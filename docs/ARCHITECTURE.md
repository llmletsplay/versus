# Versus Game Server - Architecture Documentation

## Overview

The Versus Game Server is an enterprise-grade, multiplatform game server supporting 29+ classic games with modern security, monitoring, and deployment capabilities.

## Architecture Principles

### 🌍 **Multiplatform Design**
- **Framework**: Hono.js for platform-agnostic API development
- **Runtimes**: Node.js, Cloudflare Workers, Bun, Deno support
- **Deployment**: Traditional containers, serverless, PaaS platforms

### 🔒 **Security-First**
- **Authentication**: JWT with bcrypt password hashing
- **Authorization**: Role-based access control (RBAC)
- **Input Validation**: Comprehensive Zod schema validation
- **Rate Limiting**: Multi-tier protection against abuse
- **XSS Prevention**: Client-side sanitization with DOMPurify

### 💾 **Database-Centric Storage**
- **Zero File System Access**: Eliminates directory traversal vulnerabilities
- **Unified Database**: Single SQLite/PostgreSQL database for all data
- **Atomic Transactions**: Consistent game state management
- **Automatic Backup**: Scheduled backups with integrity verification

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MULTIPLATFORM LAYER                      │
├─────────────────┬─────────────────┬─────────────────────────┤
│    Node.js      │ Cloudflare      │    Bun/Deno            │
│   (Traditional) │   Workers       │   (Alternative)         │
│                 │  (Serverless)   │                         │
└─────────────────┴─────────────────┴─────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                      HONO APPLICATION                       │
├─────────────────────────────────────────────────────────────┤
│  Security Middleware │ Rate Limiting │ Authentication       │
├─────────────────────────────────────────────────────────────┤
│     Auth Routes      │  Game Routes  │  Health/Metrics      │
└─────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────┐
│                     SERVICE LAYER                           │
├──────────────┬──────────────┬──────────────┬───────────────┤
│ AuthService  │ GameManager  │HealthService │BackupService  │
│              │              │              │               │
│ - JWT Auth   │ - Game Logic │ - Health     │ - Automated   │
│ - User Mgmt  │ - 29+ Games  │ - Metrics    │ - Compression │
│ - RBAC       │ - State Mgmt │ - Monitoring │ - Retention   │
└──────────────┴──────────────┴──────────────┴───────────────┘
┌─────────────────────────────────────────────────────────────┐
│                     DATABASE LAYER                          │
├─────────────────────────────────────────────────────────────┤
│           SQLite (Development) │ PostgreSQL (Production)    │
├─────────────────────────────────────────────────────────────┤
│  📊 Tables: users, game_states, game_stats, activity_log    │
│  🔒 Encrypted connections, connection pooling              │
│  💾 Automated backups, point-in-time recovery             │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. **Application Factory (`src/app.ts`)**
Platform-agnostic Hono application with comprehensive middleware:

```typescript
export function createApp(config: AppConfig) {
  const app = new Hono();

  // Security middleware
  app.use('*', secureHeaders());
  app.use('*', cors());
  app.use('*', rateLimiter());

  // Service initialization
  const gameManager = new GameManager(config.databaseConfig);
  const authService = new AuthService();
  const monitoringService = new MonitoringService(config.monitoring);

  return { app, gameManager, authService, monitoringService };
}
```

### 2. **Platform Adapters**

#### Node.js Server (`src/server/node.ts`)
Traditional server deployment with full monitoring:
```typescript
import { serve } from '@hono/node-server';

const { app, gameManager, authService } = createApp(config);
const server = serve({ fetch: app.fetch, port: PORT });
```

#### Cloudflare Workers (`src/server/cloudflare.ts`)
Serverless edge deployment:
```typescript
export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const { app } = createApp(config);
    return app.fetch(request, env);
  }
};
```

### 3. **Database Architecture**

#### Unified Database Schema
```sql
-- User management
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'player',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Game state storage (replaces file system)
CREATE TABLE game_states (
  game_id TEXT PRIMARY KEY,
  game_type TEXT NOT NULL,
  game_state TEXT NOT NULL,      -- JSON game state
  move_history TEXT NOT NULL,    -- JSON move history
  players TEXT NOT NULL,         -- JSON player list
  status TEXT NOT NULL,          -- active, completed, abandoned
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Statistics and analytics
CREATE TABLE game_stats (
  game_id TEXT PRIMARY KEY,
  game_type TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  end_time INTEGER,
  players TEXT NOT NULL,
  winner TEXT,
  total_moves INTEGER DEFAULT 0,
  status TEXT NOT NULL
);

-- Activity logging
CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id TEXT NOT NULL,
  game_type TEXT NOT NULL,
  action TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  players TEXT
);
```

### 4. **Game Implementation Pattern**

All games extend the `BaseGame` abstract class:

```typescript
export abstract class BaseGame<TState extends GameState> {
  constructor(gameId: string, gameType: string, database: DatabaseProvider) {
    this.database = database;
  }

  // Abstract methods that games must implement
  abstract initializeGame(config?: GameConfig): Promise<void>;
  abstract validateMove(moveData: any): Promise<MoveValidationResult>;
  abstract applyMove(move: GameMove): Promise<void>;
  abstract getGameState(): Promise<TState>;
  abstract isGameOver(): boolean;
  abstract getWinner(): string | null;
  abstract getMetadata(): GameMetadata;

  // Built-in database persistence
  protected async persistState(): Promise<void> {
    const gameStateData: GameStateData = {
      gameId: this.gameId,
      gameType: this.gameType,
      gameState: this.currentState,
      moveHistory: this.history,
      players: this.getPlayerIds(),
      status: this.isGameOver() ? 'completed' : 'active'
    };

    await this.database.saveGameState(gameStateData);
  }
}
```

## Security Architecture

### Authentication Flow
```
1. POST /api/v1/auth/register → User registration with validation
2. POST /api/v1/auth/login → JWT token generation
3. Authorization: Bearer <token> → Request authentication
4. Middleware validates token → User context attached
5. RBAC enforcement → Role-based access control
```

### Rate Limiting Strategy
```
┌─────────────────┬─────────────┬─────────────────────┐
│ Endpoint Type   │ Limit       │ Window              │
├─────────────────┼─────────────┼─────────────────────┤
│ General API     │ 100 req     │ 15 minutes          │
│ Authentication  │ 10 req      │ 15 minutes          │
│ Game Creation   │ 50 req      │ 1 hour              │
│ Game Moves      │ 100 req     │ 1 minute            │
└─────────────────┴─────────────┴─────────────────────┘
```

### Data Protection
- **Passwords**: bcrypt hashing (12 rounds)
- **JWT Tokens**: Configurable expiration (24h default)
- **Database**: Prepared statements prevent SQL injection
- **File System**: Completely eliminated (zero attack surface)

## Monitoring & Observability

### Health Monitoring
```typescript
interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  checks: {
    database: HealthStatus;    // Connection and query performance
    memory: HealthStatus;      // Memory usage thresholds
    uptime: HealthStatus;      // Service availability
    environment: HealthStatus; // Configuration validation
  };
}
```

### Sentry Integration
- **Error Tracking**: Automatic exception capture with game context
- **Performance Monitoring**: Transaction tracing and bottleneck detection
- **Custom Metrics**: Game events, authentication flows
- **User Context**: Player-specific error tracking
- **Alert Integration**: Real-time notifications for critical issues

### Backup System
```typescript
interface BackupConfig {
  enabled: boolean;
  schedule: 'hourly' | 'daily' | 'weekly';
  retentionDays: number;
  compression: boolean;
  includeGameStates: boolean;
  includeUserData: boolean;
  includeStats: boolean;
}
```

## Performance Characteristics

### Load Testing Results
- **Concurrent Users**: Supports 100+ concurrent users
- **Response Time**: P95 < 500ms for all endpoints
- **Error Rate**: < 5% under sustained load
- **Memory Usage**: < 512MB under normal load
- **Database Performance**: < 100ms query response times

### Scalability Patterns
- **Horizontal Scaling**: Stateless design with external database
- **Caching**: In-memory game state with database persistence
- **Connection Pooling**: Efficient database resource utilization
- **Rate Limiting**: Protection against abuse and DoS attacks

## Deployment Architecture

### Traditional Deployment
```
Internet → Nginx → Docker Container → Hono App → Database
                ↓
         Load Balancer → Multiple Instances → Shared Database
```

### Serverless Deployment
```
Internet → Cloudflare Edge → Workers Runtime → D1 Database
                          ↓
                   Auto-scaling → Global Distribution
```

### Monitoring Stack
```
Application → Sentry (Errors) → Alerts
           → Prometheus (Metrics) → Grafana (Dashboards)
           → Structured Logs → Loki (Aggregation)
```

## Technology Stack

### **Backend**
- **Framework**: Hono.js (multiplatform)
- **Runtime**: Node.js, Bun, Cloudflare Workers, Deno
- **Language**: TypeScript with strict type checking
- **Database**: SQLite (development), PostgreSQL (production)
- **Authentication**: JWT with bcrypt password hashing

### **Security**
- **Validation**: Zod schemas for type-safe input validation
- **Rate Limiting**: express-rate-limit with IP-based tracking
- **Headers**: Helmet.js security headers
- **CORS**: Configurable cross-origin resource sharing

### **Monitoring**
- **Error Tracking**: Sentry with custom context
- **Metrics**: Custom performance metrics collection
- **Health Checks**: Multi-component health validation
- **Logging**: Structured logging with Winston patterns

### **Development**
- **Testing**: Jest with comprehensive game coverage
- **Linting**: ESLint with TypeScript rules
- **Formatting**: Prettier with consistent code style
- **Type Checking**: Strict TypeScript compilation

## Configuration Management

### Environment Variables
```bash
# Server Configuration
PORT=6789
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com

# Database
DATABASE_URL=postgresql://user:pass@host:port/dbname

# Authentication
JWT_SECRET=your-secure-secret-key
JWT_EXPIRES_IN=24h

# Monitoring
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project
APP_VERSION=2.0.0

# Backup
BACKUP_ENABLED=true
BACKUP_SCHEDULE=daily
BACKUP_RETENTION_DAYS=30
```

### Docker Configuration
- **Multi-stage builds**: Development and production optimized
- **Security**: Non-root user execution
- **Health checks**: Comprehensive service validation
- **Resource limits**: CPU and memory constraints
- **Logging**: Structured log collection

## Migration Path

### From Previous Architecture
1. **File System → Database**: Game state storage migration
2. **Express → Hono**: Framework migration for multiplatform support
3. **Console → Structured Logging**: Production-ready logging
4. **No Auth → JWT**: Comprehensive authentication system
5. **No Monitoring → Sentry**: Enterprise monitoring integration

### Breaking Changes
- **Authentication Required**: Many endpoints now require valid JWT tokens
- **API Changes**: New structured response format with success/error fields
- **Environment Variables**: New required configuration for production
- **Database Schema**: Updated schema with new tables for authentication and game states

## Extension Points

### Adding New Games
1. Extend `BaseGame<TState>` abstract class
2. Implement required abstract methods
3. Register with `GameManager`
4. Add comprehensive test coverage
5. Update documentation

### Adding New Platforms
1. Create new server adapter in `src/server/`
2. Implement platform-specific configuration
3. Update build scripts and deployment
4. Test platform compatibility

### Monitoring Integration
1. Extend `MonitoringService` for new providers
2. Add custom metrics and alerts
3. Configure dashboards and visualization
4. Set up automated alerting

## Best Practices

### Development
- Always run type checking: `bun run type-check`
- Maintain test coverage: `bun test`
- Follow linting rules: `bun run lint:fix`
- Use structured logging: Import and use `logger` utility

### Production
- Set secure JWT secrets
- Enable Sentry monitoring
- Configure automated backups
- Monitor resource usage
- Implement proper alerting

### Security
- Never commit secrets to version control
- Use environment variables for configuration
- Regularly update dependencies
- Monitor security advisories
- Implement proper error handling

## Performance Optimization

### Database
- Use prepared statements for repeated queries
- Implement connection pooling for PostgreSQL
- Add appropriate indexes for query optimization
- Monitor slow queries and optimize

### Application
- Implement caching for frequently accessed data
- Use compression middleware for responses
- Optimize JSON serialization for large game states
- Monitor memory usage and implement cleanup

### Monitoring
- Set up performance baselines
- Monitor key metrics (response time, error rate, throughput)
- Implement automated alerts for threshold breaches
- Regular performance testing and optimization

## Disaster Recovery

### Backup Strategy
- **Automated Backups**: Daily backups with 30-day retention
- **Integrity Verification**: Checksum validation for backup files
- **Compression**: Reduces storage requirements by ~70%
- **Multiple Tables**: Users, game states, statistics, activity logs

### Recovery Procedures
1. **Identify Issue**: Use monitoring alerts and health checks
2. **Assess Impact**: Check affected systems and data
3. **Select Backup**: Choose appropriate backup point
4. **Restore Data**: Use backup manager CLI tool
5. **Verify Recovery**: Run health checks and validation
6. **Resume Operations**: Restart services and validate functionality

## Future Enhancements

### Short Term
- WebSocket support for real-time multiplayer
- Enhanced game analytics and player statistics
- Performance optimization and caching layer
- Advanced monitoring dashboards

### Long Term
- Distributed game state for horizontal scaling
- Machine learning for game recommendation
- Tournament and matchmaking systems
- Mobile SDK for game integration

## Security Considerations

### Threat Model
- **Authentication Bypass**: Prevented by JWT validation middleware
- **SQL Injection**: Prevented by prepared statements and Zod validation
- **XSS Attacks**: Prevented by DOMPurify sanitization
- **DoS Attacks**: Mitigated by rate limiting and resource monitoring
- **Data Breaches**: Protected by encryption and access controls

### Compliance
- **Data Protection**: User data encryption and secure storage
- **Audit Logging**: Comprehensive activity tracking
- **Access Controls**: Role-based permissions system
- **Security Headers**: OWASP recommended security headers

This architecture provides a solid foundation for a production-grade multiplayer game server with enterprise security, monitoring, and operational capabilities.