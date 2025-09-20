# Docker Port Conflict Detection

This system automatically detects existing services and adjusts Docker port mappings to avoid conflicts.

## Quick Start

### Windows
```bash
# Run port detection
.\check-ports.bat

# Start the application
docker-compose up
```

### Linux/macOS
```bash
# Make script executable
chmod +x check-ports.sh

# Run port detection
./check-ports.sh

# Start the application
docker-compose up
```

## How It Works

1. **Fixed Port Mapping**: Uses alternative ports to avoid conflicts with existing services:
   - PostgreSQL: 5433 (host) → 5432 (container)
   - Redis: 6380 (host) → 6379 (container)
   - Backend: Detected dynamically (8000+)
   - Frontend: Detected dynamically (3001+)

2. **Dynamic Detection**: For Backend and Frontend, if standard ports are occupied:
   - Backend: 8001, 8002, 8003...
   - Frontend: 3002, 3003, 3004...

3. **Environment Configuration**: Creates a `.env` file with optimal port mappings

4. **Docker Compose**: Uses environment variables for flexible port mapping

## Services Architecture

```
Host System          Docker Containers
─────────────────    ─────────────────
PostgreSQL:5433  →  postgres:5432
Redis:6380       →  redis:6379
Backend:8000     →  backend:8000
Frontend:3001    →  frontend:3001 (nginx proxy)
```

## Manual Port Configuration

You can also manually set ports in the `.env` file:

```env
POSTGRES_HOST_PORT=5433
REDIS_HOST_PORT=6380
BACKEND_HOST_PORT=8001
FRONTEND_HOST_PORT=3002
```

## Port Conflict Examples

### Example 1: Standard Usage
```
✅ Using fixed alternative ports:
   PostgreSQL: host:5433 → container:5432
   Redis: host:6380 → container:6379
✅ Port 8000 is available
✅ Port 3001 is available
```

### Example 2: Backend Port Conflict
```
✅ Using fixed alternative ports:
   PostgreSQL: host:5433 → container:5432
   Redis: host:6380 → container:6379
⚠️  Port 8000 is already in use (may be existing Backend service)
📍 Will use port 8001 for Backend container
✅ Port 3001 is available
```

## Benefits

- **Zero Configuration**: Automatically detects and resolves conflicts
- **Flexible Deployment**: Works alongside existing services
- **Cross-Platform**: Windows batch script and Unix shell script
- **Safe Defaults**: Falls back to standard ports when available
- **Transparent**: Clear logging of port decisions

## Troubleshooting

### Port Still Conflicts
If conflicts persist, manually check what's using the port:

**Windows:**
```cmd
netstat -an | findstr ":5432"
```

**Linux/macOS:**
```bash
netstat -tuln | grep :5432
# or
ss -tuln | grep :5432
```

### Container Can't Start
1. Run the port detection script again
2. Check Docker logs: `docker-compose logs`
3. Verify `.env` file has correct port mappings
4. Ensure Docker Desktop is running

### Access Application
After successful startup, access the application at:
- Frontend: `http://localhost:${FRONTEND_HOST_PORT}`
- Backend API: `http://localhost:${BACKEND_HOST_PORT}`
- PostgreSQL: `localhost:5433` (mapped to container port 5432)
- Redis: `localhost:6380` (mapped to container port 6379)

The actual ports will be displayed when running the detection script.