# Production Deployment Checklist

## Pre-Deployment Checklist ✅

### Security
- [ ] **Rate limiting implemented** - Critical for DoS protection
- [ ] **JWT secret generated** (32+ characters) - Must be secure
- [ ] **Database uses strong password** - No default passwords
- [ ] **SSL certificates installed** - HTTPS required
- [ ] **CORS properly configured** - Only allow production domains
- [ ] **Environment variables set** - All secrets configured
- [ ] **Security headers enabled** - X-Frame-Options, CSP, etc.
- [ ] **No console.log in production** - All debug output removed

### Infrastructure
- [ ] **Docker Compose ready** - `docker-compose.prod.yml` configured
- [ ] **PostgreSQL configured** - Connection string ready
- [ ] **Volumes created** - Persistent storage configured
- [ ] **Backup directory exists** - `/backups` directory created
- [ ] **Log directory exists** - `/logs` directory created
- [ ] **SSL certificates in place** - Files in `ssl/` directory
- [ ] **Nginx configured** - Reverse proxy settings ready
- [ ] **Monitoring setup** - Prometheus/Grafana ready (optional)

### Code Quality
- [ ] **TypeScript compiles** - No type errors
- [ ] **Tests pass** - All test suites passing
- [ ] **Code linted** - No linting errors
- [ ] **Build succeeds** - All images build successfully
- [ ] **No hardcoded values** - All config via environment
- [ ] **Database migrations ready** - If applicable

## Deployment Steps

1. **Prepare Environment**
   ```bash
   # Create production directories
   mkdir -p backups logs ssl
   ```

2. **Configure Environment**
   ```bash
   # Copy and edit production environment
   cp versus-server/.env.production versus-server/.env
   # Edit the file with your production values
   ```

3. **Set SSL Certificates**
   ```bash
   # Place your certificates in ssl/
   # - ssl/versus.crt
   # - ssl/versus.key
   ```

4. **Run Deployment Script**
   ```bash
   # Make executable
   chmod +x deploy.sh

   # Deploy
   ./deploy.sh
   ```

5. **Verify Deployment**
   ```bash
   # Check all services
   docker-compose -f docker-compose.prod.yml ps

   # Check logs
   docker-compose -f docker-compose.prod.yml logs -f

   # Test health endpoint
   curl https://yourdomain.com/api/v1/health
   ```

## Post-Deployment Checklist

### Health Checks
- [ ] **Server responding** - API accessible
- [ ] **Client loading** - Frontend works
- [ ] **Database connected** - Data persistence works
- [ ] **Authentication working** - Users can login
- [ ] **Games functional** - Can create and play games
- [ ] **Rate limiting active** - Try rapid requests
- [ ] **HTTPS working** - SSL certificate valid
- [ ] **Static assets serving** - CSS/JS loading

### Monitoring
- [ ] **Error tracking active** - Sentry configured
- [ ] **Logs flowing** - Check log files
- [ ] **Memory usage normal** - No memory leaks
- [ ] **CPU usage normal** - Performance acceptable
- [ ] **Database performing** - Queries fast
- [ ] **Backups running** - Check backup directory

### Final Verification
- [ ] **Test user registration**
- [ ] **Test game creation**
- [ ] **Test real gameplay**
- [ ] **Test API endpoints**
- [ ] **Check mobile responsiveness**
- [ ] **Verify all pages load**

## Rollback Procedure

If deployment fails:

1. **Quick Rollback**
   ```bash
   ./deploy.sh --rollback
   ```

2. **Manual Rollback**
   ```bash
   # Stop current deployment
   docker-compose -f docker-compose.prod.yml down

   # Restore from backup
   docker-compose -f docker-compose.prod.yml up -d postgres
   # Restore database from latest backup
   ```

3. **Check previous version tag**
   ```bash
   # List available images
   docker images | grep versus

   # Update docker-compose.prod.yml with previous tag
   # Deploy again
   ```

## Production URLs

- **Client**: https://yourdomain.com
- **API**: https://yourdomain.com/api/v1
- **Health**: https://yourdomain.com/api/v1/health
- **Documentation**: https://yourdomain.com/api/docs (if configured)
- **Grafana**: http://yourdomain.com:9090/grafana (if configured)
- **Prometheus**: http://yourdomain.com:9090/metrics (if configured)

## Common Issues and Solutions

### SSL Certificate Issues
- Ensure certificates are in correct format
- Check certificate paths in nginx config
- Verify certificate chain includes intermediate certs

### Database Connection Issues
- Check DATABASE_URL format
- Verify database is running
- Check network connectivity between containers
- Ensure database credentials are correct

### High Memory Usage
- Check for memory leaks
- Monitor game cleanup intervals
- Adjust container memory limits

### Performance Issues
- Enable nginx caching
- Optimize database queries
- Consider CDN for static assets
- Enable compression

### Rate Limiting Too Strict
- Adjust limits in `hono-rate-limit.ts`
- Consider different limits for different endpoints
- Monitor rate limit violations

## Security Reminders

1. **Never commit secrets** to repository
2. **Use strong passwords** for database
3. **Keep dependencies updated**
4. **Monitor security advisories**
5. **Regular backups** are critical
6. **Log everything** but sensitive data
7. **Implement alerting** for critical errors

## Maintenance Tasks

### Daily
- [ ] Check error logs
- [ ] Verify backups completed
- [ ] Monitor resource usage

### Weekly
- [ ] Update dependencies
- [ ] Review security alerts
- [ ] Clean old logs
- [ ] Check certificate expiry

### Monthly
- [ ] Full security audit
- [ ] Performance review
- [ ] Backup restoration test
- [ ] Update documentation

## Emergency Contacts

- **DevOps**: [Contact Information]
- **Database Admin**: [Contact Information]
- **Security Team**: [Contact Information]

## Last Deployment Information

- **Date**: [Fill in after deployment]
- **Version**: [Fill in after deployment]
- **Deployed By**: [Fill in after deployment]
- **Notes**: [Fill in after deployment]