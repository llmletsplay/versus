# Monitoring & Backups

Monitor application health and manage backups.

## Health Monitoring

### Health Endpoint

```bash
curl http://localhost:5556/api/v1/health
```

**Response:**

```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "pass", "responseTime": 15 },
    "memory": { "status": "pass", "totalMB": 245 },
    "uptime": { "status": "pass", "uptimeSeconds": 43200 }
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Metrics Endpoint

```bash
curl http://localhost:5556/api/v1/metrics
```

**Response:**

```json
{
  "memory": {
    "rss": 245,
    "heapUsed": 123,
    "heapTotal": 150
  },
  "uptime": {
    "seconds": 43200,
    "formatted": "12h 0m"
  }
}
```

## Error Tracking (Sentry)

### Setup

1. Create project at sentry.io
2. Get DSN from project settings
3. Add to environment:

```bash
SENTRY_DSN=https://your-dsn@sentry.io/project-id
APP_VERSION=2.0.0
```

### Verify

```bash
# Check logs for Sentry initialization
docker-compose logs server | grep Sentry
```

## Logging

### Application Logs

```bash
# All logs
docker-compose logs -f server

# Last 100 lines
docker-compose logs --tail 100 server

# Filter errors
docker-compose logs server | grep ERROR
```

### Log Files

Logs are written to `logs/` directory:

```
logs/
├── server.log
└── client.log
```

## Backups

### Configuration

```bash
BACKUP_ENABLED=true
BACKUP_SCHEDULE=daily
BACKUP_RETENTION_DAYS=30
BACKUP_PATH=./backups
```

### Manual Backup

```bash
# PostgreSQL
docker exec versus-postgres pg_dump -U versus_user versus_db > backup.sql

# SQLite
cp game_data/versus.db backups/versus_$(date +%Y%m%d).db
```

### Restore

```bash
# PostgreSQL
docker exec -i versus-postgres psql -U versus_user versus_db < backup.sql

# SQLite
cp backups/versus_20240115.db game_data/versus.db
```

### Automated Backups

The backup service runs scheduled backups:

```yaml
# docker-compose.yml
backup:
  image: postgres:16-alpine
  volumes:
    - ./backups:/backups
    - ./scripts/backup.sh:/backup.sh
  command: crond -f -l 8
```

## Alerts

### Recommended Alerts

| Condition | Severity | Action |
|-----------|----------|--------|
| Health check fails | Critical | Immediate investigation |
| Error rate > 5% | Warning | Review logs |
| Memory > 90% | Warning | Scale or optimize |
| Backup fails | Warning | Check storage |

### Slack Integration

Configure Sentry to send alerts to Slack:

1. Go to Sentry Settings > Integrations
2. Add Slack integration
3. Configure alert rules

## Performance Monitoring

### Response Times

```bash
# Monitor response time
curl -w "Time: %{time_total}s\n" http://localhost:5556/api/v1/health
```

### Database Performance

```sql
-- PostgreSQL slow queries
SELECT query, calls, total_time
FROM pg_stat_statements
ORDER BY total_time DESC
LIMIT 10;
```

### Container Stats

```bash
docker stats
```

## Maintenance

### Daily Tasks

- Check error logs
- Verify backups completed
- Monitor memory usage

### Weekly Tasks

- Review performance metrics
- Check certificate expiry
- Update dependencies

### Monthly Tasks

- Full backup restoration test
- Security audit
- Performance review
