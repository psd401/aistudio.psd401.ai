# syntax=docker.io/docker/dockerfile:1
# Multi-stage Dockerfile for Next.js AI Studio Application
# Optimized for ECS Fargate deployment with streaming support and graceful shutdown

# ============================================================================
# Stage 1: Dependencies
# ============================================================================
FROM node:22-alpine AS deps
WORKDIR /app

# Install dependencies for native packages
RUN apk add --no-cache libc6-compat

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies with BuildKit cache mount for 50-90% faster builds
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps --omit=dev

# ============================================================================
# Stage 2: Builder
# ============================================================================
FROM node:22-alpine AS builder
WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy all source files
COPY . .

# Set build-time environment variables
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build with cache mount for Next.js build artifacts
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# ============================================================================
# Stage 3: Production Runner
# ============================================================================
FROM node:22-alpine AS runner
WORKDIR /app

# Install tini for proper PID 1 signal handling and curl for health checks
RUN apk add --no-cache tini curl

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Memory optimization - set to 70% of container memory (assuming 2GB = 1400MB)
# Adjust NODE_OPTIONS based on actual ECS task memory allocation
ENV NODE_OPTIONS="--max-old-space-size=1400"

# Copy only necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose application port
EXPOSE 3000

# Health check with extended start period for Next.js initialization (60s -> 120s)
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:3000/api/healthz || exit 1

# Use tini as PID 1 for proper signal handling
# This ensures graceful shutdown when ECS sends SIGTERM
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
