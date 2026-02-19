import { v4 as uuidv4 } from 'uuid';
import { DatabaseProvider } from '../core/database.js';
import { GameManager } from '../core/game-manager.js';
import { WebSocketServer } from '../core/websocket.js';
import type {
  Room,
  RoomParticipant,
  CreateRoomRequest,
  JoinRoomRequest,
  RoomFilters,
  MatchmakingEntry,
  MatchmakingResult,
} from '../types/room.js';
import { logger } from '../utils/logger.js';

export class RoomService {
  private db: DatabaseProvider;
  private gameManager: GameManager;
  private wsServer: WebSocketServer;
  private matchmakingQueue: Map<string, MatchmakingEntry> = new Map();

  constructor(db: DatabaseProvider, gameManager: GameManager, wsServer: WebSocketServer) {
    this.db = db;
    this.gameManager = gameManager;
    this.wsServer = wsServer;
  }

  // ---------------------------------------------------------------------------
  // Room CRUD
  // ---------------------------------------------------------------------------

  async createRoom(userId: string, request: CreateRoomRequest): Promise<Room> {
    // Validate the game type is supported
    const availableTypes = this.gameManager.getAvailableGameTypes();
    if (!availableTypes.includes(request.gameType)) {
      throw new Error(`Unsupported game type: ${request.gameType}`);
    }

    const roomId = `room-${uuidv4()}`;
    const now = new Date().toISOString();

    const gameConfig = request.gameConfig ? JSON.stringify(request.gameConfig) : null;

    await this.db.execute(
      `INSERT INTO rooms (id, game_type, status, creator_id, min_players, max_players,
        is_public, is_ranked, spectators_allowed, wager_amount, wager_currency,
        escrow_address, game_config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        roomId,
        request.gameType,
        'waiting',
        userId,
        request.minPlayers ?? 2,
        request.maxPlayers ?? 2,
        (request.isPublic ?? true) ? 1 : 0,
        (request.isRanked ?? false) ? 1 : 0,
        (request.spectatorsAllowed ?? true) ? 1 : 0,
        request.wagerAmount ?? null,
        request.wagerCurrency ?? null,
        request.escrowAddress ?? null,
        gameConfig,
        now,
        now,
      ]
    );

    // Auto-join the creator as a player
    await this.db.execute(
      `INSERT INTO room_participants (room_id, user_id, agent_id, role, ready_status, elo_at_join, joined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [roomId, userId, null, 'player', 'not_ready', null, now]
    );

    logger.info('Room created', { roomId, userId, gameType: request.gameType });

    const room = await this.getRoom(roomId);
    if (!room) {
      throw new Error('Failed to retrieve room after creation');
    }
    return room;
  }

  async joinRoom(
    roomId: string,
    userId: string,
    request: JoinRoomRequest
  ): Promise<RoomParticipant> {
    const room = await this.getRoom(roomId);
    if (!room) {
      throw new Error('Room not found');
    }
    if (room.status !== 'waiting') {
      throw new Error(`Cannot join room with status: ${room.status}`);
    }

    // Check if user is already in the room
    const existing = await this.db.get<{ user_id: string }>(
      `SELECT user_id FROM room_participants WHERE room_id = ? AND user_id = ?`,
      [roomId, userId]
    );
    if (existing) {
      throw new Error('Already in this room');
    }

    // Check capacity
    const participants = await this.getRoomParticipants(roomId);
    const playerCount = participants.filter((p) => p.role === 'player').length;
    const role = request.role ?? 'player';

    if (role === 'player' && playerCount >= room.maxPlayers) {
      throw new Error('Room is full');
    }
    if (role === 'spectator' && !room.spectatorsAllowed) {
      throw new Error('Spectators are not allowed in this room');
    }

    const now = new Date().toISOString();

    await this.db.execute(
      `INSERT INTO room_participants (room_id, user_id, agent_id, role, ready_status, elo_at_join, joined_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [roomId, userId, request.agentId ?? null, role, 'not_ready', request.eloAtJoin ?? null, now]
    );

    // Check if all player slots are now filled
    const newPlayerCount = role === 'player' ? playerCount + 1 : playerCount;
    if (newPlayerCount >= room.maxPlayers) {
      await this.db.execute(`UPDATE rooms SET status = ?, updated_at = ? WHERE id = ?`, [
        'ready',
        new Date().toISOString(),
        roomId,
      ]);
    }

    this.wsServer.broadcastToRoom(roomId, {
      event: 'room:player_joined',
      data: { roomId, userId, role },
      roomId,
      timestamp: Date.now(),
    });

    logger.info('User joined room', { roomId, userId, role });

    const participant: RoomParticipant = {
      roomId,
      userId,
      agentId: request.agentId ?? null,
      role,
      readyStatus: 'not_ready',
      eloAtJoin: request.eloAtJoin ?? null,
      joinedAt: Date.now(),
    };
    return participant;
  }

  async leaveRoom(roomId: string, userId: string): Promise<void> {
    const room = await this.getRoom(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    await this.db.execute(`DELETE FROM room_participants WHERE room_id = ? AND user_id = ?`, [
      roomId,
      userId,
    ]);

    this.wsServer.broadcastToRoom(roomId, {
      event: 'room:player_left',
      data: { roomId, userId },
      roomId,
      timestamp: Date.now(),
    });

    // If creator leaves, cancel the room
    if (room.creatorId === userId) {
      await this.db.execute(`UPDATE rooms SET status = ?, updated_at = ? WHERE id = ?`, [
        'cancelled',
        new Date().toISOString(),
        roomId,
      ]);
      this.wsServer.broadcastToRoom(roomId, {
        event: 'room:cancelled',
        data: { roomId, reason: 'creator_left' },
        roomId,
        timestamp: Date.now(),
      });
      logger.info('Room cancelled — creator left', { roomId, userId });
      return;
    }

    // If room is now empty, cancel it
    const remaining = await this.getRoomParticipants(roomId);
    if (remaining.length === 0) {
      await this.db.execute(`UPDATE rooms SET status = ?, updated_at = ? WHERE id = ?`, [
        'cancelled',
        new Date().toISOString(),
        roomId,
      ]);
      logger.info('Room cancelled — empty', { roomId });
      return;
    }

    // If room was 'ready' but now has fewer players, revert to 'waiting'
    if (room.status === 'ready') {
      const playerCount = remaining.filter((p) => p.role === 'player').length;
      if (playerCount < room.maxPlayers) {
        await this.db.execute(`UPDATE rooms SET status = ?, updated_at = ? WHERE id = ?`, [
          'waiting',
          new Date().toISOString(),
          roomId,
        ]);
      }
    }

    logger.info('User left room', { roomId, userId });
  }

  async readyUp(roomId: string, userId: string): Promise<void> {
    const room = await this.getRoom(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    await this.db.execute(
      `UPDATE room_participants SET ready_status = ? WHERE room_id = ? AND user_id = ?`,
      ['ready', roomId, userId]
    );

    this.wsServer.broadcastToRoom(roomId, {
      event: 'room:player_ready',
      data: { roomId, userId },
      roomId,
      timestamp: Date.now(),
    });

    // Check if all players are ready
    const participants = await this.getRoomParticipants(roomId);
    const players = participants.filter((p) => p.role === 'player');
    const allReady =
      players.length >= room.minPlayers &&
      players.every((p) => p.readyStatus === 'ready' || p.userId === userId);

    if (allReady) {
      logger.info('All players ready — starting game', { roomId });
      await this.startGame(roomId);
    }
  }

  async unready(roomId: string, userId: string): Promise<void> {
    await this.db.execute(
      `UPDATE room_participants SET ready_status = ? WHERE room_id = ? AND user_id = ?`,
      ['not_ready', roomId, userId]
    );

    this.wsServer.broadcastToRoom(roomId, {
      event: 'room:player_unready',
      data: { roomId, userId },
      roomId,
      timestamp: Date.now(),
    });
  }

  async startGame(roomId: string): Promise<string> {
    const room = await this.getRoom(roomId);
    if (!room) {
      throw new Error('Room not found');
    }

    const participants = await this.getRoomParticipants(roomId);
    const playerIds = participants.filter((p) => p.role === 'player').map((p) => p.userId);

    const gameId = await this.gameManager.createGame(room.gameType, {
      playerCount: playerIds.length,
      ...(room.gameConfig ?? {}),
      customRules: {
        ...(room.gameConfig?.customRules ?? {}),
        roomId,
        isRanked: room.isRanked,
        playerIds,
      },
    });

    await this.db.execute(`UPDATE rooms SET game_id = ?, status = ?, updated_at = ? WHERE id = ?`, [
      gameId,
      'in_progress',
      new Date().toISOString(),
      roomId,
    ]);

    this.wsServer.broadcastToRoom(roomId, {
      event: 'room:game_started',
      data: { roomId, gameId },
      roomId,
      timestamp: Date.now(),
    });

    logger.info('Game started', { roomId, gameId, players: playerIds.length });
    return gameId;
  }

  async getRoom(roomId: string): Promise<Room | null> {
    const row = await this.db.get<any>(`SELECT * FROM rooms WHERE id = ?`, [roomId]);
    if (!row) return null;
    return this.serializeRoom(row);
  }

  async getRoomParticipants(roomId: string): Promise<RoomParticipant[]> {
    const rows = await this.db.query<any>(
      `SELECT * FROM room_participants WHERE room_id = ? ORDER BY joined_at ASC`,
      [roomId]
    );
    return rows.map((row) => ({
      roomId: row.room_id,
      userId: row.user_id,
      agentId: row.agent_id ?? null,
      role: row.role,
      readyStatus: row.ready_status,
      eloAtJoin: row.elo_at_join ?? null,
      joinedAt: row.joined_at,
    }));
  }

  async listRooms(filters: RoomFilters): Promise<Room[]> {
    const conditions: string[] = ['is_public = ?'];
    const params: any[] = [1];

    if (filters.gameType) {
      conditions.push('game_type = ?');
      params.push(filters.gameType);
    }

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    } else {
      // Default to waiting rooms
      conditions.push('status = ?');
      params.push('waiting');
    }

    if (filters.isRanked !== undefined) {
      conditions.push('is_ranked = ?');
      params.push(filters.isRanked ? 1 : 0);
    }

    if (filters.hasWager !== undefined) {
      if (filters.hasWager) {
        conditions.push('wager_amount IS NOT NULL AND wager_amount > 0');
      } else {
        conditions.push('(wager_amount IS NULL OR wager_amount = 0)');
      }
    }

    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const query = `SELECT * FROM rooms WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const rows = await this.db.query<any>(query, params);
    return rows.map((row) => this.serializeRoom(row));
  }

  async completeRoom(roomId: string, winnerId: string | null): Promise<void> {
    await this.db.execute(`UPDATE rooms SET status = ?, updated_at = ? WHERE id = ?`, [
      'completed',
      new Date().toISOString(),
      roomId,
    ]);

    this.wsServer.broadcastToRoom(roomId, {
      event: 'room:completed',
      data: { roomId, winnerId },
      roomId,
      timestamp: Date.now(),
    });

    logger.info('Room completed', { roomId, winnerId });
  }

  // ---------------------------------------------------------------------------
  // Matchmaking
  // ---------------------------------------------------------------------------

  async enqueueForMatchmaking(entry: MatchmakingEntry): Promise<MatchmakingResult> {
    // Remove any existing entry for this user
    this.matchmakingQueue.delete(entry.userId);

    // Search for a compatible match
    for (const [queuedUserId, queued] of this.matchmakingQueue) {
      if (queued.gameType !== entry.gameType) continue;
      if (queued.isRanked !== entry.isRanked) continue;

      // Wager check
      if ((queued.wagerAmount ?? 0) !== (entry.wagerAmount ?? 0)) continue;
      if ((queued.wagerCurrency ?? null) !== (entry.wagerCurrency ?? null)) continue;

      // ELO proximity check (±200)
      if (queued.elo !== undefined && entry.elo !== undefined) {
        if (Math.abs(queued.elo - entry.elo) > 200) continue;
      }

      // Match found — remove from queue and create a room
      this.matchmakingQueue.delete(queuedUserId);

      const room = await this.createRoom(entry.userId, {
        gameType: entry.gameType,
        minPlayers: 2,
        maxPlayers: 2,
        isPublic: false,
        isRanked: entry.isRanked ?? false,
        spectatorsAllowed: false,
        wagerAmount: entry.wagerAmount ?? undefined,
        wagerCurrency: entry.wagerCurrency ?? undefined,
      });

      // Join the matched player
      await this.joinRoom(room.id, queuedUserId, { role: 'player' });

      logger.info('Matchmaking — match found', {
        roomId: room.id,
        player1: entry.userId,
        player2: queuedUserId,
        gameType: entry.gameType,
      });

      return { matched: true, roomId: room.id, opponents: [queuedUserId] };
    }

    // No match — add to queue
    entry.enqueuedAt = Date.now();
    this.matchmakingQueue.set(entry.userId, entry);

    logger.info('Matchmaking — queued', { userId: entry.userId, gameType: entry.gameType });
    return { matched: false };
  }

  async dequeueFromMatchmaking(userId: string): Promise<void> {
    this.matchmakingQueue.delete(userId);
    logger.info('Matchmaking — dequeued', { userId });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private serializeRoom(row: any): Room {
    return {
      id: row.id,
      gameType: row.game_type,
      status: row.status,
      creatorId: row.creator_id,
      minPlayers: row.min_players,
      maxPlayers: row.max_players,
      isPublic: Boolean(row.is_public),
      isRanked: Boolean(row.is_ranked),
      spectatorsAllowed: Boolean(row.spectators_allowed),
      wagerAmount: row.wager_amount ?? null,
      wagerCurrency: row.wager_currency ?? null,
      escrowAddress: row.escrow_address ?? null,
      gameId: row.game_id ?? null,
      gameConfig: row.game_config ? JSON.parse(row.game_config) : null,
      marketId: row.market_id ?? null,
      tournamentMatchId: row.tournament_match_id ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
