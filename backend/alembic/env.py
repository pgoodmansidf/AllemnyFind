# backend/alembic/env.py
import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

# This block is crucial for Alembic to find your application's models.
# It adds the parent directory (which is typically your 'backend' root)
# to the Python path.
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# IMPORTANT: You need to import your SQLAlchemy Base object here.
# Based on your structure, Base is likely in app/core/database.py
from app.core.database import Base # This is correctly importing your Base

# ----------------------------------------------------------------------
# IMPORTANT: Import ALL your SQLAlchemy models here.
# This ensures Base.metadata is fully populated with all your table definitions.
# Based on your provided file locations (C:\Projects\Allemny-Find-V2\backend\app\models\)
# ----------------------------------------------------------------------

# In alembic/env.py, add these imports
from app.models.document import Document, DocumentChunk
from app.models.ingestion import IngestionJob, IngestionStatistics
from app.models.user import User
from app.models.search import SearchQuery, SearchSession  # Add this line!

# ----------------------------------------------------------------------

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
target_metadata = Base.metadata # This is correctly set

# --- DEBUGGING STEP: Print out the tables Alembic sees ---
print("--- Debugging Base.metadata.tables ---")
if target_metadata:
    for table_name, table_obj in target_metadata.tables.items():
        print(f"  Detected model table: {table_name}")
else:
    print("  target_metadata is None or empty.")
print("--- End Debugging ---")
# ---------------------------------------------------------

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    # Use DATABASE_URL environment variable if available, otherwise use config
    url = os.getenv("DATABASE_URL") or config.get_main_option("sqlalchemy.url")
    print(f"[ALEMBIC] Using database URL: {url[:50]}...")  # Debug log (truncated for security)

    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    # Use DATABASE_URL environment variable if available
    database_url = os.getenv("DATABASE_URL")

    if database_url:
        print(f"[ALEMBIC] Using DATABASE_URL environment variable: {database_url[:50]}...")
        print(f"[ALEMBIC] Full DATABASE_URL (for debugging): {database_url}")
        # Create engine directly from DATABASE_URL
        from sqlalchemy import create_engine
        try:
            # Test the connection before creating the engine
            connectable = create_engine(database_url, poolclass=pool.NullPool)
            # Test connection
            with connectable.connect() as test_conn:
                print("[ALEMBIC] Database connection test successful")
        except Exception as e:
            print(f"[ALEMBIC] ERROR: Failed to connect with DATABASE_URL: {e}")
            print("[ALEMBIC] Falling back to alembic.ini configuration...")
            database_url = None
    else:
        print("[ALEMBIC] DATABASE_URL environment variable not found")

    if not database_url:
        print("[ALEMBIC] Using alembic.ini configuration")
        # Fallback to config file
        connectable = engine_from_config(
            config.get_section(config.config_ini_section, {}),
            prefix="sqlalchemy.",
            poolclass=pool.NullPool,
        )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
