# app/api/leaderboard.py
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, case, and_
from pydantic import BaseModel
from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.search import SearchQuery
from app.models.stars import DocumentContribution, ContributionLike, DocumentStar
from app.models.document import Document
from app.models.ingestion import IngestionJob

router = APIRouter()

class LeaderboardEntry(BaseModel):
    rank: int
    user_id: int
    username: str
    full_name: Optional[str]
    department: Optional[str]
    total_score: int
    contributions_count: int
    likes_received: int
    searches_count: int
    documents_starred: int
    documents_uploaded: int
    join_date: datetime
    last_activity: Optional[datetime]

    class Config:
        from_attributes = True

class LeaderboardStats(BaseModel):
    total_users: int
    total_contributions: int
    total_likes: int
    total_searches: int
    most_active_department: Optional[str]
    top_contributor: Optional[str]

    class Config:
        from_attributes = True

class UserRankDetails(BaseModel):
    user: LeaderboardEntry
    rank_breakdown: dict
    recent_activity: List[dict]

    class Config:
        from_attributes = True

def calculate_user_score(
    contributions_count: int,
    likes_received: int,
    searches_count: int,
    documents_starred: int,
    documents_uploaded: int
) -> int:
    """Calculate weighted score for leaderboard ranking"""
    # Scoring weights
    CONTRIBUTION_WEIGHT = 10
    LIKE_WEIGHT = 5
    SEARCH_WEIGHT = 1
    STAR_WEIGHT = 2
    UPLOAD_WEIGHT = 15

    return (
        contributions_count * CONTRIBUTION_WEIGHT +
        likes_received * LIKE_WEIGHT +
        searches_count * SEARCH_WEIGHT +
        documents_starred * STAR_WEIGHT +
        documents_uploaded * UPLOAD_WEIGHT
    )

@router.get("/", response_model=List[LeaderboardEntry])
async def get_leaderboard(
    period: str = Query("all", description="Time period: all, month, week"),
    department: Optional[str] = Query(None, description="Filter by department"),
    limit: int = Query(50, description="Number of results"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get leaderboard with user rankings"""

    # Calculate date filter based on period
    date_filter = None
    if period == "month":
        date_filter = datetime.utcnow() - timedelta(days=30)
    elif period == "week":
        date_filter = datetime.utcnow() - timedelta(days=7)

    # Base query for user statistics
    base_query = db.query(
        User.id,
        User.username,
        User.full_name,
        User.department,
        User.created_at,
        User.last_login,
        # Count contributions
        func.coalesce(
            func.count(
                case(
                    (and_(
                        DocumentContribution.user_id == User.id,
                        date_filter is None or DocumentContribution.created_at >= date_filter
                    ), DocumentContribution.id)
                )
            ).label('contributions_count'), 0
        ).label('contributions_count'),
        # Count likes received
        func.coalesce(
            func.count(
                case(
                    (and_(
                        ContributionLike.contribution_id == DocumentContribution.id,
                        DocumentContribution.user_id == User.id,
                        date_filter is None or ContributionLike.liked_at >= date_filter
                    ), ContributionLike.id)
                )
            ).label('likes_received'), 0
        ).label('likes_received'),
        # Count searches
        func.coalesce(
            func.count(
                case(
                    (and_(
                        SearchQuery.user_id == User.id,
                        date_filter is None or SearchQuery.created_at >= date_filter
                    ), SearchQuery.id)
                )
            ).label('searches_count'), 0
        ).label('searches_count'),
        # Count starred documents
        func.coalesce(
            func.count(
                case(
                    (and_(
                        DocumentStar.user_id == User.id,
                        date_filter is None or DocumentStar.starred_at >= date_filter
                    ), DocumentStar.id)
                )
            ).label('documents_starred'), 0
        ).label('documents_starred'),
        # Count documents uploaded (through ingestion jobs)
        func.coalesce(
            func.count(
                case(
                    (and_(
                        IngestionJob.user_id == User.id,
                        IngestionJob.status == 'completed',
                        date_filter is None or IngestionJob.created_at >= date_filter
                    ), Document.id)
                )
            ).label('documents_uploaded'), 0
        ).label('documents_uploaded')
    ).outerjoin(
        DocumentContribution, DocumentContribution.user_id == User.id
    ).outerjoin(
        ContributionLike, ContributionLike.contribution_id == DocumentContribution.id
    ).outerjoin(
        SearchQuery, SearchQuery.user_id == User.id
    ).outerjoin(
        DocumentStar, DocumentStar.user_id == User.id
    ).outerjoin(
        IngestionJob, IngestionJob.user_id == User.id
    ).outerjoin(
        Document, Document.ingestion_job_id == IngestionJob.id
    ).filter(
        User.is_active == True
    ).group_by(
        User.id, User.username, User.full_name, User.department,
        User.created_at, User.last_login
    )

    # Apply department filter if specified
    if department:
        base_query = base_query.filter(User.department == department)

    # Execute query
    results = base_query.all()

    # Calculate scores and create leaderboard entries
    leaderboard_entries = []
    for result in results:
        total_score = calculate_user_score(
            result.contributions_count,
            result.likes_received,
            result.searches_count,
            result.documents_starred,
            result.documents_uploaded
        )

        entry = LeaderboardEntry(
            rank=0,  # Will be set after sorting
            user_id=result.id,
            username=result.username,
            full_name=result.full_name,
            department=result.department,
            total_score=total_score,
            contributions_count=result.contributions_count,
            likes_received=result.likes_received,
            searches_count=result.searches_count,
            documents_starred=result.documents_starred,
            documents_uploaded=result.documents_uploaded,
            join_date=result.created_at,
            last_activity=result.last_login
        )
        leaderboard_entries.append(entry)

    # Sort by score and assign ranks
    leaderboard_entries.sort(key=lambda x: x.total_score, reverse=True)
    for i, entry in enumerate(leaderboard_entries):
        entry.rank = i + 1

    # Apply limit
    return leaderboard_entries[:limit]

@router.get("/stats", response_model=LeaderboardStats)
async def get_leaderboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get overall leaderboard statistics"""

    # Total users
    total_users = db.query(func.count(User.id)).filter(User.is_active == True).scalar()

    # Total contributions
    total_contributions = db.query(func.count(DocumentContribution.id)).scalar()

    # Total likes
    total_likes = db.query(func.count(ContributionLike.id)).scalar()

    # Total searches
    total_searches = db.query(func.count(SearchQuery.id)).scalar()

    # Most active department
    most_active_dept = db.query(
        User.department,
        func.count(User.id).label('user_count')
    ).filter(
        User.is_active == True,
        User.department.isnot(None)
    ).group_by(
        User.department
    ).order_by(
        desc('user_count')
    ).first()

    # Top contributor
    top_contributor_query = db.query(
        User.full_name,
        func.count(DocumentContribution.id).label('contribution_count')
    ).join(
        DocumentContribution, DocumentContribution.user_id == User.id
    ).group_by(
        User.id, User.full_name
    ).order_by(
        desc('contribution_count')
    ).first()

    return LeaderboardStats(
        total_users=total_users or 0,
        total_contributions=total_contributions or 0,
        total_likes=total_likes or 0,
        total_searches=total_searches or 0,
        most_active_department=most_active_dept.department if most_active_dept else None,
        top_contributor=top_contributor_query.full_name if top_contributor_query else None
    )

@router.get("/user/{user_id}", response_model=UserRankDetails)
async def get_user_rank_details(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed ranking information for a specific user"""

    # Check if user exists
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Get user's statistics (same logic as leaderboard but for one user)
    user_stats = db.query(
        User.id,
        User.username,
        User.full_name,
        User.department,
        User.created_at,
        User.last_login,
        func.coalesce(func.count(func.distinct(DocumentContribution.id)), 0).label('contributions_count'),
        func.coalesce(func.count(func.distinct(ContributionLike.id)), 0).label('likes_received'),
        func.coalesce(func.count(func.distinct(SearchQuery.id)), 0).label('searches_count'),
        func.coalesce(func.count(func.distinct(DocumentStar.id)), 0).label('documents_starred'),
        func.coalesce(func.count(func.distinct(Document.id)), 0).label('documents_uploaded')
    ).outerjoin(
        DocumentContribution, DocumentContribution.user_id == User.id
    ).outerjoin(
        ContributionLike, ContributionLike.contribution_id == DocumentContribution.id
    ).outerjoin(
        SearchQuery, SearchQuery.user_id == User.id
    ).outerjoin(
        DocumentStar, DocumentStar.user_id == User.id
    ).outerjoin(
        IngestionJob, IngestionJob.user_id == User.id
    ).outerjoin(
        Document, and_(Document.ingestion_job_id == IngestionJob.id, IngestionJob.status == 'completed')
    ).filter(
        User.id == user_id
    ).group_by(
        User.id, User.username, User.full_name, User.department,
        User.created_at, User.last_login
    ).first()

    if not user_stats:
        raise HTTPException(status_code=404, detail="User statistics not found")

    # Calculate total score
    total_score = calculate_user_score(
        user_stats.contributions_count,
        user_stats.likes_received,
        user_stats.searches_count,
        user_stats.documents_starred,
        user_stats.documents_uploaded
    )

    # Get user's rank by comparing with others
    higher_scores = db.query(func.count('*')).select_from(
        db.query(
            User.id,
            (func.coalesce(func.count(func.distinct(DocumentContribution.id)), 0) * 10 +
             func.coalesce(func.count(func.distinct(ContributionLike.id)), 0) * 5 +
             func.coalesce(func.count(func.distinct(SearchQuery.id)), 0) * 1 +
             func.coalesce(func.count(func.distinct(DocumentStar.id)), 0) * 2 +
             func.coalesce(func.count(func.distinct(Document.id)), 0) * 15).label('total_score')
        ).outerjoin(
            DocumentContribution, DocumentContribution.user_id == User.id
        ).outerjoin(
            ContributionLike, ContributionLike.contribution_id == DocumentContribution.id
        ).outerjoin(
            SearchQuery, SearchQuery.user_id == User.id
        ).outerjoin(
            DocumentStar, DocumentStar.user_id == User.id
        ).outerjoin(
            IngestionJob, IngestionJob.user_id == User.id
        ).outerjoin(
            Document, and_(Document.ingestion_job_id == IngestionJob.id, IngestionJob.status == 'completed')
        ).filter(
            User.is_active == True
        ).group_by(User.id).subquery()
    ).filter(
        higher_scores > total_score
    ).scalar()

    rank = (higher_scores or 0) + 1

    # Create user entry
    user_entry = LeaderboardEntry(
        rank=rank,
        user_id=user_stats.id,
        username=user_stats.username,
        full_name=user_stats.full_name,
        department=user_stats.department,
        total_score=total_score,
        contributions_count=user_stats.contributions_count,
        likes_received=user_stats.likes_received,
        searches_count=user_stats.searches_count,
        documents_starred=user_stats.documents_starred,
        documents_uploaded=user_stats.documents_uploaded,
        join_date=user_stats.created_at,
        last_activity=user_stats.last_login
    )

    # Rank breakdown
    rank_breakdown = {
        "contributions": {"count": user_stats.contributions_count, "points": user_stats.contributions_count * 10},
        "likes_received": {"count": user_stats.likes_received, "points": user_stats.likes_received * 5},
        "searches": {"count": user_stats.searches_count, "points": user_stats.searches_count * 1},
        "stars": {"count": user_stats.documents_starred, "points": user_stats.documents_starred * 2},
        "uploads": {"count": user_stats.documents_uploaded, "points": user_stats.documents_uploaded * 15}
    }

    # Recent activity (last 10 items)
    recent_activity = []

    # Recent contributions
    recent_contributions = db.query(DocumentContribution).filter(
        DocumentContribution.user_id == user_id
    ).order_by(desc(DocumentContribution.created_at)).limit(5).all()

    for contrib in recent_contributions:
        recent_activity.append({
            "type": "contribution",
            "description": f"Added contribution to document",
            "timestamp": contrib.created_at,
            "points": 10
        })

    # Recent searches
    recent_searches = db.query(SearchQuery).filter(
        SearchQuery.user_id == user_id
    ).order_by(desc(SearchQuery.created_at)).limit(5).all()

    for search in recent_searches:
        recent_activity.append({
            "type": "search",
            "description": f"Performed search: {search.query_text[:50]}...",
            "timestamp": search.created_at,
            "points": 1
        })

    # Sort recent activity by timestamp
    recent_activity.sort(key=lambda x: x["timestamp"], reverse=True)
    recent_activity = recent_activity[:10]  # Limit to 10 most recent

    return UserRankDetails(
        user=user_entry,
        rank_breakdown=rank_breakdown,
        recent_activity=recent_activity
    )

@router.get("/departments")
async def get_departments(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of departments for filtering"""
    departments = db.query(User.department).filter(
        User.department.isnot(None),
        User.is_active == True
    ).distinct().all()

    return [dept.department for dept in departments if dept.department]

@router.get("/my-rank", response_model=UserRankDetails)
async def get_my_rank(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get current user's rank details"""
    return await get_user_rank_details(current_user.id, current_user, db)