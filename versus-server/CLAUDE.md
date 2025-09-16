# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Versus is a multiplayer game server supporting 29+ games with REST API and AI integration via Model Context Protocol (MCP). The project uses Bun runtime with TypeScript and follows abstract base class patterns for game implementations.

## Development Commands

### Server (versus-server)

```bash
bun run dev          # Start development server with hot reload
bun test            # Run all tests
bun test:watch      # Run tests in watch mode
bun run lint        # Lint code
bun run lint:fix    # Auto-fix linting issues
bun run format      # Format code with Prettier
bun run type-check  # TypeScript type checking
bun run build       # Build for production
bun run mcp         # Start MCP server for AI integration
```

### Client (versus-client)

```bash
bun run dev         # Start Vite dev server
bun run build       # Build for production
bun run lint        # Lint code
bun run format      # Format code
bun run type-check  # TypeScript type checking
```

### Docker Development (Recommended)

```bash
./docker-start.sh   # Start all services with Docker
```

## Architecture

### Game Implementation Pattern

All games extend `BaseGame` abstract class and must implement:

- `initializeGame(config?)` - Set up initial state
- `validateMove(moveData)` - Check if move is legal
- `applyMove(move)` - Apply validated move to state
- `getGameState()` - Return current state
- `isGameOver()` - Check if game ended
- `getWinner()` - Return winner or null
- `getMetadata()` - Return game info

Example implementation: `versus-server/src/games/tic-tac-toe/TicTacToe.ts`

### API Structure

RESTful endpoints at `/api/v1/`:

- `POST /v1/games/:gameType/new` - Create game
- `GET /v1/games/:gameType/:gameId/state` - Get state
- `POST /v1/games/:gameType/:gameId/move` - Make move
- `GET /v1/games` - List game types

### State Management

- In-memory state with automatic JSON persistence to `./game_data/`
- Move history tracking for replay/restore
- Immutable state updates using helper methods

### Type System

Key interfaces in `versus-server/src/types/`:

- `GameState` - Base state structure
- `GameMove` - Move data format
- `GameMetadata` - Game information
- Position/Board types for board games
- Card types for card games

## Environment Setup

Create `.env` from `env.example`:

```
PORT=6789
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
GAME_DATA_PATH=./game_data
MCP_PORT=4445
LOG_LEVEL=info
```

## Testing

- Run specific test: `bun test <test-name>`
- Tests use Jest with TypeScript
- Each game has comprehensive test coverage
- Pre-commit hooks run linting and formatting

## Adding New Games

1. Create folder in `versus-server/src/games/`
2. Extend `BaseGame` class
3. Implement required abstract methods
4. Register in `GameManager`
5. Add tests following existing patterns
6. Update game count in documentation

See `versus-server/GAME_DEVELOPMENT_GUIDE.md` for detailed instructions.

## Important Notes

- Use Bun runtime (fallback to Node.js if needed)
- All moves are validated before applying
- Game state persists automatically
- MCP server enables AI agent gameplay
- Docker setup handles all dependencies
- Pre-commit hooks ensure code quality
