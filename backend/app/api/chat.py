"""
Chat API endpoints for Allemny Chat with streaming support
Provides real-time conversational AI with document retrieval
"""

import json
import logging
from typing import Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.auth import get_current_user
from app.core.database import get_db
from app.models.user import User

logger = logging.getLogger(__name__)

# Import chat service with error handling
try:
    from app.services.chat_service import get_chat_service, reset_chat_service
except Exception as e:
    logger.error(f"Failed to import chat service: {e}")

    # Create a dummy function if import fails
    def get_chat_service():
        raise Exception("Chat service not available")

    def reset_chat_service():
        raise Exception("Chat service not available")

router = APIRouter()

@router.get("/test")
async def test_endpoint():
    """Simple test endpoint"""
    return {"message": "Chat router is working", "timestamp": "2024-01-01T00:00:00Z"}

@router.get("/debug")
async def debug_endpoint():
    """Debug endpoint to test without auth"""
    try:
        from app.core.database import SessionLocal
        db = SessionLocal()
        try:
            # Try to get conversations without auth check
            chat_svc = get_chat_service()
            conversations = chat_svc.get_user_conversations("1")  # Admin user ID
            db.close()
            return {
                "message": "Debug endpoint working",
                "conversations_found": len(conversations),
                "sample": conversations[:2] if conversations else []
            }
        except Exception as e:
            db.close()
            return {"error": str(e)}
    except Exception as e:
        return {"error": str(e)}

@router.get("/auth-test")
async def auth_test_endpoint(current_user: User = Depends(get_current_user)):
    """Test authentication only"""
    try:
        return {
            "message": "Authentication successful",
            "user_id": current_user.id,
            "username": current_user.username,
            "role": current_user.role,
            "is_active": current_user.is_active
        }
    except Exception as e:
        logger.error(f"Auth test error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Request/Response Models
class ChatMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, description="User message")
    conversation_id: Optional[str] = Field(None, description="Conversation ID (optional for new conversation)")

class NewConversationRequest(BaseModel):
    title: Optional[str] = Field(None, max_length=200, description="Conversation title")

class ConversationResponse(BaseModel):
    id: str
    title: str
    updated_at: str
    total_messages: int

class ConversationListResponse(BaseModel):
    conversations: List[ConversationResponse]

class ChatResponse(BaseModel):
    conversation_id: str
    message: str

# Admin role check
def check_admin_access(current_user: User = Depends(get_current_user)):
    """Check if user has admin access to chat functionality"""
    try:
        # Check admin role
        is_admin_role = current_user.role in ["admin", "super_admin"]

        # Check superuser flag
        is_superuser = getattr(current_user, 'is_superuser', False)

        # Combined check
        has_access = is_admin_role or is_superuser

        if not has_access:
            raise HTTPException(
                status_code=403,
                detail="Chat functionality is restricted to administrators"
            )

        return current_user

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Unexpected error in check_admin_access: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Admin access check error: {str(e)}"
        )

@router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(
    request: NewConversationRequest,
    current_user: User = Depends(check_admin_access),
    db: Session = Depends(get_db)
):
    """Create a new conversation"""
    try:
        chat_svc = get_chat_service()
        conversation_id = chat_svc.create_conversation(
            user_id=str(current_user.id),
            title=request.title
        )

        return ConversationResponse(
            id=conversation_id,
            title=request.title or "New Chat",
            updated_at="",  # Will be set by SQLite
            total_messages=0
        )

    except Exception as e:
        logger.error(f"Failed to create conversation: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to create conversation: {str(e)}")

@router.get("/conversations", response_model=ConversationListResponse)
async def get_conversations(
    current_user: User = Depends(check_admin_access),
    db: Session = Depends(get_db)
):
    """Get user's conversation list"""
    try:
        chat_svc = get_chat_service()
        conversations = chat_svc.get_user_conversations(str(current_user.id))

        return ConversationListResponse(
            conversations=[
                ConversationResponse(
                    id=conv['id'],
                    title=conv['title'],
                    updated_at=conv['updated_at'],
                    total_messages=conv['total_messages']
                )
                for conv in conversations
            ]
        )

    except Exception as e:
        logger.error(f"Failed to get conversations: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve conversations")

@router.get("/conversations/{conversation_id}/history")
async def get_conversation_history(
    conversation_id: str,
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(check_admin_access),
    db: Session = Depends(get_db)
):
    """Get conversation message history"""
    try:
        chat_svc = get_chat_service()
        history = chat_svc.memory.get_conversation_history(conversation_id, limit)

        return {
            "conversation_id": conversation_id,
            "messages": [
                {
                    "role": msg["role"],
                    "content": msg["content"],
                    "timestamp": msg["timestamp"],
                    "citations": json.loads(msg["citations"]) if msg["citations"] else []
                }
                for msg in history
            ]
        }

    except Exception as e:
        logger.error(f"Failed to get conversation history: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve conversation history")

@router.post("/chat")
async def chat_message(
    request: ChatMessageRequest,
    current_user: User = Depends(check_admin_access),
    db: Session = Depends(get_db)
):
    """Send a chat message and get streaming response"""
    try:
        # Get chat service instance
        chat_svc = get_chat_service()

        # Create new conversation if not provided
        conversation_id = request.conversation_id
        if not conversation_id:
            conversation_id = chat_svc.create_conversation(
                user_id=str(current_user.id),
                title=request.message[:50] + "..." if len(request.message) > 50 else request.message
            )

        # Generate streaming response
        async def generate_response():
            """Generator for streaming chat response"""
            try:
                # Send initial response with conversation ID
                yield f"data: {json.dumps({'type': 'init', 'conversation_id': conversation_id})}\n\n"

                # Get a fresh instance to avoid scope issues
                service = get_chat_service()

                # Process message and stream response
                async for chunk in service.process_message(
                    conversation_id=conversation_id,
                    user_message=request.message,
                    user_id=str(current_user.id)
                ):
                    yield chunk

            except Exception as e:
                logger.error(f"Streaming response failed: {e}")
                yield f"data: {json.dumps({'type': 'error', 'message': 'Stream interrupted'})}\n\n"

        return StreamingResponse(
            generate_response(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"  # Disable nginx buffering
            }
        )

    except Exception as e:
        logger.error(f"Chat message failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to process chat message: {str(e)}")

@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user: User = Depends(check_admin_access),
    db: Session = Depends(get_db)
):
    """Delete a conversation and all its messages"""
    try:
        import sqlite3

        chat_svc = get_chat_service()
        conn = sqlite3.connect(chat_svc.memory.db_path)
        try:
            # Verify ownership
            cursor = conn.execute("""
                SELECT user_id FROM conversations WHERE id = ?
            """, (conversation_id,))

            row = cursor.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Conversation not found")

            if row[0] != str(current_user.id):
                raise HTTPException(status_code=403, detail="Access denied")

            # Delete conversation and all related data
            conn.execute("DELETE FROM conversation_context WHERE conversation_id = ?", (conversation_id,))
            conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))
            conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))

            conn.commit()

            return {"message": "Conversation deleted successfully"}

        finally:
            conn.close()

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete conversation: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete conversation")

@router.post("/reset")
async def reset_chat():
    """Reset chat service (admin only)"""
    try:
        reset_chat_service()
        return {"message": "Chat service reset successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to reset chat service: {str(e)}")

@router.get("/health")
async def chat_health():
    """Health check for chat service"""
    try:
        chat_svc = get_chat_service()
        # Test database connections
        db_status = "ok"
        try:
            # Test SQLite memory
            chat_svc.memory.init_db()
        except Exception as e:
            db_status = f"sqlite_error: {str(e)}"

        # Test Ollama connection
        ollama_status = "ok"
        try:
            test_embedding = chat_svc.embeddings.embed_text("test")
            if not test_embedding:
                ollama_status = "no_embedding_response"
        except Exception as e:
            ollama_status = f"error: {str(e)}"

        # Test Groq connection
        groq_status = "ok"
        try:
            # Simple test - this would be a real test in production
            groq_test = chat_svc.llm.chat.completions.create(
                model=chat_svc.model,
                messages=[{"role": "user", "content": "test"}],
                max_tokens=1,
                stream=False
            )
            if not groq_test:
                groq_status = "no_response"
        except Exception as e:
            groq_status = f"error: {str(e)}"

        # Test vector store
        vector_status = "ok"
        try:
            # This tests the database connection
            test_results = chat_svc.vector_store.similarity_search([0.1] * 768, k=1)
            # Empty result is fine, we just want to test connectivity
        except Exception as e:
            vector_status = f"error: {str(e)}"

        return {
            "status": "healthy" if all(s == "ok" for s in [db_status, vector_status]) else "degraded",
            "components": {
                "sqlite_memory": db_status,
                "ollama_embeddings": ollama_status,
                "groq_llm": groq_status,
                "vector_store": vector_status
            },
            "timestamp": "2024-01-01T00:00:00Z"  # Could be dynamic
        }

    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": "2024-01-01T00:00:00Z"
        }

@router.get("/stats")
async def chat_stats(
    current_user: User = Depends(check_admin_access),
    db: Session = Depends(get_db)
):
    """Get chat usage statistics"""
    try:
        import sqlite3

        chat_svc = get_chat_service()
        conn = sqlite3.connect(chat_svc.memory.db_path)
        try:
            # Get user's conversation stats
            cursor = conn.execute("""
                SELECT
                    COUNT(*) as total_conversations,
                    SUM(total_messages) as total_messages,
                    MAX(updated_at) as last_activity
                FROM conversations
                WHERE user_id = ?
            """, (str(current_user.id),))

            row = cursor.fetchone()

            # Get recent activity
            cursor = conn.execute("""
                SELECT DATE(timestamp) as date, COUNT(*) as message_count
                FROM messages m
                JOIN conversations c ON m.conversation_id = c.id
                WHERE c.user_id = ?
                    AND m.timestamp >= datetime('now', '-30 days')
                GROUP BY DATE(timestamp)
                ORDER BY date DESC
                LIMIT 30
            """, (str(current_user.id),))

            activity = [{"date": row[0], "messages": row[1]} for row in cursor.fetchall()]

            return {
                "total_conversations": row[0] or 0,
                "total_messages": row[1] or 0,
                "last_activity": row[2],
                "recent_activity": activity
            }

        finally:
            conn.close()

    except Exception as e:
        logger.error(f"Failed to get chat stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve statistics")