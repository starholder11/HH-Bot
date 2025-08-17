# Production image for LanceDB service
FROM node:20-slim AS base

# Install build deps for LanceDB native addons
RUN apt-get update && apt-get install -y python3 make g++ curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install prod deps only
COPY package.json package-lock.json ./
ENV NODE_ENV=production
RUN npm ci --omit=dev

# Copy service source
COPY index.js ./index.js

# Create data dir used by LanceDB (can be overridden)
RUN mkdir -p /tmp/lancedb-data
ENV LANCEDB_PATH=/tmp/lancedb-data
ENV NODE_ENV=production

# Healthcheck – adjust port if changed
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["node", "index.js"]
