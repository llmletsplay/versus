import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseProvider } from '../core/database.js';
import { GameManager } from '../core/game-manager.js';
import { WebSocketServer } from '../core/websocket.js';
import { logger } from '../utils/logger.js';
import type { Agent, AgentSession, OpenClawConfig, RegisterAgentRequest } from '../types/agent.js';

const MAX_RECONNECT_RETRIES = 10;
const BASE_RECONNECT_DELAY_MS = 5000;

export class OpenClawBridge extends EventEmitter {
  private gatewayWs: WebSocket | null = null;
  private agentSessions: Map<string, AgentSession> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;

  constructor(
    private readonly db: DatabaseProvider,
    private readonly gameManager: GameManager,
    private readonly wsServer: WebSocketServer,
    private readonly config: OpenClawConfig
  ) {
    super();
  }

  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('OpenClaw bridge is disabled, skipping initialization');
      return;
    }

    logger.info('Initializing OpenClaw bridge', { gatewayUrl: this.config.gatewayUrl });
    this.connectToGateway();
  }

  private connectToGateway(): void {
    if (this.gatewayWs) {
      this.gatewayWs.removeAllListeners();
      this.gatewayWs.close();
      this.gatewayWs = null;
    }

    try {
      this.gatewayWs = new WebSocket(this.config.gatewayUrl);
    } catch (err) {
      logger.error('Failed to create WebSocket connection to OpenClaw gateway', { error: err });
      this.scheduleReconnect();
      return;
    }

    this.gatewayWs.on('open', () => {
      logger.info('Connected to OpenClaw gateway');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
    });

    this.gatewayWs.on('close', (code, reason) => {
      logger.warn('Disconnected from OpenClaw gateway', {
        code,
        reason: reason.toString(),
      });
      this.isConnected = false;
      this.emit('disconnected');
      this.scheduleReconnect();
    });

    this.gatewayWs.on('error', (err) => {
      logger.error('OpenClaw gateway WebSocket error', { error: err.message });
      this.emit('error', err);
    });

    this.gatewayWs.on('message', (data) => {
      this.handleGatewayMessage(data.toString());
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts >= MAX_RECONNECT_RETRIES) {
      logger.error('Max reconnect retries reached for OpenClaw gateway, giving up');
      this.emit('reconnect_failed');
      return;
    }

    const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    logger.info('Scheduling OpenClaw gateway reconnect', {
      attempt: this.reconnectAttempts,
      maxRetries: MAX_RECONNECT_RETRIES,
      delayMs: delay,
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connectToGateway();
    }, delay);
  }

  private handleGatewayMessage(raw: string): void {
    let message: { type: string; agentId: string; sessionKey: string; payload: any };

    try {
      message = JSON.parse(raw);
    } catch {
      logger.warn('Received invalid JSON from OpenClaw gateway', { raw });
      return;
    }

    const { type, agentId, sessionKey, payload } = message;

    if (!type || !agentId) {
      logger.warn('Received malformed message from OpenClaw gateway', { message });
      return;
    }

    logger.debug('Received OpenClaw gateway message', { type, agentId, sessionKey });

    switch (type) {
      case 'agent_move':
        this.handleAgentMove(agentId, sessionKey, payload).catch((err) => {
          logger.error('Error handling agent move', { agentId, error: err.message });
        });
        break;
      case 'agent_join':
        this.handleAgentJoin(agentId, payload).catch((err) => {
          logger.error('Error handling agent join', { agentId, error: err.message });
        });
        break;
      case 'agent_leave':
        this.handleAgentLeave(agentId, sessionKey);
        break;
      case 'ping':
        this.sendViaGateway({ type: 'pong', agentId, sessionKey });
        break;
      default:
        logger.warn('Unknown OpenClaw message type', { type, agentId });
    }
  }

  private async handleAgentMove(agentId: string, sessionKey: string, payload: any): Promise<void> {
    const session = this.agentSessions.get(sessionKey);

    if (!session) {
      logger.warn('No active session found for agent move', { agentId, sessionKey });
      await this.sendToAgent(agentId, {
        type: 'error',
        message: 'No active session found. Please join a room first.',
      });
      return;
    }

    if (session.agentId !== agentId) {
      logger.warn('Session agent mismatch', {
        sessionAgentId: session.agentId,
        requestAgentId: agentId,
      });
      return;
    }

    const moveData = payload?.moveData ?? payload?.move ?? payload;
    const gameType = payload?.gameType ?? 'unknown';
    const gameId = payload?.gameId;

    if (!gameId) {
      await this.sendToAgent(agentId, {
        type: 'move_result',
        sessionKey,
        success: false,
        error: 'gameId is required in move payload',
      });
      return;
    }

    session.lastActivityAt = Date.now();

    try {
      const result = await this.gameManager.makeMove(gameType, gameId, moveData);

      await this.sendToAgent(agentId, {
        type: 'move_result',
        sessionKey,
        success: true,
        result,
      });

      this.emit('agent_move', { agentId, sessionKey, moveData, result });
    } catch (err: any) {
      logger.error('Agent move failed', { agentId, sessionKey, error: err.message });
      await this.sendToAgent(agentId, {
        type: 'move_result',
        sessionKey,
        success: false,
        error: err.message,
      });
    }
  }

  private async handleAgentJoin(agentId: string, payload: any): Promise<void> {
    const agent = await this.getAgent(agentId);

    if (!agent) {
      logger.warn('Unregistered agent attempted to join', { agentId });
      await this.sendToAgent(agentId, {
        type: 'error',
        message: 'Agent is not registered. Please register first.',
      });
      return;
    }

    if (!agent.isActive) {
      await this.sendToAgent(agentId, {
        type: 'error',
        message: 'Agent is deactivated.',
      });
      return;
    }

    const roomId = payload?.roomId;
    const gameType = payload?.gameType;

    if (!roomId) {
      await this.sendToAgent(agentId, {
        type: 'error',
        message: 'roomId is required to join a game.',
      });
      return;
    }

    const sessionKey = `session-${uuidv4()}`;
    const now = Date.now();

    try {
      const session: AgentSession = {
        agentId,
        roomId,
        sessionKey,
        connectedAt: now,
        lastActivityAt: now,
      };

      this.agentSessions.set(sessionKey, session);

      await this.sendToAgent(agentId, {
        type: 'joined',
        sessionKey,
        roomId,
      });

      logger.info('Agent joined game room', { agentId, roomId, sessionKey });
      // Emit so the app layer can wire the agent into RoomService
      this.emit('agent_joined', { agentId, roomId, sessionKey, gameType });
    } catch (err: any) {
      logger.error('Agent failed to join room', { agentId, roomId, error: err.message });
      await this.sendToAgent(agentId, {
        type: 'error',
        message: `Failed to join room: ${err.message}`,
      });
    }
  }

  private handleAgentLeave(agentId: string, sessionKey: string): void {
    const session = this.agentSessions.get(sessionKey);

    if (!session || session.agentId !== agentId) {
      return;
    }

    this.agentSessions.delete(sessionKey);
    logger.info('Agent left game room', { agentId, roomId: session.roomId, sessionKey });
    this.emit('agent_left', { agentId, roomId: session.roomId, sessionKey });
  }

  async sendToAgent(agentId: string, message: any): Promise<void> {
    const envelope = {
      type: 'to_agent',
      agentId,
      timestamp: new Date().toISOString(),
      ...message,
    };

    if (this.isConnected && this.gatewayWs?.readyState === WebSocket.OPEN) {
      this.gatewayWs.send(JSON.stringify(envelope));
      return;
    }

    logger.warn('Cannot send message to agent: gateway WebSocket is not connected', {
      agentId,
      gatewayUrl: this.config.gatewayUrl,
    });
  }

  async sendGameStateToAgent(agentId: string, roomId: string, gameState: any): Promise<void> {
    await this.sendToAgent(agentId, {
      type: 'game_state',
      roomId,
      state: gameState,
      timestamp: new Date().toISOString(),
    });
  }

  async registerAgent(ownerUserId: string, request: RegisterAgentRequest): Promise<Agent> {
    const agentId = `agent-${uuidv4()}`;
    const now = new Date().toISOString();

    const agent: Agent = {
      id: agentId,
      ownerUserId,
      displayName: request.displayName,
      provider: request.provider,
      providerAgentId: request.providerAgentId ?? null,
      gamesSupported: request.gamesSupported,
      isActive: true,
      eloRatings: {},
      totalGames: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      lastSeenAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await this.db.execute(
      `INSERT INTO agent_registry
        (id, owner_user_id, display_name, provider, provider_agent_id,
         games_supported, is_active, elo_ratings, wins, losses, draws,
         total_games, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agent.id,
        agent.ownerUserId,
        agent.displayName,
        agent.provider,
        agent.providerAgentId,
        JSON.stringify(agent.gamesSupported),
        agent.isActive ? 1 : 0,
        JSON.stringify(agent.eloRatings),
        0,
        0,
        0,
        0,
        Date.now(),
        Date.now(),
      ]
    );

    logger.info('Registered new agent', {
      agentId,
      displayName: agent.displayName,
      provider: agent.provider,
    });
    this.emit('agent_registered', agent);

    return agent;
  }

  async getAgent(agentId: string): Promise<Agent | null> {
    const row = await this.db.get('SELECT * FROM agent_registry WHERE id = ?', [agentId]);

    if (!row) {
      return null;
    }

    return this.deserializeAgent(row);
  }

  async listAgents(activeOnly = true): Promise<Agent[]> {
    const query = activeOnly
      ? 'SELECT * FROM agent_registry WHERE is_active = 1 ORDER BY created_at DESC'
      : 'SELECT * FROM agent_registry ORDER BY created_at DESC';

    const rows = await this.db.all(query);
    return rows.map((row: any) => this.deserializeAgent(row));
  }

  async updateAgentStats(agentId: string, outcome: 'win' | 'loss' | 'draw'): Promise<void> {
    const column = outcome === 'win' ? 'wins' : outcome === 'loss' ? 'losses' : 'draws';

    await this.db.execute(
      `UPDATE agent_registry
       SET ${column} = ${column} + 1,
           total_games = total_games + 1,
           updated_at = ?
       WHERE id = ?`,
      [Date.now(), agentId]
    );

    logger.debug('Updated agent stats', { agentId, outcome });
    this.emit('agent_stats_updated', { agentId, outcome });
  }

  private sendViaGateway(message: any): void {
    if (this.isConnected && this.gatewayWs?.readyState === WebSocket.OPEN) {
      this.gatewayWs.send(JSON.stringify(message));
    }
  }

  private deserializeAgent(row: any): Agent {
    return {
      id: row.id,
      ownerUserId: row.owner_user_id,
      displayName: row.display_name,
      provider: row.provider,
      providerAgentId: row.provider_agent_id ?? null,
      gamesSupported:
        typeof row.games_supported === 'string'
          ? JSON.parse(row.games_supported)
          : (row.games_supported ?? []),
      isActive: Boolean(row.is_active),
      eloRatings:
        typeof row.elo_ratings === 'string' ? JSON.parse(row.elo_ratings) : (row.elo_ratings ?? {}),
      totalGames: row.total_games ?? 0,
      wins: row.wins ?? 0,
      losses: row.losses ?? 0,
      draws: row.draws ?? 0,
      lastSeenAt: row.last_seen_at ?? 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  close(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.agentSessions.clear();

    if (this.gatewayWs) {
      this.gatewayWs.removeAllListeners();
      this.gatewayWs.close();
      this.gatewayWs = null;
    }

    this.isConnected = false;
    logger.info('OpenClaw bridge closed');
    this.emit('closed');
  }
}
