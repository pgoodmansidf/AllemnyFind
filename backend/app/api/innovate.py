# app/api/innovate.py
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, case, and_, or_
from pydantic import BaseModel, validator
from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User, UserRole
from app.models.innovate import Suggestion, SuggestionVote, SuggestionComment, SuggestionStatus, SuggestionCategory, VoteType

router = APIRouter()

# Pydantic models for request/response
class SuggestionBase(BaseModel):
    title: str
    description: str
    category: SuggestionCategory = SuggestionCategory.OTHER

    @validator('title')
    def validate_title(cls, v):
        if len(v.strip()) < 5:
            raise ValueError('Title must be at least 5 characters long')
        if len(v) > 200:
            raise ValueError('Title must be less than 200 characters')
        return v.strip()

    @validator('description')
    def validate_description(cls, v):
        if len(v.strip()) < 20:
            raise ValueError('Please give more detail in the suggestion')
        return v.strip()

class SuggestionCreate(SuggestionBase):
    pass

class SuggestionUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[SuggestionCategory] = None

class SuggestionAdminUpdate(BaseModel):
    status: SuggestionStatus
    admin_notes: Optional[str] = None
    priority: Optional[int] = None
    is_featured: Optional[bool] = None

class SuggestionResponse(SuggestionBase):
    id: int
    status: SuggestionStatus
    user_id: int
    admin_id: Optional[int] = None
    admin_notes: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    implemented_at: Optional[datetime] = None
    upvotes_count: int = 0
    downvotes_count: int = 0
    total_score: int = 0
    priority: int = 0
    is_featured: bool = False

    # Additional fields for responses
    submitter_username: Optional[str] = None
    submitter_name: Optional[str] = None
    user_vote: Optional[VoteType] = None
    comments_count: int = 0

    class Config:
        from_attributes = True

class VoteCreate(BaseModel):
    vote_type: VoteType

class VoteResponse(BaseModel):
    id: int
    user_id: int
    suggestion_id: int
    vote_type: VoteType
    created_at: datetime

    class Config:
        from_attributes = True

class CommentCreate(BaseModel):
    content: str

    @validator('content')
    def validate_content(cls, v):
        if len(v.strip()) < 5:
            raise ValueError('Comment must be at least 5 characters long')
        return v.strip()

class CommentResponse(BaseModel):
    id: int
    suggestion_id: int
    user_id: int
    content: str
    is_admin_response: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    username: Optional[str] = None
    full_name: Optional[str] = None

    class Config:
        from_attributes = True

class SuggestionListResponse(BaseModel):
    suggestions: List[SuggestionResponse]
    total: int
    page: int
    size: int
    total_pages: int

class SuggestionStats(BaseModel):
    total_suggestions: int
    pending_suggestions: int
    approved_suggestions: int
    implemented_suggestions: int
    total_votes: int
    total_comments: int
    categories_breakdown: Dict[str, int]
    recent_activity_count: int

# Helper functions
def update_suggestion_vote_counts(db: Session, suggestion_id: int):
    """Update the vote counts for a suggestion"""
    suggestion = db.query(Suggestion).filter(Suggestion.id == suggestion_id).first()
    if not suggestion:
        return

    vote_counts = db.query(
        func.sum(case((SuggestionVote.vote_type == VoteType.UPVOTE, 1), else_=0)).label('upvotes'),
        func.sum(case((SuggestionVote.vote_type == VoteType.DOWNVOTE, 1), else_=0)).label('downvotes')
    ).filter(SuggestionVote.suggestion_id == suggestion_id).first()

    upvotes = vote_counts.upvotes or 0
    downvotes = vote_counts.downvotes or 0

    suggestion.upvotes_count = upvotes
    suggestion.downvotes_count = downvotes
    suggestion.total_score = upvotes - downvotes

    db.commit()

def get_user_vote(db: Session, user_id: int, suggestion_id: int) -> Optional[VoteType]:
    """Get user's vote for a suggestion"""
    vote = db.query(SuggestionVote).filter(
        SuggestionVote.user_id == user_id,
        SuggestionVote.suggestion_id == suggestion_id
    ).first()
    return vote.vote_type if vote else None

# API Endpoints
@router.post("/suggestions", response_model=SuggestionResponse)
def create_suggestion(
    suggestion: SuggestionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new suggestion"""
    db_suggestion = Suggestion(
        title=suggestion.title,
        description=suggestion.description,
        category=suggestion.category,
        user_id=current_user.id,
        status=SuggestionStatus.PENDING
    )

    db.add(db_suggestion)
    db.commit()
    db.refresh(db_suggestion)

    # Add submitter info
    response = SuggestionResponse.model_validate(db_suggestion)
    response.submitter_username = current_user.username
    response.submitter_name = current_user.full_name

    return response

@router.get("/suggestions", response_model=SuggestionListResponse)
def get_suggestions(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    status: Optional[SuggestionStatus] = None,
    category: Optional[SuggestionCategory] = None,
    sort_by: str = Query("created_at", regex="^(created_at|total_score|updated_at)$"),
    sort_order: str = Query("desc", regex="^(asc|desc)$"),
    search: Optional[str] = None,
    featured_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get suggestions with filtering and pagination"""
    query = db.query(Suggestion).join(User, Suggestion.user_id == User.id)

    # Apply filters
    if status:
        query = query.filter(Suggestion.status == status)
    if category:
        query = query.filter(Suggestion.category == category)
    if featured_only:
        query = query.filter(Suggestion.is_featured == True)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            or_(
                Suggestion.title.ilike(search_term),
                Suggestion.description.ilike(search_term)
            )
        )

    # Apply sorting
    if sort_by == "total_score":
        if sort_order == "desc":
            query = query.order_by(desc(Suggestion.total_score))
        else:
            query = query.order_by(Suggestion.total_score)
    elif sort_by == "updated_at":
        if sort_order == "desc":
            query = query.order_by(desc(Suggestion.updated_at))
        else:
            query = query.order_by(Suggestion.updated_at)
    else:  # created_at
        if sort_order == "desc":
            query = query.order_by(desc(Suggestion.created_at))
        else:
            query = query.order_by(Suggestion.created_at)

    # Get total count
    total = query.count()

    # Apply pagination
    offset = (page - 1) * size
    suggestions = query.offset(offset).limit(size).all()

    # Enhance with additional data
    response_suggestions = []
    for suggestion in suggestions:
        response = SuggestionResponse.model_validate(suggestion)
        response.submitter_username = suggestion.submitter.username
        response.submitter_name = suggestion.submitter.full_name
        response.user_vote = get_user_vote(db, current_user.id, suggestion.id)

        # Get comments count
        response.comments_count = db.query(SuggestionComment).filter(
            SuggestionComment.suggestion_id == suggestion.id
        ).count()

        response_suggestions.append(response)

    total_pages = (total + size - 1) // size

    return SuggestionListResponse(
        suggestions=response_suggestions,
        total=total,
        page=page,
        size=size,
        total_pages=total_pages
    )

@router.get("/suggestions/{suggestion_id}", response_model=SuggestionResponse)
def get_suggestion(
    suggestion_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get a specific suggestion"""
    suggestion = db.query(Suggestion).filter(Suggestion.id == suggestion_id).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    response = SuggestionResponse.model_validate(suggestion)
    response.submitter_username = suggestion.submitter.username
    response.submitter_name = suggestion.submitter.full_name
    response.user_vote = get_user_vote(db, current_user.id, suggestion.id)

    # Get comments count
    response.comments_count = db.query(SuggestionComment).filter(
        SuggestionComment.suggestion_id == suggestion.id
    ).count()

    return response

@router.put("/suggestions/{suggestion_id}", response_model=SuggestionResponse)
def update_suggestion(
    suggestion_id: int,
    suggestion_update: SuggestionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update a suggestion (only by the original submitter)"""
    suggestion = db.query(Suggestion).filter(Suggestion.id == suggestion_id).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    # Check if user is the submitter
    if suggestion.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="You can only edit your own suggestions")

    # Check if suggestion is still editable
    if suggestion.status not in [SuggestionStatus.PENDING]:
        raise HTTPException(status_code=400, detail="Cannot edit suggestions that have been reviewed")

    # Update fields
    update_data = suggestion_update.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(suggestion, field, value)

    suggestion.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(suggestion)

    response = SuggestionResponse.model_validate(suggestion)
    response.submitter_username = current_user.username
    response.submitter_name = current_user.full_name
    response.user_vote = get_user_vote(db, current_user.id, suggestion.id)

    return response

@router.put("/suggestions/{suggestion_id}/admin", response_model=SuggestionResponse)
def admin_update_suggestion(
    suggestion_id: int,
    admin_update: SuggestionAdminUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Admin update for suggestion status and properties"""
    # Check if user is admin
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(status_code=403, detail="Admin access required")

    suggestion = db.query(Suggestion).filter(Suggestion.id == suggestion_id).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    # Update status and admin fields
    suggestion.status = admin_update.status
    suggestion.admin_id = current_user.id
    suggestion.admin_notes = admin_update.admin_notes

    if admin_update.priority is not None:
        suggestion.priority = admin_update.priority
    if admin_update.is_featured is not None:
        suggestion.is_featured = admin_update.is_featured

    # Set timestamps based on status
    now = datetime.utcnow()
    suggestion.updated_at = now

    if admin_update.status == SuggestionStatus.APPROVED and not suggestion.approved_at:
        suggestion.approved_at = now
    elif admin_update.status == SuggestionStatus.IMPLEMENTED and not suggestion.implemented_at:
        suggestion.implemented_at = now

    db.commit()
    db.refresh(suggestion)

    response = SuggestionResponse.model_validate(suggestion)
    response.submitter_username = suggestion.submitter.username
    response.submitter_name = suggestion.submitter.full_name
    response.user_vote = get_user_vote(db, current_user.id, suggestion.id)

    return response

@router.delete("/suggestions/{suggestion_id}")
def delete_suggestion(
    suggestion_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a suggestion (admin only or original submitter if pending)"""
    suggestion = db.query(Suggestion).filter(Suggestion.id == suggestion_id).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    # Check permissions
    is_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]
    is_submitter = suggestion.user_id == current_user.id
    is_pending = suggestion.status == SuggestionStatus.PENDING

    if not (is_admin or (is_submitter and is_pending)):
        raise HTTPException(
            status_code=403,
            detail="You can only delete your own pending suggestions or admin can delete any"
        )

    db.delete(suggestion)
    db.commit()

    return {"message": "Suggestion deleted successfully"}

@router.post("/suggestions/{suggestion_id}/vote", response_model=VoteResponse)
def vote_suggestion(
    suggestion_id: int,
    vote: VoteCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Vote on a suggestion"""
    suggestion = db.query(Suggestion).filter(Suggestion.id == suggestion_id).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    # Can't vote on your own suggestion
    if suggestion.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot vote on your own suggestion")

    # Check if user already voted
    existing_vote = db.query(SuggestionVote).filter(
        SuggestionVote.user_id == current_user.id,
        SuggestionVote.suggestion_id == suggestion_id
    ).first()

    if existing_vote:
        # Update existing vote if different
        if existing_vote.vote_type != vote.vote_type:
            existing_vote.vote_type = vote.vote_type
            existing_vote.updated_at = datetime.utcnow()
            db.commit()
            db.refresh(existing_vote)

            # Update vote counts
            update_suggestion_vote_counts(db, suggestion_id)

            return VoteResponse.model_validate(existing_vote)
        else:
            raise HTTPException(status_code=400, detail="You have already cast this vote")
    else:
        # Create new vote
        new_vote = SuggestionVote(
            user_id=current_user.id,
            suggestion_id=suggestion_id,
            vote_type=vote.vote_type
        )

        db.add(new_vote)
        db.commit()
        db.refresh(new_vote)

        # Update vote counts
        update_suggestion_vote_counts(db, suggestion_id)

        return VoteResponse.model_validate(new_vote)

@router.delete("/suggestions/{suggestion_id}/vote")
def remove_vote(
    suggestion_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove user's vote from a suggestion"""
    vote = db.query(SuggestionVote).filter(
        SuggestionVote.user_id == current_user.id,
        SuggestionVote.suggestion_id == suggestion_id
    ).first()

    if not vote:
        raise HTTPException(status_code=404, detail="Vote not found")

    db.delete(vote)
    db.commit()

    # Update vote counts
    update_suggestion_vote_counts(db, suggestion_id)

    return {"message": "Vote removed successfully"}

@router.get("/suggestions/{suggestion_id}/comments", response_model=List[CommentResponse])
def get_suggestion_comments(
    suggestion_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get comments for a suggestion"""
    suggestion = db.query(Suggestion).filter(Suggestion.id == suggestion_id).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    comments = db.query(SuggestionComment).join(User).filter(
        SuggestionComment.suggestion_id == suggestion_id
    ).order_by(SuggestionComment.created_at).all()

    response_comments = []
    for comment in comments:
        response = CommentResponse.model_validate(comment)
        response.username = comment.user.username
        response.full_name = comment.user.full_name
        response_comments.append(response)

    return response_comments

@router.post("/suggestions/{suggestion_id}/comments", response_model=CommentResponse)
def create_comment(
    suggestion_id: int,
    comment: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Add a comment to a suggestion"""
    suggestion = db.query(Suggestion).filter(Suggestion.id == suggestion_id).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")

    is_admin = current_user.role in [UserRole.ADMIN, UserRole.SUPER_ADMIN]

    db_comment = SuggestionComment(
        suggestion_id=suggestion_id,
        user_id=current_user.id,
        content=comment.content,
        is_admin_response=is_admin
    )

    db.add(db_comment)
    db.commit()
    db.refresh(db_comment)

    response = CommentResponse.model_validate(db_comment)
    response.username = current_user.username
    response.full_name = current_user.full_name

    return response

@router.get("/stats", response_model=SuggestionStats)
def get_innovate_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get innovation platform statistics"""
    total_suggestions = db.query(Suggestion).count()
    pending_suggestions = db.query(Suggestion).filter(Suggestion.status == SuggestionStatus.PENDING).count()
    approved_suggestions = db.query(Suggestion).filter(Suggestion.status == SuggestionStatus.APPROVED).count()
    implemented_suggestions = db.query(Suggestion).filter(Suggestion.status == SuggestionStatus.IMPLEMENTED).count()

    total_votes = db.query(SuggestionVote).count()
    total_comments = db.query(SuggestionComment).count()

    # Categories breakdown
    categories = db.query(
        Suggestion.category,
        func.count(Suggestion.id).label('count')
    ).group_by(Suggestion.category).all()

    categories_breakdown = {cat.value: 0 for cat in SuggestionCategory}
    for category, count in categories:
        categories_breakdown[category.value] = count

    # Recent activity (last 7 days)
    seven_days_ago = datetime.utcnow() - timedelta(days=7)
    recent_activity_count = db.query(Suggestion).filter(
        Suggestion.created_at >= seven_days_ago
    ).count()

    return SuggestionStats(
        total_suggestions=total_suggestions,
        pending_suggestions=pending_suggestions,
        approved_suggestions=approved_suggestions,
        implemented_suggestions=implemented_suggestions,
        total_votes=total_votes,
        total_comments=total_comments,
        categories_breakdown=categories_breakdown,
        recent_activity_count=recent_activity_count
    )

@router.get("/my-suggestions", response_model=List[SuggestionResponse])
def get_my_suggestions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's suggestions"""
    suggestions = db.query(Suggestion).filter(
        Suggestion.user_id == current_user.id
    ).order_by(desc(Suggestion.created_at)).all()

    response_suggestions = []
    for suggestion in suggestions:
        response = SuggestionResponse.model_validate(suggestion)
        response.submitter_username = current_user.username
        response.submitter_name = current_user.full_name
        response.user_vote = get_user_vote(db, current_user.id, suggestion.id)

        # Get comments count
        response.comments_count = db.query(SuggestionComment).filter(
            SuggestionComment.suggestion_id == suggestion.id
        ).count()

        response_suggestions.append(response)

    return response_suggestions