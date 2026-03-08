# Architecture Overview

Versus is organized as a package-first game platform with optional platform services layered on top.

The stable center of the repo is the reusable game engine layer. The crypto settlement layer is still experimental.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  REUSABLE GAME PACKAGES                      │
├─────────────────────────────────────────────────────────────┤
│  @versus/game-core  │  @versus/chess  │  @versus/poker ... │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 PLATFORM SERVER (versus-server)              │
├─────────────────────────────────────────────────────────────┤
│ Auth │ Games │ Rooms │ Ratings │ Tournaments │ Agent APIs    │
│ WebSocket │ Persistence │ Match orchestration               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│          EXPERIMENTAL SETTLEMENT / MARKET LAYER              │
├─────────────────────────────────────────────────────────────┤
│ Wagers │ Markets │ x402 │ Solver bridge │ Intent adapters   │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### Reusable Game Layer

The reusable game logic lives in:

- [`packages/game-core`](../../packages/game-core)
- [`packages/*`](../../packages)

Each game package contains the game rules and implementation. The server consumes those packages rather than owning the canonical game logic itself.

### Application Factory (`src/app.ts`)

The server in [`versus-server/src/app.ts`](../../versus-server/src/app.ts) composes the platform layer around the packages:

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

There are two database abstractions in the repo:

- server database providers in [`versus-server/src/core/database.ts`](../../versus-server/src/core/database.ts)
- package-safe in-memory persistence in [`packages/game-core/src/core/database.ts`](../../packages/game-core/src/core/database.ts)

That second provider is what makes the standalone packages reusable without forcing a native database dependency.

```typescript
interface DatabaseProvider {
  initialize(): Promise<void>;
  saveGameState(data: GameStateData): Promise<void>;
  getGameState(gameId: string): Promise<GameStateData | null>;
  // ... other methods
}
```

## Game Engine

All game packages extend the shared `BaseGame` from `@versus/game-core`:

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

## Stable Vs Experimental

Stable:

- game packages
- game manager and persistence
- multiplayer APIs
- auth, rooms, ratings, tournaments
- MCP/OpenClaw-facing game integration

Experimental:

- wagers and escrow routes
- prediction markets
- x402 payment flows
- NEAR/Base/Solana intent adapters
- solver-mediated settlement

The experimental layer exists in code, but it should not be described as audited or production-trustless today.

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
| `EscrowService` | Experimental wager support |
| `PredictionMarketService` | Experimental market support |
| `TournamentService` | Tournament brackets |
| `WagerService` | Experimental wager lifecycle |
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

## Packaging Strategy

The repo is now structured so other applications can:

1. depend on standalone game packages
2. embed those games into their own server or agent system
3. ignore the Versus auth/rooms/tournaments/wagering stack entirely if they want

See [Packages](packages.md) for details.

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

- [Packages](packages.md) - Package-first architecture and usage
- [Games Engine](games.md) - Game implementation details
- [Database](database.md) - Schema and queries
- [API Overview](../api/overview.md) - API reference
