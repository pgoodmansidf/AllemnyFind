@echo off
echo ====================================================
echo      Allemny Find V2 - Stop Docker Services
echo ====================================================
echo.

echo Stopping all Docker services...
docker-compose down

if %errorlevel% eq 0 (
    echo ✓ All services stopped successfully
) else (
    echo ⚠ Error stopping services
)

echo.
echo Do you want to remove all data volumes as well? (y/N)
set /p remove_data="This will delete all database data: "

if /i "%remove_data%"=="y" (
    echo Removing data volumes...
    docker-compose down -v
    docker volume prune -f
    echo ✓ Data volumes removed
) else (
    echo Data volumes preserved
)

echo.
echo Services stopped. To start again, run deploy.bat
pause