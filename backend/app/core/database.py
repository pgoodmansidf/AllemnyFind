from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# Create engine with connection pooling
engine = create_engine(
    settings.database_url,
    poolclass=QueuePool,
    pool_size=20,
    max_overflow=30,
    pool_pre_ping=True,
    pool_recycle=3600,
    echo=False
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """Database dependency for FastAPI"""
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database error: {e}")
        db.rollback()
        raise
    finally:
        db.close()

def init_db():
    """Initialize database with pgvector extension"""
    try:
        with engine.connect() as conn:
            # Enable pgvector extension
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.commit()
            logger.info("Database initialized successfully with pgvector extension")
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise

def check_db_connection():
    """Check database connectivity"""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            return True
    except Exception as e:
        logger.error(f"Database connection failed: {e}")
        return False