import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from uuid import UUID
import json

from fastapi import APIRouter, Depends, HTTPException, status, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.services.summarization_service import get_summarization_service
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


# Pydantic models
class SummarizationRequest(BaseModel):
    document_ids: List[str]
    summary_type: str = "general"  # "general", "executive", "research_brief"
    topic: Optional[str] = None

class SummaryResponse(BaseModel):
    id: str
    title: str
    summary_type: str
    document_count: int
    word_count: int
    is_starred: bool
    created_at: str
    processing_time: float
    topics: List[str]
    tags: List[str]

class DetailedSummaryResponse(BaseModel):
    id: str
    title: str
    summary_type: str
    document_count: int
    executive_summary: Optional[str]
    key_findings: Optional[List[str]]
    trends: Optional[List[Dict]]
    statistics: Optional[List[Dict]]
    conclusions: Optional[str]
    recommendations: Optional[List[str]]
    full_summary: str
    citations: Optional[List[Dict]]
    source_documents: Optional[List[Dict]]
    word_count: int
    is_starred: bool
    created_at: str
    processing_time: float
    topics: Optional[List[str]]
    tags: Optional[List[str]]


# SSE endpoint for streaming summarization
@router.post("/create/stream")
async def stream_summarization(
    document_ids: List[str] = Body(...),
    summary_type: str = Body("general"),
    topic: Optional[str] = Body(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Stream document summarization using SSE"""
    
    # Validate document IDs
    if not document_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one document ID is required"
        )
    
    if len(document_ids) > 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Maximum 20 documents can be summarized at once"
        )
    
    # Validate summary type
    valid_types = ["general", "executive", "research_brief"]
    if summary_type not in valid_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid summary type. Must be one of: {', '.join(valid_types)}"
        )
    
    # Get summarization service
    groq_api_key = settings.groq_api_key
    if not groq_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GROQ API key not configured"
        )
    
    summarization_service = get_summarization_service(groq_api_key)
    
    async def event_generator():
        try:
            async for chunk in summarization_service.create_summary_stream(
                user_id=current_user.id,
                document_ids=document_ids,
                summary_type=summary_type,
                topic=topic
            ):
                yield f"data: {json.dumps(chunk)}\n\n"
        
        except Exception as e:
            logger.error(f"Error in summarization stream: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e), 'timestamp': datetime.now().isoformat()})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


# Get summary history
@router.get("/history", response_model=List[SummaryResponse])
async def get_summary_history(
    limit: int = 20,
    offset: int = 0,
    summary_type: Optional[str] = None,
    starred_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's summary history"""
    groq_api_key = settings.groq_api_key
    summarization_service = get_summarization_service(groq_api_key)
    
    summaries = await summarization_service.get_summary_history(
        user_id=current_user.id,
        limit=limit,
        offset=offset,
        summary_type=summary_type,
        starred_only=starred_only
    )
    
    return summaries


# Get specific summary
@router.get("/{summary_id}", response_model=DetailedSummaryResponse)
async def get_summary(
    summary_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific summary by ID"""
    groq_api_key = settings.groq_api_key
    summarization_service = get_summarization_service(groq_api_key)
    
    summary = await summarization_service.get_summary_by_id(
        summary_id=str(summary_id),
        user_id=current_user.id
    )
    
    if not summary:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Summary not found"
        )
    
    return summary


# Toggle star status
@router.post("/{summary_id}/star")
async def toggle_star(
    summary_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Toggle star status for a summary"""
    groq_api_key = settings.groq_api_key
    summarization_service = get_summarization_service(groq_api_key)
    
    is_starred = await summarization_service.toggle_star(
        summary_id=str(summary_id),
        user_id=current_user.id
    )
    
    return {"is_starred": is_starred}


# Delete summary
@router.delete("/{summary_id}")
async def delete_summary(
    summary_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a summary"""
    groq_api_key = settings.groq_api_key
    summarization_service = get_summarization_service(groq_api_key)
    
    success = await summarization_service.delete_summary(
        summary_id=str(summary_id),
        user_id=current_user.id
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Summary not found or unable to delete"
        )
    
    return {"message": "Summary deleted successfully"}


# Get available documents for summarization
@router.get("/documents/available")
async def get_available_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of documents available for summarization"""
    try:
        from sqlalchemy import text
        
        query = text("""
            SELECT 
                d.id,
                d.filename,
                d.title,
                d.file_size,
                d.main_tag,
                d.product_tags,
                d.creation_date,
                d.modification_date,
                COUNT(dc.id) as chunk_count
            FROM documents d
            LEFT JOIN document_chunks dc ON d.id = dc.document_id
            WHERE d.processing_status = 'completed'
            GROUP BY d.id
            ORDER BY d.created_at DESC
            LIMIT 100
        """)
        
        result = db.execute(query)
        
        documents = []
        for row in result:
            documents.append({
                'id': str(row.id),
                'filename': row.filename,
                'title': row.title or row.filename,
                'file_size': row.file_size,
                'main_tag': row.main_tag,
                'product_tags': row.product_tags or [],
                'creation_date': row.creation_date.isoformat() if row.creation_date else None,
                'modification_date': row.modification_date.isoformat() if row.modification_date else None,
                'chunk_count': row.chunk_count
            })
        
        return documents
    
    except Exception as e:
        logger.error(f"Error fetching available documents: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch available documents"
        )