# Multi-stage Docker build for TravelAI Platform
# Stage 1: Build stage for dependencies and frontend
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Build frontend
RUN npm run build

# Stage 2: Production runtime
FROM node:18-alpine AS runtime

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S travelai -u 1001

# Set working directory
WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Copy built application from builder stage
COPY --from=builder --chown=travelai:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=travelai:nodejs /app/build ./build
COPY --from=builder --chown=travelai:nodejs /app/public ./public
COPY --from=builder --chown=travelai:nodejs /app/src ./src
COPY --from=builder --chown=travelai:nodejs /app/package*.json ./

# Create necessary directories
RUN mkdir -p /app/logs /app/uploads /app/temp && \
    chown -R travelai:nodejs /app/logs /app/uploads /app/temp

# Switch to non-root user
USER travelai

# Expose ports
EXPOSE 3000 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8000
ENV FRONTEND_PORT=3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["npm", "start"]

# Labels for metadata
LABEL maintainer="TravelAI Team <team@travelai.com>"
LABEL version="1.0.0"
LABEL description="TravelAI Platform - Intelligent travel planning with AI"
LABEL org.opencontainers.image.title="TravelAI Platform"
LABEL org.opencontainers.image.description="Intelligent travel planning platform powered by AI with swarm intelligence"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.authors="TravelAI Team"
LABEL org.opencontainers.image.url="https://travelai.com"
LABEL org.opencontainers.image.source="https://github.com/travelai/platform"
LABEL org.opencontainers.image.licenses="MIT"
