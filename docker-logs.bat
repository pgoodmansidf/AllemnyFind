@echo off
echo ====================================================
echo      Allemny Find V2 - Docker Logs Viewer
echo ====================================================
echo.

:: Check if Docker Compose is running
docker-compose ps >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Docker Compose services are not running
    echo Run deploy.bat first to start the services
    pause
    exit /b 1
)

echo Select which logs to view:
echo.
echo 1. All services (combined)
echo 2. Backend only
echo 3. Frontend only
echo 4. Database only
echo 5. Redis only
echo 6. Live tail all services
echo.
set /p choice="Enter your choice (1-6): "

if "%choice%"=="1" (
    echo Showing logs from all services...
    docker-compose logs
) else if "%choice%"=="2" (
    echo Showing backend logs...
    docker-compose logs backend
) else if "%choice%"=="3" (
    echo Showing frontend logs...
    docker-compose logs frontend
) else if "%choice%"=="4" (
    echo Showing database logs...
    docker-compose logs postgres
) else if "%choice%"=="5" (
    echo Showing Redis logs...
    docker-compose logs redis
) else if "%choice%"=="6" (
    echo Starting live tail of all services (Press Ctrl+C to stop)...
    docker-compose logs -f
) else (
    echo Invalid choice. Showing all logs...
    docker-compose logs
)

echo.
pause