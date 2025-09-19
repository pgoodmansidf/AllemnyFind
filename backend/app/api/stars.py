# app/api/stars.py
import logging
from datetime import datetime, timedelta, timezone # Import timezone
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, desc
from pydantic import BaseModel

from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.stars import DocumentStar, SearchStar, DocumentContribution, ContributionLike
from app.models.document import Document
from app.models.search import SearchQuery

logger = logging.getLogger(__name__)

router = APIRouter()

# Pydantic models
class StarDocumentRequest(BaseModel):
    document_id: str
    search_query: Optional[str] = None

class StarSearchRequest(BaseModel):
    search_id: str

class ContributionRequest(BaseModel):
    document_id: str
    content: str

class ContributionUpdateRequest(BaseModel):
    content: str

class StarredDocumentResponse(BaseModel):
    id: str
    document_id: str
    filename: str
    title: Optional[str]
    starred_at: datetime
    search_query: Optional[str]
    file_type: str
    summary: Optional[str]

class ContributionResponse(BaseModel):
    id: str
    user_id: int
    username: str
    content: str
    created_at: datetime
    updated_at: Optional[datetime]
    is_edited: bool
    like_count: int
    user_liked: bool
    can_edit: bool
    can_delete: bool

# Document Stars Endpoints
@router.post("/documents/star")
async def star_document(
    request: StarDocumentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Star a document"""
    try:
        # Check if document exists
        document = db.query(Document).filter(Document.id == UUID(request.document_id)).first()
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Check if already starred
        existing = db.query(DocumentStar).filter(
            and_(
                DocumentStar.user_id == current_user.id,
                DocumentStar.document_id == UUID(request.document_id)
            )
        ).first()
        
        if existing:
            raise HTTPException(status_code=400, detail="Document already starred")
        
        # Create star
        star = DocumentStar(
            user_id=current_user.id,
            document_id=UUID(request.document_id),
            search_query=request.search_query
        )
        db.add(star)
        db.commit()
        
        return {"message": "Document starred successfully", "star_id": str(star.id)}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starring document: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/documents/star/{document_id}")
async def unstar_document(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unstar a document"""
    try:
        star = db.query(DocumentStar).filter(
            and_(
                DocumentStar.user_id == current_user.id,
                DocumentStar.document_id == UUID(document_id)
            )
        ).first()
        
        if not star:
            raise HTTPException(status_code=404, detail="Star not found")
        
        db.delete(star)
        db.commit()
        
        return {"message": "Document unstarred successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unstarring document: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/documents/starred", response_model=List[StarredDocumentResponse])
async def get_starred_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get user's starred documents"""
    try:
        stars = db.query(DocumentStar).filter(
            DocumentStar.user_id == current_user.id
        ).options(
            joinedload(DocumentStar.document)
        ).order_by(desc(DocumentStar.starred_at)).all()
        
        response = []
        for star in stars:
            if star.document:
                response.append(StarredDocumentResponse(
                    id=str(star.id),
                    document_id=str(star.document_id),
                    filename=star.document.filename,
                    title=star.document.title,
                    starred_at=star.starred_at,
                    search_query=star.search_query,
                    file_type=star.document.file_type,
                    summary=star.document.summary
                ))
        
        return response
        
    except Exception as e:
        logger.error(f"Error getting starred documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/documents/{document_id}/star-status")
async def get_document_star_status(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if a document is starred by the current user"""
    try:
        star = db.query(DocumentStar).filter(
            and_(
                DocumentStar.user_id == current_user.id,
                DocumentStar.document_id == UUID(document_id)
            )
        ).first()
        
        return {"is_starred": star is not None}
        
    except Exception as e:
        logger.error(f"Error checking star status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Search Stars Endpoints
@router.post("/searches/star")
async def star_search(
    request: StarSearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Star a search"""
    try:
        # Check if search exists
        search = db.query(SearchQuery).filter(SearchQuery.id == UUID(request.search_id)).first()
        if not search:
            raise HTTPException(status_code=404, detail="Search not found")
        
        # Check if already starred
        existing = db.query(SearchStar).filter(
            and_(
                SearchStar.user_id == current_user.id,
                SearchStar.search_id == UUID(request.search_id)
            )
        ).first()
        
        if existing:
            raise HTTPException(status_code=400, detail="Search already starred")
        
        # Create star
        star = SearchStar(
            user_id=current_user.id,
            search_id=UUID(request.search_id)
        )
        db.add(star)
        db.commit()
        
        return {"message": "Search starred successfully", "star_id": str(star.id)}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starring search: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/searches/star/{search_id}")
async def unstar_search(
    search_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unstar a search"""
    try:
        star = db.query(SearchStar).filter(
            and_(
                SearchStar.user_id == current_user.id,
                SearchStar.search_id == UUID(search_id)
            )
        ).first()
        
        if not star:
            raise HTTPException(status_code=404, detail="Star not found")
        
        db.delete(star)
        db.commit()
        
        return {"message": "Search unstarred successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unstarring search: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Document Contributions Endpoints
@router.post("/contributions", response_model=ContributionResponse)
async def create_contribution(
    request: ContributionRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a document contribution"""
    try:
        # Check if document exists
        document = db.query(Document).filter(Document.id == UUID(request.document_id)).first()
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Create contribution
        contribution = DocumentContribution(
            user_id=current_user.id,
            document_id=UUID(request.document_id),
            content=request.content
        )
        db.add(contribution)
        db.commit()
        db.refresh(contribution)
        
        return ContributionResponse(
            id=str(contribution.id),
            user_id=contribution.user_id,
            username=current_user.username,
            content=contribution.content,
            created_at=contribution.created_at,
            updated_at=contribution.updated_at,
            is_edited=contribution.is_edited,
            like_count=0,
            user_liked=False,
            can_edit=True,
            can_delete=True
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating contribution: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/documents/{document_id}/contributions", response_model=List[ContributionResponse])
async def get_document_contributions(
    document_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get contributions for a document"""
    try:
        contributions = db.query(DocumentContribution).filter(
            DocumentContribution.document_id == UUID(document_id)
        ).options(
            joinedload(DocumentContribution.user),
            joinedload(DocumentContribution.likes)
        ).order_by(desc(DocumentContribution.created_at)).all()
        
        # Fix: make current_time timezone-aware
        current_time = datetime.utcnow().replace(tzinfo=timezone.utc)
        response = []
        
        for contrib in contributions:
            # Check if current user liked this contribution
            user_liked = any(like.user_id == current_user.id for like in contrib.likes)
            
            # Check if user can edit/delete
            is_owner = contrib.user_id == current_user.id
            can_edit = is_owner and contrib.can_edit(current_time)
            can_delete = is_owner and contrib.can_edit(current_time)
            
            response.append(ContributionResponse(
                id=str(contrib.id),
                user_id=contrib.user_id,
                username=contrib.user.username,
                content=contrib.content,
                created_at=contrib.created_at,
                updated_at=contrib.updated_at,
                is_edited=contrib.is_edited,
                like_count=len(contrib.likes),
                user_liked=user_liked,
                can_edit=can_edit,
                can_delete=can_delete
            ))
        
        return response
        
    except Exception as e:
        logger.error(f"Error getting contributions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/contributions/{contribution_id}", response_model=ContributionResponse)
async def update_contribution(
    contribution_id: str,
    request: ContributionUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a contribution (within 30 minutes)"""
    try:
        contribution = db.query(DocumentContribution).filter(
            DocumentContribution.id == UUID(contribution_id)
        ).options(
            joinedload(DocumentContribution.user),
            joinedload(DocumentContribution.likes)
        ).first()
        
        if not contribution:
            raise HTTPException(status_code=404, detail="Contribution not found")
        
        # Check ownership
        if contribution.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to edit this contribution")
        
        # Check if within 30 minutes
        current_time = datetime.utcnow().replace(tzinfo=timezone.utc)
        if not contribution.can_edit(current_time):
            raise HTTPException(status_code=403, detail="Editing time has expired (30 minutes)")
        
        # Update contribution
        contribution.content = request.content
        contribution.is_edited = True
        contribution.updated_at = current_time
        db.commit()
        db.refresh(contribution)
        
        user_liked = any(like.user_id == current_user.id for like in contribution.likes)
        
        return ContributionResponse(
            id=str(contribution.id),
            user_id=contribution.user_id,
            username=contribution.user.username,
            content=contribution.content,
            created_at=contribution.created_at,
            updated_at=contribution.updated_at,
            is_edited=contribution.is_edited,
            like_count=len(contribution.likes),
            user_liked=user_liked,
            can_edit=contribution.can_edit(current_time),
            can_delete=contribution.can_edit(current_time)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating contribution: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/contributions/{contribution_id}")
async def delete_contribution(
    contribution_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a contribution (within 30 minutes)"""
    try:
        contribution = db.query(DocumentContribution).filter(
            DocumentContribution.id == UUID(contribution_id)
        ).first()
        
        if not contribution:
            raise HTTPException(status_code=404, detail="Contribution not found")
        
        # Check ownership
        if contribution.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to delete this contribution")
        
        # Check if within 30 minutes
        current_time = datetime.utcnow()
        if not contribution.can_edit(current_time):
            raise HTTPException(status_code=403, detail="Deletion time has expired (30 minutes)")
        
        db.delete(contribution)
        db.commit()
        
        return {"message": "Contribution deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting contribution: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/contributions/{contribution_id}/like")
async def like_contribution(
    contribution_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Like a contribution"""
    try:
        # Check if contribution exists
        contribution = db.query(DocumentContribution).filter(
            DocumentContribution.id == UUID(contribution_id)
        ).first()
        
        if not contribution:
            raise HTTPException(status_code=404, detail="Contribution not found")
        
        # Check if already liked
        existing = db.query(ContributionLike).filter(
            and_(
                ContributionLike.user_id == current_user.id,
                ContributionLike.contribution_id == UUID(contribution_id)
            )
        ).first()
        
        if existing:
            raise HTTPException(status_code=400, detail="Already liked")
        
        # Create like
        like = ContributionLike(
            user_id=current_user.id,
            contribution_id=UUID(contribution_id)
        )
        db.add(like)
        db.commit()
        
        # Get updated like count
        like_count = db.query(ContributionLike).filter(
            ContributionLike.contribution_id == UUID(contribution_id)
        ).count()
        
        return {"message": "Contribution liked", "like_count": like_count}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error liking contribution: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/contributions/{contribution_id}/like")
async def unlike_contribution(
    contribution_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unlike a contribution"""
    try:
        like = db.query(ContributionLike).filter(
            and_(
                ContributionLike.user_id == current_user.id,
                ContributionLike.contribution_id == UUID(contribution_id)
            )
        ).first()
        
        if not like:
            raise HTTPException(status_code=404, detail="Like not found")
        
        db.delete(like)
        db.commit()
        
        # Get updated like count
        like_count = db.query(ContributionLike).filter(
            ContributionLike.contribution_id == UUID(contribution_id)
        ).count()
        
        return {"message": "Contribution unliked", "like_count": like_count}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unliking contribution: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    
@router.get("/searches/{search_id}/star-status")
async def get_search_star_status(
    search_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Check if a search is starred by the current user"""
    try:
        star = db.query(SearchStar).filter(
            and_(
                SearchStar.user_id == current_user.id,
                SearchStar.search_id == UUID(search_id)
            )
        ).first()
        
        return {"is_starred": star is not None}
        
    except Exception as e:
        logger.error(f"Error checking search star status: {e}")
        raise HTTPException(status_code=500, detail=str(e))