# Versus Server - Multiplatform Hono Architecture
# Supports: Node.js, Bun, and traditional container deployments

# Use Bun's official image for optimal performance
FROM oven/bun:1 AS base
WORKDIR /app

# Install system dependencies for database and health checks
FROM base AS deps
RUN apt-get update && apt-get install -y \
    curl \
    sqlite3 \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Install dependencies into temp directory for better caching
FROM deps AS install
RUN mkdir -p /temp/dev /temp/prod

# Development dependencies
COPY package.json bun.lock* /temp/dev/
RUN cd /temp/dev && bun install

# Production dependencies only
COPY package.json bun.lock* /temp/prod/
RUN cd /temp/prod && bun install --production --ignore-scripts

# Build stage - compile TypeScript to optimized JavaScript
FROM deps AS build
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# Build the Hono application for Node.js runtime
ENV NODE_ENV=production
RUN bun run build

# Production stage - minimal image with only runtime dependencies
FROM oven/bun:1 AS production

# Install minimal runtime requirements
RUN apt-get update && apt-get install -y \
    curl \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

# Copy production dependencies and built application
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json .

# Create database directory with proper permissions
RUN mkdir -p /app/game_data /app/logs && \
    chown -R bun:bun /app

# Switch to non-root user for security
USER bun

# Expose the application port
EXPOSE 6789

# Comprehensive health check for production readiness
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:6789/api/v1/health || exit 1

# Production-ready startup
ENTRYPOINT ["bun", "run", "start"]

# Metadata labels for container registry
LABEL org.opencontainers.image.title="Versus Game Server"
LABEL org.opencontainers.image.description="Multiplatform TypeScript game server with 29+ games"
LABEL org.opencontainers.image.version="2.0.0"
LABEL org.opencontainers.image.source="https://github.com/lightnolimit/versus"
LABEL org.opencontainers.image.licenses="MIT" 