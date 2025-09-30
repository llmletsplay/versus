# Versus - Multiplayer Game Platform

## Quick Start

```bash
make start    # Start everything
```

Visit **http://localhost:5555**

Stop: `make stop`

## Ports

- Client: http://localhost:5555
- Server: http://localhost:5556  
- Database: localhost:5433

## Commands

```bash
make start      # Start all services
make stop       # Stop all services
make logs-view  # View logs
make clean      # Remove all data
```

## Why This Setup?

**Hybrid approach = Best of both worlds:**
- PostgreSQL in Docker (isolated)
- Code runs locally with Bun (fast hot reload)

**Benefits:**
- 5-second startup
- Instant code changes
- Easy debugging
- No Docker build hangs

## Docs

- `QUICK_START.md` - Getting started guide
- `PACKAGE_MANAGER.md` - Why Bun vs npm/pnpm
- `Makefile` - 4 simple commands

## Troubleshooting

```bash
# Missing deps
cd versus-server && bun install
cd versus-client && bun install

# Clean start
make clean && make start
```
