# Docker Deployment

Deploy Versus using Docker Compose for production.

## Prerequisites

- Docker 20.x+
- Docker Compose v2.0+
- 4GB RAM minimum
- 20GB disk space

## Quick Start

```bash
# 1. Clone repository
git clone https://github.com/lightnolimit/versus.git
cd versus

# 2. Copy environment file
cp versus-server/env.example versus-server/.env

# 3. Generate secure secrets
openssl rand -hex 32  # JWT_SECRET

# 4. Edit .env with production values

# 5. Start services
docker-compose up -d

# 6. Verify
curl http://localhost:6789/api/v1/health
```

## Configuration

### Environment Variables

Create `versus-server/.env`:

```bash
# Required
NODE_ENV=production
PORT=6789
JWT_SECRET=your-64-character-secret
DATABASE_URL=postgresql://versus_user:password@postgres:5432/versus_db

# Database
POSTGRES_DB=versus_db
POSTGRES_USER=versus_user
POSTGRES_PASSWORD=secure_password_here

# CORS
CORS_ORIGIN=https://yourdomain.com

# Optional
SENTRY_DSN=https://your-dsn@sentry.io
BACKUP_ENABLED=true
BACKUP_SCHEDULE=daily
```

### Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  server:
    build: ./versus-server
    environment:
      NODE_ENV: production
      DATABASE_URL: ${DATABASE_URL}
      JWT_SECRET: ${JWT_SECRET}
      CORS_ORIGIN: ${CORS_ORIGIN}
    depends_on:
      - postgres
    restart: unless-stopped
    ports:
      - "6789:6789"

  client:
    build: ./versus-client
    restart: unless-stopped
    ports:
      - "3000:3000"

volumes:
  postgres_data:
```

## Build & Deploy

### Build Images

```bash
# Build all services
docker-compose build

# Build specific service
docker-compose build server
```

### Start Services

```bash
# Start all
docker-compose up -d

# Start specific service
docker-compose up -d server

# View logs
docker-compose logs -f
```

### Stop Services

```bash
# Stop all
docker-compose down

# Stop and remove volumes
docker-compose down -v
```

## Health Checks

```bash
# Server health
curl http://localhost:6789/api/v1/health

# Check service status
docker-compose ps

# View logs
docker-compose logs server --tail 100
```

## SSL/TLS Setup

### Using Let's Encrypt

```bash
# Install certbot
apt install certbot

# Generate certificate
certbot certonly --standalone -d yourdomain.com

# Copy certificates
cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem ssl/
cp /etc/letsencrypt/live/yourdomain.com/privkey.pem ssl/
```

### Nginx SSL Configuration

```nginx
server {
    listen 443 ssl;
    server_name yourdomain.com;
    
    ssl_certificate /etc/ssl/fullchain.pem;
    ssl_certificate_key /etc/ssl/privkey.pem;
    
    location /api/ {
        proxy_pass http://server:6789;
    }
    
    location / {
        proxy_pass http://client:3000;
    }
}
```

## Database Management

### Connect to PostgreSQL

```bash
docker exec -it versus-postgres psql -U versus_user -d versus_db
```

### Backup Database

```bash
# Create backup
docker exec versus-postgres pg_dump -U versus_user versus_db > backup.sql

# Restore backup
docker exec -i versus-postgres psql -U versus_user versus_db < backup.sql
```

### Migrations

Migrations run automatically on startup. For manual migration:

```bash
docker exec versus-server bun run migrate
```

## Scaling

### Horizontal Scaling

```bash
# Scale server instances
docker-compose up -d --scale server=3

# Use load balancer
# Update nginx to balance across instances
```

### Resource Limits

```yaml
services:
  server:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Monitoring

### Logs

```bash
# All logs
docker-compose logs -f

# Specific service
docker-compose logs -f server

# Last 100 lines
docker-compose logs --tail 100 server
```

### Metrics

```bash
# API metrics
curl http://localhost:6789/api/v1/metrics

# Container stats
docker stats
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker-compose logs server

# Check configuration
docker-compose config

# Rebuild
docker-compose build --no-cache server
```

### Database Connection Issues

```bash
# Check PostgreSQL
docker-compose ps postgres
docker-compose logs postgres

# Test connection
docker exec versus-postgres pg_isready
```

### Memory Issues

```bash
# Check memory usage
docker stats

# Increase limits
# Update docker-compose.yml memory settings
```

## Updates

### Update Application

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose build
docker-compose up -d
```

### Update Dependencies

```bash
# Rebuild with no cache
docker-compose build --no-cache
docker-compose up -d
```

## Security Checklist

- [ ] Strong JWT secret (32+ characters)
- [ ] Secure database password
- [ ] CORS restricted to your domain
- [ ] HTTPS enabled
- [ ] Rate limiting active
- [ ] Secrets not in version control
- [ ] Regular backups configured

## Next Steps

- [Production Checklist](production.md) - Pre-launch checklist
- [Monitoring](monitoring.md) - Set up monitoring
