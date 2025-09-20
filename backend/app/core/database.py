from sqlalchemy import create_engine, text, event
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool, StaticPool
import logging
import sys
import time

from app.core.config import settings

logger = logging.getLogger(__name__)

# Windows-specific PostgreSQL connection settings
Windows_PG_SETTINGS = {
    "connect_args": {
        "connect_timeout": 30,
        "application_name": "allemny_find_v2",
        "options": "-c search_path=public -c timezone=UTC"
    }
}

# Optimized engine configuration for Windows PostgreSQL 17.4
engine_config = {
    "poolclass": QueuePool,
    "pool_size": 5,  # Reduced for Windows
    "max_overflow": 10,  # Conservative overflow
    "pool_pre_ping": True,
    "pool_recycle": 1800,  # 30 minutes instead of 1 hour
    "pool_timeout": 30,  # Connection timeout
    "pool_reset_on_return": "commit",  # Reset connections properly
    "echo": False,
    "isolation_level": "READ_COMMITTED",
    "future": True,  # Use SQLAlchemy 2.0 style
}

# Add Windows-specific settings if on Windows
if sys.platform.startswith('win'):
    engine_config.update(Windows_PG_SETTINGS)

# Create engine with Windows optimizations
engine = create_engine(
    settings.database_url,
    **engine_config
)

# PostgreSQL-specific connection event handlers
@event.listens_for(engine, "connect")
def set_postgresql_search_path(dbapi_connection, connection_record):
    """Set search path and optimize connection for pgvector"""
    with dbapi_connection.cursor() as cursor:
        # Set search path and timezone
        cursor.execute("SET search_path TO public")
        cursor.execute("SET timezone TO 'UTC'")

        # Optimize for pgvector operations
        cursor.execute("SET work_mem = '256MB'")
        cursor.execute("SET effective_cache_size = '1GB'")
        cursor.execute("SET random_page_cost = 1.1")

        # Windows-specific optimizations
        if sys.platform.startswith('win'):
            cursor.execute("SET max_parallel_workers_per_gather = 2")
            cursor.execute("SET synchronous_commit = 'off'")

@event.listens_for(engine, "checkout")
def ping_connection(dbapi_connection, connection_record, connection_proxy):
    """Ensure connection is alive before using"""
    try:
        with dbapi_connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception as e:
        logger.warning(f"Connection ping failed: {e}")
        # Invalidate the connection
        connection_record.invalidate()
        raise

# Optimized session configuration
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False  # Prevent lazy loading issues
)

Base = declarative_base()

def get_db():
    """Database dependency for FastAPI with improved error handling"""
    db = SessionLocal()
    try:
        # Test connection before yielding
        db.execute(text("SELECT 1"))
        yield db
    except Exception as e:
        logger.error(f"Database error: {e}")
        try:
            db.rollback()
        except Exception as rollback_error:
            logger.error(f"Rollback failed: {rollback_error}")
        raise
    finally:
        try:
            db.close()
        except Exception as close_error:
            logger.error(f"Failed to close database session: {close_error}")

def init_db():
    """Initialize database with pgvector extension and Windows optimizations"""
    max_retries = 3
    retry_delay = 2

    for attempt in range(max_retries):
        try:
            with engine.connect() as conn:
                # Enable pgvector extension
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

                # Create indexes for better performance
                conn.execute(text("""
                    DO $$
                    BEGIN
                        -- Create index on document_chunks embedding if it doesn't exist
                        IF NOT EXISTS (
                            SELECT 1 FROM pg_indexes
                            WHERE indexname = 'idx_document_chunks_embedding_hnsw'
                        ) THEN
                            CREATE INDEX CONCURRENTLY idx_document_chunks_embedding_hnsw
                            ON document_chunks USING hnsw (embedding vector_cosine_ops)
                            WITH (m = 16, ef_construction = 64);
                        END IF;
                    END $$;
                """))

                conn.commit()
                logger.info("Database initialized successfully with pgvector extension and HNSW indexes")
                return
        except Exception as e:
            logger.warning(f"Database initialization attempt {attempt + 1} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                logger.error(f"Failed to initialize database after {max_retries} attempts: {e}")
                raise

def check_db_connection():
    """Check database connectivity with detailed diagnostics"""
    try:
        with engine.connect() as conn:
            # Basic connectivity test
            conn.execute(text("SELECT 1"))

            # Check pgvector extension
            result = conn.execute(text(
                "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'vector')"
            )).scalar()

            if not result:
                logger.warning("pgvector extension not found")
                return False

            # Check connection pool status
            try:
                pool_status = {
                    "size": engine.pool.size(),
                    "checked_in": engine.pool.checkedin(),
                    "checked_out": engine.pool.checkedout(),
                }
                # Only include overflow and invalid if they exist
                if hasattr(engine.pool, 'overflow'):
                    pool_status["overflow"] = engine.pool.overflow()
                if hasattr(engine.pool, 'invalid'):
                    pool_status["invalid"] = engine.pool.invalid()
                logger.info(f"Database connection pool status: {pool_status}")
            except Exception as pool_error:
                logger.warning(f"Could not get pool status: {pool_error}")

            return True
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return False

def close_db_connections():
    """Properly close all database connections"""
    try:
        engine.dispose()
        logger.info("Database connections closed successfully")
    except Exception as e:
        logger.error(f"Failed to close database connections: {e}")

def get_db_session_stats():
    """Get database session statistics for monitoring"""
    stats = {
        "pool_size": engine.pool.size(),
        "checked_in": engine.pool.checkedin(),
        "checked_out": engine.pool.checkedout(),
    }
    # Only include overflow and invalid if they exist
    if hasattr(engine.pool, 'overflow'):
        stats["overflow"] = engine.pool.overflow()
    if hasattr(engine.pool, 'invalid'):
        stats["invalid"] = engine.pool.invalid()
    return stats