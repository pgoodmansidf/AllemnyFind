-- Allemny Find V2 - Database Initialization Script
-- This script sets up the PostgreSQL database with pgvector extension

-- Create the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the allemny_find database if it doesn't exist
SELECT 'CREATE DATABASE allemny_find_v2'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'allemny_find_v2')\gexec

-- Connect to the database
\c allemny_find_v2;

-- Create the pgvector extension in the target database
CREATE EXTENSION IF NOT EXISTS vector;

-- Create a user for the application if it doesn't exist
DO
$do$
BEGIN
   IF NOT EXISTS (
      SELECT FROM pg_catalog.pg_roles
      WHERE  rolname = 'allemny_find') THEN

      CREATE ROLE allemny_find LOGIN PASSWORD 'AFbqSrE?h8bPjSCs9#';
   END IF;
END
$do$;

-- Grant privileges to the user
GRANT ALL PRIVILEGES ON DATABASE allemny_find_v2 TO allemny_find;
GRANT ALL ON SCHEMA public TO allemny_find;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO allemny_find;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO allemny_find;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO allemny_find;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO allemny_find;

-- Set up database configuration for optimal performance
ALTER DATABASE allemny_find_v2 SET shared_preload_libraries = 'vector';
ALTER DATABASE allemny_find_v2 SET max_connections = 100;
ALTER DATABASE allemny_find_v2 SET shared_buffers = '256MB';
ALTER DATABASE allemny_find_v2 SET effective_cache_size = '1GB';
ALTER DATABASE allemny_find_v2 SET maintenance_work_mem = '64MB';
ALTER DATABASE allemny_find_v2 SET checkpoint_completion_target = 0.9;
ALTER DATABASE allemny_find_v2 SET wal_buffers = '16MB';
ALTER DATABASE allemny_find_v2 SET default_statistics_target = 100;

-- Create indexes for better performance
-- Note: These will be created by Alembic migrations, but including here for reference
COMMENT ON DATABASE allemny_find_v2 IS 'Allemny Find V2 - AI-Powered Document Search System';

-- Show successful initialization
SELECT 'Database allemny_find_v2 initialized successfully with pgvector extension' AS status;