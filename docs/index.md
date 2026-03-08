# Versus

Versus is a package-first multiplayer game platform with reusable game engines, a real-time server, and an experimental wagering/intents layer.

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

## Release Position

- Stable: game packages, game core, multiplayer APIs, auth, rooms, ratings, tournaments, MCP/OpenClaw-facing game APIs
- Experimental: wagers, x402 payments, prediction markets, solver bridges, NEAR/Base/Solana intent settlement

## Features

- **27+ Games**: Chess, Poker, Go, Spades, Hearts, Catan, and more
- **Reusable Packages**: Game logic is extracted into `packages/*`
- **Real-time Multiplayer**: WebSocket-based live gameplay
- **AI Agents**: MCP server and OpenClaw bridge for agent play
- **Platform Services**: Rooms, ratings, and tournaments

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
cd versus-server && bun run test

# Type check
cd versus-server && bun run type-check
```

## Project Structure

```
versus/
├── packages/          # Reusable game packages
├── versus-server/     # Hono platform server
├── versus-client/     # React frontend
├── docs/              # Documentation
└── Makefile           # Development commands
```

## Contributing

See [Contributing Guidelines](contributing/guidelines.md) for development workflow and coding standards.

## License

[MIT](../LICENSE)
