# Deployment Guide - Versus Game Server

## Quick Start

### 🚀 **Production Deployment (Recommended)**
```bash
# Clone and setup
git clone https://github.com/lightnolimit/versus.git
cd versus

# Set environment variables
cp versus-server/env.example versus-server/.env
# Edit .env with your configuration

# Deploy to production
./deploy.sh
```

### 🧪 **Development Deployment**
```bash
# Install dependencies
bun install

# Start development servers
bun run dev        # Both client and server
# OR
bun run dev:server # Server only
bun run dev:client # Client only
```

## Platform-Specific Deployments

### 1. **Traditional Hosting (Docker)**

#### Prerequisites
- Docker and Docker Compose
- 2GB+ RAM recommended
- 10GB+ disk space

#### Configuration
```bash
# 1. Environment Setup
cp versus-server/env.example versus-server/.env

# 2. Required Environment Variables
JWT_SECRET=your-super-secure-jwt-secret-key
DATABASE_URL=postgresql://user:pass@host:port/db  # Optional: Use PostgreSQL
SENTRY_DSN=https://your-sentry-dsn@sentry.io      # Optional: Error monitoring

# 3. Production Deployment
./deploy.sh
```

#### Docker Compose Services
- **versus-server**: Hono API server with authentication
- **versus-client**: React frontend with Nginx
- **nginx**: Reverse proxy with rate limiting (optional)

### 2. **Cloudflare Workers (Serverless)**

#### Prerequisites
- Cloudflare account
- Wrangler CLI installed
- D1 Database (optional) or external PostgreSQL

#### Setup
```bash
# 1. Install Wrangler
npm install -g wrangler

# 2. Login to Cloudflare
wrangler login

# 3. Create D1 Database (optional)
wrangler d1 create versus-game-db

# 4. Configure wrangler.toml
# Update database_id in versus-server/wrangler.toml

# 5. Set secrets
wrangler secret put JWT_SECRET
wrangler secret put SENTRY_DSN

# 6. Deploy
cd versus-server
bun run deploy:cloudflare
```

#### Cloudflare Workers Features
- **Edge Deployment**: Global distribution with <50ms latency
- **Auto-scaling**: Handles traffic spikes automatically
- **D1 Database**: Serverless SQLite with global replication
- **Zero Cold Starts**: Always-warm execution environment

### 3. **Platform-as-a-Service (PaaS)**

#### Railway
```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login and deploy
railway login
railway link
railway up
```

#### Vercel
```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Deploy
vercel --prod
```

#### Fly.io
```bash
# 1. Install Fly CLI
curl -L https://fly.io/install.sh | sh

# 2. Deploy
fly deploy
```

## Environment Configuration

### Required Variables
```bash
# Core Configuration
NODE_ENV=production
PORT=6789
JWT_SECRET=your-secure-secret-key

# Database (choose one)
DATABASE_URL=postgresql://user:pass@host:port/db  # PostgreSQL
# OR use SQLite (automatic)

# CORS Security
CORS_ORIGIN=https://yourdomain.com
```

### Optional Variables
```bash
# Monitoring
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project
APP_VERSION=2.0.0

# Backup Configuration
BACKUP_ENABLED=true
BACKUP_SCHEDULE=daily
BACKUP_RETENTION_DAYS=30
BACKUP_PATH=./game_data/backups

# Performance Tuning
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=info
```

## Database Setup

### SQLite (Default)
```bash
# Automatic setup - no configuration needed
# Database file: ./game_data/versus.db
```

### PostgreSQL (Production)
```bash
# 1. Create database
createdb versus_production

# 2. Set connection string
export DATABASE_URL="postgresql://user:password@localhost:5432/versus_production"

# 3. Database auto-initializes on first startup
```

### Cloudflare D1
```bash
# 1. Create D1 database
wrangler d1 create versus-game-db

# 2. Update wrangler.toml with database ID

# 3. Deploy with D1 binding
wrangler deploy
```

## Monitoring Setup

### Basic Monitoring (Built-in)
```bash
# Health checks
curl http://localhost:6789/api/v1/health

# Performance metrics
curl http://localhost:6789/api/v1/metrics

# Application logs
docker-compose logs -f versus-server
```

### Sentry Error Monitoring
```bash
# 1. Create Sentry project at sentry.io
# 2. Get DSN from project settings
# 3. Set environment variable
export SENTRY_DSN="https://your-dsn@sentry.io/project-id"

# 4. Restart application
./deploy.sh
```

### Advanced Monitoring (Optional)
```bash
# Start monitoring stack
docker-compose -f monitoring/docker-compose.monitoring.yml up

# Access dashboards
# Grafana: http://localhost:3001 (admin/admin)
# Prometheus: http://localhost:9090
```

## Backup & Recovery

### Automated Backups
```bash
# Enable automatic backups in .env
BACKUP_ENABLED=true
BACKUP_SCHEDULE=daily
BACKUP_RETENTION_DAYS=30

# Manual backup operations
npm run backup:create         # Create backup now
npm run backup:list          # List all backups
npm run backup:restore <id>  # Restore specific backup
```

### Disaster Recovery Procedures

#### Complete System Recovery
```bash
# 1. Set up new environment
git clone https://github.com/lightnolimit/versus.git
cd versus

# 2. Configure environment
cp versus-server/env.example versus-server/.env
# Set your configuration

# 3. Restore from backup
npm run backup:list
npm run backup:restore backup-2024-01-15T10-30-00-000Z

# 4. Restart services
./deploy.sh
```

#### Point-in-Time Recovery
```bash
# 1. Identify restore point
npm run backup:list

# 2. Stop current services
docker-compose down

# 3. Restore database
npm run backup:restore <backup-id>

# 4. Restart with restored data
./deploy.sh
```

## Performance Optimization

### Load Testing
```bash
# Quick performance test
npm run load-test:simple

# Comprehensive load testing
npm run load-test

# Custom load testing
k6 run load-tests/api-load-test.js --vus 50 --duration 5m
```

### Database Optimization
```bash
# Monitor slow queries (PostgreSQL)
# Add to postgresql.conf:
log_min_duration_statement = 100ms

# SQLite optimization
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = 1000000;
```

### Memory Optimization
```bash
# Monitor memory usage
npm run metrics

# Container memory limits (docker-compose.yml)
deploy:
  resources:
    limits:
      memory: 1G
    reservations:
      memory: 512M
```

## Security Hardening

### SSL/TLS Setup
```bash
# Using Let's Encrypt with nginx
certbot --nginx -d yourdomain.com

# Update nginx.conf for HTTPS redirect
server {
    listen 80;
    return 301 https://$server_name$request_uri;
}
```

### Firewall Configuration
```bash
# Allow only necessary ports
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw allow 6789  # API (if direct access needed)
ufw enable
```

### Security Headers
```nginx
# nginx.conf security headers
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

## Troubleshooting

### Common Issues

#### Database Connection Errors
```bash
# Check database status
npm run health:check

# Verify database configuration
echo $DATABASE_URL

# Test database connectivity
psql $DATABASE_URL -c "SELECT 1;"
```

#### Authentication Issues
```bash
# Verify JWT secret is set
echo $JWT_SECRET

# Check user table exists
npm run health:check

# Reset user data (caution!)
npm run backup:create  # Backup first
# Then reset auth tables
```

#### Performance Issues
```bash
# Check memory usage
npm run metrics

# Run performance test
npm run load-test:simple

# Check database performance
npm run health:check
```

### Log Analysis
```bash
# Application logs
docker-compose logs -f versus-server

# Error analysis
docker-compose logs versus-server | grep ERROR

# Performance analysis
docker-compose logs versus-server | grep "response time"
```

## Scaling Considerations

### Horizontal Scaling
- **Stateless Design**: All state stored in database
- **Load Balancer**: Nginx or cloud load balancer
- **Database**: Use PostgreSQL with connection pooling
- **Session Storage**: JWT tokens (stateless)

### Vertical Scaling
- **Memory**: Monitor with `/api/v1/metrics`
- **CPU**: Database operations are primary bottleneck
- **Storage**: Database size grows with game history
- **Network**: Minimal bandwidth requirements

### Cloudflare Workers Scaling
- **Automatic**: Scales to 0-10M+ requests automatically
- **Global**: Deployed to 200+ edge locations
- **Cost**: Pay-per-request pricing model
- **Limits**: 128MB memory, 10ms CPU time per request

## Maintenance

### Regular Tasks
- **Security Updates**: Update dependencies monthly
- **Backup Verification**: Test restore procedures quarterly
- **Performance Review**: Analyze metrics weekly
- **Log Rotation**: Configure log retention policies

### Monitoring Checklist
- [ ] Health checks responding
- [ ] Error rates within thresholds
- [ ] Backup system functioning
- [ ] Database performance acceptable
- [ ] Security headers present
- [ ] Rate limiting effective

This deployment guide ensures your Versus Game Server runs reliably in production with enterprise-grade operational practices.