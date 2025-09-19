# app/models/innovate.py
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum, Boolean, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base
import enum

class SuggestionStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    IN_PROGRESS = "IN_PROGRESS"
    IMPLEMENTED = "IMPLEMENTED"

class SuggestionCategory(str, enum.Enum):
    FEATURE = "FEATURE"
    IMPROVEMENT = "IMPROVEMENT"
    BUG_FIX = "BUG_FIX"
    UI_UX = "UI_UX"
    PERFORMANCE = "PERFORMANCE"
    INTEGRATION = "INTEGRATION"
    OTHER = "OTHER"

class VoteType(str, enum.Enum):
    UPVOTE = "UPVOTE"
    DOWNVOTE = "DOWNVOTE"

class Suggestion(Base):
    __tablename__ = "suggestions"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=False)
    category = Column(Enum(SuggestionCategory), nullable=False, default=SuggestionCategory.OTHER)
    status = Column(Enum(SuggestionStatus), nullable=False, default=SuggestionStatus.PENDING)

    # User who submitted the suggestion
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Admin who approved/rejected
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    admin_notes = Column(Text, nullable=True)

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    approved_at = Column(DateTime(timezone=True), nullable=True)
    implemented_at = Column(DateTime(timezone=True), nullable=True)

    # Computed fields (can be calculated from votes)
    upvotes_count = Column(Integer, default=0)
    downvotes_count = Column(Integer, default=0)
    total_score = Column(Integer, default=0)  # upvotes - downvotes

    # Priority and visibility
    priority = Column(Integer, default=0)  # Higher number = higher priority
    is_featured = Column(Boolean, default=False)

    # Relationships
    votes = relationship("SuggestionVote", back_populates="suggestion", cascade="all, delete-orphan")
    submitter = relationship("User", foreign_keys=[user_id])
    approver = relationship("User", foreign_keys=[admin_id])

    def __repr__(self):
        return f"<Suggestion(id={self.id}, title='{self.title}', status='{self.status}')>"

class SuggestionVote(Base):
    __tablename__ = "suggestion_votes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    suggestion_id = Column(Integer, ForeignKey("suggestions.id"), nullable=False)
    vote_type = Column(Enum(VoteType), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    user = relationship("User")
    suggestion = relationship("Suggestion", back_populates="votes")

    # Ensure one vote per user per suggestion
    __table_args__ = (
        Index('idx_user_suggestion_unique', 'user_id', 'suggestion_id', unique=True),
    )

    def __repr__(self):
        return f"<SuggestionVote(user_id={self.user_id}, suggestion_id={self.suggestion_id}, vote='{self.vote_type}')>"

class SuggestionComment(Base):
    __tablename__ = "suggestion_comments"

    id = Column(Integer, primary_key=True, index=True)
    suggestion_id = Column(Integer, ForeignKey("suggestions.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    is_admin_response = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # Relationships
    suggestion = relationship("Suggestion")
    user = relationship("User")

    def __repr__(self):
        return f"<SuggestionComment(id={self.id}, suggestion_id={self.suggestion_id})>"