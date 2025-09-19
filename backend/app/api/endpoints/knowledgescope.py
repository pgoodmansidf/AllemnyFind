from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.analytics import KnowledgeScopeResponse
from app.services.analytics_service import AnalyticsService

router = APIRouter()

@router.get("/analytics/complete", response_model=KnowledgeScopeResponse)
async def get_complete_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get complete analytics data for KnowledgeScope dashboard"""
    try:
        service = AnalyticsService(db)
        
        # Determine user role (simplified - you may have a more complex role system)
        user_role = "admin" if current_user.is_superuser else "regular"
        
        analytics = service.get_complete_analytics(user_role)
        return analytics
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/analytics/document-coverage")
async def get_document_coverage(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get document coverage statistics"""
    service = AnalyticsService(db)
    return service.get_document_type_distribution()

@router.get("/analytics/temporal-coverage")
async def get_temporal_coverage(
    days: Optional[int] = Query(30, description="Number of days to analyze"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get temporal coverage of documents"""
    service = AnalyticsService(db)
    return service.get_temporal_coverage()

@router.get("/analytics/topic-coverage")
async def get_topic_coverage(
    limit: Optional[int] = Query(50, description="Maximum number of topics to return"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get topic coverage analysis"""
    service = AnalyticsService(db)
    coverage = service.get_topic_coverage()
    return coverage[:limit]

@router.get("/analytics/entities")
async def get_entity_analytics(
    entity_type: Optional[str] = Query(None, description="Filter by entity type"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get entity extraction analytics"""
    service = AnalyticsService(db)
    entities = service.get_entity_analytics()
    
    if entity_type:
        entities = [e for e in entities if e.entity_type == entity_type]
    
    return entities

@router.get("/analytics/search-metrics")
async def get_search_metrics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get search performance metrics"""
    service = AnalyticsService(db)
    return service.get_search_metrics()

@router.get("/analytics/content-depth")
async def get_content_depth(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get content depth and complexity metrics"""
    service = AnalyticsService(db)
    return service.get_content_depth_metrics()

@router.get("/analytics/knowledge-gaps")
async def get_knowledge_gaps(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Identify gaps in the knowledge base"""
    service = AnalyticsService(db)
    return service.identify_knowledge_gaps()

@router.get("/analytics/quality")
async def get_quality_metrics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get quality metrics for the knowledge base"""
    service = AnalyticsService(db)
    return service.get_quality_metrics()

@router.get("/analytics/performance")
async def get_performance_metrics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get system performance metrics"""
    service = AnalyticsService(db)
    return service.get_performance_metrics()