import { WebSocket, WebSocketServer as WSServer } from 'ws';
import { EventEmitter } from 'events';
import { IncomingMessage } from 'http';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import type { JWTPayload } from '../types/auth.js';
import type { WSMessage, WSClientMessage, WSClient, WSEventType } from '../types/websocket.js';

const HEARTBEAT_INTERVAL = 30_000;
const PONG_TIMEOUT = 10_000;

export class WebSocketServer extends EventEmitter {
  private wss: WSServer | null = null;
  private clients: Map<string, WSClient> = new Map();
  private sockets: Map<string, WebSocket> = new Map();
  private rooms: Map<string, Set<string>> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  initialize(httpServer: any): void {
    this.wss = new WSServer({ noServer: true });

    httpServer.on('upgrade', (request: IncomingMessage, socket: any, head: Buffer) => {
      const user = this.authenticateConnection(request);
      if (!user) {
        logger.warn('WebSocket upgrade rejected: authentication failed');
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss!.handleUpgrade(request, socket, head, (ws) => {
        this.handleConnection(ws, user);
      });
    });

    this.startHeartbeat();
    logger.info('WebSocket server initialized');
  }

  authenticateConnection(request: IncomingMessage): JWTPayload | null {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      const token = url.searchParams.get('token');

      if (!token) {
        logger.debug('WebSocket connection missing token');
        return null;
      }

      const secret = process.env.JWT_SECRET;
      if (!secret) {
        logger.error('JWT_SECRET is not configured');
        return null;
      }

      const payload = jwt.verify(token, secret) as JWTPayload;
      return payload;
    } catch (err) {
      logger.warn('WebSocket JWT verification failed', { error: (err as Error).message });
      return null;
    }
  }

  handleConnection(ws: WebSocket, user: JWTPayload): void {
    const clientId = uuidv4();

    const client: WSClient = {
      id: clientId,
      user,
      rooms: new Set(),
      isAgent: user.role === 'agent',
      agentId: user.role === 'agent' ? user.userId : null,
      connectedAt: Date.now(),
      lastPingAt: Date.now(),
    };

    this.clients.set(clientId, client);
    this.sockets.set(clientId, ws);

    logger.info('WebSocket client connected', {
      clientId,
      userId: user.userId,
      username: user.username,
      role: user.role,
    });

    // Send connected confirmation
    this.sendToClient(clientId, {
      event: 'system:connected',
      data: { clientId, userId: user.userId, username: user.username },
      timestamp: Date.now(),
    });

    this.emit('connection', client);

    ws.on('message', (raw: Buffer | string) => {
      this.handleMessage(clientId, raw.toString());
    });

    ws.on('close', () => {
      this.handleDisconnect(clientId);
    });

    ws.on('error', (err) => {
      logger.error('WebSocket client error', { clientId, error: err.message });
      this.handleDisconnect(clientId);
    });

    ws.on('pong', () => {
      const c = this.clients.get(clientId);
      if (c) {
        c.lastPingAt = Date.now();
      }
    });
  }

  handleMessage(clientId: string, raw: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    let parsed: WSClientMessage;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.sendToClient(clientId, {
        event: 'system:error',
        data: { message: 'Invalid JSON' },
        timestamp: Date.now(),
      });
      return;
    }

    if (!parsed.event) {
      this.sendToClient(clientId, {
        event: 'system:error',
        data: { message: 'Missing event type' },
        timestamp: Date.now(),
      });
      return;
    }

    // Handle built-in events
    switch (parsed.event) {
      case 'system:ping':
        client.lastPingAt = Date.now();
        this.sendToClient(clientId, {
          event: 'system:pong',
          data: {},
          timestamp: Date.now(),
        });
        return;

      case 'room:join':
        if (parsed.roomId) {
          this.joinRoom(clientId, parsed.roomId);
        }
        break;

      case 'room:leave':
        if (parsed.roomId) {
          this.leaveRoom(clientId, parsed.roomId);
        }
        break;

      default:
        break;
    }

    // Emit for external handlers
    this.emit('message', {
      clientId,
      client,
      event: parsed.event,
      data: parsed.data,
      roomId: parsed.roomId,
    });

    this.emit(parsed.event, {
      clientId,
      client,
      data: parsed.data,
      roomId: parsed.roomId,
    });
  }

  joinRoom(clientId: string, roomId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.rooms.add(roomId);

    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId)!.add(clientId);

    logger.debug('Client joined room', { clientId, roomId, userId: client.user.userId });

    this.broadcastToRoom(
      roomId,
      {
        event: 'room:join',
        data: {
          userId: client.user.userId,
          username: client.user.username,
          isAgent: client.isAgent,
          clientCount: this.getRoomClientCount(roomId),
        },
        roomId,
        timestamp: Date.now(),
      },
      clientId
    );

    // Confirm to the joining client
    this.sendToClient(clientId, {
      event: 'room:update',
      data: {
        roomId,
        clientCount: this.getRoomClientCount(roomId),
        clients: this.getClientsInRoom(roomId).map((c) => ({
          userId: c.user.userId,
          username: c.user.username,
          isAgent: c.isAgent,
        })),
      },
      roomId,
      timestamp: Date.now(),
    });

    this.emit('room:join', { clientId, client, roomId });
  }

  leaveRoom(clientId: string, roomId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.rooms.delete(roomId);

    const room = this.rooms.get(roomId);
    if (room) {
      room.delete(clientId);
      if (room.size === 0) {
        this.rooms.delete(roomId);
      }
    }

    logger.debug('Client left room', { clientId, roomId, userId: client.user.userId });

    this.broadcastToRoom(roomId, {
      event: 'room:leave',
      data: {
        userId: client.user.userId,
        username: client.user.username,
        clientCount: this.getRoomClientCount(roomId),
      },
      roomId,
      timestamp: Date.now(),
    });

    this.emit('room:leave', { clientId, client, roomId });
  }

  broadcastToRoom(roomId: string, message: WSMessage, excludeClientId?: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const payload = JSON.stringify(message);

    for (const cid of room) {
      if (cid === excludeClientId) continue;
      const ws = this.sockets.get(cid);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  sendToClient(clientId: string, message: WSMessage): void {
    const ws = this.sockets.get(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  broadcastToAll(message: WSMessage): void {
    const payload = JSON.stringify(message);
    for (const [cid, ws] of this.sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  getClientsInRoom(roomId: string): WSClient[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    const clients: WSClient[] = [];
    for (const cid of room) {
      const client = this.clients.get(cid);
      if (client) clients.push(client);
    }
    return clients;
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getRoomClientCount(roomId: string): number {
    const room = this.rooms.get(roomId);
    return room ? room.size : 0;
  }

  close(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    for (const [cid, ws] of this.sockets) {
      ws.close(1001, 'Server shutting down');
    }

    this.clients.clear();
    this.sockets.clear();
    this.rooms.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    logger.info('WebSocket server closed');
  }

  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Leave all rooms
    for (const roomId of client.rooms) {
      this.leaveRoom(clientId, roomId);
    }

    this.clients.delete(clientId);
    this.sockets.delete(clientId);

    logger.info('WebSocket client disconnected', {
      clientId,
      userId: client.user.userId,
      username: client.user.username,
    });

    this.emit('disconnect', client);
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();

      for (const [cid, ws] of this.sockets) {
        const client = this.clients.get(cid);
        if (!client) {
          ws.terminate();
          this.sockets.delete(cid);
          continue;
        }

        // If client hasn't responded to ping within timeout window, disconnect
        if (now - client.lastPingAt > HEARTBEAT_INTERVAL + PONG_TIMEOUT) {
          logger.warn('WebSocket client heartbeat timeout', {
            clientId: cid,
            userId: client.user.userId,
          });
          ws.terminate();
          this.handleDisconnect(cid);
          continue;
        }

        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        }
      }
    }, HEARTBEAT_INTERVAL);
  }
}
