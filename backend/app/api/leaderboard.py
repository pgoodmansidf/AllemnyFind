# app/api/leaderboard.py - FIXED VERSION
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
    db: Session = Depends(get_db)
):
    """Get leaderboard with user rankings"""

    # Calculate date filter based on period
    date_filter = None
    if period == "month":
        date_filter = datetime.utcnow() - timedelta(days=30)
    elif period == "week":
        date_filter = datetime.utcnow() - timedelta(days=7)

    # Use separate queries to avoid cartesian product issues
    # Get base user data
    users_query = db.query(User).filter(User.is_active == True)
    if department:
        users_query = users_query.filter(User.department == department)

    users = users_query.all()
    leaderboard_entries = []

    for user in users:
        # Count contributions
        contributions_query = db.query(DocumentContribution).filter(
            DocumentContribution.user_id == user.id
        )
        if date_filter:
            contributions_query = contributions_query.filter(
                DocumentContribution.created_at >= date_filter
            )
        contributions_count = contributions_query.count()

        # Count likes received on user's contributions
        likes_query = db.query(ContributionLike).join(
            DocumentContribution,
            ContributionLike.contribution_id == DocumentContribution.id
        ).filter(
            DocumentContribution.user_id == user.id
        )
        if date_filter:
            likes_query = likes_query.filter(
                ContributionLike.liked_at >= date_filter
            )
        likes_count = likes_query.count()

        # Count searches
        searches_query = db.query(SearchQuery).filter(
            SearchQuery.user_id == user.id
        )
        if date_filter:
            searches_query = searches_query.filter(
                SearchQuery.created_at >= date_filter
            )
        searches_count = searches_query.count()

        # Count starred documents
        stars_query = db.query(DocumentStar).filter(
            DocumentStar.user_id == user.id
        )
        if date_filter:
            stars_query = stars_query.filter(
                DocumentStar.starred_at >= date_filter
            )
        stars_count = stars_query.count()

        # Count documents uploaded (through completed ingestion jobs)
        uploads_query = db.query(Document).join(
            IngestionJob,
            Document.ingestion_job_id == IngestionJob.id
        ).filter(
            IngestionJob.user_id == user.id,
            IngestionJob.status == 'completed'
        )
        if date_filter:
            uploads_query = uploads_query.filter(
                IngestionJob.created_at >= date_filter
            )
        uploads_count = uploads_query.count()

        # Calculate total score
        total_score = calculate_user_score(
            contributions_count,
            likes_count,
            searches_count,
            stars_count,
            uploads_count
        )

        entry = LeaderboardEntry(
            rank=0,  # Will be set after sorting
            user_id=user.id,
            username=user.username,
            full_name=user.full_name,
            department=user.department,
            total_score=total_score,
            contributions_count=contributions_count,
            likes_received=likes_count,
            searches_count=searches_count,
            documents_starred=stars_count,
            documents_uploaded=uploads_count,
            join_date=user.created_at,
            last_activity=user.last_login
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

    # Calculate user's statistics using the same logic as leaderboard
    contributions_count = db.query(DocumentContribution).filter(
        DocumentContribution.user_id == user_id
    ).count()

    likes_count = db.query(ContributionLike).join(
        DocumentContribution,
        ContributionLike.contribution_id == DocumentContribution.id
    ).filter(
        DocumentContribution.user_id == user_id
    ).count()

    searches_count = db.query(SearchQuery).filter(
        SearchQuery.user_id == user_id
    ).count()

    stars_count = db.query(DocumentStar).filter(
        DocumentStar.user_id == user_id
    ).count()

    uploads_count = db.query(Document).join(
        IngestionJob,
        Document.ingestion_job_id == IngestionJob.id
    ).filter(
        IngestionJob.user_id == user_id,
        IngestionJob.status == 'completed'
    ).count()

    # Calculate total score
    total_score = calculate_user_score(
        contributions_count,
        likes_count,
        searches_count,
        stars_count,
        uploads_count
    )

    # Calculate rank by counting users with higher scores
    users_with_higher_scores = 0
    all_users = db.query(User).filter(User.is_active == True).all()

    for user in all_users:
        if user.id == user_id:
            continue

        # Calculate this user's score
        other_contributions = db.query(DocumentContribution).filter(
            DocumentContribution.user_id == user.id
        ).count()

        other_likes = db.query(ContributionLike).join(
            DocumentContribution,
            ContributionLike.contribution_id == DocumentContribution.id
        ).filter(
            DocumentContribution.user_id == user.id
        ).count()

        other_searches = db.query(SearchQuery).filter(
            SearchQuery.user_id == user.id
        ).count()

        other_stars = db.query(DocumentStar).filter(
            DocumentStar.user_id == user.id
        ).count()

        other_uploads = db.query(Document).join(
            IngestionJob,
            Document.ingestion_job_id == IngestionJob.id
        ).filter(
            IngestionJob.user_id == user.id,
            IngestionJob.status == 'completed'
        ).count()

        other_score = calculate_user_score(
            other_contributions,
            other_likes,
            other_searches,
            other_stars,
            other_uploads
        )

        if other_score > total_score:
            users_with_higher_scores += 1

    rank = users_with_higher_scores + 1

    # Create user entry
    user_entry = LeaderboardEntry(
        rank=rank,
        user_id=target_user.id,
        username=target_user.username,
        full_name=target_user.full_name,
        department=target_user.department,
        total_score=total_score,
        contributions_count=contributions_count,
        likes_received=likes_count,
        searches_count=searches_count,
        documents_starred=stars_count,
        documents_uploaded=uploads_count,
        join_date=target_user.created_at,
        last_activity=target_user.last_login
    )

    # Rank breakdown
    rank_breakdown = {
        "contributions": {"count": contributions_count, "points": contributions_count * 10},
        "likes_received": {"count": likes_count, "points": likes_count * 5},
        "searches": {"count": searches_count, "points": searches_count * 1},
        "stars": {"count": stars_count, "points": stars_count * 2},
        "uploads": {"count": uploads_count, "points": uploads_count * 15}
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