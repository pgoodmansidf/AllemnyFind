# app/core/db_utils.py - Database Utilities for Windows PostgreSQL Optimization
import logging
import time
import threading
from contextlib import contextmanager
from typing import Optional, Dict, Any
from sqlalchemy import text, func
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError, DisconnectionError, TimeoutError
from app.core.database import engine, SessionLocal

logger = logging.getLogger(__name__)

class DatabaseHealthMonitor:
    """Monitor database health and connection pool status"""

    def __init__(self):
        self._monitoring = False
        self._monitor_thread = None

    def start_monitoring(self, interval: int = 60):
        """Start monitoring database health"""
        if self._monitoring:
            return

        self._monitoring = True
        self._monitor_thread = threading.Thread(
            target=self._monitor_loop,
            args=(interval,),
            daemon=True
        )
        self._monitor_thread.start()
        logger.info("Database health monitoring started")

    def stop_monitoring(self):
        """Stop monitoring database health"""
        self._monitoring = False
        if self._monitor_thread:
            self._monitor_thread.join(timeout=5)
        logger.info("Database health monitoring stopped")

    def _monitor_loop(self, interval: int):
        """Monitor loop for database health"""
        while self._monitoring:
            try:
                health_status = self.get_health_status()

                # Log warnings for concerning metrics
                if health_status['pool']['overflow'] > 5:
                    logger.warning(f"High connection overflow: {health_status['pool']['overflow']}")

                if health_status['pool']['invalid'] > 2:
                    logger.warning(f"Invalid connections detected: {health_status['pool']['invalid']}")

                if health_status.get('active_connections', 0) > 50:
                    logger.warning(f"High active connection count: {health_status['active_connections']}")

            except Exception as e:
                logger.error(f"Database monitoring error: {e}")

            time.sleep(interval)

    def get_health_status(self) -> Dict[str, Any]:
        """Get comprehensive database health status"""
        try:
            with engine.connect() as conn:
                # Pool status
                pool_status = {
                    "size": engine.pool.size(),
                    "checked_in": engine.pool.checkedin(),
                    "checked_out": engine.pool.checkedout(),
                    "overflow": engine.pool.overflow(),
                    "invalid": engine.pool.invalid()
                }

                # Database connection stats
                db_stats = conn.execute(text("""
                    SELECT
                        count(*) as active_connections,
                        count(*) FILTER (WHERE state = 'active') as active_queries,
                        count(*) FILTER (WHERE state = 'idle') as idle_connections,
                        count(*) FILTER (WHERE state = 'idle in transaction') as idle_in_transaction
                    FROM pg_stat_activity
                    WHERE datname = current_database()
                """)).fetchone()

                # Long running queries
                long_queries = conn.execute(text("""
                    SELECT count(*)
                    FROM pg_stat_activity
                    WHERE datname = current_database()
                    AND state = 'active'
                    AND now() - query_start > interval '30 seconds'
                """)).scalar()

                # Lock information
                locks = conn.execute(text("""
                    SELECT count(*)
                    FROM pg_locks l
                    JOIN pg_stat_activity a ON l.pid = a.pid
                    WHERE a.datname = current_database()
                    AND NOT l.granted
                """)).scalar()

                return {
                    "healthy": True,
                    "pool": pool_status,
                    "active_connections": db_stats.active_connections,
                    "active_queries": db_stats.active_queries,
                    "idle_connections": db_stats.idle_connections,
                    "idle_in_transaction": db_stats.idle_in_transaction,
                    "long_running_queries": long_queries,
                    "waiting_locks": locks,
                    "timestamp": time.time()
                }

        except Exception as e:
            logger.error(f"Failed to get database health status: {e}")
            return {
                "healthy": False,
                "error": str(e),
                "timestamp": time.time()
            }

@contextmanager
def get_db_with_retry(max_retries: int = 3, retry_delay: float = 1.0):
    """Get database session with retry logic for Windows environments"""
    for attempt in range(max_retries):
        db = None
        try:
            db = SessionLocal()
            # Test the connection
            db.execute(text("SELECT 1"))
            yield db
            return
        except (DisconnectionError, TimeoutError, ConnectionError) as e:
            if db:
                try:
                    db.close()
                except:
                    pass

            if attempt < max_retries - 1:
                logger.warning(f"Database connection attempt {attempt + 1} failed: {e}. Retrying...")
                time.sleep(retry_delay * (2 ** attempt))  # Exponential backoff
            else:
                logger.error(f"All database connection attempts failed: {e}")
                raise
        except Exception as e:
            if db:
                try:
                    db.rollback()
                    db.close()
                except:
                    pass
            raise
        finally:
            if db:
                try:
                    db.close()
                except:
                    pass

def optimize_session_for_user_operations(db: Session):
    """Optimize database session for user-related operations"""
    try:
        # Set session-specific optimizations for user operations
        db.execute(text("SET work_mem = '64MB'"))
        db.execute(text("SET enable_hashjoin = on"))
        db.execute(text("SET enable_mergejoin = on"))
        db.execute(text("SET random_page_cost = 1.1"))

        # Windows-specific optimizations
        db.execute(text("SET effective_io_concurrency = 2"))

    except Exception as e:
        logger.warning(f"Failed to optimize session: {e}")

def check_and_fix_connection_issues():
    """Check and attempt to fix common connection issues"""
    try:
        with engine.connect() as conn:
            # Kill idle transactions that might be causing locks
            result = conn.execute(text("""
                SELECT pg_terminate_backend(pid)
                FROM pg_stat_activity
                WHERE datname = current_database()
                AND state = 'idle in transaction'
                AND now() - state_change > interval '5 minutes'
            """))

            terminated_count = len(result.fetchall())
            if terminated_count > 0:
                logger.info(f"Terminated {terminated_count} idle transactions")

            # Check for and report deadlocks
            deadlocks = conn.execute(text("""
                SELECT count(*)
                FROM pg_stat_database_conflicts
                WHERE datname = current_database()
                AND confl_deadlock > 0
            """)).scalar()

            if deadlocks > 0:
                logger.warning(f"Deadlocks detected: {deadlocks}")

            return True

    except Exception as e:
        logger.error(f"Failed to check/fix connection issues: {e}")
        return False

def get_connection_diagnostics() -> Dict[str, Any]:
    """Get detailed connection diagnostics for troubleshooting"""
    try:
        with engine.connect() as conn:
            # PostgreSQL version and settings
            pg_version = conn.execute(text("SELECT version()")).scalar()

            # Connection settings
            settings = {}
            for setting in ['max_connections', 'shared_buffers', 'work_mem', 'maintenance_work_mem']:
                value = conn.execute(text(f"SHOW {setting}")).scalar()
                settings[setting] = value

            # Current database statistics
            db_stats = conn.execute(text("""
                SELECT
                    numbackends,
                    xact_commit,
                    xact_rollback,
                    blks_read,
                    blks_hit,
                    tup_returned,
                    tup_fetched,
                    tup_inserted,
                    tup_updated,
                    tup_deleted,
                    conflicts,
                    deadlocks
                FROM pg_stat_database
                WHERE datname = current_database()
            """)).fetchone()

            return {
                "postgresql_version": pg_version,
                "settings": settings,
                "database_stats": dict(db_stats._mapping) if db_stats else {},
                "engine_url": str(engine.url).replace(engine.url.password, '***') if engine.url.password else str(engine.url),
                "pool_status": {
                    "size": engine.pool.size(),
                    "checked_in": engine.pool.checkedin(),
                    "checked_out": engine.pool.checkedout(),
                    "overflow": engine.pool.overflow(),
                    "invalid": engine.pool.invalid()
                }
            }

    except Exception as e:
        logger.error(f"Failed to get connection diagnostics: {e}")
        return {"error": str(e)}

# Global health monitor instance
health_monitor = DatabaseHealthMonitor()

def start_db_monitoring():
    """Start database health monitoring"""
    health_monitor.start_monitoring()

def stop_db_monitoring():
    """Stop database health monitoring"""
    health_monitor.stop_monitoring()