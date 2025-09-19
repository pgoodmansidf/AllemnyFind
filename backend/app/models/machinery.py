# app/models/machinery.py
from sqlalchemy import Column, String, DateTime, Text, Float, JSON, Boolean, Integer, DECIMAL, Date, Index, ARRAY
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
import uuid
from pgvector.sqlalchemy import Vector
from app.core.database import Base

class Machinery(Base):
    __tablename__ = "machinery"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    
    # Core fields from CSV - INCLUDING ALL COLUMNS
    sector = Column(String(255), nullable=True, index=True)
    project_name = Column(String(500), nullable=True, index=True)  # Added
    sau_number = Column(String(100), nullable=True, index=True)    # Added - primary SAU
    description = Column(Text, nullable=False)
    manufacturer = Column(String(255), nullable=True, index=True)
    origin = Column(String(100), nullable=True)
    cost = Column(DECIMAL(15, 2), nullable=True)
    cost_index = Column(DECIMAL(10, 2), nullable=True)
    unit_of_measure = Column(String(50), nullable=True)
    unit = Column(String(50), nullable=True)
    production_year = Column(Integer, nullable=True)               # Added
    last_update = Column(Date, nullable=True)
    
    # SAU tracking - for multiple SAUs found in text
    sau_numbers = Column(ARRAY(String), nullable=True, index=True)
    project_numbers = Column(ARRAY(String), nullable=True)
    
    # Vector embedding for similarity search
    embedding = Column(Vector(dim=768), nullable=True)
    embedding_model = Column(String(100), default="nomic-embed-text:latest")
    
    # Search optimization
    search_text = Column(Text, nullable=True)
    
    # Metadata
    machinery_metadata = Column(JSON, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def __repr__(self):
        return f"<Machinery(description='{self.description[:50]}...', sau='{self.sau_number}')>"

# Create indexes for better search performance
Index('idx_machinery_search_text', Machinery.search_text)
Index('idx_machinery_sau', Machinery.sau_numbers)
Index('idx_machinery_sau_number', Machinery.sau_number)
Index('idx_machinery_project', Machinery.project_name)
Index('idx_machinery_sector_manufacturer', Machinery.sector, Machinery.manufacturer)