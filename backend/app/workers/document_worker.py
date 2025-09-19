import logging
import asyncio
import hashlib
import requests
import json
from datetime import datetime, timezone
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from celery import current_task, group
from celery.exceptions import Retry, Ignore
from sqlalchemy.exc import SQLAlchemyError # Import for specific SQLAlchemy error handling

from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.document import Document, DocumentChunk
from app.models.ingestion import IngestionJob, IngestionStatistics
from app.services.document_processor import document_processor
from app.services.embedding_service import embedding_service
from app.services.groq_service import groq_service
from app.services.file_scanner import file_scanner
import time
import concurrent.futures
import threading

logger = logging.getLogger(__name__)

def create_sync_embeddings_batch(texts: List[str], model: str = "nomic-embed-text", batch_size: int = 10) -> List[List[float]]:
    """
    Create embeddings in batches using concurrent requests for much faster processing
    """
    embeddings = [None] * len(texts)
    ollama_url = "http://localhost:11434/api/embeddings"
    
    def process_single_embedding(index_text_tuple):
        index, text = index_text_tuple
        try:
            payload = {
                "model": model,
                "prompt": text
            }
            
            response = requests.post(
                ollama_url,
                json=payload,
                timeout=30  # Reduced timeout since we're processing in parallel
            )
            
            if response.status_code == 200:
                result = response.json()
                embedding = result.get('embedding', [])
                if embedding:
                    logger.debug(f"Successfully created embedding {index + 1}/{len(texts)}")
                    return index, embedding
                else:
                    logger.error(f"No embedding returned for text at index {index}")
                    return index, []
            else:
                logger.error(f"Ollama request failed for index {index}: {response.status_code} - {response.text}")
                return index, []
                
        except requests.exceptions.Timeout:
            logger.error(f"Timeout creating embedding for index {index}")
            return index, []
        except Exception as e:
            logger.error(f"Error creating embedding {index}: {e}")
            return index, []
    
    # Process embeddings in parallel batches
    logger.info(f"Creating embeddings for {len(texts)} text chunks in batches of {batch_size}")
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=batch_size) as executor:
        # Submit all tasks
        future_to_index = {}
        for i, text in enumerate(texts):
            future = executor.submit(process_single_embedding, (i, text))
            future_to_index[future] = i
        
        # Collect results as they complete
        completed = 0
        for future in concurrent.futures.as_completed(future_to_index):
            try:
                index, embedding = future.result()
                embeddings[index] = embedding
                completed += 1
                if completed % 10 == 0:
                    logger.info(f"Embedding progress: {completed}/{len(texts)}")
            except Exception as e:
                index = future_to_index[future]
                logger.error(f"Failed to get result for embedding {index}: {e}")
                embeddings[index] = []
    
    # Convert None to empty lists for any failed embeddings
    embeddings = [e if e is not None else [] for e in embeddings]
    
    successful_embeddings = len([e for e in embeddings if e])
    logger.info(f"Completed embedding generation: {successful_embeddings}/{len(texts)} successful")
    
    return embeddings

def chunk_text_simple(text: str, chunk_size: int = 1000, chunk_overlap: int = 200) -> List[str]:
    """
    Simple text chunking without async dependencies
    """
    if len(text) <= chunk_size:
        return [text]
    
    chunks = []
    start = 0
    
    while start < len(text):
        end = start + chunk_size
        
        # Try to break at a word boundary
        if end < len(text):
            # Look for the last space in the chunk
            last_space = text.rfind(' ', start, end)
            if last_space > start:
                end = last_space
        
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        
        # Move start position with overlap
        start = end - chunk_overlap if end - chunk_overlap > start else end
        
        if start >= len(text):
            break
    
    return chunks

def create_chunks_with_embeddings_sync(content: str, embedding_model: str, chunk_size: int, chunk_overlap: int):
    """
    Chunking and embedding with batch processing for better performance
    """
    # Simple chunking
    text_chunks = chunk_text_simple(content, chunk_size, chunk_overlap)
    logger.info(f"Created {len(text_chunks)} text chunks")
    
    # Create embeddings using batch processing
    embeddings = create_sync_embeddings_batch(text_chunks, embedding_model)
    logger.info(f"Created {len([e for e in embeddings if e])} embeddings")
    
    # Combine chunks with embeddings
    chunks_with_embeddings = []
    for i, (text, embedding) in enumerate(zip(text_chunks, embeddings)):
        chunks_with_embeddings.append({
            'text': text,
            'embedding': embedding,
            'index': i
        })
    
    return chunks_with_embeddings

def create_summary_sync(content: str, document_metadata: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Simplified synchronous summary creation without ThreadPoolExecutor overhead
    """
    try:
        # Create a new event loop for this thread
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            # Run the async function with a timeout
            result = asyncio.wait_for(
                groq_service.summarize_document(content, document_metadata),
                timeout=120  # 2 minute timeout
            )
            result = loop.run_until_complete(result)
            return result
        finally:
            loop.close()
            
    except asyncio.TimeoutError:
        logger.error("Summary generation timed out after 2 minutes")
        return {
            'summary': 'Summary generation timed out',
            'executive_summary': 'Timeout occurred during summary generation',
            'main_topics': [],
            'product_tags': [],
            'success': False,
            'error': 'Timeout after 2 minutes'
        }
    except Exception as e:
        logger.error(f"Error in summary generation: {e}")
        return {
            'summary': f'Summary generation failed: {str(e)}',
            'executive_summary': 'Failed to generate summary',
            'main_topics': [],
            'product_tags': [],
            'success': False,
            'error': str(e)
        }

def generate_content_hash(content: str) -> str:
    """Generate MD5 hash of content"""
    return hashlib.md5(content.encode('utf-8')).hexdigest()

@celery_app.task(bind=True, name='app.workers.document_worker.test_task')
def test_task(self, message="Hello World"):
    """Simple test task for debugging"""
    logger.info(f"TEST TASK EXECUTED: {message}")
    return f"Task completed: {message}"

@celery_app.task(bind=True, name='app.workers.document_worker.process_document')
def process_document(self, document_data: Dict[str, Any], job_id: str, embedding_model: str = "nomic-embed-text"):
    """Process a single document with optimized database operations"""
    task_id = self.request.id
    db = SessionLocal()
    document = None
    
    try:
        filename = document_data.get('filename', 'Unknown')
        logger.info(f"=== STARTING DOCUMENT PROCESSING: {filename} (Task: {task_id}) ===")
        
        # Update task progress
        try:
            self.update_state(
                state='PROGRESS',
                meta={
                    'job_id': job_id,
                    'document_name': filename,
                    'stage': 'extracting_content',
                    'progress': 10
                }
            )
        except Exception as e:
            logger.warning(f"Could not update task state: {e}")

        # Extract content
        logger.info(f"Extracting content from: {document_data['path']}")
        extracted_data = document_processor.extract_content(
            file_path=document_data['path'],
            mime_type=document_data['mime_type']
        )
        
        if not extracted_data or not extracted_data.get('content'):
            error_msg = "Could not extract content from document"
            logger.error(error_msg)
            raise ValueError(error_msg)

        content = extracted_data['content']
        logger.info(f"Content extracted successfully. Length: {len(content)}")

        # Generate content hash
        content_hash = generate_content_hash(content)
        logger.info(f"Generated content hash: {content_hash}")

        # Check for duplicate content (optimization)
        existing_doc = db.query(Document).filter(
            Document.content_hash == content_hash,
            Document.processing_status == 'completed'
        ).first()
        
        if existing_doc:
            logger.info(f"Found duplicate content for {filename}, skipping processing")
            # Update job statistics - this is a skipped file, not processed
            job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
            if job:
                job.skipped_files += 1  # Changed from processed_files
                if job.total_files > 0:
                    job.progress = ((job.processed_files + job.failed_files + job.skipped_files) / job.total_files) * 100
                db.commit()
            
            return {
                'success': True,
                'document_id': str(existing_doc.id),
                'filename': filename,
                'skipped': True,
                'reason': 'duplicate_content',
                'original_document': existing_doc.filename
            }

        # Get job details
        job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
        if not job:
            error_msg = f"Ingestion job with ID {job_id} not found"
            logger.error(error_msg)
            raise ValueError(error_msg)

        # Create document record
        logger.info("Creating document record in database...")
        document = Document(
            filename=document_data['filename'],
            original_path=document_data['path'],
            file_type=document_data['extension'],
            file_size=document_data['size'],
            mime_type=document_data['mime_type'],
            content=content,
            content_hash=content_hash,
            ingestion_job_id=job_id,
            processing_status='content_extracted',
            created_at=document_data.get('creation_time', datetime.now(timezone.utc)),
            updated_at=document_data.get('modification_time', datetime.now(timezone.utc))
        )
        
        db.add(document)
        db.commit()
        db.refresh(document)

        logger.info(f"Document record created with ID: {document.id}")

        # Update progress
        try:
            self.update_state(
                state='PROGRESS',
                meta={
                    'job_id': job_id,
                    'document_name': document.filename,
                    'stage': 'creating_summary',
                    'progress': 30
                }
            )
        except Exception as e:
            logger.warning(f"Could not update task state: {e}")

        # Create summary using Groq service
        logger.info(f"Creating summary with Groq for {filename}...")
        try:
            # Prepare document metadata for better context
            document_metadata = {
                'filename': document_data['filename'],
                'file_type': document_data['extension'],
                'file_size': document_data['size'],
                'mime_type': document_data['mime_type']
            }
            
            # Create summary synchronously
            groq_analysis = create_summary_sync(content, document_metadata)
            
            # Update document with summary and analysis
            if groq_analysis.get('success', False):
                document.summary = groq_analysis.get('summary', 'No summary generated')
                
                # Handle keywords and topics safely
                main_topics = groq_analysis.get('main_topics', [])
                product_tags = groq_analysis.get('product_tags', [])
                
                document.main_topics = main_topics if isinstance(main_topics, list) else []
                document.product_tags = product_tags if isinstance(product_tags, list) else []
                
                logger.info(f"Successfully created summary for {filename}")
                logger.info(f"Summary length: {len(document.summary)}")
                logger.info(f"Main topics: {len(document.main_topics)}")
                logger.info(f"Product tags: {len(document.product_tags)}")
            else:
                # Groq failed, but continue processing
                error_msg = groq_analysis.get('error', 'Unknown error')
                document.summary = f"Summary generation failed: {error_msg}"
                document.main_topics = []
                document.product_tags = []
                logger.warning(f"Summary generation failed for {filename}: {error_msg}")
            
        except Exception as e:
            logger.warning(f"Failed to create summary with Groq for {filename}: {e}")
            document.summary = f"Summary generation error: {str(e)}"
            document.main_topics = []
            document.product_tags = []

        # Update progress
        try:
            self.update_state(
                state='PROGRESS',
                meta={
                    'job_id': job_id,
                    'document_name': document.filename,
                    'stage': 'chunking_and_embedding',
                    'progress': 60
                }
            )
        except Exception as e:
            logger.warning(f"Could not update task state: {e}")

        logger.info(f"Creating chunks and embeddings for {filename}...")
        
        try:
            # Use batch processing for chunks and embeddings
            chunks = create_chunks_with_embeddings_sync(
                content,
                embedding_model,
                job.chunk_size,
                job.chunk_overlap
            )
            
            if not chunks:
                logger.warning(f"No chunks generated for document: {document.filename}")
                document.processing_status = 'completed_without_embeddings'
                document.error_message = 'No chunks generated'
                db.commit()
                
                # Update job statistics
                job.processed_files += 1
                if job.total_files > 0:
                    job.progress = (job.processed_files / job.total_files) * 100
                db.commit()
                
                return {
                    'success': True,
                    'document_id': str(document.id),
                    'filename': document.filename,
                    'summary': document.summary,
                    'warning': 'No chunks generated'
                }

            logger.info(f"Successfully generated {len(chunks)} chunks for {filename}")

            # Store chunks with embeddings - batch insert
            document_chunks = []
            chunks_with_embeddings = 0
            
            for i, chunk_data in enumerate(chunks):
                chunk_content = chunk_data['text']
                chunk_content_hash = generate_content_hash(chunk_content)
                
                # Only count chunks that have embeddings
                embedding = chunk_data.get('embedding', [])
                if embedding:
                    chunks_with_embeddings += 1
                
                chunk = DocumentChunk(
                    document_id=document.id,
                    chunk_index=i,
                    content=chunk_content,
                    content_hash=chunk_content_hash,
                    embedding=embedding if embedding else None,
                    embedding_model=embedding_model if embedding else None,
                    updated_at=datetime.now(timezone.utc)
                )
                document_chunks.append(chunk)
            
            # Single batch insert and update
            logger.info(f"Inserting {len(document_chunks)} chunks into database ({chunks_with_embeddings} with embeddings)...")
            
            # Update document status and insert chunks in one transaction
            db.add_all(document_chunks)
            document.total_chunks = len(document_chunks)
            document.processing_status = 'completed'
            document.processed_at = datetime.now(timezone.utc)
            document.updated_at = datetime.now(timezone.utc)
            
            # Update job statistics
            job.processed_files += 1
            if job.total_files > 0:
                job.progress = ((job.processed_files + job.failed_files) / job.total_files) * 100
            
            # Single commit for all operations
            db.commit()

            logger.info(f"=== SUCCESSFULLY PROCESSED: {document.filename} ===")
            
            return {
                'success': True,
                'document_id': str(document.id),
                'filename': document.filename,
                'summary': document.summary[:200] + "..." if len(document.summary) > 200 else document.summary,
                'main_topics': document.main_topics,
                'product_tags': document.product_tags,
                'chunks_count': document.total_chunks,
                'chunks_with_embeddings': chunks_with_embeddings
            }
            
        except Exception as e:
            logger.error(f"Failed to create embeddings for {filename}: {e}")
            logger.exception("Full embedding error traceback:")
            
            # Mark as completed without embeddings rather than failed
            document.processing_status = 'completed_without_embeddings'
            document.error_message = f'Embedding failed: {str(e)}'
            
            # Update job statistics
            job.processed_files += 1
            if job.total_files > 0:
                job.progress = ((job.processed_files + job.failed_files) / job.total_files) * 100
            
            db.commit()
            
            return {
                'success': True,  # Still count as success to avoid hanging
                'document_id': str(document.id),
                'filename': document.filename,
                'summary': document.summary,
                'main_topics': document.main_topics,
                'product_tags': document.product_tags,
                'chunks_count': 0,
                'warning': f'Embedding failed: {str(e)}'
            }
            
    except Exception as e:
        error_msg = f"ERROR PROCESSING DOCUMENT {document_data.get('filename')}: {str(e)}"
        logger.error(f"=== {error_msg} ===")
        logger.exception("Full traceback:")
        try:
            db.rollback()
            if document:
                document.processing_status = 'failed'
                document.error_message = str(e)
                document.updated_at = datetime.now(timezone.utc)
                db.commit()
            # Update IngestionJob statistics for failed files
            job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
            if job:
                job.failed_files += 1
                if job.total_files > 0:
                    job.progress = ((job.processed_files + job.failed_files) / job.total_files) * 100
                db.commit()
        except Exception as commit_error:
            logger.error(f"Error updating database after failure: {commit_error}")
        
        return {
            'success': False,
            'error': error_msg,
            'filename': document_data.get('filename', 'Unknown')
        }
    finally:
        try:
            db.close()
        except:
            pass

@celery_app.task(bind=True, name='app.workers.document_worker.process_ingestion_job')
def process_ingestion_job(self, job_id: str):
    """Main task to process an entire ingestion job using Celery groups for efficiency"""
    db = SessionLocal()
    job = None
    try:
        logger.info(f"=== STARTING INGESTION JOB PROCESSING: {job_id} ===")
        
        # --- DEBUGGING START ---
        logger.debug(f"Attempting to fetch IngestionJob with ID: {job_id}")
        # --- DEBUGGING END ---
        
        job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
        if not job:
            logger.error(f"Ingestion job with ID {job_id} not found.")
            return {'success': False, 'message': 'Job not found'}
        
        logger.info(f"Fetched ingestion job: {job.name} (ID: {job_id}). Current status: {job.status}")
        
        # --- DEBUGGING START ---
        logger.debug(f"Attempting to update job status to 'running' for job ID: {job_id}")
        # --- DEBUGGING END ---
        
        job.status = 'running'
        job.started_at = datetime.now(timezone.utc)
        # Reset counters at start
        job.processed_files = 0
        job.failed_files = 0
        job.skipped_files = 0
        
        try:
            db.commit()
            logger.info(f"Job status successfully updated to 'running' for job ID: {job_id}")
        except SQLAlchemyError as sqla_e:
            db.rollback()
            logger.critical(f"SQLAlchemyError during initial job status update for job {job_id}: {sqla_e}")
            logger.critical(f"Details: {sqla_e.args}")
            raise RuntimeError(f"Database error during job initialization: {sqla_e}") from sqla_e
        except Exception as e:
            db.rollback()
            logger.critical(f"CRITICAL: Generic error during initial job status update for job {job_id}: {e}")
            raise RuntimeError(f"Unexpected error during job initialization: {e}") from e
            
        try:
            self.update_state(
                state='PROGRESS',
                meta={
                    'job_name': job.name,
                    'stage': 'scanning_files',
                    'progress': 5
                }
            )
        except Exception as e:
            logger.warning(f"Could not update task state: {e}")

        # Scan files
        logger.info(f"Scanning directory: {job.source_path}")
        scan_result = file_scanner.scan_directory(
            directory_path=job.source_path,
            recursive=True,
            max_files=1000
        )

        if not scan_result.get('success'):
            error_msg = f"Failed to scan directory: {scan_result.get('error', 'Unknown error')}"
            logger.error(error_msg)
            raise ValueError(error_msg)

        # Get supported files
        supported_files = [
            f for f in scan_result.get('files', [])
            if f.get('size', 0) > 0
        ]
        
        # --- DEBUGGING START ---
        logger.debug(f"Setting total_files to {len(supported_files)} for job {job_id}")
        # --- DEBUGGING END ---
        job.total_files = len(supported_files)
        try:
            db.commit()
            logger.info(f"Total files updated successfully for job ID: {job_id}")
        except SQLAlchemyError as sqla_e:
            db.rollback()
            logger.critical(f"SQLAlchemyError during total_files update for job {job_id}: {sqla_e}")
            raise RuntimeError(f"Database error updating total files: {sqla_e}") from sqla_e
        except Exception as e:
            db.rollback()
            logger.critical(f"CRITICAL: Generic error during total_files update for job {job_id}: {e}")
            raise RuntimeError(f"Unexpected error updating total files: {e}") from e

        logger.info(f"Found {job.total_files} supported files for job {job.name}")

        if not supported_files:
            job.status = 'completed'
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
            logger.info(f"No supported files found for job {job.name}. Job completed.")
            return {
                'success': True,
                'job_id': str(job.id),
                'total_files': 0,
                'processed_files': 0,
                'failed_files': 0,
                'skipped_files': 0,
                'message': 'No supported files found.'
            }

        logger.info(f"Creating Celery group for {len(supported_files)} documents...")
        
        # Use Celery group for parallel processing
        job_group = group(
            process_document.s(
                document_data=file_data,
                job_id=str(job.id),
                embedding_model=job.embedding_model
            ) for file_data in supported_files
        )
        
        # Execute all tasks and wait for results
        group_result = job_group.apply_async()
        
        logger.info(f"Submitted {len(supported_files)} tasks for processing")
        
        # Monitor progress without constant polling
        start_time = time.time()
        last_log_time = start_time
        timeout_seconds = 1800  # 30 minutes total timeout
        
        while not group_result.ready():
            current_time = time.time()
            elapsed = current_time - start_time
            
            # Check for timeout
            if elapsed > timeout_seconds:
                logger.error(f"Job timed out after {timeout_seconds/60} minutes")
                break
            
            # Log progress every 10 seconds
            if current_time - last_log_time >= 10:
                # Get current statistics from database
                db.expire_all()  # Refresh from database
                job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
                if job:
                    total_processed = job.processed_files + job.failed_files + job.skipped_files
                    logger.info(f"Progress: {total_processed}/{job.total_files} files "
                              f"(Success: {job.processed_files}, Failed: {job.failed_files}, "
                              f"Skipped: {job.skipped_files})")
                    last_log_time = current_time
            
            time.sleep(2)  # Check every 2 seconds instead of 1
        
        # Wait a moment for final database updates to complete
        time.sleep(1)
        
        # Get final results from database instead of counting from results
        # This ensures we have the accurate count from what actually happened
        db.expire_all()  # Force refresh from database
        job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
        
        # If group completed, verify counts match expected
        if group_result.ready():
            try:
                results = group_result.get(timeout=30)
                
                # Log individual results for debugging
                for i, result in enumerate(results):
                    if result.get('success'):
                        status = "skipped" if result.get('skipped') else "processed"
                        logger.debug(f"File {i+1}: {result.get('filename')} - {status}")
                    else:
                        logger.debug(f"File {i+1}: {result.get('filename')} - failed: {result.get('error')}")
                
                # The database should already have accurate counts from individual tasks
                # Just verify the total matches
                total_in_db = job.processed_files + job.failed_files + job.skipped_files
                if total_in_db != job.total_files:
                    logger.warning(f"Count mismatch: DB shows {total_in_db} files processed, "
                                 f"but total_files is {job.total_files}")
                    
                    # If there's a mismatch, try to reconcile from results
                    result_processed = sum(1 for r in results if r.get('success') and not r.get('skipped'))
                    result_failed = sum(1 for r in results if not r.get('success'))
                    result_skipped = sum(1 for r in results if r.get('success') and r.get('skipped'))
                    
                    logger.info(f"Results count - Processed: {result_processed}, "
                              f"Failed: {result_failed}, Skipped: {result_skipped}")
                    
                    # Only update if DB counts are clearly wrong
                    if total_in_db == 0 and len(results) > 0:
                        job.processed_files = result_processed
                        job.failed_files = result_failed
                        job.skipped_files = result_skipped
                        db.commit()
                
            except Exception as e:
                logger.error(f"Error collecting results: {e}")
        
        # Ensure progress is 100%
        job.progress = 100.0
        job.status = 'completed'
        job.completed_at = datetime.now(timezone.utc)
        db.commit()

        # One final refresh to get the latest counts
        db.expire_all()
        job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()

        logger.info(f"=== INGESTION JOB COMPLETED: {job.name} ===")
        logger.info(f"Final stats - Total: {job.total_files}, Processed: {job.processed_files}, "
                   f"Failed: {job.failed_files}, Skipped: {job.skipped_files}")
        
        return {
            'success': True,
            'job_id': str(job.id),
            'total_files': job.total_files,
            'processed_files': job.processed_files,
            'failed_files': job.failed_files,
            'skipped_files': job.skipped_files
        }
        
    except Exception as e:
        error_msg = f"ERROR IN INGESTION JOB {job_id}: {str(e)}"
        logger.error(f"=== {error_msg} ===")
        logger.exception("Full traceback:")
        
        try:
            if job:
                job.status = 'failed'
                job.error_message = str(e)
                job.completed_at = datetime.now(timezone.utc)
                db.commit()
        except Exception as commit_error:
            logger.error(f"Error updating job status after failure: {commit_error}")
        
        return {
            'success': False,
            'job_id': job_id,
            'error': error_msg
        }
    finally:
        try:
            db.close()
        except Exception as close_error:
            logger.error(f"Error closing database session in finally block: {close_error}")