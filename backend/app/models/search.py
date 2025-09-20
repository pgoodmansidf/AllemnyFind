from sqlalchemy import Column, Integer, String, DateTime, Text, Boolean, JSON, ForeignKey, Float, Index
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.core.database import Base

class SearchQuery(Base):
    __tablename__ = "search_queries"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    query_text = Column(Text, nullable=False)
    response_content = Column(Text, nullable=True)
    include_online = Column(Boolean, default=False)
    search_type = Column(String(50), default="langchain")  # langchain, agentic, simple
    processing_time = Column(Integer, nullable=True)  # in milliseconds
    success = Column(Boolean, default=True)
    error_message = Column(Text, nullable=True)
    citations_count = Column(Integer, default=0)
    
    # Metadata including comments
    search_metadata = Column(JSON, nullable=True)
    agent_stages = Column(JSON, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # Optimized relationship
    user = relationship(
        "User",
        back_populates="search_queries",
        lazy="select",  # Explicit lazy loading
        innerjoin=True  # User always exists for queries
    )
    
    def __repr__(self):
        return f"<SearchQuery(query='{self.query_text[:50]}...', user_id={self.user_id})>"

class SearchSession(Base):
    __tablename__ = "search_sessions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False, index=True)
    session_name = Column(String(200), nullable=True)
    
    # Session metadata
    total_queries = Column(Integer, default=0)
    successful_queries = Column(Integer, default=0)
    average_response_time = Column(Integer, nullable=True)  # in milliseconds
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_activity = Column(DateTime(timezone=True), server_default=func.now())
    
    # Optimized relationship
    user = relationship(
        "User",
        back_populates="search_sessions",
        lazy="select",
        innerjoin=True
    )
    
    def __repr__(self):
        return f"<SearchSession(id='{self.id}', user_id={self.user_id})>"
    
class SearchLog(Base):
    __tablename__ = "search_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    user = relationship(
        "User",
        backref="user_search_logs",
        lazy="select",
        innerjoin=True
    )  # Optimized relationship
    
    query = Column(Text, nullable=False)
    search_type = Column(String(50), default="hybrid")  # hybrid, semantic, keyword
    results_count = Column(Integer, default=0)
    response_time_ms = Column(Float)
    
    # Optional: track which documents were returned
    result_document_ids = Column(Text)  # JSON array of document IDs
    
    # Optional: track if user clicked on any results
    clicked_results = Column(Text)  # JSON array of clicked document IDs
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    def __repr__(self):
        return f"<SearchLog(query='{self.query[:50]}...', results={self.results_count})>"

# Add indexes for better query performance
SearchQuery.__table_args__ = (
    Index('idx_search_queries_user_created', 'user_id', 'created_at'),
    Index('idx_search_queries_success_created', 'success', 'created_at'),
    Index('idx_search_queries_search_type', 'search_type'),
    Index('idx_search_queries_processing_time', 'processing_time'),
)

SearchSession.__table_args__ = (
    Index('idx_search_sessions_user_activity', 'user_id', 'last_activity'),
    Index('idx_search_sessions_created', 'created_at'),
)

SearchLog.__table_args__ = (
    Index('idx_search_logs_user_created', 'user_id', 'created_at'),
    Index('idx_search_logs_search_type', 'search_type'),
    Index('idx_search_logs_response_time', 'response_time_ms'),
)