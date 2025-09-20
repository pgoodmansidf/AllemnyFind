# app/main.py - UPDATED VERSION
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn
# from sse_starlette.sse import EventSourceResponse

from app.core.config import settings
from app.core.database import init_db, check_db_connection, Base, engine
from app.core.migrations import run_migrations

# Import all models first to ensure proper SQLAlchemy registration
import app.models

from app.api import auth, ingestion, websocket, search, stars, summarization, smartmatch, machinery, admin, metrics, leaderboard, innovate
from app.api import chat
from app.api.endpoints import knowledgescope

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan events"""
    # Startup
    logger.info("Starting Allemny Find application...")
    
    try:
        # Initialize database
        init_db()
        
        # Create tables
        Base.metadata.create_all(bind=engine)
        
        # Run migrations
        run_migrations()
        
        # Check database connection
        if not check_db_connection():
            raise Exception("Database connection failed")
            
        logger.info("Database initialized successfully")
        
        # Create default admin user if none exists
        try:
            from app.core.admin_setup import ensure_admin_exists, verify_admin_login

            # Ensure admin user exists
            admin_created = ensure_admin_exists()
            if admin_created:
                # Verify admin can login
                login_verified = verify_admin_login()
                if login_verified:
                    logger.info("✅ Admin authentication system verified successfully")
                else:
                    logger.warning("⚠️ Admin user exists but login verification failed")
            else:
                logger.error("❌ Failed to create or verify admin user")

        except Exception as e:
            logger.error(f"Error setting up admin user: {e}")
            # Continue startup even if admin creation fails
            
        logger.info("✅ POWERED UP! Application startup completed successfully")
        
    except Exception as e:
        logger.error(f"Application startup failed: {e}")
        raise
        
    yield
    
    # Shutdown
    logger.info("Shutting down Allemny Find application...")

# Create FastAPI app
app = FastAPI(
    title=settings.project_name,
    description="Advanced Knowledge Hub with Agentic Search",
    version="2.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],  # Important for SSE
)

# Exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.error(f"Global exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    db_status = check_db_connection()
    return {
        "status": "healthy" if db_status else "unhealthy",
        "database": "connected" if db_status else "disconnected",
        "version": "2.0.0"
    }

# API routes
app.include_router(auth.router, prefix=f"{settings.api_v1_str}/auth", tags=["authentication"])
app.include_router(admin.router, prefix=f"{settings.api_v1_str}/admin", tags=["admin"])
app.include_router(ingestion.router, prefix=f"{settings.api_v1_str}/ingestion", tags=["ingestion"])
app.include_router(search.router, prefix=f"{settings.api_v1_str}/search", tags=["search"])
app.include_router(websocket.router, prefix="/ws", tags=["websocket"])
app.include_router(stars.router, prefix=f"{settings.api_v1_str}/stars", tags=["stars"])
app.include_router(summarization.router, prefix=f"{settings.api_v1_str}/summarization", tags=["summarization"])
app.include_router(smartmatch.router, prefix=f"{settings.api_v1_str}/smartmatch", tags=["smartmatch"])
app.include_router(machinery.router, prefix=f"{settings.api_v1_str}/machinery", tags=["machinery"])
app.include_router(metrics.router, prefix=f"{settings.api_v1_str}/metrics", tags=["metrics"])
app.include_router(knowledgescope.router, prefix=f"{settings.api_v1_str}/knowledgescope", tags=["knowledgescope"])
app.include_router(leaderboard.router, prefix=f"{settings.api_v1_str}/leaderboard", tags=["leaderboard"])
app.include_router(innovate.router, prefix=f"{settings.api_v1_str}/innovate", tags=["innovate"])
app.include_router(chat.router, prefix=f"{settings.api_v1_str}/chat", tags=["chat"])

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "Welcome to Allemny Find - Advanced Knowledge Hub with Agentic Search",
        "version": "2.0.0",
        "documentation": "/docs"
    }

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )