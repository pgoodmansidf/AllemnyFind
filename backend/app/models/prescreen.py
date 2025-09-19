# app/models/prescreen.py - NEW FILE
from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class PrescreenedUser(Base):
    __tablename__ = "prescreened_users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(100), unique=True, index=True, nullable=False)
    full_name = Column(String(100), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    created_by = Column(Integer, nullable=True)  # Admin who added this user
    is_registered = Column(Boolean, default=False, nullable=False)  # Track if user has registered
    
    def __repr__(self):
        return f"<PrescreenedUser(email='{self.email}', full_name='{self.full_name}')>"