# Versus 🎮

A comprehensive multiplayer game platform featuring 27 classic games with AI integration, real-time gameplay, and modern web technologies.

![License](https://img.shields.io/badge/license-MIT-green)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue)
![Bun](https://img.shields.io/badge/Bun-1.0+-orange)
![React](https://img.shields.io/badge/React-19-61dafb)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ed)

## 🌟 Features

- **27 Classic Games** - Chess, Poker, Go, Hearts, Spades, and many more
- **AI Integration** - Model Context Protocol (MCP) support for AI agents
- **Real-time Gameplay** - WebSocket support for live multiplayer
- **Modern Stack** - TypeScript, React 19, Vite, Bun runtime
- **Comprehensive Rules** - Built-in rules documentation for every game
- **Production Ready** - Docker, CI/CD, monitoring, and scaling
- **Open Source** - MIT licensed with active community

## 🎯 Supported Games

### Board Games (10)
Chess • Checkers • Go • Othello • Connect Four • Tic-Tac-Toe • Omok • Mancala • Chinese Checkers • Catan

### Card Games (10)
Poker • Blackjack • Hearts • Spades • Go Fish • Cuttle • War • Bullshit • Thirteen • Crazy Cards

### Strategy Games (3)
Shogi • Martial Tactics • Mahjong

### Party Games (4)
Bingo • Word Tiles • Battleship • Against Cards

## 🚀 Quick Start

### Prerequisites
- [Bun](https://bun.sh/) 1.0+ or Node.js 18+
- Docker & Docker Compose (optional)
- Git

### Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/versus.git
cd versus

# Install dependencies
bun install
bun run setup

# Start both server and client concurrently
bun run dev
```

- **Server**: http://localhost:6789
- **Client**: http://localhost:5173

### Docker Development

```bash
# Start with Docker Compose
docker-compose up

# Or use the convenience script
./docker-start.sh

# For development mode with hot reload
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## 🏗️ Architecture

```
versus/
├── versus-server/          # Game server (API + MCP)
│   ├── src/
│   │   ├── games/         # 27 game implementations
│   │   ├── api/           # REST API endpoints
│   │   ├── core/          # Game engine core
│   │   └── mcp/           # AI integration
│   ├── tests/             # Comprehensive test suite
│   └── docs/              # Server documentation
├── versus-client/          # React web client
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Application pages
│   │   └── services/      # API client
│   └── public/            # Static assets
├── docker-compose.yml      # Production config
├── docker-compose.dev.yml  # Development config
└── nginx.conf             # Reverse proxy config
```

## 🛠️ Development

### Available Scripts

```bash
# Development
bun run dev              # Start both server and client
bun run dev:server       # Start server only
bun run dev:client       # Start client only

# Testing
bun test                 # Run server tests
bun run lint             # Lint all code
bun run type-check       # TypeScript checking

# Building
bun run build            # Build both projects
bun run docker:build     # Build Docker images

# Docker
bun run docker:up        # Start containers
bun run docker:down      # Stop containers
bun run docker:logs      # View logs
```

### Adding a New Game

1. Create game implementation in `versus-server/src/games/`
2. Extend the `BaseGame` class
3. Add comprehensive tests
4. Create rules documentation in `versus-server/docs/rules/`
5. Register in game index

See [Game Development Guide](versus-server/GAME_DEVELOPMENT_GUIDE.md) for details.

## 🔗 API Reference

### Game Management

```typescript
// List all games
GET /api/v1/games

// Get game metadata
GET /api/v1/games/:gameType/metadata

// Get game rules
GET /api/v1/games/:gameType/rules

// Create new game
POST /api/v1/games/:gameType/new
Body: { config?: { maxPlayers?, customRules? } }

// Get game state
GET /api/v1/games/:gameType/:gameId/state

// Make a move
POST /api/v1/games/:gameType/:gameId/move
Body: { player: string, moveData: any }
```

### Statistics & Health

```typescript
// Global statistics
GET /api/v1/stats

// Game-specific stats
GET /api/v1/stats/:gameType

// Health check
GET /api/v1/health
```

## 🤖 AI Integration

Versus supports AI agents through the Model Context Protocol (MCP):

```bash
# Start MCP server
cd versus-server
bun run mcp

# AI agents can connect on port 4445
```

### MCP Tools Available
- `list_games` - Get available games
- `create_game` - Start a new game
- `get_game_state` - View current state
- `make_move` - Submit a move
- `get_game_rules` - Read game rules

## 🐳 Docker Deployment

### Production Deployment

```bash
# Build and run production
docker-compose build
docker-compose up -d

# With nginx proxy (port 80)
docker-compose --profile production up -d
```

### Environment Variables

```bash
# Server
NODE_ENV=production
PORT=6789
CORS_ORIGIN=http://localhost:5173
GAME_DATA_PATH=/app/game_data
LOG_LEVEL=info

# Client  
VITE_API_URL=http://localhost:6789
VITE_ENABLE_DEBUG=false
```

## 🧪 Testing

- **200+ Tests** across all games
- **High Coverage** for game logic
- **Integration Tests** for API endpoints
- **Pre-commit Hooks** for quality

```bash
# Run all tests
bun test

# Run specific game tests
bun test chess

# Watch mode
bun test --watch
```

## 📊 Monitoring

### Built-in Monitoring
- Game statistics tracking
- Player activity metrics  
- Performance monitoring
- Error tracking

### Observability
- Health endpoints
- Structured logging
- Metrics collection ready
- Docker health checks

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Quick Contribution Steps

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`bun test`)
5. Submit a Pull Request

### Code Quality

- TypeScript strict mode
- ESLint + Prettier
- Pre-commit hooks with Husky
- Automated CI/CD checks
- Code review by maintainers

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built with [Bun](https://bun.sh/) for blazing performance
- React 19 with [Vite](https://vitejs.dev/) for modern UI
- Inspired by classic games from around the world
- Community contributors and testers

## 🔮 Roadmap

- [ ] WebSocket multiplayer support
- [ ] Tournament system
- [ ] Player rankings and leaderboards
- [ ] Mobile app (React Native)
- [ ] Additional games (30+ planned)
- [ ] Internationalization (i18n)
- [ ] Advanced AI opponents

## 📞 Support

- **Documentation**: [Full Docs](docs/)
- **Issues**: [GitHub Issues](https://github.com/yourusername/versus/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/versus/discussions)

---

**Ready to play?** 🎮 Start the server, launch the client, and enjoy 27 classic games!