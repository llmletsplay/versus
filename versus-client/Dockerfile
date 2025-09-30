# Lightweight Vite build for Versus client
FROM oven/bun:1-alpine AS build
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install

# Build the application
COPY . .
ARG VITE_API_URL=http://localhost:6789
ENV NODE_ENV=production
RUN bun run build

# Production stage with nginx
FROM nginx:alpine AS production

# Copy built app
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Set permissions
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chown -R nginx:nginx /var/cache/nginx && \
    chown -R nginx:nginx /var/log/nginx && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

USER nginx
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

CMD ["nginx", "-g", "daemon off;"]
