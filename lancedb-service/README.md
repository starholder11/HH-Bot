# LanceDB Service

A production-ready HTTP API service for semantic search using LanceDB and OpenAI embeddings.

## Overview

This service provides a REST API for storing and searching vector embeddings across different content types (text, images, audio, video). It's designed to run in AWS ECS/Fargate with EFS storage for persistence.

## Features

- **Vector Storage**: Store embeddings with metadata and references
- **Semantic Search**: Similarity search across multiple content types
- **Batch Operations**: Bulk processing for large datasets
- **Automatic Retries**: Robust error handling and retry logic
- **Caching**: In-memory embedding cache for performance
- **Health Checks**: Production-ready health monitoring

## Quick Start

### Environment Variables

Copy the environment variables template:

```bash
# Required
OPENAI_API_KEY=your_openai_api_key_here
LANCEDB_PATH=/mnt/efs/lancedb
PORT=8000

# Optional
NODE_ENV=production
LOG_LEVEL=info
EMBEDDING_MODEL=text-embedding-3-small
ALLOWED_ORIGINS=https://your-domain.com
```

### Local Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run health check
npm run healthcheck
```

### Docker Build

```bash
# Build the image
docker build -t lancedb-service .

# Run the container
docker run -p 8000:8000 \
  -e OPENAI_API_KEY=your_key \
  -e LANCEDB_PATH=/data \
  -v /path/to/storage:/data \
  lancedb-service
```

## API Endpoints

### Health Endpoints

- `GET /health` - Basic health check
- `GET /ready` - Readiness check (tests database connection)

### Embedding Operations

- `POST /embeddings` - Add new embedding
- `GET /embeddings/:id` - Get embedding by ID
- `PUT /embeddings/:id` - Update embedding
- `DELETE /embeddings/:id` - Delete embedding
- `POST /embeddings/bulk` - Bulk operations

### Search

- `POST /search` - Semantic similarity search

## API Usage Examples

### Add Embedding

```bash
curl -X POST http://localhost:8000/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "id": "unique-id",
    "content_type": "text",
    "title": "Sample Content",
    "content_text": "This is the text content to embed",
    "references": {
      "content_url": "https://example.com/content",
      "metadata_path": "path/to/metadata.json"
    },
    "metadata": {
      "tags": ["sample", "test"]
    }
  }'
```

### Search

```bash
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "text to search for",
    "limit": 10,
    "content_types": ["text", "image"],
    "threshold": 0.7
  }'
```

## ECS/Fargate Deployment

### Task Definition

```json
{
  "family": "lancedb-service",
  "cpu": "2048",
  "memory": "8192",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::account:role/ecsTaskRole",
  "containerDefinitions": [
    {
      "name": "lancedb-service",
      "image": "your-ecr-repo/lancedb-service:latest",
      "cpu": 2048,
      "memory": 8192,
      "essential": true,
      "portMappings": [
        {
          "containerPort": 8000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "secrets": [
        {
          "name": "OPENAI_API_KEY",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:openai-api-key"
        }
      ],
      "mountPoints": [
        {
          "sourceVolume": "efs-storage",
          "containerPath": "/mnt/efs"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/lancedb-service",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "node healthcheck.js"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ],
  "volumes": [
    {
      "name": "efs-storage",
      "efsVolumeConfiguration": {
        "fileSystemId": "fs-xxxxxxxxx",
        "transitEncryption": "ENABLED"
      }
    }
  ]
}
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   HTTP Client   │───▶│  Express API    │───▶│   LanceDB      │
│  (Next.js App)  │    │   (Node.js)     │    │  (Vector DB)   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │                        │
                              ▼                        ▼
                       ┌─────────────────┐    ┌─────────────────┐
                       │  OpenAI API     │    │   EFS Storage   │
                       │  (Embeddings)   │    │  (Persistent)   │
                       └─────────────────┘    └─────────────────┘
```

## Monitoring

### Logs

```bash
# View container logs
docker logs lancedb-service

# Follow logs
docker logs -f lancedb-service
```

### Metrics

The service exposes several monitoring endpoints:
- Health status via `/health` and `/ready`
- Service stats and performance metrics in logs
- OpenAI API usage tracking

## Troubleshooting

### Common Issues

1. **Service won't start**
   - Check OpenAI API key is set
   - Verify EFS mount permissions
   - Check available memory/CPU

2. **Search returning no results**
   - Verify embeddings are being stored
   - Check similarity threshold settings
   - Confirm content types in query

3. **High memory usage**
   - Tune embedding cache size
   - Consider processing batch sizes
   - Monitor EFS usage

### Debug Mode

```bash
# Enable debug logging
export LOG_LEVEL=debug

# Start service
npm start
```

## Development

### Running Tests

```bash
npm test
```

### Code Structure

```
lancedb-service/
├── index.js                 # Main server application
├── lib/
│   ├── logger.js            # Winston logging
│   ├── lancedb-manager.js   # LanceDB operations
│   └── embedding-service.js # OpenAI embeddings
├── healthcheck.js           # Health check script
├── Dockerfile              # Container definition
└── package.json            # Dependencies
```

## License

MIT
