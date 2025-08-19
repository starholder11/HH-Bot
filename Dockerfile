FROM node:20-alpine AS builder

ARG REDIS_URL
ARG GIT_SHA
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    APP_BUILD_SHA=$GIT_SHA

WORKDIR /app

# Install build dependencies (for native modules like sharp)
RUN apk add --no-cache python3 make g++ libc6-compat

# Copy package files first for better caching
COPY package*.json ./
# Single install (includes dev deps needed for next build)
RUN npm ci --legacy-peer-deps

# Copy source and build
COPY . .
RUN REDIS_URL=${REDIS_URL} npm run build:web

# --- Runtime image ---
FROM node:20-alpine AS runner

ARG REDIS_URL
ARG GIT_SHA
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    REDIS_URL=${REDIS_URL} \
    APP_BUILD_SHA=$GIT_SHA

WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Use Next.js standalone output for a smaller runtime image
# Public assets and static files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
