from sqlalchemy import Column, Integer, String, DateTime, Text, Float, JSON, Boolean, ForeignKey, Index
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
import uuid
from app.core.database import Base

class DocumentSummary(Base):
    __tablename__ = "document_summaries"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    user = relationship("User", backref="summaries")
    
    # Summary configuration
    summary_type = Column(String(50), nullable=False, index=True)  # 'single', 'collection', 'executive', 'research_brief'
    document_ids = Column(ARRAY(UUID(as_uuid=True)), nullable=False)  # Array of document IDs
    document_count = Column(Integer, nullable=False)
    
    # Summary content
    title = Column(String(500), nullable=False)
    executive_summary = Column(Text, nullable=True)  # Brief overview
    key_findings = Column(JSON, nullable=True)  # List of key findings
    trends = Column(JSON, nullable=True)  # Identified trends
    statistics = Column(JSON, nullable=True)  # Extracted statistics
    conclusions = Column(Text, nullable=True)
    recommendations = Column(JSON, nullable=True)  # Actionable recommendations
    
    # Full formatted summary
    full_summary = Column(Text, nullable=False)
    
    # Citations and references
    citations = Column(JSON, nullable=True)  # Document references with page numbers
    source_documents = Column(JSON, nullable=True)  # Document metadata
    
    # Metadata
    summary_metadata = Column(JSON, nullable=True)
    topics = Column(ARRAY(String), nullable=True)
    tags = Column(ARRAY(String), nullable=True)
    word_count = Column(Integer, nullable=True)
    
    # Processing information
    processing_time = Column(Float, nullable=True)  # in seconds
    processing_status = Column(String(50), default="pending", index=True)
    error_message = Column(Text, nullable=True)
    
    # Star/favorite functionality
    is_starred = Column(Boolean, default=False, index=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self):
        return f"<DocumentSummary(id='{self.id}', title='{self.title}', type='{self.summary_type}')>"

# Create indexes for better performance
Index('idx_summary_user_created', DocumentSummary.user_id, DocumentSummary.created_at.desc())
Index('idx_summary_starred', DocumentSummary.user_id, DocumentSummary.is_starred)
Index('idx_summary_type', DocumentSummary.summary_type)