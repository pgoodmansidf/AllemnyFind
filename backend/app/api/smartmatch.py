# app/api/smartmatch.py
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Dict, Any, List, Optional
import json
import asyncio
from datetime import datetime
import logging
from jose import jwt, JWTError

from app.core.database import get_db
from app.api.deps import get_current_user
from app.models.user import User
from app.services.smartmatch_service import SmartMatchService
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter()

# Store service instances globally to persist tasks
_service_instances = {}

def get_smartmatch_service(db: Session) -> SmartMatchService:
    """Get or create SmartMatch service singleton"""
    service_id = "smartmatch_service"
    if service_id not in _service_instances:
        _service_instances[service_id] = SmartMatchService(settings.groq_api_key, db)
    return _service_instances[service_id]

@router.post("/analyze")
async def analyze_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Analyze uploaded document and find similar documents"""
    try:
        # Read file content
        contents = await file.read()
        file_size = len(contents)
        
        # Validate file size
        if file_size > settings.max_file_size:
            raise HTTPException(status_code=400, detail="File too large (max 50MB)")
        
        # Get service instance
        service = get_smartmatch_service(db)
        
        # Start analysis
        task_id = await service.start_analysis(file, current_user.id, contents)
        
        logger.info(f"Started analysis task {task_id} for user {current_user.id}")
        
        return {
            "task_id": task_id,
            "message": "Analysis started",
            "status": "processing"
        }
        
    except Exception as e:
        logger.error(f"Error analyzing document: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analyze-stream")
async def analyze_stream(
    request: Request,
    task_id: str = Query(...),
    token: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Stream analysis progress and results"""
    
    # Get user from token or headers
    user_id = None
    
    # Try token from query parameter first (for EventSource)
    if token:
        try:
            payload = jwt.decode(
                token, 
                settings.secret_key, 
                algorithms=[settings.algorithm]
            )
            user_id = payload.get("sub")
            logger.info(f"User {user_id} authenticated via token for task {task_id}")
        except JWTError as e:
            logger.error(f"Token validation error: {e}")
    
    # Try Authorization header as fallback
    if not user_id:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split(" ")[1]
            try:
                payload = jwt.decode(
                    token, 
                    settings.secret_key, 
                    algorithms=[settings.algorithm]
                )
                user_id = payload.get("sub")
                logger.info(f"User {user_id} authenticated via header for task {task_id}")
            except JWTError as e:
                logger.error(f"Header token validation error: {e}")
    
    if not user_id:
        logger.error(f"No valid authentication for task {task_id}")
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    # Convert user_id to int
    try:
        user_id = int(user_id)
    except (ValueError, TypeError):
        logger.error(f"Invalid user_id: {user_id}")
        raise HTTPException(status_code=401, detail="Invalid user ID")
    
    async def event_generator():
        service = get_smartmatch_service(db)
        
        try:
            logger.info(f"Starting stream for task {task_id}, user {user_id}")
            async for event in service.analyze_document_stream(task_id, user_id):
                yield f"data: {json.dumps(event)}\n\n"
                
        except Exception as e:
            logger.error(f"Error in stream for task {task_id}: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Credentials": "true"
        }
    )

@router.get("/analysis/{task_id}")
async def get_analysis_result(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get analysis result by task ID"""
    service = get_smartmatch_service(db)
    
    logger.info(f"Getting analysis result for task {task_id}, user {current_user.id}")
    
    result = await service.get_analysis_result(task_id, current_user.id)
    
    if not result:
        logger.error(f"Analysis not found for task {task_id}")
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    if result.get("status") != "completed":
        return {
            "status": result.get("status", "processing"),
            "message": "Analysis in progress"
        }
    
    return result

@router.get("/history")
async def get_analysis_history(
    limit: int = 10,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's SmartMatch analysis history"""
    service = get_smartmatch_service(db)
    history = await service.get_user_history(current_user.id, limit, offset)
    return history