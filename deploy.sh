#!/bin/bash
# Production Deployment Script
# This script automates the deployment process

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_NAME="versus"
ENVIRONMENT="production"
COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DIR="./backups"
LOG_DIR="./logs"

# Logging
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Pre-deployment checks
check_prerequisites() {
    log "Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        error "Docker is not installed"
    fi

    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        error "Docker Compose is not installed"
    fi

    # Check environment file
    if [ ! -f "versus-server/.env.production" ]; then
        error "Production environment file not found at versus-server/.env.production"
    fi

    # Check SSL certificates
    if [ ! -f "ssl/versus.crt" ] || [ ! -f "ssl/versus.key" ]; then
        warn "SSL certificates not found in ssl/ directory"
        warn "Run: ./scripts/setup-ssl.sh"
    fi

    log "Prerequisites check completed"
}

# Create necessary directories
create_directories() {
    log "Creating necessary directories..."

    mkdir -p "${BACKUP_DIR}"
    mkdir -p "${LOG_DIR}"
    mkdir -p "${LOG_DIR}/nginx"
    mkdir -p "${LOG_DIR}/app"
    mkdir -p "ssl"

    log "Directories created"
}

# Backup existing data
backup_existing() {
    if [ -d "${BACKUP_DIR}" ] && [ "$(ls -A ${BACKUP_DIR})" ]; then
        log "Existing data found, creating pre-deployment backup..."

        # Backup database
        if docker-compose -f "${COMPOSE_FILE}" ps postgres | grep -q "Up"; then
            docker-compose -f "${COMPOSE_FILE}" exec postgres \
                pg_dump -U "${POSTGRES_USER:-versus_user}" \
                "${POSTGRES_DB:-versus_db}" \
                > "${BACKUP_DIR}/pre_deploy_backup_$(date +%Y%m%d_%H%M%S).sql"
            log "Database backed up"
        fi

        # Backup game data
        if docker volume ls | grep -q "${PROJECT_NAME}_game_data"; then
            docker run --rm \
                -v "${PROJECT_NAME}_game_data:/data" \
                -v "$(pwd)/${BACKUP_DIR}:/backup" \
                alpine tar czf "/backup/game_data_backup_$(date +%Y%m%d_%H%M%S).tar.gz" -C /data .
            log "Game data backed up"
        fi
    fi
}

# Build and deploy
deploy() {
    log "Starting deployment..."

    # Set environment
    export COMPOSE_PROJECT_NAME="${PROJECT_NAME}"
    export NODE_ENV="${ENVIRONMENT}"

    # Load environment variables
    source versus-server/.env.production

    # Pull latest images
    log "Pulling latest images..."
    docker-compose -f "${COMPOSE_FILE}" pull

    # Build custom images
    log "Building application images..."
    docker-compose -f "${COMPOSE_FILE}" build --parallel

    # Stop existing services
    log "Stopping existing services..."
    docker-compose -f "${COMPOSE_FILE}" down

    # Start database first
    log "Starting database..."
    docker-compose -f "${COMPOSE_FILE}" up -d postgres redis

    # Wait for database to be ready
    log "Waiting for database to be ready..."
    sleep 30

    # Run database migrations if needed
    log "Running database migrations..."
    # Add migration commands here if you have them

    # Start all services
    log "Starting all services..."
    docker-compose -f "${COMPOSE_FILE}" up -d

    log "Deployment completed"
}

# Health checks
health_check() {
    log "Running health checks..."

    # Wait for services to start
    sleep 30

    # Check if services are running
    services=("server" "client" "postgres" "nginx")

    for service in "${services[@]}"; do
        if docker-compose -f "${COMPOSE_FILE}" ps "${service}" | grep -q "Up"; then
            log "✓ ${service} is running"
        else
            error "✗ ${service} is not running"
        fi
    done

    # Check API health
    if curl -f http://localhost/api/v1/health &> /dev/null; then
        log "✓ API health check passed"
    else
        error "✗ API health check failed"
    fi

    # Check client
    if curl -f http://localhost/health &> /dev/null; then
        log "✓ Client health check passed"
    else
        error "✗ Client health check failed"
    fi

    log "All health checks passed"
}

# Show status
show_status() {
    log "Deployment status:"
    echo ""
    docker-compose -f "${COMPOSE_FILE}" ps
    echo ""
    log "Application URLs:"
    echo "  Client: https://yourdomain.com"
    echo "  API: https://yourdomain.com/api/v1"
    echo "  Health: https://yourdomain.com/api/v1/health"
    echo ""
    log "Monitoring:"
    echo "  Grafana: http://yourdomain.com:9090/grafana/"
    echo "  Prometheus: http://yourdomain.com:9090/metrics"
    echo ""
}

# Cleanup old images
cleanup() {
    log "Cleaning up old Docker images..."
    docker image prune -f
    docker volume prune -f
    log "Cleanup completed"
}

# Rollback function
rollback() {
    warn "Rolling back deployment..."
    docker-compose -f "${COMPOSE_FILE}" down

    # Restore from latest backup if available
    LATEST_BACKUP=$(ls -t "${BACKUP_DIR}"/pre_deploy_backup_*.sql 2>/dev/null | head -1)
    if [ -n "${LATEST_BACKUP}" ]; then
        log "Restoring database from ${LATEST_BACKUP}"
        docker-compose -f "${COMPOSE_FILE}" up -d postgres
        sleep 30
        docker-compose -f "${COMPOSE_FILE}" exec -T postgres \
            psql -U "${POSTGRES_USER:-versus_user}" \
            "${POSTGRES_DB:-versus_db}" < "${LATEST_BACKUP}"
    fi

    warn "Rollback completed"
}

# Main script
main() {
    log "Starting deployment of ${PROJECT_NAME} to ${ENVIRONMENT}"
    echo ""

    # Check for rollback flag
    if [ "${1:-}" = "--rollback" ]; then
        rollback
        exit 0
    fi

    check_prerequisites
    create_directories
    backup_existing
    deploy
    health_check
    show_status
    cleanup

    echo ""
    log "🎉 Deployment completed successfully!"
    log "📊 Monitor the application at the URLs above"
    log "📝 Check logs with: docker-compose -f ${COMPOSE_FILE} logs -f"
}

# Trap errors
trap 'error "Deployment failed at line $LINENO"' ERR

# Run main function
main "$@"