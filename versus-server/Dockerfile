# Debian-based for better native module compatibility
FROM oven/bun:1-debian AS builder
WORKDIR /app

# Copy dependency files
COPY package.json bun.lock ./

# Install dependencies
RUN bun install

# Copy source code
COPY . .

# Build application
ENV NODE_ENV=production
RUN bun run build

# Production image
FROM oven/bun:1-debian-slim
WORKDIR /app

# Install curl for healthcheck
RUN apt-get update && \
    apt-get install -y curl && \
    rm -rf /var/lib/apt/lists/*

# Copy built app and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./

# Create data directories
RUN mkdir -p /app/game_data /app/logs

EXPOSE 6789

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:6789/api/v1/health || exit 1

CMD ["bun", "run", "start"]
