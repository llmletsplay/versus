# Versus Docker Setup

This document explains how to run the Versus application using Docker.

## Prerequisites

- Docker Desktop installed and running
- Docker Compose (included with Docker Desktop)

## Quick Start

### Option 1: Use the startup script (Recommended)

```bash
./docker-start.sh
```

This script will:
- Build both client and server containers
- Start the services with health checks
- Wait for both services to be ready
- Display the application URLs
- Follow the logs

### Option 2: Manual Docker Compose

```bash
# Build and start services
docker-compose up --build -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Production Deployment

For production deployment, use the production override:

```bash
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Application URLs

- **Client (React App)**: http://localhost:3000
- **Server (API)**: http://localhost:4444
- **API Documentation**: http://localhost:4444/api/v1/docs
- **Health Checks**: 
  - Client: http://localhost:3000/health
  - Server: http://localhost:4444/api/v1/health

## Architecture

### Client Container
- **Base Image**: `nginx:alpine`
- **Build Process**: Multi-stage build with Bun
- **Port**: 3000
- **Features**: 
  - Optimized Nginx configuration
  - SPA routing support
  - Gzip compression
  - Security headers
  - Static asset caching

### Server Container
- **Base Image**: `oven/bun:1`
- **Build Process**: Multi-stage build with production optimization
- **Port**: 4444
- **Features**:
  - Production-optimized build
  - Non-root user execution
  - Health checks
  - Persistent game data storage

### Networking
- Both containers run on a custom bridge network (`versus-network`)
- Client depends on server health check before starting
- CORS configured for client-server communication

### Volumes
- `game_data`: Persistent storage for game state and statistics

## Development

### Building Individual Services

```bash
# Build server only
docker-compose build server

# Build client only
docker-compose build client
```

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f server
docker-compose logs -f client
```

### Executing Commands in Containers

```bash
# Access server container
docker-compose exec server /bin/bash

# Access client container
docker-compose exec client /bin/sh

# Run server tests
docker-compose exec server bun test
```

### Environment Variables

The server supports these environment variables:

- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port (default: 4444)
- `CORS_ORIGIN`: Allowed CORS origin (default: http://localhost:3000)
- `GAME_DATA_PATH`: Path for game data storage (default: /app/game_data)

## Troubleshooting

### Common Issues

1. **Port conflicts**: Make sure ports 3000 and 4444 are not in use
2. **Docker not running**: Ensure Docker Desktop is started
3. **Build failures**: Clear Docker cache with `docker system prune -a`

### Useful Commands

```bash
# Check container status
docker-compose ps

# Restart services
docker-compose restart

# Rebuild without cache
docker-compose build --no-cache

# View resource usage
docker stats

# Clean up everything
docker-compose down -v --rmi all
```

### Health Check Status

Both services include health checks:

```bash
# Check health status
docker-compose ps

# Manual health check
curl http://localhost:3000/health
curl http://localhost:4444/api/v1/health
```

## Performance

### Resource Limits (Production)

- **Server**: 1 CPU, 512MB RAM
- **Client**: 0.5 CPU, 256MB RAM

### Optimization Features

- Multi-stage builds for smaller images
- Nginx gzip compression
- Static asset caching
- Non-root user execution
- Log rotation
- Health monitoring

## Security

- Non-root user execution in both containers
- Security headers in Nginx
- Minimal attack surface with Alpine Linux
- Network isolation with custom bridge network 