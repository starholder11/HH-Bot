# LanceDB Service Container for ECS/Fargate
FROM node:18-alpine

# Install system dependencies for LanceDB
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Create directory for EFS mount point
RUN mkdir -p /mnt/efs

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S lancedb -u 1001

# Change ownership of app directory
RUN chown -R lancedb:nodejs /app
RUN chown -R lancedb:nodejs /mnt/efs

# Switch to non-root user
USER lancedb

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

# Start the service
CMD ["node", "index.js"]
