from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, Float, JSON, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from app.core.database import Base

class IngestionJob(Base):
    __tablename__ = "ingestion_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    source_path = Column(String(500), nullable=False)
    source_type = Column(String(50), nullable=False)  # local, network_share
    main_tag = Column(String(100), nullable=False)
    status = Column(String(50), default="pending")  # pending, queued, running, completed, failed, cancelled
    progress = Column(Float, default=0.0)
    total_files = Column(Integer, default=0)
    processed_files = Column(Integer, default=0)
    failed_files = Column(Integer, default=0)
    skipped_files = Column(Integer, default=0)
    embedding_model = Column(String(100), nullable=False)
    chunk_size = Column(Integer, default=1000)
    chunk_overlap = Column(Integer, default=200)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    error_message = Column(Text, nullable=True)
    configuration = Column(JSON, nullable=True)
    statistics = Column(JSON, nullable=True)

    # Relationships    user = relationship("User", backref="ingestion_jobs")
    def __repr__(self):
        return f"<IngestionJob(name='{self.name}', status='{self.status}')>"

class IngestionStatistics(Base):
    __tablename__ = "ingestion_statistics"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(UUID(as_uuid=True), nullable=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())
    files_per_minute = Column(Float, default=0.0)
    average_file_size = Column(Float, default=0.0)
    total_processing_time = Column(Float, default=0.0)
    memory_usage = Column(Float, default=0.0)
    cpu_usage = Column(Float, default=0.0)
    error_rate = Column(Float, default=0.0)
    throughput_mbps = Column(Float, default=0.0)
    doc_metadata = Column(JSON, nullable=True)

    def __repr__(self):
        return f"<IngestionStatistics(job_id='{self.job_id}', timestamp='{self.timestamp}')>"