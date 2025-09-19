# app/models/user.py - UPDATED VERSION
from sqlalchemy import Column, Integer, String, Boolean, DateTime
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
    
    # Relationships
    search_queries = relationship("SearchQuery", back_populates="user", cascade="all, delete-orphan")
    search_sessions = relationship("SearchSession", back_populates="user", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<User(username='{self.username}', email='{self.email}')>"

# User role constants
class UserRole:
    STANDARD = "standard"
    ADMIN = "admin"
    SUPER_ADMIN = "super_admin"