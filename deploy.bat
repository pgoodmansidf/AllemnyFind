@echo off
echo ====================================================
echo    Allemny Find V2 - 1-Click Docker Deployment
echo ====================================================
echo.

:: Check prerequisites
echo [1/7] Checking prerequisites...

:: Check Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not installed or not in PATH
    echo Please install Docker Desktop for Windows
    pause
    exit /b 1
)

docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker is not running
    echo Please start Docker Desktop and try again
    pause
    exit /b 1
)
echo ✓ Docker is installed and running

:: Check PostgreSQL
echo Checking PostgreSQL connection...
psql --version >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: PostgreSQL client not found in PATH
    echo PostgreSQL server is required for this application
)

:: Test PostgreSQL connection
pg_isready -h localhost -p 5432 -U allemny_find -d allemny_find_v2 >nul 2>&1
if %errorlevel% eq 0 (
    echo ✓ PostgreSQL server is running and accessible
) else (
    echo ERROR: Cannot connect to PostgreSQL server
    echo.
    echo PREREQUISITES REQUIRED:
    echo 1. PostgreSQL must be installed and running on localhost:5432
    echo 2. Database 'allemny_find_v2' must exist
    echo 3. User 'allemny_find' must have access
    echo 4. Admin user must be created ^(admin/admin123^)
    echo.
    echo Please set up PostgreSQL first, then run this script again.
    pause
    exit /b 1
)

:: Stop and remove existing containers
echo.
echo [2/7] Stopping existing containers...
docker-compose down --remove-orphans >nul 2>&1
echo ✓ Existing containers stopped

:: Remove old images to ensure fresh build
echo.
echo [3/7] Cleaning up old images...
docker image prune -f >nul 2>&1
echo ✓ Old images cleaned up

:: Build and start services
echo.
echo [4/7] Building and starting services...
echo This may take a few minutes on first run...
docker-compose up --build -d

if %errorlevel% neq 0 (
    echo ERROR: Failed to start services
    echo Showing logs for debugging:
    docker-compose logs
    pause
    exit /b 1
)

:: Wait for services to be ready
echo.
echo [5/7] Waiting for services to start...
timeout /t 10 /nobreak >nul

:: Check service health
echo.
echo [6/7] Checking service status...
echo.

:: Check database (host PostgreSQL)
echo Checking database connection...
pg_isready -h localhost -p 5432 -U allemny_find -d allemny_find_v2 >nul 2>&1
if %errorlevel% eq 0 (
    echo ✓ PostgreSQL database is accessible
) else (
    echo ⚠ Database connection issue, but continuing...
)

:: Check backend
echo Checking backend...
timeout /t 5 /nobreak >nul
curl -s http://localhost:8000/health >nul 2>&1
if %errorlevel% eq 0 (
    echo ✓ Backend is ready
) else (
    echo ⚠ Backend not ready yet, but continuing...
)

:: Check frontend
echo Checking frontend...
curl -s http://localhost:3001 >nul 2>&1
if %errorlevel% eq 0 (
    echo ✓ Frontend is ready
) else (
    echo ⚠ Frontend not ready yet, but continuing...
)

echo.
echo ====================================================
echo           🚀 DEPLOYMENT COMPLETE! 🚀
echo ====================================================
echo.
echo Services are starting up. Please wait 1-2 minutes for full initialization.
echo.
echo Access your application:
echo   Frontend: http://localhost:3001
echo   Backend API: http://localhost:8000
echo   API Docs: http://localhost:8000/docs
echo   Health Check: http://localhost:8000/health
echo.
echo Default Admin Login:
echo   Username: admin
echo   Password: admin123
echo.
echo Useful Commands:
echo   View logs: docker-compose logs -f
echo   Stop services: docker-compose down
echo   Restart services: docker-compose restart
echo   View running containers: docker-compose ps
echo.
echo [7/7] Opening application...
timeout /t 3 /nobreak >nul
start http://localhost:3001
echo.
echo Press any key to exit...
pause >nul