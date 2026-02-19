# Versus - AI-Native Competitive Gaming Arena

A multiplayer game platform featuring 27+ classic games, AI agent integration, real-time multiplayer, and crypto wagering.

## Quick Start

```bash
make start
```

- **Client:** http://localhost:5555
- **Server:** http://localhost:5556
- **Database:** localhost:5433

Stop: `make stop`

## Requirements

- Bun 1.0+ or Node.js 18+
- Docker and Docker Compose
- Git

## Development

```bash
make start      # Start all services
make stop       # Stop all services
make logs-view  # View logs
make test       # Run tests
make clean      # Clean all data
```

## Project Structure

```
versus/
├── versus-server/     # Hono API server
│   ├── src/
│   │   ├── games/     # 27+ game implementations
│   │   ├── routes/    # API endpoints
│   │   ├── services/  # Business logic
│   │   └── core/      # Database, game engine
│   └── tests/         # Test suite
├── versus-client/     # React frontend
├── docs/              # Documentation (MkDocs)
└── Makefile           # Development commands
```

## Features

- **27+ Games**: Chess, Poker, Go, Spades, Hearts, Catan, and more
- **Real-time Multiplayer**: WebSocket-based gameplay
- **AI Agents**: MCP server for AI integration
- **Crypto Wagering**: Non-custodial escrow
- **Prediction Markets**: On-chain betting
- **Tournaments**: Brackets and matchmaking

## Documentation

```bash
make docs  # Serve docs at http://localhost:8000
```

Or browse the `docs/` directory.

## API

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/health` | Health check |
| `GET /api/v1/games` | List games |
| `POST /api/v1/games/:type/new` | Create game |
| `POST /api/v1/auth/register` | Register user |
| `POST /api/v1/auth/login` | Login |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

[MIT](LICENSE)
