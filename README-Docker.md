# Allemny Find V2 - Docker Deployment Guide

This directory contains a complete Docker deployment solution for the Allemny Find V2 application.

## Prerequisites

**IMPORTANT: PostgreSQL must be installed and running locally before deployment!**

### Required Setup:
1. **PostgreSQL 15+** installed and running on `localhost:5432`
2. **Database**: `allemny_find_v2`
3. **User**: `allemny_find` with password `AFbqSrE?h8bPjSCs9#`
4. **Extensions**: pgvector enabled
5. **Admin user**: Created with username `admin` and password `admin123`

### Quick PostgreSQL Setup:
```sql
-- Connect as postgres superuser and run:
CREATE DATABASE allemny_find_v2;
CREATE USER allemny_find WITH PASSWORD 'AFbqSrE?h8bPjSCs9#';
GRANT ALL PRIVILEGES ON DATABASE allemny_find_v2 TO allemny_find;

-- Connect to allemny_find_v2 database:
CREATE EXTENSION IF NOT EXISTS vector;
GRANT ALL ON SCHEMA public TO allemny_find;
```

## Quick Start (1-Click Deployment)

**For Windows users:**
```bash
double-click deploy.bat
```

**For Linux/Mac users:**
```bash
chmod +x deploy.sh && ./deploy.sh
```

## What's Included

### Docker Services
- **Frontend**: React/Vite application (Port 3001)
- **Backend**: FastAPI application (Port 8000)

### External Prerequisites
- **Database**: PostgreSQL 15+ with pgvector (localhost:5432)

### Access Points
- Frontend: http://localhost:3001
- Backend API: http://localhost:8000
- API Documentation: http://localhost:8000/docs
- Health Check: http://localhost:8000/health

### Default Admin Credentials
- Username: `admin`
- Password: `admin123`

## Files Created

### Core Docker Files
- `backend/Dockerfile` - Backend container configuration
- `frontend/Dockerfile` - Frontend container configuration
- `frontend/nginx.conf` - Nginx configuration for frontend
- `docker-compose.yml` - Multi-service orchestration
- `init-db.sql` - Database initialization script

### Environment Configuration
- `.env.docker` - Docker-specific environment variables

### Deployment Scripts
- `deploy.bat` - Windows 1-click deployment
- `docker-logs.bat` - View service logs
- `docker-stop.bat` - Stop all services

### Optimization Files
- `backend/.dockerignore` - Excludes unnecessary files from backend build
- `frontend/.dockerignore` - Excludes unnecessary files from frontend build

## Manual Commands

### Start Services
```bash
docker-compose up -d --build
```

### Stop Services
```bash
docker-compose down
```

### View Logs
```bash
# All services
docker-compose logs

# Specific service
docker-compose logs backend
docker-compose logs frontend
docker-compose logs postgres
```

### Check Service Status
```bash
docker-compose ps
```

### Rebuild Specific Service
```bash
docker-compose up -d --build backend
docker-compose up -d --build frontend
```

## Troubleshooting

### Services Not Starting
1. Check if Docker is running: `docker info`
2. Check logs: `docker-compose logs`
3. Restart services: `docker-compose restart`

### Database Connection Issues
1. Check if PostgreSQL is healthy: `docker-compose ps`
2. Check database logs: `docker-compose logs postgres`
3. Verify environment variables in docker-compose.yml

### Frontend Not Loading
1. Check nginx configuration in `frontend/nginx.conf`
2. Verify build process: `docker-compose logs frontend`
3. Check if backend is accessible: `curl http://localhost:8000/health`

### Permission Issues (Linux/Mac)
```bash
sudo chown -R $USER:$USER ./backend/document_storage
sudo chown -R $USER:$USER ./backend/logs
```

## Data Persistence

- Database data is stored in Docker volume `postgres_data`
- Document storage is mounted from `./backend/document_storage`
- Logs are mounted from `./backend/logs`

## Configuration

### Environment Variables
All configuration is handled through environment variables in `docker-compose.yml`. The application preserves all current local settings.

### External Services
- Ollama: Configure `OLLAMA_BASE_URL` to point to your local Ollama instance
- API Keys: Update `GROQ_API_KEY` in docker-compose.yml or .env.docker

## Security Notes

- Default credentials are for development only
- API keys are included for demo purposes
- In production, use Docker secrets or external key management

## Performance

- Services start with health checks
- Database includes connection pooling
- Frontend uses Nginx for static file serving
- Redis provides session caching

## Clean Installation

To start fresh:
```bash
docker-compose down -v
docker system prune -f
./deploy.bat  # or deploy.sh
```

This removes all containers, networks, and volumes, then rebuilds everything from scratch.