#!/bin/bash

# Versus Game Platform - Local Development Startup Script
# This script starts PostgreSQL + Server + Client with Docker Compose

set -e

echo "🎮 Versus Game Platform - Local Development Setup"
echo "=================================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running."
    echo "Please start Docker Desktop and try again."
    exit 1
fi

# Check if .env exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from .env.example..."
    cp .env.example .env
    echo "✅ .env created"
    echo ""
    echo "⚠️  IMPORTANT: Please edit .env and update these values:"
    echo "   - JWT_SECRET (generate with: openssl rand -hex 32)"
    echo "   - POSTGRES_PASSWORD (choose a secure password)"
    echo ""
    read -p "Press Enter after you've updated .env, or Ctrl+C to exit..."
fi

# Validate JWT_SECRET is set
source .env
if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" == "e6809d316083c1486e8bdef7e12532da9ead79d85196d1fbd1177756702c8c50" ]; then
    echo "⚠️  WARNING: Using default JWT_SECRET!"
    echo "For security, generate a new one: openssl rand -hex 32"
    echo ""
fi

echo "🐳 Starting Docker containers..."
echo ""

# Stop any existing containers
docker-compose down 2>/dev/null || true

# Start services
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be healthy..."
echo ""

# Wait for PostgreSQL
echo "  Waiting for PostgreSQL..."
timeout=60
counter=0
until docker-compose exec -T postgres pg_isready -U versus_user -d versus_db > /dev/null 2>&1; do
    sleep 2
    counter=$((counter + 2))
    if [ $counter -ge $timeout ]; then
        echo "  ❌ PostgreSQL failed to start within ${timeout}s"
        echo "  Check logs: docker-compose logs postgres"
        exit 1
    fi
done
echo "  ✅ PostgreSQL ready"

# Wait for server health check
echo "  Waiting for Versus Server..."
timeout=120
counter=0
until curl -f http://localhost:6789/api/v1/health > /dev/null 2>&1; do
    sleep 3
    counter=$((counter + 3))
    if [ $counter -ge $timeout ]; then
        echo "  ❌ Server failed to start within ${timeout}s"
        echo "  Check logs: docker-compose logs versus-server"
        exit 1
    fi
done
echo "  ✅ Versus Server ready"

# Wait for client
echo "  Waiting for Client..."
sleep 5
if curl -f http://localhost:5173 > /dev/null 2>&1; then
    echo "  ✅ Client ready"
else
    echo "  ⚠️  Client may still be building (this is normal)"
fi

echo ""
echo "=========================================="
echo "🎉 Versus Game Platform is running!"
echo "=========================================="
echo ""
echo "📍 Access URLs:"
echo "   Server:     http://localhost:6789"
echo "   API Health: http://localhost:6789/api/v1/health"
echo "   API Docs:   http://localhost:6789/api/v1/games"
echo "   Client:     http://localhost:5173"
echo "   PostgreSQL: localhost:5432"
echo ""
echo "🔑 Database Credentials:"
echo "   Database: versus_db"
echo "   User:     versus_user"
echo "   Password: (from .env)"
echo ""
echo "📝 Useful Commands:"
echo "   View logs:        docker-compose logs -f"
echo "   Server logs:      docker-compose logs -f versus-server"
echo "   Postgres logs:    docker-compose logs -f postgres"
echo "   Stop services:    docker-compose down"
echo "   Restart:          docker-compose restart"
echo "   Connect to DB:    docker exec -it versus-postgres psql -U versus_user -d versus_db"
echo ""
echo "📚 Documentation:"
echo "   Full Guide:       ./DEPLOYMENT.md"
echo "   Railway Deploy:   ./README.railway.md"
echo ""
echo "✨ Happy Gaming!"