# Production image for LanceDB service
FROM node:20-slim AS base

# Install build deps for LanceDB native addons
RUN apt-get update && apt-get install -y python3 make g++ curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install prod deps only
COPY lancedb-service/package.json ./
RUN npm ci --omit=dev

# Copy service source
COPY lancedb-service/index.js ./index.js

# Create data dir used by LanceDB (can be overridden)
RUN mkdir -p /tmp/lancedb-data
ENV LANCEDB_PATH=/tmp/lancedb-data

# Healthcheck – adjust port if changed
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

EXPOSE 3000

CMD ["npm", "run", "start"]
