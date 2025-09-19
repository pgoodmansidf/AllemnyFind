from sqlalchemy import Column, Integer, String, DateTime, Text, Float, JSON, Boolean, LargeBinary, Index, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship
import uuid
from pgvector.sqlalchemy import Vector
from app.core.database import Base

class Document(Base):
    __tablename__ = "documents"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    filename = Column(String(255), nullable=False, index=True)
    original_path = Column(String(500), nullable=False)
    file_type = Column(String(50), nullable=False, index=True)
    file_size = Column(Integer, nullable=False)
    mime_type = Column(String(100), nullable=True)
    encoding = Column(String(50), nullable=True)
    
    # Enhanced metadata fields
    title = Column(String(500), nullable=True)
    author = Column(String(200), nullable=True)
    creation_date = Column(DateTime(timezone=True), nullable=True)
    modification_date = Column(DateTime(timezone=True), nullable=True)
    
    # Content and storage
    content = Column(Text, nullable=True)
    content_hash = Column(String(64), nullable=False, unique=True, index=True)
    
    # Binary storage for small files
    file_data = Column(LargeBinary, nullable=True)  # For files ≤10MB
    storage_path = Column(String(500), nullable=True)  # For files >10MB
    storage_type = Column(String(20), default="database")  # "database" or "filesystem"
    
    # AI-generated content
    summary = Column(Text, nullable=True)
    main_topics = Column(ARRAY(String), nullable=True)
    product_tags = Column(ARRAY(String), nullable=True)
    
    # Table metadata for spreadsheets
    has_tables = Column(Boolean, default=False)
    table_count = Column(Integer, default=0)
    table_metadata = Column(JSON, nullable=True)  # Structured table info
    
    # Metadata
    doc_metadata = Column(JSON, nullable=True)
    main_tag = Column(String(100), nullable=True, index=True)
    
    # Ingestion Job Relation
    ingestion_job_id = Column(UUID(as_uuid=True), ForeignKey('ingestion_jobs.id'), nullable=False)
    ingestion_job = relationship("IngestionJob", backref="documents")
    
    # Processing Status
    processing_status = Column(String(50), default="pending", index=True)
    error_message = Column(Text, nullable=True)
    total_chunks = Column(Integer, default=0)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    processed_at = Column(DateTime(timezone=True), nullable=True)
    
    def __repr__(self):
        return f"<Document(filename='{self.filename}', status='{self.processing_status}')>"

class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    document_id = Column(UUID(as_uuid=True), ForeignKey('documents.id'), nullable=False, index=True)
    document = relationship("Document", backref="chunks")
    chunk_index = Column(Integer, nullable=False)
    
    # Content
    content = Column(Text, nullable=False)
    content_hash = Column(String(64), nullable=False, index=True)
    token_count = Column(Integer, nullable=True)
    
    # Embedding - using 1536 dimensions for OpenAI compatibility
    embedding = Column(Vector(dim=768), nullable=True)
    embedding_model = Column(String(100), nullable=True)
    
    # Enhanced metadata
    chunk_metadata = Column(JSON, nullable=True)
    chunk_type = Column(String(50), default="text")  # "text", "table", "list", etc.
    
    # Table-specific metadata
    is_table = Column(Boolean, default=False)
    table_name = Column(String(200), nullable=True)
    table_headers = Column(ARRAY(String), nullable=True)
    table_summary = Column(Text, nullable=True)
    
    # Document structure
    page_number = Column(Integer, nullable=True)
    section_hierarchy = Column(ARRAY(String), nullable=True)  # ["Chapter 1", "Section 1.2", "Subsection 1.2.3"]
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def __repr__(self):
        return f"<DocumentChunk(document_id='{self.document_id}', chunk_index={self.chunk_index}, type='{self.chunk_type}')>"

# Indexes for better performance
Index('idx_chunks_doc_embedding', DocumentChunk.document_id, DocumentChunk.embedding_model)
Index('idx_chunks_type', DocumentChunk.chunk_type)
Index('idx_chunks_table', DocumentChunk.is_table)