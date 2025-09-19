from sqlalchemy import Column, Integer, String, DateTime, Text, Float, JSON, Boolean, LargeBinary, Index, ForeignKey, DECIMAL, Date
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID, ARRAY, TSVECTOR
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
    
    # NEW: Project-specific metadata
    main_city = Column(String(200), nullable=True, index=True)
    project_number = Column(ARRAY(String), nullable=True)
    companies = Column(ARRAY(String), nullable=True)
    project_date = Column(Date, nullable=True, index=True)
    
    # Content and storage
    content = Column(Text, nullable=True)
    content_hash = Column(String(64), nullable=False, unique=True, index=True)
    content_tsvector = Column(TSVECTOR, nullable=True)  # NEW: Full-text search vector
    
    # Binary storage for small files
    file_data = Column(LargeBinary, nullable=True)
    storage_path = Column(String(500), nullable=True)
    storage_type = Column(String(20), default="database")
    
    # AI-generated content
    summary = Column(Text, nullable=True)
    main_topics = Column(ARRAY(String), nullable=True)
    product_tags = Column(ARRAY(String), nullable=True)
    
    # Table metadata for spreadsheets
    has_tables = Column(Boolean, default=False)
    table_count = Column(Integer, default=0)
    table_metadata = Column(JSON, nullable=True)
    
    # NEW: Enhanced extraction metadata
    extraction_metadata = Column(JSON, nullable=True)
    
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
    
    # Relationships
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")
    table_cells = relationship("TableCell", back_populates="document", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Document(filename='{self.filename}', status='{self.processing_status}')>"

class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    document_id = Column(UUID(as_uuid=True), ForeignKey('documents.id'), nullable=False, index=True)
    document = relationship("Document", back_populates="chunks")
    chunk_index = Column(Integer, nullable=False)
    
    # Content
    content = Column(Text, nullable=False)
    content_hash = Column(String(64), nullable=False, index=True)
    content_tsvector = Column(TSVECTOR, nullable=True)  # NEW: Full-text search
    token_count = Column(Integer, nullable=True)
    
    # Embeddings - supporting both dimensions
    embedding = Column(Vector(dim=768), nullable=True)  # Current Nomic
    embedding_1024 = Column(Vector(dim=1024), nullable=True)  # NEW: BGE-M3
    embedding_model = Column(String(100), nullable=True)
    
    # NEW: Lexical features for hybrid search
    lexical_weights = Column(JSON, nullable=True)
    
    # Enhanced metadata
    chunk_metadata = Column(JSON, nullable=True)
    chunk_type = Column(String(50), default="text")
    
    # NEW: Chunk relationships
    parent_chunk_id = Column(UUID(as_uuid=True), nullable=True)
    child_chunk_ids = Column(ARRAY(UUID(as_uuid=True)), nullable=True)
    
    # Table-specific metadata
    is_table = Column(Boolean, default=False)
    table_name = Column(String(200), nullable=True)
    table_headers = Column(ARRAY(String), nullable=True)
    table_summary = Column(Text, nullable=True)
    
    # Document structure
    page_number = Column(Integer, nullable=True)
    section_hierarchy = Column(ARRAY(String), nullable=True)
    
    # NEW: Summary and relevance
    chunk_summary = Column(Text, nullable=True)
    relevance_score = Column(Float, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    table_cells = relationship("TableCell", back_populates="chunk", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<DocumentChunk(document_id='{self.document_id}', chunk_index={self.chunk_index}, type='{self.chunk_type}')>"

class TableCell(Base):
    """NEW: Table for cell-level search and retrieval"""
    __tablename__ = "table_cells"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    document_id = Column(UUID(as_uuid=True), ForeignKey('documents.id'), nullable=False, index=True)
    document = relationship("Document", back_populates="table_cells")
    
    chunk_id = Column(UUID(as_uuid=True), ForeignKey('document_chunks.id'), nullable=True, index=True)
    chunk = relationship("DocumentChunk", back_populates="table_cells")
    
    # Table identification
    table_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    table_title = Column(Text, nullable=True)
    table_index = Column(Integer, nullable=True)
    
    # Cell location
    row_index = Column(Integer, nullable=False)
    col_index = Column(Integer, nullable=False)
    
    # Cell content
    cell_value = Column(Text, nullable=True)
    cell_type = Column(String(50), nullable=True)  # text, number, date, currency, percentage
    
    # Headers for context
    row_header = Column(Text, nullable=True)
    col_header = Column(Text, nullable=True)
    
    # Parsed values for structured queries
    numeric_value = Column(DECIMAL, nullable=True)
    date_value = Column(Date, nullable=True)
    currency_value = Column(DECIMAL, nullable=True)
    currency_code = Column(String(10), nullable=True)
    percentage_value = Column(DECIMAL, nullable=True)
    
    # Metadata and search
    document_metadata = Column(JSON, nullable=True)
    embedding = Column(Vector(dim=1024), nullable=True)  # BGE-M3
    embedding_768 = Column(Vector(dim=768), nullable=True)  # Nomic fallback
    search_text = Column(Text, nullable=True)
    search_vector = Column(TSVECTOR, nullable=True)
    
    # Quality and source
    confidence_score = Column(Float, default=1.0)
    extraction_method = Column(String(50), nullable=True)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    def __repr__(self):
        return f"<TableCell(table_id='{self.table_id}', row={self.row_index}, col={self.col_index}, value='{self.cell_value[:20] if self.cell_value else 'None'}...')>"

# Indexes for better performance
Index('idx_chunks_doc_embedding', DocumentChunk.document_id, DocumentChunk.embedding_model)
Index('idx_chunks_type', DocumentChunk.chunk_type)
Index('idx_chunks_table', DocumentChunk.is_table)
Index('idx_table_cells_composite', TableCell.document_id, TableCell.table_id, TableCell.row_index, TableCell.col_index)
Index('idx_table_cells_headers', TableCell.row_header, TableCell.col_header)
Index('idx_table_cells_numeric', TableCell.numeric_value)
Index('idx_table_cells_date', TableCell.date_value)