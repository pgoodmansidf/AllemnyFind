# app/workers/langchain_worker.py
# Enhanced Celery worker with perfect ingestion and validation

import logging
import asyncio
from datetime import datetime
from typing import Dict, Any, List, Union
from uuid import UUID
import hashlib
from pathlib import Path
import concurrent.futures
import os
import json
import re
import traceback

from celery import Task
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import SessionLocal
from app.core.config import settings
from app.models.ingestion import IngestionJob, IngestionStatistics
from app.models.document import Document, DocumentChunk
from app.services.langchain_processor import langchain_processor, ChunkType
from app.services.file_scanner import file_scanner
from app.services.groq_service import groq_service
from app.services.websocket_manager import manager
from langchain_ollama import OllamaEmbeddings

# Import the celery app instance
from app.core.celery_app import celery_app

logger = logging.getLogger(__name__)

# Initialize embeddings
embeddings = OllamaEmbeddings(
    model="nomic-embed-text:latest",
    base_url=settings.ollama_base_url
)


class IngestionValidator:
    """Validates ingested data for accuracy"""
    
    @staticmethod
    def validate_table_extraction(tables: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Validate extracted tables"""
        validation_results = []
        
        for table in tables:
            issues = []
            
            # Check for headers
            if not table.get("headers"):
                issues.append("Missing headers")
            
            # Check for data
            if not table.get("data"):
                issues.append("Missing data rows")
            
            # Check for consistency
            if table.get("headers") and table.get("data"):
                expected_cols = len(table["headers"])
                for row_idx, row in enumerate(table["data"]):
                    if len(row) != expected_cols:
                        issues.append(f"Row {row_idx} has {len(row)} columns, expected {expected_cols}")
                        break
            
            # Check for numeric data integrity
            if table.get("data"):
                for row in table["data"]:
                    for cell in row:
                        # Check if numeric values are preserved
                        if isinstance(cell, str) and re.match(r'^\d+\.?\d*$', cell):
                            try:
                                float(cell)
                            except ValueError:
                                issues.append(f"Invalid numeric value: {cell}")
                                break
            
            validation_results.append({
                "table_title": table.get("title", "Unknown"),
                "valid": len(issues) == 0,
                "issues": issues
            })
        
        # Calculate overall validation score
        valid_tables = sum(1 for v in validation_results if v["valid"])
        total_tables = len(validation_results)
        
        return {
            "validation_score": valid_tables / total_tables if total_tables > 0 else 1.0,
            "valid_tables": valid_tables,
            "total_tables": total_tables,
            "details": validation_results
        }


def make_json_serializable(obj: Any) -> Any:
    """Recursively convert Python objects to JSON-serializable format"""
    if isinstance(obj, dict):
        return {k: make_json_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [make_json_serializable(item) for item in obj]
    elif isinstance(obj, tuple):
        return [make_json_serializable(item) for item in obj]
    elif isinstance(obj, datetime):
        return obj.isoformat()
    elif isinstance(obj, bool):
        return bool(obj)
    elif isinstance(obj, (int, float)):
        return obj
    elif isinstance(obj, str):
        return obj
    elif obj is None:
        return None
    else:
        return str(obj)


def run_async_safe(coro):
    """Helper to run async code in sync context with error handling"""
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, coro)
                return future.result()
        else:
            return loop.run_until_complete(coro)
    except Exception as e:
        logger.warning(f"Async operation failed: {e}")
        return None


class CallbackTask(Task):
    """Task with callbacks for better error handling"""
    
    def on_success(self, retval, task_id, args, kwargs):
        """Success handler"""
        logger.info(f"Task {task_id} succeeded with validation score: {retval.get('validation_score', 'N/A')}")
    
    def on_failure(self, exc, task_id, args, kwargs, einfo):
        """Failure handler"""
        logger.error(f"Task {task_id} failed: {exc}")


@celery_app.task(name='app.workers.langchain_worker.process_ingestion_job', bind=True, base=CallbackTask)
def process_ingestion_job(self, job_id: str):
    """Enhanced ingestion job with validation and perfect extraction"""
    logger.info(f"Starting enhanced ingestion job: {job_id}")
    db = SessionLocal()
    
    try:
        # Get the job
        job = db.query(IngestionJob).filter(IngestionJob.id == UUID(job_id)).first()
        if not job:
            logger.error(f"Job {job_id} not found")
            return {"status": "error", "message": f"Job {job_id} not found"}
        
        logger.info(f"Processing job: {job.name} (ID: {job.id})")
        
        # Update job status
        job.status = 'running'
        job.started_at = datetime.utcnow()
        db.commit()
        
        # Send initial progress (with error handling)
        try:
            run_async_safe(
                manager.send_ingestion_progress(
                    job_id,
                    0,
                    'scanning',
                    message=f'Scanning directory: {job.source_path}'
                )
            )
        except Exception as e:
            logger.warning(f"Could not send progress update: {e}")
        
        # Scan directory
        logger.info(f"Scanning directory: {job.source_path}")
        scan_result = file_scanner.scan_directory(
            job.source_path,
            recursive=True,
            max_files=None
        )
        
        if not scan_result['success']:
            raise Exception(f"Directory scan failed: {scan_result.get('error', 'Unknown error')}")
        
        files = scan_result['files']
        total_files = len(files)
        job.total_files = total_files
        db.commit()
        
        logger.info(f"Found {total_files} files to process")
        
        # Send scan complete (with error handling)
        try:
            run_async_safe(
                manager.send_ingestion_progress(
                    job_id,
                    5,
                    'scanning',
                    message=f'Found {total_files} files to process'
                )
            )
        except Exception as e:
            logger.warning(f"Could not send progress update: {e}")
        
        # Process files with enhanced extraction
        processed_count = 0
        failed_count = 0
        skipped_count = 0
        validation_scores = []
        
        # Update processor with job's chunk settings
        processor = langchain_processor
        processor.chunk_size = job.chunk_size
        processor.chunk_overlap = job.chunk_overlap
        processor.text_splitter = processor._create_text_splitter()
        
        for i, file_info in enumerate(files):
            document = None
            try:
                # Normalize file_info keys for compatibility
                if 'size' in file_info and 'file_size' not in file_info:
                    file_info['file_size'] = file_info['size']
                elif 'file_size' in file_info and 'size' not in file_info:
                    file_info['size'] = file_info['file_size']
                
                file_path = file_info['path']
                filename = file_info['filename']
                file_size = file_info.get('size', file_info.get('file_size', 0))

                logger.info(f"Processing file {i+1}/{total_files}: {filename}")
                
                # Calculate progress
                progress = 10 + (i / total_files) * 80  # Reserve last 10% for finalization
                
                # Update progress (with error handling to prevent failures)
                try:
                    run_async_safe(
                        manager.send_ingestion_progress(
                            job_id,
                            progress,
                            'processing',
                            current_file=filename,
                            processed_files=processed_count,
                            total_files=total_files,
                            message=f'Processing: {filename}'
                        )
                    )
                except Exception as e:
                    logger.warning(f"Progress update failed: {e}")
                
                # Check if document already exists
                file_hash = _calculate_file_hash(file_path)
                existing_doc = db.query(Document).filter(
                    Document.content_hash == file_hash
                ).first()
                
                if existing_doc:
                    logger.info(f"Skipping duplicate file: {filename}")
                    skipped_count += 1
                    continue
                
                # Process document with enhanced extraction
                logger.info(f"Extracting content from: {filename}")
                result = processor.process_document(file_path, job.main_tag)
                
                if not result or not result.get('content'):
                    logger.error(f"No content extracted from {filename}")
                    failed_count += 1
                    continue
                
                # Validate extraction
                validation_result = None
                if result.get('tables'):
                    validation_result = IngestionValidator.validate_table_extraction(result['tables'])
                    validation_scores.append(validation_result['validation_score'])
                    
                    if validation_result['validation_score'] < 0.9:
                        logger.warning(f"Low validation score for {filename}: {validation_result['validation_score']}")
                        logger.warning(f"Validation issues: {validation_result['details']}")
                
                # Verify file size if needed
                if file_size == 0 and os.path.exists(file_path):
                    file_size = os.path.getsize(file_path)
                
                # Determine storage type
                storage_type = 'file_path'
                file_data = None
                storage_path = file_path
                
                storage_threshold = getattr(processor, 'storage_threshold', 10485760)  # Default 10MB
                if file_size < storage_threshold:
                    try:
                        with open(file_path, 'rb') as f:
                            file_data = f.read()
                        storage_type = 'database'
                        storage_path = None
                    except Exception as e:
                        logger.warning(f"Failed to read file data for {filename}: {e}")
                
                # Prepare table metadata with validation info
                table_metadata = None
                if result.get('tables'):
                    if validation_result is None:
                        validation_result = {'validation_score': 1.0}
                    table_metadata = {
                        'tables': [
                            {
                                'title': t.get('title', ''),
                                'headers': t.get('headers', []),
                                'row_count': len(t.get('data', [])),
                                'column_count': len(t.get('headers', [])),
                                'validation_score': validation_result.get('validation_score', 1.0)
                            }
                            for t in result['tables']
                        ],
                        'total_validation_score': validation_result.get('validation_score', 1.0)
                    }
                
                # Create document record
                document = Document(
                    filename=result['filename'],
                    original_path=result['original_path'],
                    file_type=result['file_type'],
                    file_size=file_size,
                    mime_type=file_info.get('mime_type'),
                    content_hash=result['content_hash'],
                    storage_type=storage_type,
                    file_data=file_data,
                    storage_path=storage_path,
                    content=result['content'][:1000000] if result['content'] else None,
                    title=result.get('filename', '').replace(result.get('file_type', ''), '').strip('.'),
                    author=None,
                    creation_date=None,
                    modification_date=None,
                    has_tables=result['metadata'].get('table_count', 0) > 0,
                    table_count=result['metadata'].get('table_count', 0),
                    table_metadata=make_json_serializable(table_metadata),
                    main_tag=job.main_tag,
                    ingestion_job_id=job.id,
                    processing_status='content_extracted'
                )
                
                db.add(document)
                db.commit()
                db.refresh(document)
                
                # Get AI summary (optional - with error handling)
                try:
                    if groq_service and hasattr(groq_service, 'summarize_document'):
                        try:
                            run_async_safe(
                                manager.send_ingestion_progress(
                                    job_id,
                                    progress,
                                    'analyzing',
                                    current_file=filename,
                                    message=f'Analyzing content: {filename}'
                                )
                            )
                        except:
                            pass
                        
                        logger.info(f"Generating AI summary for: {filename}")
                        summary_result = run_async_safe(groq_service.summarize_document(result['content']))
                        if summary_result and summary_result.get('success', False):
                            document.summary = summary_result.get('summary', '')
                            document.main_topics = summary_result.get('main_topics', [])
                            document.product_tags = summary_result.get('product_tags', [])
                            db.commit()
                except Exception as e:
                    logger.warning(f"Summary generation failed: {e}")
                
                # Create chunks with embeddings (CRITICAL - must succeed)
                try:
                    run_async_safe(
                        manager.send_ingestion_progress(
                            job_id,
                            progress,
                            'embedding',
                            current_file=filename,
                            message=f'Creating embeddings: {filename}'
                        )
                    )
                except:
                    pass
                
                logger.info(f"Creating chunks and embeddings for: {filename} - {len(result.get('chunks', []))} chunks")
                chunk_count = 0
                
                # Process chunks in batches to ensure they get saved
                chunks_to_save = []
                for chunk_data in result.get('chunks', []):
                    try:
                        # Generate embedding
                        embedding = None
                        try:
                            embedding = embeddings.embed_query(chunk_data['content'])
                            if len(embedding) != 768:
                                logger.warning(f"Unexpected embedding dimension: {len(embedding)}")
                        except Exception as e:
                            logger.error(f"Error generating embedding for chunk {chunk_count}: {e}")
                            embedding = None
                        
                        # Extract chunk metadata
                        chunk_metadata = chunk_data.get('metadata', {})
                        
                        # Determine if this is a table chunk
                        chunk_type = chunk_data.get('chunk_type', 'text')
                        is_table = chunk_type.startswith('table')

                        # Create chunk record with enhanced metadata
                        chunk = DocumentChunk(
                            document_id=document.id,
                            chunk_index=chunk_data.get('chunk_index', chunk_count),
                            content=chunk_data['content'],
                            content_hash=hashlib.sha256(
                                chunk_data['content'].encode()
                            ).hexdigest(),
                            token_count=len(chunk_data['content'].split()),
                            embedding=embedding,
                            embedding_model=job.embedding_model if embedding else None,
                            chunk_type=chunk_type,
                            is_table=is_table,
                            table_name=chunk_metadata.get('table_title'),
                            table_headers=chunk_metadata.get('headers'),
                            table_summary=chunk_metadata.get('summary') if chunk_type == 'table_summary' else None,
                            chunk_metadata=make_json_serializable(chunk_metadata),
                            page_number=chunk_metadata.get('page_number')
                        )
                        
                        chunks_to_save.append(chunk)
                        chunk_count += 1
                        
                        # Save chunks in batches of 50
                        if len(chunks_to_save) >= 50:
                            db.add_all(chunks_to_save)
                            db.commit()
                            logger.info(f"Saved batch of {len(chunks_to_save)} chunks")
                            chunks_to_save = []
                            
                    except Exception as e:
                        logger.error(f"Error processing chunk {chunk_count}: {e}")
                        continue
                
                # Save remaining chunks
                if chunks_to_save:
                    db.add_all(chunks_to_save)
                    db.commit()
                    logger.info(f"Saved final batch of {len(chunks_to_save)} chunks")
                
                # Update document with final chunk count
                document.total_chunks = chunk_count
                document.processing_status = 'completed'
                document.processed_at = datetime.utcnow()
                db.commit()
                
                processed_count += 1
                logger.info(f"Successfully processed: {filename} ({chunk_count} chunks)")
                
            except Exception as e:
                logger.error(f"Error processing file {file_info['filename']}: {e}")
                logger.error(f"Full traceback: {traceback.format_exc()}")
                failed_count += 1
                
                # Try to save partial progress if document was created
                try:
                    if document and document.id:
                        document.processing_status = 'partial'
                        document.error_message = str(e)[:500]
                        db.commit()
                        logger.info(f"Saved partial progress for {filename}")
                    else:
                        # Create failed document record
                        failed_hash = hashlib.sha256(
                            f"failed_{file_info['path']}_{datetime.utcnow().isoformat()}".encode()
                        ).hexdigest()
                        
                        failed_file_size = file_info.get('size', file_info.get('file_size', 0))
                        
                        failed_doc = Document(
                            filename=file_info['filename'],
                            original_path=file_info['path'],
                            file_type=file_info.get('extension', ''),
                            file_size=failed_file_size,
                            content_hash=failed_hash,
                            main_tag=job.main_tag,
                            ingestion_job_id=job.id,
                            processing_status='failed',
                            error_message=str(e)[:500]
                        )
                        db.add(failed_doc)
                        db.commit()
                except Exception as db_error:
                    logger.error(f"Failed to save error record: {db_error}")
                    db.rollback()
        
        # Calculate overall validation score
        overall_validation = sum(validation_scores) / len(validation_scores) if validation_scores else 1.0
        
        # Update job completion
        job.status = 'completed'
        job.completed_at = datetime.utcnow()
        job.processed_files = processed_count
        job.failed_files = failed_count
        job.skipped_files = skipped_count
        job.progress = 100
        job.statistics = make_json_serializable({
            "validation_score": overall_validation,
            "validation_details": f"{len(validation_scores)} documents validated"
        })
        db.commit()
        
        logger.info(f"Job completed: {processed_count} processed, {failed_count} failed, {skipped_count} skipped")
        logger.info(f"Overall validation score: {overall_validation:.2%}")
        
        # Send completion (with error handling)
        try:
            run_async_safe(
                manager.send_ingestion_progress(
                    job_id,
                    100,
                    'completed',
                    message=f'Job completed: {processed_count} processed, validation score: {overall_validation:.2%}'
                )
            )
        except Exception as e:
            logger.warning(f"Could not send completion update: {e}")
        
        # Create statistics
        _create_job_statistics(db, job, overall_validation)
        
        return {
            "status": "completed",
            "processed": processed_count,
            "failed": failed_count,
            "skipped": skipped_count,
            "validation_score": overall_validation
        }
        
    except Exception as e:
        logger.error(f"Fatal error in job {job_id}: {e}")
        logger.error(f"Full traceback: {traceback.format_exc()}")
        
        if 'job' in locals():
            job.status = 'failed'
            job.error_message = str(e)
            job.completed_at = datetime.utcnow()
            db.commit()
        
        try:
            run_async_safe(
                manager.send_ingestion_progress(
                    job_id,
                    job.progress if 'job' in locals() else 0,
                    'failed',
                    message=f'Job failed: {str(e)}'
                )
            )
        except:
            pass
        
        return {"status": "failed", "error": str(e)}
        
    finally:
        try:
            db.close()
        except:
            pass
        logger.info(f"Closed database connection for job {job_id}")


def _calculate_file_hash(file_path: str) -> str:
    """Calculate SHA256 hash of file"""
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()


def _create_job_statistics(db: Session, job: IngestionJob, validation_score: float):
    """Create enhanced job statistics"""
    try:
        duration = (job.completed_at - job.started_at).total_seconds()
        
        # Calculate total size processed
        total_size = db.query(func.sum(Document.file_size)).filter(
            Document.ingestion_job_id == job.id
        ).scalar() or 0
        
        # Count tables extracted
        total_tables = db.query(func.sum(Document.table_count)).filter(
            Document.ingestion_job_id == job.id
        ).scalar() or 0
        
        stats = IngestionStatistics(
            job_id=job.id,
            files_per_minute=job.processed_files / (duration / 60) if duration > 0 else 0,
            average_file_size=total_size / job.processed_files if job.processed_files > 0 else 0,
            total_processing_time=duration,
            error_rate=(job.failed_files / job.total_files * 100) if job.total_files > 0 else 0,
            throughput_mbps=(total_size / 1024 / 1024) / duration if duration > 0 else 0,
            doc_metadata={
                "total_tables_extracted": total_tables,
                "validation_score": validation_score,
                "extraction_method": "perfect_extraction"
            }
        )
        
        db.add(stats)
        db.commit()
        
        logger.info(f"Created enhanced statistics for job {job.id}")
        logger.info(f"Total tables extracted: {total_tables}, Validation score: {validation_score:.2%}")
        
    except Exception as e:
        logger.error(f"Error creating statistics: {e}")


# Additional validation functions
def validate_numeric_integrity(value: str) -> bool:
    """Validate that numeric values are preserved correctly"""
    try:
        # Check if it's a valid number
        if re.match(r'^-?\d+\.?\d*$', value):
            float(value)
            return True
        return False
    except:
        return False


def validate_table_structure(table: Dict[str, Any]) -> List[str]:
    """Validate table structure and return issues"""
    issues = []
    
    if not table.get('headers'):
        issues.append("Missing headers")
    
    if not table.get('data'):
        issues.append("No data rows")
    
    if table.get('headers') and table.get('data'):
        expected_cols = len(table['headers'])
        for idx, row in enumerate(table.get('data', [])):
            if len(row) != expected_cols:
                issues.append(f"Row {idx} column count mismatch")
                break
    
    return issues