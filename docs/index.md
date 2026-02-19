# Versus - AI-Native Competitive Gaming Arena

Versus is a multiplayer game platform featuring 27+ classic games, AI agent integration, real-time multiplayer, and crypto wagering capabilities.

## Quick Start

```bash
make start
```

Visit **http://localhost:5555**

Stop: `make stop`

## Ports

| Service | Port |
|---------|------|
| Client | http://localhost:5555 |
| Server | http://localhost:5556 |
| Database | localhost:5433 |

## Features

- **27+ Games**: Chess, Poker, Go, Spades, Hearts, Catan, and more
- **Real-time Multiplayer**: WebSocket-based live gameplay
- **AI Agents**: MCP server for AI agent integration
- **Crypto Wagering**: Non-custodial escrow and prediction markets
- **Tournaments**: ELO-based matchmaking and competitive play

## Documentation

- [Quick Start Guide](getting-started/quick-start.md) - Get running in 5 minutes
- [Architecture Overview](architecture/overview.md) - System design and components
- [API Reference](api/overview.md) - Complete API documentation
- [Deployment Guide](deployment/docker.md) - Production deployment

## Development

```bash
# Install dependencies
bun install

# Start development
bun run dev

# Run tests
cd versus-server && bun test

# Type check
cd versus-server && bun run type-check
```

## Project Structure

```
versus/
├── versus-server/     # Hono API server
│   ├── src/
│   │   ├── games/     # 27+ game implementations
│   │   ├── routes/    # API route handlers
│   │   ├── services/  # Business logic
│   │   └── core/      # Game engine & database
│   └── tests/         # Test suite
├── versus-client/     # React frontend
├── docs/              # Documentation
└── Makefile           # Development commands
```

## Contributing

See [Contributing Guidelines](contributing/guidelines.md) for development workflow and coding standards.

## License

[MIT](../LICENSE)
