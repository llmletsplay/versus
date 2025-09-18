# Sentry Monitoring Setup Guide

## Step 1: Create Sentry Project

1. **Sign up at [sentry.io](https://sentry.io)**
2. **Create new project**:
   - Platform: **Node.js**
   - Project name: **versus-game-server**
   - Team: Your organization

3. **Copy DSN** from project settings
   - Format: `https://[key]@[org].ingest.sentry.io/[project]`

## Step 2: Configure Environment

Add to your `.env` file:
```bash
# Sentry Configuration
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
APP_VERSION=2.0.0
NODE_ENV=production
```

## Step 3: Sentry Dashboard Configuration

### Custom Dashboards

#### 1. **Game Server Overview Dashboard**
Create dashboard with these widgets:

**Error Tracking**
- Error count by game type (last 24h)
- Error rate trend (last 7 days)
- Top errors by frequency
- Error distribution by endpoint

**Performance Monitoring**
- API response time trends
- Database query performance
- Memory usage over time
- Transaction throughput

**Game Analytics**
- Games created by type (last 24h)
- Player activity patterns
- Game completion rates
- Popular game types

#### 2. **Security Monitoring Dashboard**

**Authentication Events**
- Failed login attempts (last 24h)
- New user registrations
- Token refresh frequency
- Authentication error patterns

**Rate Limiting**
- Rate limit violations by endpoint
- IP addresses hitting limits
- Rate limit effectiveness metrics

**Security Incidents**
- Suspicious activity patterns
- Invalid JWT token attempts
- Unusual API access patterns

### Alert Rules

#### Critical Alerts (Immediate Response)
```yaml
Database Connection Failure:
  condition: "event.exception.type:DatabaseError"
  threshold: 1 occurrence in 5 minutes
  notification: PagerDuty + Slack

High Error Rate:
  condition: "error rate > 10%"
  threshold: sustained for 5 minutes
  notification: Slack + Email

Memory Critical:
  condition: "memory usage > 90%"
  threshold: sustained for 2 minutes
  notification: PagerDuty

Authentication System Down:
  condition: "event.tags.endpoint:/api/v1/auth/* AND event.level:error"
  threshold: 5 errors in 2 minutes
  notification: PagerDuty + Slack
```

#### Warning Alerts (Monitor)
```yaml
High Memory Usage:
  condition: "memory usage > 70%"
  threshold: sustained for 10 minutes
  notification: Slack

Slow Database Queries:
  condition: "database response time > 1000ms"
  threshold: 10 occurrences in 5 minutes
  notification: Slack

Failed Game Creation:
  condition: "event.tags.action:game_creation AND event.level:error"
  threshold: 5 failures in 10 minutes
  notification: Slack
```

## Step 4: Custom Metrics Setup

### Game-Specific Metrics
```typescript
// Track game events
monitoringService.trackGameEvent('game_created', gameId, gameType, {
  players: playerCount,
  config: gameConfig,
  timestamp: Date.now()
});

monitoringService.trackGameEvent('game_completed', gameId, gameType, {
  duration: gameDuration,
  winner: gameWinner,
  totalMoves: moveCount
});
```

### Performance Metrics
```typescript
// Track API performance
const transaction = monitoringService.startTransaction('api_request', 'http');

try {
  // Your API logic
  const result = await processRequest();
  transaction?.setStatus('ok');
  return result;
} catch (error) {
  transaction?.setStatus('internal_error');
  monitoringService.captureException(error, {
    endpoint: request.url,
    method: request.method
  });
  throw error;
} finally {
  transaction?.finish();
}
```

## Step 5: Sentry Integration Verification

### Test Error Reporting
```bash
# 1. Start server with Sentry configured
SENTRY_DSN=your-dsn bun run dev

# 2. Trigger test error
curl -X POST http://localhost:6789/api/v1/games/invalid-game-type/new

# 3. Check Sentry dashboard for error capture
```

### Test Performance Monitoring
```bash
# 1. Enable performance monitoring
SENTRY_DSN=your-dsn NODE_ENV=production bun run dev

# 2. Generate traffic
for i in {1..10}; do
  curl http://localhost:6789/api/v1/health
done

# 3. Check Sentry Performance tab for transactions
```

## Step 6: Production Monitoring Checklist

### Initial Setup
- [ ] Sentry project created
- [ ] DSN configured in environment
- [ ] Test error captured successfully
- [ ] Performance monitoring enabled
- [ ] Custom contexts working

### Dashboard Configuration
- [ ] Game Server Overview dashboard created
- [ ] Security Monitoring dashboard created
- [ ] Custom metrics widgets added
- [ ] Performance charts configured

### Alert Setup
- [ ] Critical alerts configured (PagerDuty)
- [ ] Warning alerts configured (Slack)
- [ ] Notification channels tested
- [ ] Escalation policies defined

### Team Setup
- [ ] Team members invited to Sentry
- [ ] Roles and permissions configured
- [ ] On-call rotation setup (if applicable)
- [ ] Incident response procedures documented

## Sentry Best Practices

### Error Context Enhancement
```typescript
// Always provide rich context for errors
Sentry.withScope((scope) => {
  scope.setTag('game_type', gameType);
  scope.setTag('endpoint', '/api/v1/games');
  scope.setUser({ id: userId, username: username });
  scope.setContext('game_context', {
    gameId: gameId,
    currentPlayer: currentPlayer,
    moveCount: moves.length,
    gameState: 'active'
  });

  Sentry.captureException(error);
});
```

### Performance Monitoring
```typescript
// Monitor critical operations
const transaction = Sentry.startTransaction({
  op: 'game.move.validate',
  name: `Validate ${gameType} Move`
});

try {
  const validation = await validateMove(moveData);
  transaction.setStatus('ok');
  return validation;
} catch (error) {
  transaction.setStatus('internal_error');
  throw error;
} finally {
  transaction.finish();
}
```

### Custom Metrics
```typescript
// Track business metrics
Sentry.addBreadcrumb({
  category: 'business',
  message: 'Game Created',
  level: 'info',
  data: {
    game_type: gameType,
    player_count: playerCount,
    estimated_duration: estimatedDuration
  }
});
```

This Sentry setup provides comprehensive monitoring for your production Versus Game Server with game-specific context and alerting.