@echo off
echo ====================================================
echo     PostgreSQL Setup for Allemny Find V2
echo ====================================================
echo.

echo This script will help you set up PostgreSQL for the application.
echo.
echo Prerequisites:
echo - PostgreSQL must be installed on your system
echo - You must know the postgres superuser password
echo.

set /p continue="Continue with PostgreSQL setup? (y/N): "
if /i not "%continue%"=="y" (
    echo Setup cancelled.
    pause
    exit /b 0
)

echo.
echo [1/5] Testing PostgreSQL connection...
psql --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: PostgreSQL client (psql) not found in PATH
    echo Please install PostgreSQL or add it to your PATH
    pause
    exit /b 1
)
echo ✓ PostgreSQL client found

echo.
echo [2/5] Creating database and user...
echo You will be prompted for the postgres superuser password.
echo.

psql -U postgres -h localhost -c "CREATE DATABASE allemny_find_v2;" 2>nul
if %errorlevel% neq 0 (
    echo Database may already exist, continuing...
)

psql -U postgres -h localhost -c "CREATE USER allemny_find WITH PASSWORD 'AFbqSrE?h8bPjSCs9#';" 2>nul
if %errorlevel% neq 0 (
    echo User may already exist, continuing...
)

psql -U postgres -h localhost -c "GRANT ALL PRIVILEGES ON DATABASE allemny_find_v2 TO allemny_find;" 2>nul

echo.
echo [3/5] Setting up pgvector extension...
psql -U postgres -h localhost -d allemny_find_v2 -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>nul
psql -U postgres -h localhost -d allemny_find_v2 -c "GRANT ALL ON SCHEMA public TO allemny_find;" 2>nul

echo.
echo [4/5] Testing connection as allemny_find user...
set PGPASSWORD=AFbqSrE?h8bPjSCs9#
pg_isready -h localhost -p 5432 -U allemny_find -d allemny_find_v2 >nul 2>&1
if %errorlevel% eq 0 (
    echo ✓ Database connection successful
) else (
    echo ⚠ Warning: Could not verify database connection
)

echo.
echo [5/5] Creating admin user tables...
echo This will be done automatically when the application starts.
echo.

echo ====================================================
echo            ✅ POSTGRESQL SETUP COMPLETE!
echo ====================================================
echo.
echo Database Configuration:
echo   Host: localhost
echo   Port: 5432
echo   Database: allemny_find_v2
echo   User: allemny_find
echo   Password: AFbqSrE?h8bPjSCs9#
echo.
echo You can now run the Docker deployment:
echo   double-click deploy.bat
echo.
echo Admin credentials will be created automatically:
echo   Username: admin
echo   Password: admin123
echo.
pause