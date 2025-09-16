# Monitoring & Backup Guide - Versus Game Server

## Health Monitoring

### Built-in Health Checks

The server provides comprehensive health monitoring at `/api/v1/health`:

```bash
# Check service health
curl http://localhost:6789/api/v1/health | jq

# Quick health status
curl -s http://localhost:6789/api/v1/health | jq -r '.status'
```

#### Health Check Components

1. **Database Health**
   - Connection testing with query response time
   - Threshold: Warns if >1000ms, fails if unreachable

2. **Memory Health**
   - RSS and heap memory monitoring
   - Warning: >512MB, Critical: >1024MB

3. **Uptime Health**
   - Service availability tracking
   - Warning: <60 seconds (warming up)

4. **Environment Health**
   - Required environment variables validation
   - Production security configuration checks

### Performance Metrics

Access real-time metrics at `/api/v1/metrics`:

```bash
# Get current metrics
npm run metrics

# Monitor continuously
watch -n 5 'npm run metrics'
```

#### Key Metrics
- **Memory Usage**: RSS, heap, external memory
- **Uptime**: Service availability duration
- **Response Times**: Database query performance
- **Error Rates**: Application error frequencies

## External Monitoring (Sentry)

### Setup Sentry Integration

1. **Create Sentry Project**
   ```bash
   # 1. Go to https://sentry.io and create account
   # 2. Create new project: "versus-game-server"
   # 3. Copy DSN from project settings
   ```

2. **Configure Environment**
   ```bash
   # Add to .env
   SENTRY_DSN=https://your-dsn@sentry.io/project-id
   APP_VERSION=2.0.0
   ```

3. **Verify Integration**
   ```bash
   # Restart server
   ./deploy.sh

   # Check logs for Sentry initialization
   docker-compose logs versus-server | grep "Sentry"
   ```

### Sentry Features

#### Error Tracking
- **Automatic Capture**: All unhandled exceptions
- **Game Context**: Errors include game ID, type, and player info
- **User Tracking**: Errors linked to specific users
- **Performance**: Transaction tracing for slow operations

#### Custom Events
```typescript
// Track game events
monitoringService.trackGameEvent('game_created', gameId, gameType, {
  players: playerCount,
  config: gameConfig
});

// Track authentication events
monitoringService.trackAuthEvent('user_login', userId, {
  method: 'password',
  ip: userIp
});
```

#### Performance Monitoring
- **Transaction Tracing**: API endpoint performance
- **Database Queries**: Slow query detection
- **Memory Profiling**: Memory leak detection
- **Error Correlation**: Link errors to performance issues

### Sentry Dashboard Configuration

#### Recommended Alerts
1. **Error Rate**: >5% in 5 minutes
2. **Response Time**: P95 >1000ms
3. **Database Errors**: Any database connection failures
4. **Authentication Failures**: >10 failed logins per minute

#### Custom Dashboards
- **Game Performance**: Game creation and move processing times
- **User Activity**: Registration, login, and engagement metrics
- **System Health**: Memory usage, uptime, and error rates

## Backup & Recovery

### Automated Backup System

#### Configuration
```bash
# Enable in .env
BACKUP_ENABLED=true
BACKUP_SCHEDULE=daily          # hourly, daily, weekly
BACKUP_RETENTION_DAYS=30
BACKUP_PATH=./game_data/backups
```

#### Backup CLI Operations
```bash
# Create manual backup
npm run backup:create

# List all backups
npm run backup:list

# Restore specific backup
npm run backup:restore backup-2024-01-15T10-30-00-000Z
```

### Backup Content

#### Included Data
- **User Accounts**: All user registration and profile data
- **Game States**: Active and completed game states
- **Game Statistics**: Historical game performance data
- **Activity Logs**: User activity and audit trails

#### Backup Features
- **Compression**: ~70% size reduction with gzip
- **Integrity**: SHA-256 checksum verification
- **Metadata**: Timestamp, version, table list
- **Incremental**: Only changed data (future enhancement)

### Disaster Recovery Procedures

#### Complete System Recovery
```bash
# 1. Deploy fresh instance
git clone https://github.com/lightnolimit/versus.git
cd versus

# 2. Configure environment
cp versus-server/env.example versus-server/.env
# Set your production configuration

# 3. Choose recovery point
npm run backup:list

# 4. Restore data
npm run backup:restore backup-2024-01-15T10-30-00-000Z

# 5. Verify and restart
npm run health:check
./deploy.sh
```

#### Point-in-Time Recovery
```bash
# 1. Stop current services
docker-compose down

# 2. List available backups
npm run backup:list

# 3. Restore to specific point in time
npm run backup:restore backup-2024-01-15T08-00-00-000Z

# 4. Restart services
./deploy.sh

# 5. Verify recovery
npm run health:check
```

## Load Testing & Performance Validation

### Quick Performance Test
```bash
# Simple load test with Autocannon
npm run load-test:simple

# Expected results:
# - P95 latency < 500ms
# - Error rate < 10%
# - Rate limiting functional
```

### Comprehensive Load Testing
```bash
# Full K6 test suite
npm run load-test

# Custom load test
k6 run load-tests/api-load-test.js --vus 100 --duration 10m
```

#### Load Test Scenarios
1. **Health Endpoint**: Basic availability testing
2. **Game Listing**: Metadata retrieval performance
3. **Authentication**: Login/register under load
4. **Game Creation**: Game instantiation performance
5. **Game Moves**: Move processing latency

#### Performance Thresholds
- **Response Time**: P95 < 500ms for all endpoints
- **Error Rate**: < 10% under sustained load
- **Throughput**: 100+ concurrent users supported
- **Memory**: < 1GB under load
- **Database**: < 100ms query response time

### Load Testing Results Analysis
```bash
# View test results
k6 run load-tests/api-load-test.js --out json=results.json

# Analyze results
jq '.metrics.http_req_duration' results.json
jq '.metrics.errors.rate' results.json
```

## Advanced Monitoring (Optional)

### Prometheus + Grafana Stack

#### Setup
```bash
# Start monitoring stack
docker-compose -f monitoring/docker-compose.monitoring.yml up -d

# Access dashboards
open http://localhost:3001  # Grafana (admin/admin)
open http://localhost:9090  # Prometheus
```

#### Custom Metrics
```typescript
// Game-specific metrics
gameCreationCounter.inc({ game_type: 'chess' });
moveProcessingHistogram.observe({ game_type: 'poker' }, duration);
activeGamesGauge.set(activeGameCount);
```

#### Grafana Dashboards
- **System Overview**: CPU, memory, disk usage
- **Application Metrics**: Request rates, response times, error rates
- **Game Analytics**: Game creation rates, popular games, player activity
- **Database Performance**: Query times, connection pool usage

### Log Aggregation (Loki)

#### Configuration
```bash
# Enable log shipping
docker-compose -f monitoring/docker-compose.monitoring.yml up promtail loki

# Query logs
curl -G http://localhost:3100/loki/api/v1/query_range \
  --data-urlencode 'query={job="versus-server"}' \
  --data-urlencode 'start=2024-01-15T00:00:00Z'
```

#### Log Queries
- **Error Analysis**: `{job="versus-server"} |= "ERROR"`
- **Game Events**: `{job="versus-server"} |= "Game action"`
- **Auth Events**: `{job="versus-server"} |= "User"`
- **Performance**: `{job="versus-server"} |= "response time"`

## Alerting & Notifications

### Built-in Alerts (Sentry)
Automatic alerts for:
- Application errors and exceptions
- Performance degradation
- High error rates
- Database connection issues

### Custom Alert Rules

#### Prometheus AlertManager
```yaml
# alerts.yml
groups:
  - name: versus-server
    rules:
      - alert: HighErrorRate
        expr: rate(http_requests_errors_total[5m]) > 0.1
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate detected"

      - alert: DatabaseDown
        expr: up{job="versus-db"} == 0
        for: 30s
        labels:
          severity: critical
        annotations:
          summary: "Database is down"
```

#### Notification Channels
- **Slack**: Real-time team notifications
- **Email**: Critical error notifications
- **PagerDuty**: On-call incident management
- **Discord**: Community notifications

## Maintenance Procedures

### Daily Maintenance
```bash
# Check system health
npm run health:check

# Review error logs
docker-compose logs versus-server --since 24h | grep ERROR

# Verify backup status
npm run backup:list | head -5
```

### Weekly Maintenance
```bash
# Performance review
npm run load-test:simple

# Backup verification
npm run backup:list

# Security updates
bun update
docker-compose pull
```

### Monthly Maintenance
```bash
# Full load testing
npm run load-test

# Backup restoration test
npm run backup:create
npm run backup:restore <latest-backup-id>

# Security audit
npm audit
docker scan versus-server:latest
```

## Troubleshooting

### Common Issues

#### High Memory Usage
```bash
# Check current usage
npm run metrics

# Identify memory leaks
docker-compose exec versus-server bun --inspect

# Restart service
docker-compose restart versus-server
```

#### Database Performance Issues
```bash
# Check database health
npm run health:check

# Monitor query performance
# PostgreSQL: Enable slow query logging
# SQLite: Use EXPLAIN QUERY PLAN

# Optimize if needed
VACUUM;  # SQLite
REINDEX; # PostgreSQL
```

#### Authentication Problems
```bash
# Verify JWT configuration
echo $JWT_SECRET

# Check user creation
npm run health:check

# Reset authentication (backup first!)
npm run backup:create
# Then reset users table
```

### Log Analysis

#### Error Pattern Analysis
```bash
# Find error patterns
docker-compose logs versus-server | grep ERROR | sort | uniq -c

# Authentication errors
docker-compose logs versus-server | grep "auth" | grep ERROR

# Game-specific errors
docker-compose logs versus-server | grep "game" | grep ERROR
```

#### Performance Analysis
```bash
# Response time analysis
docker-compose logs versus-server | grep "response time" | awk '{print $NF}'

# Database query times
docker-compose logs versus-server | grep "query" | grep "ms"
```

## Security Monitoring

### Security Events to Monitor
- Failed authentication attempts
- Rate limit violations
- Invalid JWT tokens
- Unusual API access patterns
- Database connection anomalies

### Security Alerts
```bash
# Failed login attempts
docker-compose logs versus-server | grep "login failed" | wc -l

# Rate limit violations
docker-compose logs versus-server | grep "rate limit" | wc -l

# Authentication errors
docker-compose logs versus-server | grep "auth" | grep ERROR
```

### Incident Response
1. **Identify**: Monitor alerts and health checks
2. **Assess**: Determine scope and impact
3. **Contain**: Rate limit or block malicious IPs
4. **Investigate**: Analyze logs and error patterns
5. **Resolve**: Apply fixes and verify resolution
6. **Document**: Update procedures and improve monitoring

This monitoring guide ensures your Versus Game Server maintains high availability, performance, and security in production environments.