from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import Dict, Any, List
from datetime import datetime, timedelta

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.document import Document, DocumentChunk
from app.models.ingestion import IngestionJob
# from app.models.summary import Summary

router = APIRouter()

@router.get("/dashboard")
async def get_dashboard_metrics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Get real dashboard metrics from database"""
    try:
        # Basic counts
        total_documents = db.query(func.count(Document.id)).scalar() or 0
        total_chunks = db.query(func.count(DocumentChunk.id)).scalar() or 0

        # Active jobs (running or queued in last 24 hours)
        active_jobs = db.query(func.count(IngestionJob.id)).filter(
            IngestionJob.status.in_(['running', 'queued']),
            IngestionJob.created_at >= datetime.now() - timedelta(days=1)
        ).scalar() or 0

        # Success rate calculation (completed vs total jobs in last 7 days)
        recent_jobs = db.query(IngestionJob.status).filter(
            IngestionJob.created_at >= datetime.now() - timedelta(days=7)
        ).all()

        if recent_jobs:
            completed_jobs = sum(1 for job in recent_jobs if job.status == 'completed')
            success_rate = (completed_jobs / len(recent_jobs)) * 100
        else:
            success_rate = 100.0

        # Document type distribution (using main_tag instead of file_type)
        main_tag_distribution = db.query(
            Document.main_tag,
            func.count(Document.id).label('count')
        ).filter(
            Document.main_tag.isnot(None)
        ).group_by(Document.main_tag).order_by(desc('count')).limit(10).all()

        # Fallback to file_type if main_tag is empty
        if not main_tag_distribution:
            main_tag_distribution = db.query(
                Document.file_type,
                func.count(Document.id).label('count')
            ).group_by(Document.file_type).order_by(desc('count')).limit(10).all()

        # Recent activity (documents added in last 7 days)
        recent_docs = db.query(func.count(Document.id)).filter(
            Document.created_at >= datetime.now() - timedelta(days=7)
        ).scalar() or 0

        # Storage metrics
        total_size = db.query(func.sum(Document.file_size)).scalar() or 0
        total_size_mb = total_size / (1024 * 1024) if total_size else 0

        # Most recent documents
        recent_documents = db.query(
            Document.filename,
            Document.file_type,
            Document.created_at,
            Document.processing_status
        ).order_by(desc(Document.created_at)).limit(5).all()

        # Processing status distribution
        status_distribution = db.query(
            Document.processing_status,
            func.count(Document.id).label('count')
        ).group_by(Document.processing_status).all()

        return {
            "basic_stats": {
                "total_documents": total_documents,
                "total_chunks": total_chunks,
                "active_jobs": active_jobs,
                "success_rate": round(success_rate, 1),
                "recent_documents": recent_docs,
                "total_size_mb": round(total_size_mb, 2)
            },
            "distribution": {
                "main_tags": [
                    {"tag": item[0] or "unknown", "count": item[1]}
                    for item in main_tag_distribution
                ],
                "processing_status": [
                    {"status": item[0], "count": item[1]}
                    for item in status_distribution
                ]
            },
            "recent_activity": [
                {
                    "filename": doc.filename,
                    "file_type": doc.file_type,
                    "created_at": doc.created_at.isoformat() if doc.created_at else None,
                    "status": doc.processing_status
                }
                for doc in recent_documents
            ],
            "generated_at": datetime.now().isoformat()
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching dashboard metrics: {str(e)}")

@router.get("/topic-cloud")
async def get_topic_cloud_data(
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    """Get topic data for enhanced word cloud visualization"""
    try:
        # Get main topics from documents
        topic_data = []

        # Query main_topics (array field)
        topic_docs = db.query(Document.main_topics).filter(
            Document.main_topics.isnot(None)
        ).all()

        # Count topics
        topic_counts = {}
        for doc in topic_docs:
            if doc.main_topics:
                for topic in doc.main_topics:
                    if topic and topic.strip():
                        topic_counts[topic] = topic_counts.get(topic, 0) + 1

        # If main_topics is empty, use main_tag as fallback
        if not topic_counts:
            tag_docs = db.query(Document.main_tag).filter(
                Document.main_tag.isnot(None)
            ).all()

            for doc in tag_docs:
                if doc.main_tag and doc.main_tag.strip():
                    topic_counts[doc.main_tag] = topic_counts.get(doc.main_tag, 0) + 1

        # Convert to list with enhanced data for visualization
        max_count = max(topic_counts.values()) if topic_counts else 1

        for topic, count in sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)[:limit]:
            # Calculate relative size (0.5 to 3.0 scale)
            relative_size = 0.5 + (count / max_count) * 2.5

            # Assign vibrant colors based on frequency
            if count >= max_count * 0.7:
                color = "#FF6B6B"  # High frequency - bright red
            elif count >= max_count * 0.4:
                color = "#4ECDC4"  # Medium frequency - teal
            elif count >= max_count * 0.2:
                color = "#45B7D1"  # Medium-low frequency - blue
            elif count >= max_count * 0.1:
                color = "#96CEB4"  # Low frequency - green
            else:
                color = "#FFEAA7"  # Very low frequency - yellow

            topic_data.append({
                "text": topic,
                "value": count,
                "size": relative_size,
                "color": color,
                "fontWeight": "bold" if count >= max_count * 0.5 else "normal",
                "fontSize": f"{12 + (relative_size * 8)}px"  # 12px to 36px range
            })

        return topic_data

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching topic cloud data: {str(e)}")

@router.get("/user-stats")
async def get_user_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """Get user-specific statistics"""
    try:
        # User's document uploads (placeholder until user tracking is implemented)
        user_docs = 0

        # User's search activity (placeholder for when search logging is implemented)
        user_searches = 0

        # User's summary requests (placeholder until Summary model is fixed)
        user_summaries = 0

        return {
            "user_documents": user_docs,
            "user_searches": user_searches,
            "user_summaries": user_summaries,
            "last_activity": current_user.updated_at.isoformat() if hasattr(current_user, 'updated_at') and current_user.updated_at else None
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching user stats: {str(e)}")