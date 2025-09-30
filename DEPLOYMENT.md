# Deployment Guide - Versus Game Platform

This guide covers both local Docker deployment and one-click Railway deployment.

---

## 🚀 Quick Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/versus-game-platform?referralCode=versus)

### One-Click Railway Deployment

1. Click the "Deploy on Railway" button above
2. Railway will automatically:
   - Create a PostgreSQL database
   - Deploy the Versus server
   - Set up environment variables
3. Configure these **required** environment variables in Railway:
   - `JWT_SECRET` - Generate with: `openssl rand -hex 32`
   - `CORS_ORIGIN` - Your frontend URL (or `*` for development)
4. Railway will automatically connect `DATABASE_URL` to your PostgreSQL service

### Manual Railway Deployment

If the button doesn't work, follow these steps:

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login to Railway
railway login

# 3. Create new project
railway init

# 4. Add PostgreSQL database
railway add --database postgresql

# 5. Set environment variables
railway variables set JWT_SECRET=$(openssl rand -hex 32)
railway variables set NODE_ENV=production
railway variables set CORS_ORIGIN=https://your-frontend-url.com
railway variables set LOG_LEVEL=info

# 6. Deploy
railway up
```

### Railway Configuration

Your deployment will automatically use:
- **Build Command**: `cd versus-server && bun install && bun run build`
- **Start Command**: `cd versus-server && node dist/server/node.js`
- **Health Check**: `/api/v1/health`
- **Port**: 6789 (auto-detected by Railway)

---

## 🐳 Local Docker Deployment

### Prerequisites

- Docker Desktop (Mac/Windows) or Docker Engine (Linux)
- Docker Compose v2.0+
- 4GB RAM minimum
- 2GB disk space

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/your-org/versus.git
cd versus

# 2. Copy environment file
cp .env.example .env

# 3. IMPORTANT: Edit .env and set your JWT_SECRET
# The default is provided for development only
# For production, generate a new one:
openssl rand -hex 32

# 4. Start all services (PostgreSQL + Server + Client)
docker-compose up -d

# 5. Check health
curl http://localhost:6789/api/v1/health

# 6. Access the application
# Server: http://localhost:6789
# Client: http://localhost:5173
# PostgreSQL: localhost:5432
```

### Docker Services

The `docker-compose.yml` includes:

1. **PostgreSQL Database** (postgres:16-alpine)
   - Port: 5432
   - Database: `versus_db`
   - User: `versus_user`
   - Password: Set in `.env`
   - Volume: `versus-postgres-data` (persistent)

2. **Versus Server** (Node.js/Hono)
   - Port: 6789
   - Health check: `/api/v1/health`
   - Depends on PostgreSQL
   - Volumes: game data, logs

3. **Versus Client** (React/Vite)
   - Port: 5173
   - Depends on server

### Environment Variables

Edit `.env` file with these required variables:

```bash
# REQUIRED
JWT_SECRET=your-64-character-hex-secret-here
DATABASE_URL=postgresql://versus_user:your_password@localhost:5432/versus_db

# Database Credentials (used by docker-compose)
POSTGRES_DB=versus_db
POSTGRES_USER=versus_user
POSTGRES_PASSWORD=your_secure_password_here

# Server Configuration
NODE_ENV=development
SERVER_PORT=6789
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=debug

# Optional
SENTRY_DSN=
BACKUP_ENABLED=true
```

### Common Docker Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f

# View server logs only
docker-compose logs -f versus-server

# Stop services
docker-compose down

# Stop and remove volumes (DELETES ALL DATA)
docker-compose down -v

# Rebuild after code changes
docker-compose up -d --build

# Check service status
docker-compose ps

# Execute psql in PostgreSQL container
docker exec -it versus-postgres psql -U versus_user -d versus_db

# Backup database
docker exec versus-postgres pg_dump -U versus_user versus_db > backup.sql

# Restore database
docker exec -i versus-postgres psql -U versus_user versus_db < backup.sql
```

### Database Management

#### Connect to PostgreSQL

```bash
# Using docker exec
docker exec -it versus-postgres psql -U versus_user -d versus_db

# Using local psql client
psql postgresql://versus_user:your_password@localhost:5432/versus_db
```

#### Useful SQL Commands

```sql
-- List all tables
\dt

-- View game states
SELECT game_id, game_type, status, created_at FROM game_states ORDER BY created_at DESC LIMIT 10;

-- View active games
SELECT game_id, game_type, players FROM game_states WHERE status IN ('active', 'waiting');

-- View users
SELECT id, username, email, is_active, role FROM users;

-- View activity log
SELECT game_type, action, timestamp FROM activity_log ORDER BY timestamp DESC LIMIT 20;

-- Database size
SELECT pg_size_pretty(pg_database_size('versus_db'));

-- Table sizes
SELECT
    schemaname AS schema,
    tablename AS table,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Troubleshooting

#### Server won't start

```bash
# Check logs
docker-compose logs versus-server

# Common issues:
# 1. JWT_SECRET not set
#    Solution: Edit .env and set JWT_SECRET

# 2. Database connection failed
#    Solution: Check postgres container is running
docker-compose ps postgres

# 3. Port already in use
#    Solution: Change SERVER_PORT in .env
```

#### Database connection refused

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check PostgreSQL logs
docker-compose logs postgres

# Test connection
docker exec versus-postgres pg_isready -U versus_user

# Restart PostgreSQL
docker-compose restart postgres
```

#### Can't connect to server from client

```bash
# Check server health
curl http://localhost:6789/api/v1/health

# Check CORS settings
# Make sure CORS_ORIGIN in .env matches your client URL
```

---

## 🌐 Production Deployment

### Railway Production Setup

1. **Enable PostgreSQL Connection Pooling**
   ```bash
   railway variables set DATABASE_CONNECTION_POOL_SIZE=20
   ```

2. **Set Production Environment**
   ```bash
   railway variables set NODE_ENV=production
   railway variables set LOG_LEVEL=info
   ```

3. **Configure Monitoring**
   ```bash
   # Get your Sentry DSN from sentry.io
   railway variables set SENTRY_DSN=https://your-sentry-dsn
   ```

4. **Enable Backups**
   ```bash
   railway variables set BACKUP_ENABLED=true
   railway variables set BACKUP_SCHEDULE=daily
   railway variables set BACKUP_RETENTION_DAYS=30
   ```

5. **Set CORS for Production**
   ```bash
   # Replace with your actual frontend domain
   railway variables set CORS_ORIGIN=https://your-app.com
   ```

### Security Checklist

Before going to production:

- [ ] Generate a new JWT_SECRET (don't use the development one)
- [ ] Set strong PostgreSQL password
- [ ] Configure CORS_ORIGIN to your specific domain (not `*`)
- [ ] Enable Sentry monitoring
- [ ] Set up database backups
- [ ] Configure LOG_LEVEL=info or warn (not debug)
- [ ] Review and rotate secrets regularly
- [ ] Enable Railway's built-in monitoring
- [ ] Set up custom domain with HTTPS
- [ ] Configure rate limiting (already built-in)

### Scaling on Railway

Railway auto-scales based on traffic, but you can configure:

```bash
# Set minimum instances (for zero downtime)
railway variables set RAILWAY_MIN_INSTANCES=1

# Set maximum instances
railway variables set RAILWAY_MAX_INSTANCES=5

# Set CPU/Memory limits (Railway dashboard)
# Recommended: 1 CPU, 1GB RAM for starter
```

---

## 📊 Monitoring

### Health Check Endpoints

```bash
# Server health
curl https://your-app.railway.app/api/v1/health

# Metrics
curl https://your-app.railway.app/api/v1/metrics
```

### Railway Logs

```bash
# View live logs
railway logs

# View last 100 lines
railway logs --tail 100
```

### Database Monitoring

```bash
# Connect to Railway PostgreSQL
railway connect postgres

# Check active connections
SELECT count(*) FROM pg_stat_activity WHERE datname = 'versus_db';

# Check table sizes (see SQL commands above)
```

---

## 🔄 Updates and Maintenance

### Updating on Railway

Railway auto-deploys on every push to your main branch. To deploy manually:

```bash
# Push changes
git push origin main

# Or use Railway CLI
railway up
```

### Database Migrations

```bash
# For schema changes, create migration scripts in:
# versus-server/scripts/migrations/

# Example: versus-server/scripts/migrations/001_add_user_stats.sql
# Then run manually or via CI/CD
```

### Backup and Restore on Railway

```bash
# Backup (export from Railway)
railway run --service postgres pg_dump > backup.sql

# Restore
railway run --service postgres psql < backup.sql
```

---

## 🆘 Support

### Common Issues

1. **"JWT_SECRET is required" error**
   - Solution: Set JWT_SECRET in environment variables

2. **Database connection timeout**
   - Solution: Check DATABASE_URL is set correctly
   - Railway auto-sets this when you add PostgreSQL

3. **CORS errors in browser**
   - Solution: Set CORS_ORIGIN to match your frontend URL

4. **TypeScript errors**
   - Solution: Run `bun run type-check` and fix errors before deploying

### Getting Help

- Open an issue: https://github.com/your-org/versus/issues
- Railway Discord: https://discord.gg/railway
- Check logs: `railway logs` or `docker-compose logs`

---

## 📝 Additional Resources

- [Railway Documentation](https://docs.railway.app/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Hono Documentation](https://hono.dev/)