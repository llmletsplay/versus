# Quick Start Guide for Production Deployment
**Priority Order - Do these FIRST**

## 🚨 IMMEDIATE ACTION REQUIRED (Day 1)

### 1. Fix Rate Limiting (CRITICAL - Security Vulnerability)
```bash
# Install rate limiting package for Hono
cd versus-server
bun add @hono/rate-limiter
```

Create `versus-server/src/middleware/rate-limit.ts`:
```typescript
import { rateLimiter } from '@hono/rate-limiter'

// General API rate limit
export const apiRateLimit = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests' },
})

// Auth rate limit (stricter)
export const authRateLimit = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: { error: 'Too many authentication attempts' },
})
```

Update `versus-server/src/app.ts`:
```typescript
import { apiRateLimit, authRateLimit } from './middleware/rate-limit'

// Add after compression middleware
app.use('/api/*', apiRateLimit)
app.use('/api/auth/*', authRateLimit)
```

### 2. Fix Test Suite (CRITICAL - Quality Gate)
```bash
cd versus-server
npm install --save-dev @jest/globals
```

Update `versus-server/jest.config.js`:
```javascript
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  // ... rest of config
}
```

### 3. Generate Secure Production Values
```bash
# Generate secure JWT secret
JWT_SECRET=$(openssl rand -hex 32)

# Generate database password
DB_PASSWORD=$(openssl rand -base64 32)

# Create production .env
cat > .env << EOF
NODE_ENV=production
SERVER_PORT=6789
CORS_ORIGIN=https://yourdomain.com
JWT_SECRET=${JWT_SECRET}
DATABASE_URL=postgresql://versus_user:${DB_PASSWORD}@localhost:5432/versus_db
BACKUP_ENABLED=true
SENTRY_DSN=your-sentry-dsn-here
EOF
```

## 📋 Today's Checklist (Must Complete)

- [ ] **Rate limiting implemented** - Cannot deploy without this
- [ ] **All tests passing** - Run `npm test` to verify
- [ ] **Secure JWT secret generated** - 32+ characters
- [ ] **Production .env created** - No placeholder values
- [ ] **Database selected** - PostgreSQL recommended

## 🏗️ Tomorrow (Day 2)

### 4. Set Up Production Database
**Option A: PostgreSQL (Recommended)**
```bash
# Using Docker for now
docker run --name versus-postgres \
  -e POSTGRES_DB=versus_db \
  -e POSTGRES_USER=versus_user \
  -e POSTGRES_PASSWORD=your_secure_password \
  -p 5432:5432 \
  -d postgres:16-alpine
```

**Option B: Railway (Easiest)**
1. Go to railway.app
2. Create new project
3. Add PostgreSQL service
4. Copy DATABASE_URL to .env

### 5. Create Production Docker Compose
Create `docker-compose.prod.yml`:
```yaml
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
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
    depends_on:
      - postgres
    restart: unless-stopped
    ports:
      - "6789:6789"

  client:
    build: ./versus-client
    ports:
      - "3000:3000"
    restart: unless-stopped

volumes:
  postgres_data:
```

## ⚡ Performance Quick Wins

### 6. Enable Compression (Already configured)
- ✅ Gzip enabled in nginx
- ✅ Static asset caching configured

### 7. Add Health Checks
```bash
# Test health endpoint
curl http://localhost:6789/api/v1/health
```

## 🔧 Quick Commands

```bash
# Build everything
npm run build

# Run with production config
NODE_ENV=production bun run start

# Check logs
docker-compose logs -f

# Test load (install first: bun install -g autocannon)
autocannon -c 100 -d 10 http://localhost:6789/api/v1/health
```

## 🎯 Minimum Viable Launch (Day 3)

If you need to launch ASAP, do the absolute minimum:

1. **Fix rate limiting** (2 hours)
2. **Fix tests** (3 hours)
3. **Deploy to Railway** (1 hour)
4. **Point domain** (30 minutes)

Total: ~6.5 hours

## 🚀 Railway Deployment (Fastest)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Add PostgreSQL
railway add postgresql

# Deploy server
cd versus-server
railway up

# Deploy client
cd ../versus-client
railway up

# Get URLs
railway domain
```

## 📊 Monitoring Setup (5 minutes)

1. Go to sentry.io
2. Create new project
3. Copy DSN to .env
4. Add to Railway environment variables

## ⚠️ Common Pitfalls

1. **Don't use the demo JWT secret** - Generate a new one
2. **Don't skip rate limiting** - You'll get DDoS'd
3. **Don't use SQLite in production** - Use PostgreSQL
4. **Don't forget to set NODE_ENV=production**
5. **Don't skip HTTPS** - Use Cloudflare or Let's Encrypt

## 🎁 Next Steps for Revenue

Once deployed:
1. Add Stripe for payments
2. Create premium subscription tiers
3. Set up tournament fees
4. Build analytics dashboard

## Need Help?

- Check the full DEPLOYMENT_PLAN.md for details
- Review server logs: `docker-compose logs server`
- Monitor errors in Sentry
- Check test output: `npm test -- --verbose`

**Remember: You can start making money as soon as the rate limiting is fixed and tests pass!**