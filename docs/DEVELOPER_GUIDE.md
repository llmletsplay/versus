# Developer Onboarding Guide - Versus Game Server

## Quick Start (5 Minutes)

### Prerequisites
- **Bun** >= 1.0.0 (recommended) or Node.js >= 18.0.0
- **Docker** and Docker Compose
- **Git**

### Setup
```bash
# 1. Clone repository
git clone https://github.com/lightnolimit/versus.git
cd versus

# 2. Install dependencies
bun install

# 3. Start development environment
bun run dev

# 4. Verify setup
curl http://localhost:6789/api/v1/health
open http://localhost:5173
```

## Development Environment

### Project Structure
```
versus/
├── versus-server/           # Hono API server
│   ├── src/
│   │   ├── app.ts          # Main Hono application
│   │   ├── server/         # Platform adapters
│   │   │   ├── node.ts     # Node.js server
│   │   │   └── cloudflare.ts # Cloudflare Workers
│   │   ├── routes/         # API route handlers
│   │   ├── services/       # Business logic services
│   │   ├── core/           # Game engine and database
│   │   ├── games/          # 29+ game implementations
│   │   ├── middleware/     # Auth, validation, rate limiting
│   │   └── utils/          # Helper utilities
│   └── tests/              # Comprehensive test suite
├── versus-client/           # React frontend
├── docs/                   # Documentation
├── scripts/                # Operational scripts
├── load-tests/             # Performance testing
└── monitoring/             # Optional monitoring stack
```

### Development Commands
```bash
# Server development
cd versus-server
bun run dev          # Start with hot reload
bun run build        # Build for production
bun run test         # Run test suite
bun run type-check   # TypeScript validation

# Client development
cd versus-client
bun run dev          # Start Vite dev server
bun run build        # Build for production

# Full stack development
bun run dev          # Start both client and server
```

## Adding New Games

### Game Implementation Template

1. **Create Game File**
   ```typescript
   // versus-server/src/games/my-game.ts
   import { BaseGame } from '../core/base-game.js';
   import type { GameState, GameMove, GameConfig, GameMetadata } from '../types/game.js';

   interface MyGameState extends GameState {
     // Define your game-specific state
     board: string[][];
     currentPlayer: string;
     // ... other properties
   }

   interface MyGameMove extends GameMove {
     // Define your move structure
     player: string;
     moveData: {
       row: number;
       col: number;
       // ... other move properties
     };
   }

   export class MyGame extends BaseGame<MyGameState> {
     async initializeGame(config?: GameConfig): Promise<void> {
       // Set up initial game state
       this.currentState = {
         gameId: this.gameId,
         gameType: this.gameType,
         board: Array(3).fill(null).map(() => Array(3).fill('')),
         currentPlayer: 'player1',
         players: ['player1', 'player2'],
         isGameOver: false,
         winner: null
       };

       await this.persistState();
     }

     async validateMove(moveData: MyGameMove): Promise<MoveValidationResult> {
       // Implement move validation logic
       const { player, moveData: move } = moveData;

       // Validate player turn
       if (player !== this.currentState.currentPlayer) {
         return { valid: false, error: 'Not your turn' };
       }

       // Validate move format
       if (!this.isValidPosition(move.row, move.col)) {
         return { valid: false, error: 'Invalid position' };
       }

       // Check if position is empty
       if (this.currentState.board[move.row][move.col] !== '') {
         return { valid: false, error: 'Position already occupied' };
       }

       return { valid: true };
     }

     async applyMove(move: MyGameMove): Promise<void> {
       // Apply the validated move
       const { player, moveData } = move;

       this.currentState.board[moveData.row][moveData.col] = player === 'player1' ? 'X' : 'O';
       this.currentState.currentPlayer = player === 'player1' ? 'player2' : 'player1';

       // Check for game over conditions
       this.checkGameOver();

       // Add to move history
       this.history.push({
         player,
         moveData,
         timestamp: Date.now()
       });

       // Persist to database
       await this.persistState();
     }

     async getGameState(): Promise<MyGameState> {
       return this.currentState;
     }

     isGameOver(): boolean {
       return this.currentState.isGameOver;
     }

     getWinner(): string | null {
       return this.currentState.winner;
     }

     getMetadata(): GameMetadata {
       return {
         name: 'My Game',
         description: 'A custom game implementation',
         minPlayers: 2,
         maxPlayers: 2,
         estimatedDuration: 10,
         difficulty: 'beginner',
         categories: ['custom', 'strategy']
       };
     }

     // Helper methods
     private isValidPosition(row: number, col: number): boolean {
       return row >= 0 && row < 3 && col >= 0 && col < 3;
     }

     private checkGameOver(): void {
       // Implement win condition checking
       // Set this.currentState.isGameOver and this.currentState.winner
     }

     protected getPlayerIds(): string[] {
       return this.currentState.players;
     }
   }
   ```

2. **Register Game**
   ```typescript
   // versus-server/src/games/index.ts
   import { MyGame } from './my-game.js';

   export function registerGames(gameManager: GameManager): void {
     // ... existing games
     gameManager.registerGame('my-game', MyGame);
   }
   ```

3. **Add Tests**
   ```typescript
   // versus-server/tests/my-game.test.ts
   import { MyGame } from '../src/games/my-game';
   import { createDatabaseProvider } from '../src/core/database';

   describe('MyGame', () => {
     let game: MyGame;
     let database: DatabaseProvider;

     beforeEach(async () => {
       database = createDatabaseProvider({ type: 'sqlite', sqlitePath: ':memory:' });
       await database.initialize();
       game = new MyGame('test-game', database);
       await game.initializeGame();
     });

     test('should initialize correctly', async () => {
       const state = await game.getGameState();
       expect(state.gameType).toBe('my-game');
       expect(state.players).toHaveLength(2);
     });

     test('should validate moves correctly', async () => {
       const validMove = await game.validateMove({
         player: 'player1',
         moveData: { row: 0, col: 0 }
       });
       expect(validMove.valid).toBe(true);
     });

     // Add more comprehensive tests
   });
   ```

## API Development

### Creating New Endpoints

1. **Define Route Handler**
   ```typescript
   // versus-server/src/routes/my-routes.ts
   import { Hono } from 'hono';
   import { zValidator } from '@hono/zod-validator';
   import { z } from 'zod';

   const schema = z.object({
     name: z.string().min(1),
     value: z.number()
   });

   export function createMyRoutes() {
     const app = new Hono();

     app.post('/create', zValidator('json', schema), async (c) => {
       const data = c.req.valid('json');

       try {
         // Your business logic here
         const result = await processData(data);

         return c.json({
           success: true,
           data: result,
           message: 'Data processed successfully'
         }, 201);
       } catch (error) {
         return c.json({
           success: false,
           error: 'Processing failed',
           code: 'PROCESSING_ERROR'
         }, 500);
       }
     });

     return app;
   }
   ```

2. **Mount Routes**
   ```typescript
   // versus-server/src/app.ts
   import { createMyRoutes } from './routes/my-routes.js';

   export function createApp(config: AppConfig) {
     const app = new Hono();

     // ... existing middleware

     app.route('/api/v1/my-feature', createMyRoutes());

     return { app, gameManager, authService };
   }
   ```

### Input Validation with Zod
```typescript
import { z } from 'zod';

// Define schemas
const gameConfigSchema = z.object({
  maxPlayers: z.number().min(2).max(8).optional(),
  timeLimit: z.number().positive().optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional()
});

// Use in route handlers
app.post('/games/:type/new', zValidator('json', gameConfigSchema), async (c) => {
  const config = c.req.valid('json'); // Type-safe and validated
  // ... rest of handler
});
```

## Testing Guide

### Running Tests
```bash
# Run all tests
bun test

# Run specific test file
bun test tic-tac-toe

# Run tests with coverage
bun test --coverage

# Watch mode for development
bun test --watch
```

### Test Categories

#### Unit Tests
- **Game Logic**: Individual game rule testing
- **Validation**: Move and input validation
- **Utilities**: Helper function testing

#### Integration Tests
- **API Endpoints**: Route handler testing
- **Database**: Data persistence testing
- **Authentication**: Login/register flows

#### Load Tests
- **Performance**: Response time validation
- **Concurrency**: Multi-user scenarios
- **Rate Limiting**: Abuse protection testing

### Writing Tests
```typescript
import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';

describe('Game Integration Tests', () => {
  let app: Hono;
  let database: DatabaseProvider;

  beforeEach(async () => {
    // Setup test environment
    database = createDatabaseProvider({ type: 'sqlite', sqlitePath: ':memory:' });
    await database.initialize();

    const { app: testApp } = createApp({
      databaseConfig: { type: 'sqlite', sqlitePath: ':memory:' },
      nodeEnv: 'test'
    });
    app = testApp;
  });

  afterEach(async () => {
    await database.close();
  });

  test('should create game successfully', async () => {
    const response = await app.request('/api/v1/games/tic-tac-toe/new', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: { maxPlayers: 2 } })
    });

    expect(response.status).toBe(201);
    const result = await response.json();
    expect(result.success).toBe(true);
    expect(result.data.gameId).toBeDefined();
  });
});
```

## Code Quality

### Linting & Formatting
```bash
# Check code quality
bun run lint

# Auto-fix issues
bun run lint:fix

# Format code
bun run format

# Type checking
bun run type-check
```

### Pre-commit Hooks
```bash
# Automatically runs on git commit:
# 1. ESLint with auto-fix
# 2. Prettier formatting
# 3. TypeScript type checking

# Manually run pre-commit checks
npm run pre-commit
```

### Code Standards

#### TypeScript Patterns
```typescript
// Use strict typing
interface GameConfig {
  maxPlayers?: number;
  timeLimit?: number;
}

// Prefer type guards
function isValidMove(move: unknown): move is GameMove {
  return typeof move === 'object' && move !== null && 'player' in move;
}

// Use error handling
async function safeGameOperation(): Promise<Result<GameState, GameError>> {
  try {
    const result = await riskyOperation();
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

#### Database Patterns
```typescript
// Use transactions for related operations
async function updateGameState(gameId: string, newState: GameState): Promise<void> {
  // Database handles transaction automatically
  await this.database.saveGameState({
    gameId,
    gameType: this.gameType,
    gameState: newState,
    moveHistory: this.history,
    players: this.getPlayerIds(),
    status: this.isGameOver() ? 'completed' : 'active'
  });
}
```

## Debugging

### Development Debugging
```bash
# Enable debug logging
LOG_LEVEL=debug bun run dev

# Database query logging
DEBUG=db:query bun run dev

# Memory leak detection
bun --inspect src/server/node.ts
```

### Production Debugging
```bash
# Check application logs
docker-compose logs -f versus-server

# Health check debugging
npm run health:check

# Performance metrics
npm run metrics

# Database health
docker-compose exec versus-server sqlite3 /app/game_data/versus.db ".tables"
```

### Common Debugging Scenarios

#### Game Logic Issues
```typescript
// Add debug logging to game methods
async validateMove(moveData: GameMove): Promise<MoveValidationResult> {
  logger.debug('Validating move', { gameId: this.gameId, moveData });

  const result = this.performValidation(moveData);

  logger.debug('Validation result', { gameId: this.gameId, result });
  return result;
}
```

#### Database Issues
```bash
# Check database schema
docker-compose exec versus-server sqlite3 /app/game_data/versus.db ".schema"

# Query game states
docker-compose exec versus-server sqlite3 /app/game_data/versus.db "SELECT game_id, game_type, status FROM game_states LIMIT 10;"

# Check for locks or corruption
docker-compose exec versus-server sqlite3 /app/game_data/versus.db "PRAGMA integrity_check;"
```

#### Authentication Issues
```bash
# Verify JWT secret
echo $JWT_SECRET | wc -c  # Should be >32 characters

# Test token generation
curl -X POST http://localhost:6789/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'

# Decode JWT (for debugging only)
# Use https://jwt.io or jwt-cli tool
```

## Performance Optimization

### Game Performance
```typescript
// Cache frequently accessed data
private gameStateCache = new Map<string, GameState>();

async getGameState(): Promise<GameState> {
  if (this.gameStateCache.has(this.gameId)) {
    return this.gameStateCache.get(this.gameId)!;
  }

  const state = await this.loadFromDatabase();
  this.gameStateCache.set(this.gameId, state);
  return state;
}

// Batch database operations
async batchUpdateGames(updates: Array<{ gameId: string, state: GameState }>): Promise<void> {
  const promises = updates.map(update =>
    this.database.saveGameState(this.formatGameStateData(update))
  );

  await Promise.all(promises);
}
```

### Database Optimization
```typescript
// Use prepared statements (automatic with our DatabaseProvider)
async getPlayerGames(playerId: string): Promise<GameStateData[]> {
  // This uses prepared statements internally
  return await this.database.getGamesByPlayer(playerId);
}

// Add database indexes for common queries
// Already included in schema:
// - idx_game_states_type (game_type)
// - idx_game_states_status (status)
// - idx_game_states_updated (updated_at)
```

## Security Development

### Authentication Middleware
```typescript
// Check if request needs authentication
function requireAuth() {
  return async (c: Context, next: Next) => {
    const user = c.get('user');

    if (!user) {
      return c.json({
        success: false,
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      }, 401);
    }

    await next();
  };
}

// Use in routes
app.post('/protected-endpoint', requireAuth(), async (c) => {
  const user = c.get('user');
  // User is guaranteed to exist here
});
```

### Input Sanitization
```typescript
import { z } from 'zod';

// Always validate and sanitize input
const moveSchema = z.object({
  player: z.string().regex(/^[a-zA-Z0-9_-]+$/), // Safe player names only
  moveData: z.object({
    row: z.number().int().min(0).max(2),
    col: z.number().int().min(0).max(2)
  })
});

// Use zValidator middleware
app.post('/move', zValidator('json', moveSchema), async (c) => {
  const move = c.req.valid('json'); // Guaranteed safe
});
```

## Deployment Pipeline

### CI/CD Setup (GitHub Actions)
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun run type-check
      - run: bun run lint
      - run: bun test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to production
        run: |
          # Your deployment script
          ./deploy.sh
```

### Local Development Workflow
```bash
# 1. Create feature branch
git checkout -b feature/my-new-game

# 2. Develop with hot reload
bun run dev

# 3. Add comprehensive tests
bun test my-new-game

# 4. Validate code quality
bun run lint:fix
bun run type-check

# 5. Test performance impact
npm run load-test:simple

# 6. Commit changes
git add .
git commit -m "feat: add my new game"

# 7. Push and create PR
git push origin feature/my-new-game
```

## Troubleshooting Development Issues

### TypeScript Errors
```bash
# Check for type errors
bun run type-check

# Common fixes:
# 1. Add missing imports
# 2. Update interface definitions
# 3. Add type assertions where needed
```

### Database Schema Changes
```bash
# 1. Update DatabaseProvider schema in database.ts
# 2. Add migration logic if needed
# 3. Test with fresh database
rm -f game_data/versus.db
bun run dev

# 4. Update tests with new schema
```

### Game Implementation Issues
```bash
# Debug game logic
LOG_LEVEL=debug bun run dev

# Test individual game
bun test my-game --verbose

# Check game registration
curl http://localhost:6789/api/v1/games | jq '.data | keys'
```

## Production Checklist

Before deploying to production:

### Code Quality
- [ ] All tests passing
- [ ] TypeScript compilation clean
- [ ] ESLint warnings resolved
- [ ] Code coverage >80%

### Security
- [ ] JWT_SECRET set securely
- [ ] Input validation comprehensive
- [ ] Rate limiting configured
- [ ] Error messages don't leak sensitive info

### Performance
- [ ] Load tests passing
- [ ] Memory usage acceptable
- [ ] Database queries optimized
- [ ] Response times within thresholds

### Monitoring
- [ ] Health checks functional
- [ ] Sentry integration working
- [ ] Backup system enabled
- [ ] Logging properly configured

### Documentation
- [ ] API documentation updated
- [ ] Game rules documented
- [ ] Deployment procedures tested
- [ ] Monitoring procedures verified

## Contributing Guidelines

### Code Review Process
1. **Self Review**: Check code quality and test coverage
2. **Automated Checks**: CI/CD pipeline validation
3. **Peer Review**: Team member code review
4. **Security Review**: Security-focused evaluation
5. **Performance Review**: Load testing validation

### Best Practices
- **Small PRs**: Keep changes focused and reviewable
- **Clear Commits**: Descriptive commit messages
- **Test Coverage**: Add tests for all new functionality
- **Documentation**: Update docs for API changes
- **Breaking Changes**: Clearly document and communicate

This developer guide ensures efficient onboarding and high-quality contributions to the Versus Game Server codebase.