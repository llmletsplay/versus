# Production Checklist

Complete checklist before deploying to production.

## Security

### Authentication

- [ ] JWT secret is 32+ characters
- [ ] JWT secret is randomly generated
- [ ] Token expiration configured
- [ ] Password hashing working (bcrypt)

```bash
openssl rand -hex 32
```

### Network Security

- [ ] HTTPS enabled with valid SSL certificate
- [ ] CORS restricted to production domain
- [ ] Rate limiting configured and tested
- [ ] Security headers enabled

### Secrets Management

- [ ] No secrets in version control
- [ ] Environment variables properly set
- [ ] Database credentials secure
- [ ] API keys rotated if leaked

## Infrastructure

### Database

- [ ] PostgreSQL configured for production
- [ ] Connection pooling enabled
- [ ] Regular backups scheduled
- [ ] Backup restoration tested

### Docker

- [ ] Images built for correct architecture
- [ ] Health checks configured
- [ ] Resource limits set
- [ ] Logging configured

### SSL/TLS

- [ ] Certificate valid and not expiring
- [ ] Certificate covers all domains
- [ ] Auto-renewal configured
- [ ] HTTPS redirect working

## Code Quality

### Testing

- [ ] All tests passing
- [ ] Code coverage acceptable
- [ ] Load testing completed
- [ ] Edge cases covered

### Performance

- [ ] Response times acceptable (<500ms)
- [ ] Memory usage stable
- [ ] No memory leaks detected
- [ ] Database queries optimized

## Monitoring

- [ ] Health endpoint accessible
- [ ] Error tracking configured (Sentry)
- [ ] Log aggregation set up
- [ ] Alerts configured

## Pre-Launch

### Documentation

- [ ] API documentation updated
- [ ] README reflects current setup
- [ ] Environment variables documented
- [ ] Deployment guide accurate

### Final Checks

- [ ] DNS configured correctly
- [ ] SSL certificate installed
- [ ] Firewall rules set
- [ ] Backup verified

## Post-Launch

### Immediate (First Hour)

- [ ] Health checks passing
- [ ] Users can register
- [ ] Games can be created
- [ ] Error monitoring active

### First 24 Hours

- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Verify backups running
- [ ] Review user feedback

## Rollback Plan

```bash
# Stop services
docker-compose down

# Restore database
docker exec -i versus-postgres psql < backup.sql

# Deploy previous version
git checkout previous-tag
docker-compose up -d
```
