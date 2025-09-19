import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from uuid import UUID
import json

from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect, Body
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_
from pydantic import BaseModel

from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.search import SearchQuery, SearchSession
from app.services.langchain_search import get_search_service
from app.services.websocket_manager import manager
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Pydantic models
class SearchRequest(BaseModel):
    query: str
    include_online: bool = False
    session_id: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None
    selected_product: Optional[str] = None  # Add this field

class CommentRequest(BaseModel):
    text: str

class Comment(BaseModel):
    id: str
    text: str
    timestamp: str
    userId: Optional[str] = None

class SearchResponse(BaseModel):
    id: str
    query: str
    response: str
    citations_count: int
    processing_time: int
    include_online: bool
    success: bool
    timestamp: datetime
    comments: List[Comment] = []
    metadata: Optional[Dict[str, Any]] = None  # Add metadata field

class SearchHistoryResponse(BaseModel):
    searches: List[SearchResponse]
    total_count: int
    session_info: Optional[Dict[str, Any]] = None

# WebSocket endpoint for search
@router.websocket("/ws/search/{user_id}")
async def websocket_search(websocket: WebSocket, user_id: int):
    """WebSocket endpoint for search streaming"""
    await manager.connect(websocket, "search")
    try:
        while True:
            # Keep connection alive
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, "search")

# SSE endpoint for search streaming - UPDATED
@router.post("/search/stream")
async def stream_search(
    query: str = Body(...),
    include_online: bool = Body(False),
    filters: Optional[Dict] = Body(None),
    selected_product: Optional[str] = Body(None),  # Add this parameter
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Stream search results using SSE with LangChain"""
    start_time = datetime.utcnow()
    
    # Get the appropriate API key
    groq_api_key = settings.groq_api_key
    if not groq_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GROQ API key not configured"
        )
    
    search_service = get_search_service(groq_api_key)
    
    async def event_generator():
        try:
            # Create search query record
            search_query = SearchQuery(
                user_id=current_user.id,
                query_text=query,
                include_online=include_online,
                search_type="langchain",
                search_metadata={
                    "filters": filters,
                    "selected_product": selected_product  # Store selected product
                }
            )
            db.add(search_query)
            db.commit()
            
            # Stream search results
            full_response = ""
            citations = []
            
            # Pass selected_product to the search service
            async for chunk in search_service.search_stream(
                query=query,
                k=20,  # Increased from 5 to get more results
                filters=filters,
                selected_product=selected_product  # Pass selected product
            ):
                # Forward the chunk as SSE
                yield f"data: {json.dumps(chunk)}\n\n"
                
                # Accumulate response
                if chunk['type'] == 'content_chunk':
                    full_response += chunk.get('content', '')
                elif chunk['type'] == 'search_complete':
                    citations = chunk.get('citations', [])
            
            # Update search query with results
            processing_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
            search_query.response_content = full_response
            search_query.processing_time = processing_time
            search_query.citations_count = len(citations)
            search_query.success = True
            search_query.completed_at = datetime.utcnow()
            db.commit()
            
        except Exception as e:
            logger.error(f"Error in search stream: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e), 'timestamp': datetime.utcnow().isoformat()})}\n\n"
            
            # Update search query with error
            if 'search_query' in locals():
                search_query.success = False
                search_query.error_message = str(e)
                db.commit()
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

# Regular search endpoint - UPDATED
@router.post("/", response_model=SearchResponse)
async def perform_search(
    request: SearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Perform synchronous search"""
    start_time = datetime.utcnow()
    
    # Get the appropriate API key
    groq_api_key = settings.groq_api_key
    if not groq_api_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GROQ API key not configured"
        )
    
    search_service = get_search_service(groq_api_key)
    
    try:
        # Create search query record
        search_query = SearchQuery(
            user_id=current_user.id,
            query_text=request.query,
            include_online=request.include_online,
            search_type="langchain",
            search_metadata={
                "filters": request.filters,
                "selected_product": request.selected_product  # Store selected product
            }
        )
        db.add(search_query)
        db.commit()
        
        # Perform search
        full_response = ""
        citations_count = 0
        metadata = {}
        
        # Pass selected_product to the search service
        async for chunk in search_service.search_stream(
            query=request.query,
            k=20,
            filters=request.filters,
            selected_product=request.selected_product  # Pass selected product
        ):
            if chunk['type'] == 'content_chunk':
                full_response += chunk.get('content', '')
            elif chunk['type'] == 'search_complete':
                citations = chunk.get('citations', [])
                citations_count = len(citations)
                metadata = chunk.get('metadata', {})
        
        # Update search query
        processing_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        search_query.response_content = full_response
        search_query.processing_time = processing_time
        search_query.citations_count = citations_count
        search_query.success = True
        search_query.completed_at = datetime.utcnow()
        db.commit()
        
        return SearchResponse(
            id=str(search_query.id),
            query=request.query,
            response=full_response,
            citations_count=citations_count,
            processing_time=processing_time,
            include_online=request.include_online,
            success=True,
            timestamp=search_query.created_at,
            metadata=metadata  # Include metadata
        )
        
    except Exception as e:
        logger.error(f"Error performing search: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

# Search history endpoints
@router.get("/history", response_model=SearchHistoryResponse)
async def get_search_history(
    limit: int = 20,
    offset: int = 0,
    session_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's search history with comments"""
    try:
        query = db.query(SearchQuery).filter(SearchQuery.user_id == current_user.id)
        
        if session_id:
            query = query.filter(SearchQuery.search_metadata.contains({"session_id": session_id}))
        
        total_count = query.count()
        searches = query.order_by(desc(SearchQuery.created_at)).offset(offset).limit(limit).all()
        
        search_responses = []
        for search_item in searches:
            # Parse comments from metadata
            comments = []
            if search_item.search_metadata and 'comments' in search_item.search_metadata:
                for comment_data in search_item.search_metadata['comments']:
                    comments.append(Comment(**comment_data))
            
            # Include all metadata
            metadata = search_item.search_metadata if search_item.search_metadata else {}
            
            search_responses.append(SearchResponse(
                id=str(search_item.id),
                query=search_item.query_text,
                response=search_item.response_content or "",
                citations_count=search_item.citations_count,
                processing_time=search_item.processing_time or 0,
                include_online=search_item.include_online,
                success=search_item.success,
                timestamp=search_item.created_at,
                comments=comments,
                metadata=metadata  # Include metadata
            ))
        
        return SearchHistoryResponse(
            searches=search_responses,
            total_count=total_count
        )
        
    except Exception as e:
        logger.error(f"Error fetching search history: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/history/{search_id}/comments", response_model=Comment)
async def add_comment(
    search_id: UUID,
    request: CommentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add comment to a search"""
    try:
        search_item = db.query(SearchQuery).filter(
            and_(SearchQuery.id == search_id, SearchQuery.user_id == current_user.id)
        ).first()
        
        if not search_item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Search not found"
            )
        
        # Create comment
        import uuid
        comment = Comment(
            id=str(uuid.uuid4()),
            text=request.text,
            timestamp=datetime.utcnow().isoformat(),
            userId=str(current_user.id)
        )
        
        # Update search metadata
        if not search_item.search_metadata:
            search_item.search_metadata = {}
        
        if 'comments' not in search_item.search_metadata:
            search_item.search_metadata['comments'] = []
        
        search_item.search_metadata['comments'].append(comment.dict())
        
        # Mark metadata as modified for SQLAlchemy
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(search_item, "search_metadata")
        
        db.commit()
        
        return comment
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding comment: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/history/{search_id}/comments", response_model=List[Comment])
async def get_comments(
    search_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get comments for a search"""
    try:
        search_item = db.query(SearchQuery).filter(
            and_(SearchQuery.id == search_id, SearchQuery.user_id == current_user.id)
        ).first()
        
        if not search_item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Search not found"
            )
        
        comments = []
        if search_item.search_metadata and 'comments' in search_item.search_metadata:
            for comment_data in search_item.search_metadata['comments']:
                comments.append(Comment(**comment_data))
        
        return comments
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching comments: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.delete("/history/{search_id}/comments/{comment_id}")
async def delete_comment(
    search_id: UUID,
    comment_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a comment from a search"""
    try:
        search_item = db.query(SearchQuery).filter(
            and_(SearchQuery.id == search_id, SearchQuery.user_id == current_user.id)
        ).first()
        
        if not search_item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Search not found"
            )
        
        if search_item.search_metadata and 'comments' in search_item.search_metadata:
            search_item.search_metadata['comments'] = [
                c for c in search_item.search_metadata['comments'] 
                if c.get('id') != comment_id
            ]
            
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(search_item, "search_metadata")
            db.commit()
        
        return {"message": "Comment deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting comment: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.delete("/history/{search_id}")
async def delete_search(
    search_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a specific search from history"""
    try:
        search_item = db.query(SearchQuery).filter(
            and_(SearchQuery.id == search_id, SearchQuery.user_id == current_user.id)
        ).first()
        
        if not search_item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Search not found"
            )
        
        db.delete(search_item)
        db.commit()
        
        return {"message": "Search deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting search: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/agent-status")
async def get_agent_status(current_user: User = Depends(get_current_user)):
    """Get the status of the search service"""
    try:
        groq_api_key = settings.groq_api_key
        search_service = get_search_service(groq_api_key)
        
        return {
            "search_agent": "active",
            "knowledge_base": "configured",
            "vector_db": "PGVector",
            "embedding_model": "ollama/nomic-embed-text:latest",
            "llm_model": f"groq/{settings.groq_model}",
            "protocol": "LangChain",
            "transport": "SSE",
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        return {
            "search_agent": "error",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }

@router.post("/test-connection")
async def test_connection(current_user: User = Depends(get_current_user)):
    """Test the search service connection"""
    try:
        groq_api_key = settings.groq_api_key
        search_service = get_search_service(groq_api_key)
        
        # Test embeddings
        test_embedding = search_service.embeddings.embed_query("test")
        embeddings_ok = len(test_embedding) > 0
        
        # Test LLM
        llm_ok = search_service.llm is not None
        
        return {
            "agentic_service": "connected" if embeddings_ok and llm_ok else "disconnected",
            "agent_status": {
                "search_agent": "active" if llm_ok else "inactive",
                "knowledge_base": "configured",
                "vector_db": "PGVector",
                "embedding_model": "ollama/nomic-embed-text:latest",
                "llm_model": f"groq/{settings.groq_model}",
                "protocol": "LangChain",
                "transport": "SSE",
                "timestamp": datetime.utcnow().isoformat()
            }
        }
    except Exception as e:
        return {
            "agentic_service": "error",
            "agent_status": {
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat()
            }
        }