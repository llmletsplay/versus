# Deploy Versus Game Platform on Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/versus-game-platform?referralCode=versus)

## Quick Start

1. Click "Deploy on Railway" button above
2. Railway will create:
   - PostgreSQL database (automatic)
   - Versus game server (automatic)
3. Set required environment variables:
   - `JWT_SECRET` - Generate: `openssl rand -hex 32`
   - `CORS_ORIGIN` - Your frontend URL
4. Deploy! 🚀

## What You Get

- 🎮 27+ multiplayer games (Chess, Poker, Go, and more)
- 🔐 Full authentication system (JWT-based)
- 🗄️ PostgreSQL database (managed by Railway)
- 📊 Health monitoring and metrics
- 🔒 Production-ready security (rate limiting, helmet, CORS)
- 🌐 RESTful API + MCP server for AI agents

## Environment Variables

Railway will automatically set `DATABASE_URL` when you add PostgreSQL.

**Required** - You must set these:
```
JWT_SECRET=<generate with: openssl rand -hex 32>
CORS_ORIGIN=https://your-frontend-domain.com
```

**Optional** - Recommended for production:
```
NODE_ENV=production
LOG_LEVEL=info
SENTRY_DSN=<your-sentry-dsn>
BACKUP_ENABLED=true
BACKUP_SCHEDULE=daily
```

## After Deployment

### Test Your Deployment

```bash
# Health check
curl https://your-app.railway.app/api/v1/health

# Get available games
curl https://your-app.railway.app/api/v1/games

# Create a user
curl -X POST https://your-app.railway.app/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "player1",
    "email": "player1@example.com",
    "password": "SecurePassword123!"
  }'
```

### Connect Your Frontend

Update your frontend to point to your Railway URL:

```javascript
const API_URL = 'https://your-app.railway.app';
```

### Monitor Your App

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# View logs
railway logs

# Check metrics
railway metrics
```

## API Documentation

Once deployed, your API will be available at:

- **Health Check**: `GET /api/v1/health`
- **Metrics**: `GET /api/v1/metrics`
- **List Games**: `GET /api/v1/games`
- **Game Metadata**: `GET /api/v1/games/metadata`
- **Auth**:
  - Register: `POST /api/v1/auth/register`
  - Login: `POST /api/v1/auth/login`
- **Game Operations**:
  - Create Game: `POST /api/v1/games/:gameType`
  - Get State: `GET /api/v1/games/:gameId`
  - Make Move: `POST /api/v1/games/:gameId/move`

## Architecture

```
Railway Platform
├── PostgreSQL Database (managed)
│   ├── Game states
│   ├── User accounts
│   ├── Activity logs
│   └── Statistics
│
└── Versus Server (Node.js + Hono)
    ├── 27+ game implementations
    ├── JWT authentication
    ├── Rate limiting
    ├── Health monitoring
    └── MCP server for AI agents
```

## Cost Estimate

Railway pricing (as of 2024):
- **Starter Plan**: $5/month (includes $5 credit)
- **PostgreSQL**: $5/month (500MB)
- **Compute**: ~$0.01/hour (~$7.20/month for 1 instance)

**Total**: ~$12/month for full production deployment

**Free Tier**: $5 credit/month = 500 hours compute (enough for hobby projects)

## Scaling

Railway auto-scales based on traffic. Configure in Railway dashboard:
- Min instances: 1 (recommended for production)
- Max instances: 3-5 (based on your traffic)
- CPU/Memory: 1 CPU, 1GB RAM (sufficient for most use cases)

## Troubleshooting

### "JWT_SECRET is required" error
Set JWT_SECRET in Railway dashboard: `openssl rand -hex 32`

### Database connection error
Railway should auto-set `DATABASE_URL`. If not, check PostgreSQL service is running.

### CORS errors
Set `CORS_ORIGIN` to your frontend domain (don't use `*` in production)

### View logs
```bash
railway logs --tail 100
```

## Support

- [Full Documentation](./DEPLOYMENT.md)
- [GitHub Issues](https://github.com/your-org/versus/issues)
- [Railway Discord](https://discord.gg/railway)

## Local Development

Want to run locally first?

```bash
git clone https://github.com/your-org/versus.git
cd versus
cp .env.example .env
# Edit .env with your JWT_SECRET
docker-compose up -d
```

Server runs on http://localhost:6789

## License

MIT