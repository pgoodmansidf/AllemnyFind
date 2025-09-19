# app/core/migrations.py - NEW FILE
import logging
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.core.database import engine, SessionLocal
from app.models.user import UserRole

logger = logging.getLogger(__name__)

def run_migrations():
    """Run database migrations to update schema"""
    db = SessionLocal()
    try:
        # Check if migrations are needed
        check_and_migrate_users_table(db)
        create_prescreened_users_table(db)
        logger.info("Database migrations completed successfully")
    except Exception as e:
        logger.error(f"Error running migrations: {e}")
        raise
    finally:
        db.close()

def check_and_migrate_users_table(db: Session):
    """Add new columns to users table if they don't exist"""
    try:
        # Check if role column exists
        result = db.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='users' AND column_name='role'
        """))
        
        if not result.fetchone():
            logger.info("Adding new columns to users table...")
            
            # Add role column with default value
            db.execute(text("""
                ALTER TABLE users 
                ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'standard'
            """))
            
            # Add other new columns
            db.execute(text("""
                ALTER TABLE users 
                ADD COLUMN IF NOT EXISTS department VARCHAR(100),
                ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
                ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE,
                ADD COLUMN IF NOT EXISTS api_key VARCHAR(100)
            """))
            
            # Update existing admin user to have admin role
            db.execute(text("""
                UPDATE users 
                SET role = 'admin' 
                WHERE username = 'admin' OR is_superuser = true
            """))
            
            db.commit()
            logger.info("Users table migration completed")
        else:
            logger.info("Users table already has required columns")
            
    except Exception as e:
        logger.error(f"Error migrating users table: {e}")
        db.rollback()
        raise

def create_prescreened_users_table(db: Session):
    """Create prescreened_users table if it doesn't exist"""
    try:
        # Check if table exists
        result = db.execute(text("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'prescreened_users'
            )
        """))
        
        table_exists = result.fetchone()[0]
        
        if not table_exists:
            logger.info("Creating prescreened_users table...")
            
            db.execute(text("""
                CREATE TABLE prescreened_users (
                    id SERIAL PRIMARY KEY,
                    email VARCHAR(100) UNIQUE NOT NULL,
                    full_name VARCHAR(100) NOT NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    created_by INTEGER,
                    is_registered BOOLEAN DEFAULT FALSE
                )
            """))
            
            # Create index on email
            db.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_prescreened_users_email 
                ON prescreened_users(email)
            """))
            
            db.commit()
            logger.info("Prescreened users table created successfully")
        else:
            logger.info("Prescreened users table already exists")
            
    except Exception as e:
        logger.error(f"Error creating prescreened_users table: {e}")
        db.rollback()
        raise