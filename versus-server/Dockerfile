# Use Bun's official image
FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies into temp directory
# This will cache them and speed up future builds
FROM base AS install

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /temp/dev
COPY package.json bun.lock* /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
COPY package.json bun.lock* /temp/prod/
# Skip prepare script in production
RUN cd /temp/prod && bun install --frozen-lockfile --production --ignore-scripts

# Copy node_modules from temp directory
# Then copy all (non-ignored) project files into the image
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# Build without running tests (tests can be run in CI/CD)
ENV NODE_ENV=production
RUN bun run build

# Copy production dependencies and source code into final image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /app/dist ./dist
COPY --from=prerelease /app/package.json .

# Install curl for health checks and create game_data directory
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/* && \
    mkdir -p /app/game_data && \
    chown -R bun:bun /app

# Switch to non-root user (bun user already exists in base image)
USER bun

# Expose port
EXPOSE 4444

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4444/api/v1/health || exit 1

# Run the app
ENTRYPOINT [ "bun", "run", "start" ] 