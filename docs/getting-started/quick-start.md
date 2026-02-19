# Quick Start Guide

Get Versus running locally in under 5 minutes.

## Prerequisites

- **Bun** >= 1.0.0 (recommended) or Node.js >= 18.0.0
- **Docker** and Docker Compose (for PostgreSQL)
- **Git**

## One Command Setup

```bash
make start
```

This single command:

1. Starts PostgreSQL in Docker (port 5433)
2. Starts the API server (port 5556)
3. Starts the React client (port 5555)

## Verify Installation

```bash
# Check server health
curl http://localhost:5556/api/v1/health

# Open the client
open http://localhost:5555
```

## Create Your First Game

```bash
# Register a user
curl -X POST http://localhost:5556/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"player1","email":"player1@example.com","password":"password123"}'

# Create a game (use token from registration)
curl -X POST http://localhost:5556/api/v1/games/tic-tac-toe/new \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Stop Services

```bash
make stop
```

## Troubleshooting

### Dependencies Missing

```bash
cd versus-server && bun install
cd versus-client && bun install
make start
```

### Clean Restart

```bash
make clean
make start
```

### Check Running Processes

```bash
ps aux | grep "bun run dev"
docker ps
```

## View Logs

```bash
make logs-view    # Live tail of all logs

# Or individually:
tail -f logs/server.log
tail -f logs/client.log
```

## Custom Ports

Default ports (5555/5556) avoid conflicts with common development ports. To use different ports:

```bash
PORT=8080 make start
```

## Next Steps

- [Development Workflow](development.md) - Daily development practices
- [API Overview](../api/overview.md) - Learn the API
- [Adding Games](../contributing/adding-games.md) - Create new games
