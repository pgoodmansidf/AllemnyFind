from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional
from datetime import datetime
from uuid import UUID

class DocumentTypeDistribution(BaseModel):
    file_type: str
    count: int
    percentage: float
    total_size_mb: float

class TemporalCoverage(BaseModel):
    date: str
    document_count: int
    cumulative_count: int

class TopicCoverage(BaseModel):
    topic: str
    count: int
    documents: List[str]
    related_topics: List[str]
    confidence_score: float = 1.0

class EntityAnalytics(BaseModel):
    entity_type: str  # company, project, location, sau_number
    entity_name: str
    count: int
    documents: List[str]
    context_samples: List[str] = []

class SearchMetrics(BaseModel):
    total_searches: int
    unique_users: int
    average_response_time_ms: float
    success_rate: float
    top_keywords: List[Dict[str, Any]]
    failed_searches: List[Dict[str, Any]]

class DocumentAccessMetrics(BaseModel):
    document_id: str
    filename: str
    access_count: int
    last_accessed: Optional[datetime]
    average_view_duration_seconds: Optional[float]
    user_ratings: Optional[float]

class ContentDepthMetrics(BaseModel):
    average_document_length: float
    median_document_length: float
    complexity_distribution: Dict[str, int]
    language_distribution: Dict[str, int]
    readability_scores: Dict[str, float]
    total_unique_terms: int
    vocabulary_richness: float

class KnowledgeGap(BaseModel):
    gap_type: str  # missing_topic, stale_content, low_coverage
    description: str
    severity: str  # high, medium, low
    affected_areas: List[str]
    recommended_action: str
    priority_score: float

class QualityMetrics(BaseModel):
    validation_scores: Dict[str, float]
    extraction_accuracy: float
    duplicate_count: int
    duplicate_percentage: float
    error_rate: float
    processing_success_rate: float

class VolumeMetrics(BaseModel):
    total_documents: int
    total_chunks: int
    total_size_gb: float
    storage_utilization_percentage: float
    average_file_size_mb: float
    largest_file: Dict[str, Any]
    smallest_file: Dict[str, Any]

class CoverageMetrics(BaseModel):
    topic_breadth: int
    unique_topics: List[str]
    temporal_range_days: int
    earliest_document_date: Optional[datetime]
    latest_document_date: Optional[datetime]
    entity_diversity_score: float
    geographic_coverage: List[str]

class PerformanceMetrics(BaseModel):
    average_search_latency_ms: float
    p95_search_latency_ms: float
    p99_search_latency_ms: float
    search_throughput_qps: float
    cache_hit_rate: float

class KnowledgeScopeResponse(BaseModel):
    document_coverage: List[DocumentTypeDistribution]
    temporal_coverage: List[TemporalCoverage]
    topic_coverage: List[TopicCoverage]
    entity_analytics: List[EntityAnalytics]
    search_metrics: SearchMetrics
    document_access: List[DocumentAccessMetrics]
    content_depth: ContentDepthMetrics
    knowledge_gaps: List[KnowledgeGap]
    quality_metrics: QualityMetrics
    volume_metrics: VolumeMetrics
    coverage_metrics: CoverageMetrics
    performance_metrics: PerformanceMetrics
    generated_at: datetime = Field(default_factory=datetime.now)
    user_role: str = "admin"