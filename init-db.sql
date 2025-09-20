-- Initialize database and create necessary extensions
-- This script runs automatically when the PostgreSQL container starts

-- Create the database if it doesn't exist (handled by POSTGRES_DB env var)
-- But we can ensure the user has proper permissions

-- Create pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Grant necessary permissions
GRANT ALL PRIVILEGES ON DATABASE allemny_find_v2 TO allemny_find;

-- Create schema if needed (optional)
-- CREATE SCHEMA IF NOT EXISTS public;

-- You can add any additional database initialization here