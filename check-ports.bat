@echo off
REM Port conflict detection script for Windows
REM This script checks for existing services and sets environment variables to avoid conflicts

echo 🔍 Checking for port conflicts...

setlocal enabledelayedexpansion

REM Function to check if a port is in use
:check_port
netstat -an | findstr ":%1 " >nul 2>&1
if !errorlevel! == 0 (
    echo ⚠️  Port %1 is already in use ^(may be existing %2^)
    exit /b 1
) else (
    echo ✅ Port %1 is available
    exit /b 0
)

REM Function to find next available port
:find_available_port
set start_port=%1
set test_port=%start_port%
set /a max_attempts=100
set /a attempt=0

:port_loop
netstat -an | findstr ":%test_port% " >nul 2>&1
if !errorlevel! neq 0 (
    echo !test_port!
    exit /b 0
)
set /a attempt+=1
set /a test_port=start_port+attempt
if !attempt! lss !max_attempts! goto port_loop

echo %start_port%
exit /b 1

REM Check PostgreSQL port (5432)
echo Checking PostgreSQL port...
call :check_port 5432 "PostgreSQL"
if !errorlevel! == 0 (
    set POSTGRES_HOST_PORT=5432
) else (
    for /f %%i in ('call :find_available_port 5433') do set POSTGRES_HOST_PORT=%%i
    echo 📍 Will use port !POSTGRES_HOST_PORT! for PostgreSQL container
)

REM Check Redis port (6379)
echo Checking Redis port...
call :check_port 6379 "Redis"
if !errorlevel! == 0 (
    set REDIS_HOST_PORT=6379
) else (
    for /f %%i in ('call :find_available_port 6380') do set REDIS_HOST_PORT=%%i
    echo 📍 Will use port !REDIS_HOST_PORT! for Redis container
)

REM Check Backend port (8000)
echo Checking Backend port...
call :check_port 8000 "Backend service"
if !errorlevel! == 0 (
    set BACKEND_HOST_PORT=8000
) else (
    for /f %%i in ('call :find_available_port 8001') do set BACKEND_HOST_PORT=%%i
    echo 📍 Will use port !BACKEND_HOST_PORT! for Backend container
)

REM Check Frontend port (3001)
echo Checking Frontend port...
call :check_port 3001 "Frontend service"
if !errorlevel! == 0 (
    set FRONTEND_HOST_PORT=3001
) else (
    for /f %%i in ('call :find_available_port 3002') do set FRONTEND_HOST_PORT=%%i
    echo 📍 Will use port !FRONTEND_HOST_PORT! for Frontend container
)

REM Create .env file with port mappings
echo 📝 Creating .env file with port configurations...
(
echo # Auto-generated port configuration to avoid conflicts
echo # Generated on %date% %time%
echo.
echo POSTGRES_HOST_PORT=!POSTGRES_HOST_PORT!
echo REDIS_HOST_PORT=!REDIS_HOST_PORT!
echo BACKEND_HOST_PORT=!BACKEND_HOST_PORT!
echo FRONTEND_HOST_PORT=!FRONTEND_HOST_PORT!
echo.
echo # Database configuration
echo DB_PASSWORD=AFbqSrE?h8bPjSCs9#
echo.
echo # API Keys
echo GROQ_API_KEY=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
echo SECRET_KEY=allemny-find-super-secret-key-change-in-production-2024
) > .env

echo.
echo 🎯 Port Configuration Summary:
echo    PostgreSQL: localhost:!POSTGRES_HOST_PORT! → container:5432
echo    Redis:      localhost:!REDIS_HOST_PORT! → container:6379
echo    Backend:    localhost:!BACKEND_HOST_PORT! → container:8000
echo    Frontend:   localhost:!FRONTEND_HOST_PORT! → container:3001
echo.
echo 💡 Run 'docker-compose up' to start with these port mappings
echo    The .env file has been created with the optimal port configuration

pause