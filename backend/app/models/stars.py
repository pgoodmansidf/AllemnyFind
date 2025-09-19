# app/models/stars.py
from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import uuid
from app.core.database import Base

class DocumentStar(Base):
    __tablename__ = "document_stars"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    document_id = Column(UUID(as_uuid=True), ForeignKey('documents.id'), nullable=False)
    starred_at = Column(DateTime(timezone=True), server_default=func.now())
    search_query = Column(String(500), nullable=True)  # The search query that led to this document
    
    # Relationships
    user = relationship("User", backref="starred_documents")
    document = relationship("Document", backref="stars")
    
    # Unique constraint to prevent duplicate stars
    __table_args__ = (
        UniqueConstraint('user_id', 'document_id', name='_user_document_star_uc'),
    )

class SearchStar(Base):
    __tablename__ = "search_stars"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    search_id = Column(UUID(as_uuid=True), ForeignKey('search_queries.id'), nullable=False)
    starred_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", backref="starred_searches")
    search = relationship("SearchQuery", backref="stars")
    
    # Unique constraint
    __table_args__ = (
        UniqueConstraint('user_id', 'search_id', name='_user_search_star_uc'),
    )

class DocumentContribution(Base):
    __tablename__ = "document_contributions"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    document_id = Column(UUID(as_uuid=True), ForeignKey('documents.id'), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    is_edited = Column(Boolean, default=False)
    
    # Relationships
    user = relationship("User", backref="contributions")
    document = relationship("Document", backref="contributions")
    likes = relationship("ContributionLike", backref="contribution", cascade="all, delete-orphan")
    
    @property
    def like_count(self):
        return len(self.likes)
    
    def can_edit(self, current_time):
        """Check if contribution can still be edited (within 30 minutes)"""
        from datetime import timedelta
        time_passed = current_time - self.created_at
        return time_passed < timedelta(minutes=30)

class ContributionLike(Base):
    __tablename__ = "contribution_likes"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Integer, ForeignKey('users.id'), nullable=False)
    contribution_id = Column(UUID(as_uuid=True), ForeignKey('document_contributions.id'), nullable=False)
    liked_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", backref="contribution_likes")
    
    # Unique constraint
    __table_args__ = (
        UniqueConstraint('user_id', 'contribution_id', name='_user_contribution_like_uc'),
    )