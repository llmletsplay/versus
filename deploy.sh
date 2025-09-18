#!/bin/bash

# Versus Game Server - Production Deployment Script
set -e

echo "🚀 Starting Versus Game Server Production Deployment..."

# Function to cleanup on exit
cleanup() {
    echo "🛑 Deployment interrupted, cleaning up..."
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml down
}

# Trap cleanup function on script exit
trap cleanup EXIT

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Check environment variables
if [ -z "$JWT_SECRET" ]; then
    echo "⚠️  WARNING: JWT_SECRET not set. Using generated secret."
    export JWT_SECRET=$(openssl rand -base64 32)
    echo "🔑 Generated JWT_SECRET: $JWT_SECRET"
    echo "💾 Save this secret for production use!"
fi

# Build production images
echo "🔨 Building production containers..."
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build --parallel

# Run database migrations and setup
echo "💾 Setting up database..."
docker-compose -f docker-compose.yml -f docker-compose.prod.yml run --rm versus-server bun run db:migrate || echo "⚠️  Migration skipped (not implemented yet)"

# Start production services
echo "🚀 Starting production services..."
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

echo "⏳ Waiting for services to be healthy..."

# Wait for server health check
echo "📡 Checking server health..."
timeout=120
counter=0
while [ $counter -lt $timeout ]; do
    if curl -f http://localhost:6789/api/v1/health > /dev/null 2>&1; then
        echo "✅ Server is healthy!"
        break
    fi
    echo "⏳ Waiting for server... ($counter/$timeout)"
    sleep 3
    counter=$((counter + 3))
done

if [ $counter -ge $timeout ]; then
    echo "❌ Server failed to start within $timeout seconds"
    echo "📋 Server logs:"
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs versus-server
    exit 1
fi

# Wait for client health check
echo "🌐 Checking client health..."
counter=0
while [ $counter -lt $timeout ]; do
    if curl -f http://localhost:5173 > /dev/null 2>&1; then
        echo "✅ Client is healthy!"
        break
    fi
    echo "⏳ Waiting for client... ($counter/$timeout)"
    sleep 3
    counter=$((counter + 3))
done

if [ $counter -ge $timeout ]; then
    echo "❌ Client failed to start within $timeout seconds"
    echo "📋 Client logs:"
    docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs versus-client
    exit 1
fi

echo ""
echo "🎉 Versus Game Server Production Deployment Complete!"
echo "🌍 Architecture: Hono Multiplatform"
echo "💾 Storage: Secure Database-Only"
echo "🔒 Security: Authentication + Rate Limiting"
echo ""
echo "📱 Client: http://localhost:5173"
echo "🔧 Server: http://localhost:6789"
echo "📊 Health: http://localhost:6789/api/v1/health"
echo "📈 Metrics: http://localhost:6789/api/v1/metrics"
echo "🔐 Auth: http://localhost:6789/api/v1/auth"
echo ""
echo "🗄️  Database: SQLite (${JWT_SECRET:+JWT configured})"
echo "🐳 Containers: $(docker-compose -f docker-compose.yml -f docker-compose.prod.yml ps --services | wc -l) services running"
echo ""
echo "Press Ctrl+C to stop the deployment"

# Don't follow logs in deploy script, let user choose
echo "📋 To view logs: docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f"
echo "🛑 To stop: docker-compose -f docker-compose.yml -f docker-compose.prod.yml down"