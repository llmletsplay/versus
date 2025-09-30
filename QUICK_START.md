# Quick Start Guide

## Start Everything (One Command)

```bash
make start
```

**That's it!** Your services are now running:

- 🌐 **Client:** http://localhost:5555
- 🔌 **Server:** http://localhost:5556
- 🗄️ **Database:** localhost:5433

## Stop Everything

```bash
make stop
```

## View Logs

```bash
make logs-view    # Live tail of all logs (Ctrl+C to exit)

# Or view individually:
tail -f logs/server.log
tail -f logs/client.log
```

## Commands

```bash
make help       # Show all commands
make start      # Start everything
make stop       # Stop everything
make logs-view  # View live logs
make clean      # Remove all data and start fresh
```

## Custom Ports

Default ports are 5555 (client) and 5556 (server) to avoid conflicts.

To use different ports:
```bash
# Edit Makefile line 16-20, or set env vars:
PORT=8080 make start  # Changes both client and server
```

## Troubleshooting

### Dependencies missing
```bash
cd versus-server && bun install
cd versus-client && bun install
make start
```

### Clean restart
```bash
make clean
make start
```

### Check what's running
```bash
ps aux | grep "bun run dev"
docker ps
```

## What This Does

The `make start` command:
1. Starts PostgreSQL in Docker (port 5433)
2. Starts the server with Bun (port 5556, background process)
3. Starts the client with Vite (port 5555, background process)
4. Saves logs to `logs/server.log` and `logs/client.log`
5. Saves process IDs to `logs/*.pid` for clean shutdown

## Why These Ports?

- **5555/5556** - Chosen to avoid conflicts with common dev ports
- **5433** - PostgreSQL on non-standard port (5432 often in use)

All ports can be customized via environment variables.
