# Installation

## System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Runtime | Bun 1.0+ / Node 18+ | Bun latest |
| RAM | 2GB | 4GB |
| Disk | 1GB | 5GB |
| Docker | 20.x+ | Latest |

## Install Bun

Bun is the recommended runtime for fastest development:

```bash
# macOS/Linux
curl -fsSL https://bun.sh/install | bash

# Windows
powershell -c "irm bun.sh/install.ps1 | iex"

# Verify
bun --version
```

## Clone Repository

```bash
git clone https://github.com/lightnolimit/versus.git
cd versus
```

## Install Dependencies

```bash
# Install all dependencies (root + workspaces)
bun install
```

## Environment Setup

```bash
# Copy environment template
cp versus-server/env.example versus-server/.env
```

Required environment variables:

```bash
# Server
PORT=5556
NODE_ENV=development

# Database (auto-configured by make start)
DATABASE_URL=postgresql://versus_user:dev_password@localhost:5433/versus_db

# Authentication
JWT_SECRET=your-secret-key-change-in-production

# CORS
CORS_ORIGIN=http://localhost:5555
```

### Generate Secure JWT Secret

```bash
# For production
openssl rand -hex 32
```

## Docker Setup

Docker is used only for PostgreSQL:

```bash
# Verify Docker is running
docker --version
docker-compose --version
```

## Verify Installation

```bash
# Check all dependencies
bun --version      # Bun runtime
docker --version   # Docker
git --version      # Git

# Start the stack
make start

# Verify server
curl http://localhost:5556/api/v1/health
```

## Optional Tools

### VS Code Extensions

- ESLint
- Prettier
- TypeScript and JavaScript Language Features
- Docker

### Performance Tools

```bash
# Load testing
bun install -g autocannon

# Database client
bun install -g drizzle-kit
```

## Platform Notes

### macOS

No special requirements. Docker Desktop recommended.

### Linux

```bash
# Docker without sudo
sudo usermod -aG docker $USER
```

### Windows

Use WSL2 for best compatibility. Docker Desktop with WSL2 backend required.

## Next Steps

- [Quick Start](quick-start.md) - Get running
- [Development](development.md) - Daily workflow
