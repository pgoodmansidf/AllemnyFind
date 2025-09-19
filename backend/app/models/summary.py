from sqlalchemy import Column, Integer, String, DateTime, Text, Float, JSON, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
import uuid
from app.core.database import Base

class Summary(Base):
    __tablename__ = "summaries"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    # Note: User relationship to be configured after User model is imported
    # user = relationship("User", backref="document_summaries")
    
    # Document references
    document_ids = Column(ARRAY(UUID(as_uuid=True)), nullable=False)
    document_count = Column(Integer, nullable=False)
    
    # Summary content
    title = Column(String(500), nullable=False)
    summary_type = Column(String(50), nullable=False)  # general, executive, technical, research_brief
    content = Column(Text, nullable=False)
    
    # Extracted information
    key_findings = Column(ARRAY(String), nullable=True)
    statistics = Column(JSON, nullable=True)
    recommendations = Column(ARRAY(String), nullable=True)
    topics = Column(ARRAY(String), nullable=True)
    
    # Metadata
    word_count = Column(Integer, nullable=True)
    processing_time = Column(Float, nullable=True)  # in seconds
    model_used = Column(String(100), nullable=True)
    
    # User interaction
    is_starred = Column(Boolean, default=False)
    access_count = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_accessed = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self):
        return f"<Summary(title='{self.title}', type='{self.summary_type}')>"