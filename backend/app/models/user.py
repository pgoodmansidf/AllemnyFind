# app/models/user.py - OPTIMIZED VERSION
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.core.database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(100), unique=True, index=True, nullable=True)
    full_name = Column(String(100), nullable=True)
    hashed_password = Column(String(200), nullable=False)
    role = Column(String(20), default="standard", nullable=False)  # Changed from Enum
    department = Column(String(100), nullable=True)
    phone = Column(String(20), nullable=True)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    last_login = Column(DateTime(timezone=True), nullable=True)
    api_key = Column(String(100), nullable=True)
    
    # Optimized relationships with lazy loading control
    search_queries = relationship(
        "SearchQuery",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="select",  # Explicit lazy loading
        order_by="SearchQuery.created_at.desc()"
    )
    search_sessions = relationship(
        "SearchSession",
        back_populates="user",
        cascade="all, delete-orphan",
        lazy="select",
        order_by="SearchSession.last_activity.desc()"
    )
    
    def __repr__(self):
        return f"<User(username='{self.username}', email='{self.email}')>"

    @property
    def search_query_count(self):
        """Get count of search queries without loading them"""
        return len(self.search_queries) if hasattr(self, '_sa_instance_state') else 0

    @property
    def last_search_session(self):
        """Get the most recent search session"""
        if self.search_sessions:
            return self.search_sessions[0]  # Already ordered by last_activity desc
        return None

# Add database indexes for better performance
__table_args__ = (
    Index('idx_users_email_active', 'email', 'is_active'),
    Index('idx_users_username_active', 'username', 'is_active'),
    Index('idx_users_created_at', 'created_at'),
    Index('idx_users_last_login', 'last_login'),
)

# User role constants
class UserRole:
    STANDARD = "standard"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"