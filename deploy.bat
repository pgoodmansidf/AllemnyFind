@echo off
echo ====================================================
echo    Allemny Find V2 - 1-Click Docker Deployment
echo ====================================================
echo.

:: Check if Docker is installed and running
echo [1/6] Checking Docker installation...
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

:: Stop and remove existing containers
echo.
echo [2/6] Stopping existing containers...
docker-compose down --remove-orphans >nul 2>&1
echo ✓ Existing containers stopped

:: Remove old images to ensure fresh build
echo.
echo [3/6] Cleaning up old images...
docker image prune -f >nul 2>&1
echo ✓ Old images cleaned up

:: Build and start services
echo.
echo [4/6] Building and starting services...
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
echo [5/6] Waiting for services to start...
timeout /t 10 /nobreak >nul

:: Check service health
echo.
echo [6/6] Checking service status...
echo.

:: Check database
echo Checking database...
docker-compose exec -T postgres pg_isready -U allemny_find -d allemny_find_v2 >nul 2>&1
if %errorlevel% eq 0 (
    echo ✓ Database is ready
) else (
    echo ⚠ Database not ready yet, but continuing...
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
echo Opening frontend in your default browser...
timeout /t 3 /nobreak >nul
start http://localhost:3001
echo.
echo Press any key to exit...
pause >nul