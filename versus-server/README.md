# Versus Game Server 🎮

A high-performance, extensible multiplayer game server built with TypeScript and Bun. Supporting 27 classic games with real-time gameplay, AI integration, and comprehensive testing.

## ✨ Features

- **27 Games**: Chess, Poker, Blackjack, Catan, Go, and many more
- **Real-time Multiplayer**: WebSocket-based real-time gameplay
- **AI Integration**: Model Context Protocol (MCP) for AI agents
- **Type-Safe**: Full TypeScript implementation with strict typing
- **High Performance**: Built on Bun for optimal speed
- **Extensible**: Easy-to-use framework for adding new games
- **Comprehensive Testing**: 200+ tests with high coverage
- **RESTful API**: Clean HTTP API for game management
- **Persistent State**: Automatic game state persistence

## 🚀 Quick Start

### Prerequisites

- [Bun](https://bun.sh/) 1.0+ (recommended) or Node.js 18+
- TypeScript 5.0+

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd versus-server

# Install dependencies
bun install

# Copy environment configuration
cp env.example .env

# Start the development server
bun run dev
```

### Verify Installation

```bash
# Run tests to ensure everything works
bun test

# Check code quality
bun run lint

# Start the server
bun start
```

## 🎯 Supported Games (27 Total)

### Board Games (10)

- **Chess** - Full implementation with all rules
- **Checkers** - American checkers with king promotion
- **Go** - Traditional Go with territory scoring
- **Othello/Reversi** - Classic disc-flipping game
- **Connect Four** - Drop-disc connection game
- **Tic-Tac-Toe** - Simple 3x3 grid game
- **Omok** - Korean five-in-a-row game
- **Mancala** - Ancient stone-capturing game
- **Chinese Checkers** - Star-board jumping game
- **Catan** - Resource management and building

### Card Games (10)

- **Poker** - Texas Hold'em with betting rounds
- **Blackjack** - Classic 21 with dealer mechanics
- **Hearts** - Trick-taking with penalty cards
- **Spades** - Partnership trick-taking game
- **Go Fish** - Card-matching collection game
- **Cuttle** - Strategic number card game
- **War** - Simple high-card comparison
- **Bullshit** - Bluffing and deception game
- **Thirteen** - Vietnamese shedding card game
- **Crazy Cards** - Uno-style card matching game

### Strategy Games (4)

- **Shogi** - Japanese chess variant
- **Martial Tactics** - Custom strategy game
- **Mahjong** - Traditional tile-based game

### Party Games (3)

- **Bingo** - Number-calling game
- **Word Tiles** - Word formation game
- **Battleship** - Naval combat guessing game
- **Against Cards** - Cards Against Humanity style game

## 📚 Documentation

- **[Developer Guide & Contributing](DEVELOPER_QUICKSTART.md)** - Complete guide for contributing and adding new games
- **[Architecture Guide](ARCHITECTURE.md)** - System design and patterns
- **[Game Development Guide](GAME_DEVELOPMENT_GUIDE.md)** - Comprehensive development guide
- **[Documentation Index](docs/README.md)** - Navigate all documentation easily

## 🛠️ API Usage

### Starting a Game

```bash
# Create a new chess game
curl -X POST http://localhost:6789/api/v1/games/chess/new \
  -H "Content-Type: application/json" \
  -d '{"config": {"playerCount": 2}}'
```

### Making a Move

```bash
# Make a chess move
curl -X POST http://localhost:6789/api/v1/games/chess/{gameId}/move \
  -H "Content-Type: application/json" \
  -d '{"player": "player1", "from": "e2", "to": "e4"}'
```

### Getting Game State

```bash
# Get current game state
curl http://localhost:6789/api/v1/games/chess/{gameId}/state
```

## 🤖 AI Integration

The server supports AI agents through the Model Context Protocol (MCP):

```bash
# Start MCP server
bun run mcp

# AI agents can now connect and play games
```

### Example AI Integration

```typescript
import { GameManager } from './src/core/game-manager.js';

const gameManager = new GameManager();
const game = await gameManager.createGame('chess');

// AI makes a move
await game.makeMove({
  player: 'ai-player',
  from: 'e2',
  to: 'e4',
});
```

## 🧪 Testing

```bash
# Run all tests
bun test

# Run specific game tests
bun test tests/chess.test.ts

# Run with coverage
bun test --coverage

# Watch mode for development
bun test --watch
```

### Test Coverage

- **200+ tests** across 27 test files
- **High test coverage** with comprehensive game testing
- **Unit tests** for all game logic
- **Integration tests** for API endpoints
- **Edge case testing** for error handling

## 🏗️ Architecture

### Core Components

```
src/
├── core/              # Game engine core
│   ├── base-game.ts   # Abstract base class
│   ├── game-manager.ts # Game lifecycle
│   └── stats-service.ts # Analytics
├── games/             # Game implementations
├── api/               # REST API
├── mcp/               # AI integration
├── types/             # TypeScript definitions
└── utils/             # Shared utilities
```

### Design Principles

- **SOLID Principles** - Clean, maintainable code
- **DRY (Don't Repeat Yourself)** - Reusable components
- **KISS (Keep It Simple)** - Straightforward implementations
- **Type Safety** - Comprehensive TypeScript usage
- **Test-Driven Development** - High test coverage

## 🔧 Development

### Adding a New Game

1. **Create game class** extending `BaseGame`
2. **Implement required methods** (validate, apply moves, etc.)
3. **Add comprehensive tests**
4. **Register in game index**
5. **Update documentation**

See [Developer Quick Start](DEVELOPER_QUICKSTART.md) for detailed instructions.

### Code Quality

```bash
# Lint code
bun run lint

# Format code
bun run format

# Type check
bun run type-check
```

## 📊 Performance

- **Sub-millisecond** move validation
- **Concurrent game support** for multiple players
- **Efficient state management** with persistence
- **Optimized algorithms** for game logic
- **Memory-efficient** data structures

## 🐳 Docker Support

```bash
# Build and run with Docker
docker build -t versus-server .
docker run -p 6789:6789 versus-server

# Or use docker-compose
docker-compose up
```

## 📈 Statistics

- **27 Games** implemented and tested
- **200+ Test cases** ensuring reliability
- **TypeScript** for type safety
- **Bun runtime** for performance
- **MCP integration** for AI agents

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Quick Contribution Steps

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Bun](https://bun.sh/) for optimal performance
- Inspired by classic board and card games
- Community-driven development
- AI-first design for modern gaming

---

**Ready to play?** Start the server and enjoy 27 classic games with friends or AI opponents! 🎮
