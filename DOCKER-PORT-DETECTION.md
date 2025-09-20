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

1. **Port Detection**: The script checks if standard ports are already in use:
   - PostgreSQL: 5432
   - Redis: 6379
   - Backend: 8000
   - Frontend: 3001

2. **Conflict Resolution**: If a port is occupied, it finds the next available port:
   - PostgreSQL: 5433, 5434, 5435...
   - Redis: 6380, 6381, 6382...
   - Backend: 8001, 8002, 8003...
   - Frontend: 3002, 3003, 3004...

3. **Environment Configuration**: Creates a `.env` file with optimal port mappings

4. **Docker Compose**: Uses environment variables for flexible port mapping

## Services Architecture

```
Host System          Docker Containers
─────────────────    ─────────────────
PostgreSQL:5432  →  postgres:5432
Redis:6379       →  redis:6379
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

### Example 1: PostgreSQL Already Running
```
⚠️  Port 5432 is already in use (may be existing PostgreSQL)
📍 Will use port 5433 for PostgreSQL container
```

### Example 2: All Ports Available
```
✅ Port 5432 is available
✅ Port 6379 is available
✅ Port 8000 is available
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
- PostgreSQL: `localhost:${POSTGRES_HOST_PORT}`
- Redis: `localhost:${REDIS_HOST_PORT}`

The actual ports will be displayed when running the detection script.