# Architecture Overview

Versus is a multiplatform, enterprise-grade game server supporting 27+ classic games with real-time multiplayer, AI agent integration, and crypto wagering.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                              │
├─────────────────────────────────────────────────────────────┤
│  React SPA (Vite)  │  WebSocket Client  │  API Client       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    HONO APPLICATION                          │
├─────────────────────────────────────────────────────────────┤
│  Security Middleware │ Rate Limiting │ Authentication       │
├─────────────────────────────────────────────────────────────┤
│  Auth Routes │ Game Routes │ Wager Routes │ Agent Routes    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     SERVICE LAYER                            │
├──────────────┬──────────────┬──────────────┬───────────────┤
│ AuthService  │ GameManager  │ EscrowService│ RoomService   │
│ WagerService │ MarketService│ TournamentSvc│ AgentBridge   │
└──────────────┴──────────────┴──────────────┴───────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     DATABASE LAYER                           │
├─────────────────────────────────────────────────────────────┤
│  SQLite (Development)  │  PostgreSQL (Production)           │
│  Tables: users, games, rooms, wagers, tournaments           │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### Application Factory (`src/app.ts`)

Platform-agnostic Hono application with comprehensive middleware:

```typescript
export async function createApp(config: AppConfig) {
  const app = new Hono();
  
  // Security middleware
  app.use('*', secureHeaders());
  app.use('*', cors());
  app.use('/api/*', apiRateLimit);
  
  // Initialize services
  const gameManager = new GameManager(config.databaseConfig);
  const authService = new AuthService(config.databaseConfig);
  
  // Mount routes
  app.route('/api/v1/games', createGameRoutes(gameManager));
  app.route('/api/v1/auth', createAuthRoutes(authService));
  
  return { app, gameManager, authService };
}
```

### Platform Adapters

The server supports multiple runtimes:

| Platform | Entry Point | Use Case |
|----------|-------------|----------|
| Node.js | `src/server/node.ts` | Traditional hosting, Docker |
| Cloudflare Workers | `src/server/cloudflare.ts` | Edge deployment |
| Bun | `src/server/node.ts` | Development, fast runtime |

### Database Provider

Unified database abstraction supporting both SQLite and PostgreSQL:

```typescript
interface DatabaseProvider {
  initialize(): Promise<void>;
  saveGameState(data: GameStateData): Promise<void>;
  getGameState(gameId: string): Promise<GameStateData | null>;
  // ... other methods
}
```

## Game Engine

All games extend the `BaseGame` abstract class:

```typescript
export abstract class BaseGame<TState extends GameState> {
  abstract initializeGame(config?: GameConfig): Promise<void>;
  abstract validateMove(moveData: any): Promise<MoveValidationResult>;
  abstract applyMove(move: GameMove): Promise<void>;
  abstract getGameState(): Promise<TState>;
  abstract isGameOver(): boolean;
  abstract getWinner(): string | null;
  abstract getMetadata(): GameMetadata;
}
```

### Supported Games (27+)

| Category | Games |
|----------|-------|
| Strategy | Chess, Go, Checkers, Othello, Shogi |
| Card Games | Poker, Blackjack, Hearts, Spades, Cuttle |
| Classic | Tic-Tac-Toe, Connect Four, Mancala, Battleship |
| Modern | Catan, Mahjong, Word Tiles |

## Security Architecture

### Authentication Flow

```
1. POST /api/v1/auth/register → User registration
2. POST /api/v1/auth/login → JWT token generation
3. Authorization: Bearer <token> → Request authentication
4. Middleware validates token → User context attached
```

### Rate Limiting

| Endpoint Type | Limit | Window |
|---------------|-------|--------|
| General API | 100 req | 15 minutes |
| Authentication | 10 req | 15 minutes |
| Game Moves | 100 req | 1 minute |

### Data Protection

- **Passwords**: bcrypt hashing (12 rounds)
- **JWT Tokens**: Configurable expiration (24h default)
- **Database**: Prepared statements prevent SQL injection
- **Input**: Zod schema validation on all endpoints

## Service Layer

### Core Services

| Service | Responsibility |
|---------|---------------|
| `AuthService` | User registration, login, JWT management |
| `GameManager` | Game lifecycle, state persistence |
| `HealthService` | System health monitoring |
| `BackupService` | Automated database backups |

### Feature Services

| Service | Responsibility |
|---------|---------------|
| `RoomService` | Multiplayer room management |
| `RatingService` | ELO calculations |
| `EscrowService` | Crypto escrow for wagers |
| `PredictionMarketService` | Betting markets |
| `TournamentService` | Tournament brackets |
| `WagerService` | Wager settlement |
| `OpenClawBridge` | AI agent integration |

## Real-time Communication

WebSocket server for live game updates:

```typescript
class WebSocketServer {
  // Room-based broadcasting
  broadcastToRoom(roomId: string, message: any): void;
  
  // Game state updates
  sendGameState(gameId: string, state: GameState): void;
}
```

## Performance Characteristics

### Tested Under Load

- **Concurrent Users**: 100+ supported
- **Response Time**: P95 < 500ms
- **Error Rate**: < 5% under sustained load
- **Memory**: < 512MB normal operation

### Scalability Patterns

- **Stateless Design**: All state in database
- **Connection Pooling**: PostgreSQL connection management
- **Horizontal Scaling**: Multiple instances behind load balancer

## Configuration

### Environment Variables

```bash
# Server
PORT=5556
NODE_ENV=production

# Database
DATABASE_URL=postgresql://user:pass@host:port/db

# Auth
JWT_SECRET=your-secure-secret

# CORS
CORS_ORIGIN=https://yourdomain.com

# Monitoring
SENTRY_DSN=https://your-sentry-dsn
```

## Next Steps

- [Games Engine](games.md) - Game implementation details
- [Database](database.md) - Schema and queries
- [API Overview](../api/overview.md) - API reference
