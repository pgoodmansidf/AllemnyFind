# 🚀 Allemny Find V2 - Production Deployment

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Docker](https://img.shields.io/badge/docker-ready-brightgreen.svg)](https://docker.com)
[![Linux](https://img.shields.io/badge/platform-linux-lightgrey.svg)](https://linux.org)

> **AI-Powered Document Search & Knowledge Management System**
> Intelligent document processing, semantic search, and conversational AI for enterprise knowledge management.

## 📋 Table of Contents

- [🌟 Features](#-features)
- [🔧 Quick Start](#-quick-start)
- [📦 Requirements](#-requirements)
- [🐳 Docker Deployment](#-docker-deployment)
- [⚙️ Configuration](#️-configuration)
- [🏥 Health Monitoring](#-health-monitoring)
- [📊 API Documentation](#-api-documentation)
- [🔒 Security](#-security)
- [🛠️ Troubleshooting](#️-troubleshooting)
- [📞 Support](#-support)

## 🌟 Features

### 🔍 **Advanced Search Capabilities**
- **Semantic Search**: AI-powered understanding of document content
- **Vector Search**: Fast similarity-based document retrieval
- **Full-Text Search**: Traditional keyword-based search
- **Hybrid Search**: Combines multiple search methods for optimal results

### 🤖 **Conversational AI**
- **Context-Aware Chat**: Maintains conversation context across multiple turns
- **Document Citation**: Provides specific source references for all answers
- **Streaming Responses**: Real-time response generation
- **Multi-Language Support**: Supports multiple languages for queries and documents

### 📄 **Document Processing**
- **Multi-Format Support**: PDF, DOCX, XLSX, PPTX, TXT, and more
- **Intelligent Chunking**: Smart document segmentation for optimal retrieval
- **Metadata Extraction**: Automatic extraction of document properties
- **Batch Processing**: Efficient handling of multiple documents

### 🎯 **Enterprise Features**
- **Role-Based Access Control**: Admin and user roles with appropriate permissions
- **Audit Logging**: Comprehensive activity tracking
- **Performance Analytics**: Search metrics and usage statistics
- **Scalable Architecture**: Designed for high-volume enterprise use

## 🔧 Quick Start

### One-Command Deployment

Deploy Allemny Find V2 on any Linux system with a single command:

```bash
curl -sSL https://raw.githubusercontent.com/p.goodman@sidf.gov.sa/AllemnyFind/main/Pre-Prod/deploy.sh | bash
```

This command will:
- ✅ Install all system dependencies
- ✅ Setup Docker and Docker Compose
- ✅ Clone the repository
- ✅ Configure environment settings
- ✅ Detect and configure available ports (starting from 3001)
- ✅ Build and start all services
- ✅ Initialize the database
- ✅ Setup AI models
- ✅ Perform health checks

### Manual Deployment

If you prefer manual deployment:

```bash
# 1. Clone the repository
git clone https://github.com/p.goodman@sidf.gov.sa/AllemnyFind.git
cd AllemnyFind/Pre-Prod

# 2. Setup environment
chmod +x *.sh
./setup-environment.sh

# 3. Configure ports
./port-manager.sh

# 4. Deploy services
docker-compose up -d

# 5. Check health
./health-check.sh
```

## 📦 Requirements

### System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **OS** | Linux (Ubuntu 20.04+, CentOS 8+, RHEL 8+) | Ubuntu 22.04 LTS |
| **RAM** | 4 GB | 8 GB+ |
| **Storage** | 20 GB | 50 GB+ |
| **CPU** | 2 cores | 4+ cores |
| **Network** | Internet access for setup | Stable broadband |

### Software Dependencies

- **Docker**: 20.10+
- **Docker Compose**: 2.0+
- **Git**: Latest
- **Curl/Wget**: For installation scripts

All dependencies are automatically installed by the deployment script.

### Port Requirements

| Service | Default Port | Configurable | Description |
|---------|--------------|--------------|-------------|
| Frontend | 3001 | ✅ | Web application UI |
| Backend API | 8002 | ✅ | REST API server |
| PostgreSQL | 5432 | ✅ | Database server |
| Redis | 6379 | ✅ | Cache and session store |
| Ollama | 11434 | ✅ | Local AI model server |

*The system automatically detects port conflicts and uses the next available port.*

## 🐳 Docker Deployment

### Architecture Overview

```mermaid
graph TB
    A[Frontend - React/TypeScript] --> B[Nginx Reverse Proxy]
    B --> C[Backend - FastAPI/Python]
    C --> D[PostgreSQL + pgvector]
    C --> E[Redis Cache]
    C --> F[Ollama AI Models]

    G[Docker Volumes] --> D
    G --> E
    G --> F
    G --> H[Document Storage]
```

### Services

| Service | Container | Purpose | Health Check |
|---------|-----------|---------|--------------|
| **Frontend** | `allemny_frontend` | React web application | HTTP GET / |
| **Backend** | `allemny_backend` | FastAPI server | HTTP GET /health |
| **Database** | `allemny_postgres` | PostgreSQL with pgvector | pg_isready |
| **Cache** | `allemny_redis` | Redis server | redis-cli ping |
| **AI Models** | `allemny_ollama` | Local LLM server | HTTP GET /api/tags |

### Docker Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f [service_name]

# Stop all services
docker-compose down

# Rebuild and restart
docker-compose up -d --build

# Check service status
docker-compose ps

# Execute commands in containers
docker-compose exec backend python manage.py shell
docker-compose exec postgres psql -U allemny_find -d allemny_find_v2
```

## ⚙️ Configuration

### Environment Variables

Key configuration options in `.env`:

```bash
# Application
FRONTEND_PORT=3001
BACKEND_PORT=8002
ENVIRONMENT=production

# Database
DATABASE_URL=postgresql://allemny_find:password@postgres:5432/allemny_find_v2

# Security
SECRET_KEY=your-secret-key-here
ACCESS_TOKEN_EXPIRE_MINUTES=30

# AI Services
GROQ_API_KEY=your-groq-api-key
OLLAMA_BASE_URL=http://ollama:11434

# Performance
MAX_CONCURRENT_JOBS=10
CHUNK_SIZE=1000
CHUNK_OVERLAP=200
```

### Advanced Configuration

#### Custom Docker Compose Override

Create `docker-compose.override.yml` for custom configurations:

```yaml
version: '3.8'
services:
  backend:
    environment:
      - LOG_LEVEL=DEBUG
    volumes:
      - ./custom-config:/app/config

  nginx:
    ports:
      - "443:443"
    volumes:
      - ./ssl:/etc/ssl/certs
```

#### SSL/TLS Configuration

For production HTTPS:

1. Place SSL certificates in `./ssl/` directory
2. Update nginx configuration
3. Set `NGINX_SSL_PORT=443` in `.env`

## 🏥 Health Monitoring

### Health Check Script

Monitor system health with the included script:

```bash
# Quick health check
./health-check.sh check

# Detailed health check with statistics
./health-check.sh check detailed

# Continuous monitoring (every 30 seconds)
./health-check.sh watch 30

# Restart unhealthy services
./health-check.sh restart

# View service logs
./health-check.sh logs [service_name]
```

### Health Endpoints

| Endpoint | Purpose | Expected Response |
|----------|---------|-------------------|
| `GET /health` | Backend health | `{\"status\": \"healthy\"}` |
| `GET /docs` | API documentation | Swagger UI |
| `GET /metrics` | System metrics | Prometheus format |

### Monitoring Metrics

The system tracks:
- **Performance**: Response times, throughput
- **Resources**: CPU, memory, disk usage
- **Errors**: Error rates, failed requests
- **Business**: Search queries, document processing

## 📊 API Documentation

### Interactive Documentation

Access the interactive API documentation:
- **Swagger UI**: http://localhost:8002/docs
- **ReDoc**: http://localhost:8002/redoc

### Key API Endpoints

#### Authentication
```bash
POST /api/auth/login      # User login
POST /api/auth/register   # User registration
POST /api/auth/refresh    # Token refresh
```

#### Document Management
```bash
POST /api/documents/upload     # Upload documents
GET  /api/documents/          # List documents
GET  /api/documents/{id}      # Get document details
DELETE /api/documents/{id}    # Delete document
```

#### Search
```bash
POST /api/search/query        # Perform search
GET  /api/search/history      # Search history
POST /api/search/feedback     # Search feedback
```

#### Chat
```bash
POST /api/chat/message        # Send chat message
GET  /api/chat/conversations  # List conversations
WebSocket /ws/chat           # Real-time chat
```

### API Authentication

Use JWT tokens for API access:

```bash
# Login to get token
curl -X POST \"http://localhost:8002/api/auth/login\" \
  -H \"Content-Type: application/json\" \
  -d '{\"username\": \"admin@example.com\", \"password\": \"password\"}'

# Use token in requests
curl -X GET \"http://localhost:8002/api/documents/\" \
  -H \"Authorization: Bearer YOUR_TOKEN_HERE\"
```

## 🔒 Security

### Authentication & Authorization

- **JWT Tokens**: Secure token-based authentication
- **Role-Based Access**: Admin and user roles
- **Password Hashing**: Bcrypt with salt
- **Session Management**: Secure session handling

### Data Protection

- **Encryption at Rest**: Database encryption
- **TLS/SSL**: HTTPS for all communications
- **Input Validation**: Comprehensive input sanitization
- **File Security**: Safe file upload handling

### Security Headers

The application includes security headers:
- `X-Frame-Options: SAMEORIGIN`
- `X-XSS-Protection: 1; mode=block`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer-when-downgrade`

### Security Best Practices

1. **Change Default Credentials**: Update admin password immediately
2. **Use Strong Secrets**: Generate secure JWT secret keys
3. **Enable HTTPS**: Use SSL certificates in production
4. **Regular Updates**: Keep dependencies up to date
5. **Monitor Logs**: Watch for suspicious activity

## 🛠️ Troubleshooting

### Common Issues

#### Port Conflicts
```bash
# Check what's using a port
sudo netstat -tulpn | grep :3001

# Use port detection script
./port-manager.sh

# Manually set different ports in .env
FRONTEND_PORT=3002
BACKEND_PORT=8003
```

#### Service Won't Start
```bash
# Check service logs
docker-compose logs [service_name]

# Restart specific service
docker-compose restart [service_name]

# Check system resources
./health-check.sh check detailed
```

#### Database Connection Issues
```bash
# Check database status
docker-compose exec postgres pg_isready -U allemny_find

# Reset database
docker-compose down
docker volume rm allemny_postgres_data
docker-compose up -d postgres
```

#### Out of Memory
```bash
# Check memory usage
free -h
docker stats

# Adjust Docker limits in docker-compose.yml
services:
  backend:
    deploy:
      resources:
        limits:
          memory: 2G
```

### Log Locations

| Component | Log Location | Purpose |
|-----------|--------------|---------|
| Application | `./logs/app.log` | Application events |
| Deployment | `./deployment.log` | Installation log |
| Health Checks | `./health-check.log` | System monitoring |
| Docker | `docker-compose logs` | Container logs |

### Performance Tuning

#### Database Optimization
```sql
-- Increase shared_buffers (in PostgreSQL)
ALTER SYSTEM SET shared_buffers = '256MB';

-- Optimize for search queries
CREATE INDEX IF NOT EXISTS idx_documents_embedding
ON documents USING ivfflat (embedding vector_cosine_ops);
```

#### Application Optimization
```bash
# Increase worker processes
export WORKERS=4

# Adjust batch sizes
export BATCH_SIZE=50
export MAX_CONCURRENT_JOBS=5
```

## 📞 Support

### Documentation

- **API Docs**: http://localhost:8002/docs
- **Health Dashboard**: http://localhost:8002/health
- **System Metrics**: `./health-check.sh check detailed`

### Getting Help

1. **Check Logs**: Review application and system logs
2. **Run Diagnostics**: Use `./health-check.sh check detailed`
3. **Consult Documentation**: Check this README and API docs
4. **Community Support**: GitHub Issues and Discussions

### Development Team

- **Primary Contact**: p.goodman@sidf.gov.sa
- **Repository**: [GitHub - AllemnyFind](https://github.com/p.goodman@sidf.gov.sa/AllemnyFind)

### Reporting Issues

When reporting issues, please include:
- System information (`uname -a`)
- Docker version (`docker --version`)
- Error logs (`docker-compose logs`)
- Steps to reproduce the issue

---

## 🎉 Success Metrics

After successful deployment, you should see:

✅ **All services healthy** (5/5 containers running)
✅ **Frontend accessible** at http://localhost:3001
✅ **API responding** at http://localhost:8002/health
✅ **Database connected** and migrations applied
✅ **AI models loaded** and responding
✅ **Search functionality** working correctly
✅ **Chat interface** providing contextual responses

---

*Allemny Find V2 - Empowering organizations with intelligent document search and AI-driven knowledge management.*