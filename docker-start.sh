#!/bin/bash

# Versus Docker Startup Script
set -e

echo "🚀 Starting Versus Application..."

# Function to cleanup on exit
cleanup() {
    echo "🛑 Shutting down containers..."
    docker-compose down
}

# Trap cleanup function on script exit
trap cleanup EXIT

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Build and start services
echo "🔨 Building containers..."
docker-compose build --parallel

echo "🚀 Starting services..."
docker-compose up -d

echo "⏳ Waiting for services to be healthy..."

# Wait for server health check
echo "📡 Checking server health..."
timeout=60
counter=0
while [ $counter -lt $timeout ]; do
    if docker-compose exec -T versus-server curl -f http://localhost:6789/api/v1/health > /dev/null 2>&1; then
        echo "✅ Server is healthy!"
        break
    fi
    echo "⏳ Waiting for server... ($counter/$timeout)"
    sleep 2
    counter=$((counter + 2))
done

if [ $counter -ge $timeout ]; then
    echo "❌ Server failed to start within $timeout seconds"
    docker-compose logs server
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
    sleep 2
    counter=$((counter + 2))
done

if [ $counter -ge $timeout ]; then
    echo "❌ Client failed to start within $timeout seconds"
    docker-compose logs client
    exit 1
fi

echo ""
echo "🎉 Versus application is running!"
echo "📱 Client: http://localhost:5173"
echo "🔧 Server: http://localhost:6789"
echo "📊 Health: http://localhost:6789/api/v1/health"
echo ""
echo "Press Ctrl+C to stop the application"

# Follow logs
docker-compose logs -f 