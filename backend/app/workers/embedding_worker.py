import logging
import asyncio
from datetime import datetime, timezone
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from celery import current_task

from app.core.celery_app import celery_app
from app.core.database import SessionLocal
from app.models.document import Document, DocumentChunk
from app.services.embedding_service import embedding_service

logger = logging.getLogger(__name__)

def run_async_in_celery(coro):
    """Helper function to run async code in Celery tasks"""
    try:
        # Try to get existing loop
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If loop is running, use asyncio.run in a thread
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, coro)
                return future.result()
        else:
            return loop.run_until_complete(coro)
    except RuntimeError:
        # No event loop exists, create a new one
        return asyncio.run(coro)

async def get_embedding_async(content: str, model: str):
    """Get embedding without async context manager"""
    return await embedding_service.get_embedding(content, model)

@celery_app.task(bind=True, name='app.workers.embedding_worker.create_embeddings')
def create_embeddings(self, document_id: str, chunks: List[Dict[str, Any]], embedding_model: str = "nomic-embed-text"):
    """
    Create embeddings for document chunks
    
    Args:
        document_id: Document ID
        chunks: List of text chunks from document processor
        embedding_model: Ollama model to use for embeddings
    """
    task_id = self.request.id
    db = SessionLocal()
    document = None
    
    try:
        # Get document
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            raise ValueError(f"Document not found: {document_id}")
        
        logger.info(f"Creating embeddings for document: {document.filename} ({len(chunks)} chunks)")
        
        # Update document status
        document.processing_status = 'creating_embeddings'
        db.commit()
        
        self.update_state(
            state='PROGRESS',
            meta={
                'document_id': document_id,
                'filename': document.filename,
                'stage': 'creating_embeddings',
                'progress': 0,
                'total_chunks': len(chunks)
            }
        )
        
        # Process chunks in batches
        chunk_objects = []
        for i, chunk_data in enumerate(chunks):
            # Generate embedding for the chunk using the helper function
            embedding = run_async_in_celery(
                get_embedding_async(chunk_data['content'], embedding_model)
            )

            chunk_obj = DocumentChunk(
                document_id=document_id,
                chunk_index=chunk_data['chunk_index'],
                content=chunk_data['content'],
                embedding=embedding,
                metadata=chunk_data.get('metadata', {})
            )
            chunk_objects.append(chunk_obj)
            
            # Update progress
            progress = (i + 1) / len(chunks) * 100
            if int(progress) % 10 == 0:
                 self.update_state(
                    state='PROGRESS',
                    meta={
                        'document_id': document_id,
                        'filename': document.filename,
                        'stage': 'creating_embeddings',
                        'progress': progress,
                        'current_chunk': i + 1,
                        'total_chunks': len(chunks)
                    }
                )
        
        # Add all chunks to the database
        db.add_all(chunk_objects)
        db.commit()
        
        # Update document status to completed
        document.processing_status = 'completed'
        document.processed_at = datetime.now(timezone.utc)
        document.total_chunks = len(chunks)
        db.commit()
        
        logger.info(f"Embeddings created for document: {document.filename}. Total chunks: {len(chunks)}")
        
        self.update_state(
            state='SUCCESS',
            meta={
                'document_id': document_id,
                'filename': document.filename,
                'stage': 'completed_embeddings',
                'progress': 100,
                'total_chunks': len(chunks),
                'status': 'completed'
            }
        )
        
        return {
            'success': True,
            'document_id': document_id,
            'filename': document.filename,
            'total_chunks': len(chunks)
        }
        
    except Exception as e:
        logger.error(f"Error creating embeddings for document {document_id}: {e}")
        
        try:
            db.rollback()
            if document:
                document.processing_status = 'failed'
                document.error_message = str(e)
                db.commit()
        except Exception as commit_error:
            logger.error(f"Error updating document status after failure: {commit_error}")
        
        self.update_state(
            state='FAILURE',
            meta={
                'document_id': document_id,
                'filename': document.filename if document else 'Unknown',
                'stage': 'failed_embeddings',
                'error': str(e)
            }
        )
        raise
    finally:
        db.close()

@celery_app.task(bind=True, name='app.workers.embedding_worker.recreate_embeddings')
def recreate_embeddings(self, document_id: str, new_embedding_model: str = "nomic-embed-text"):
    """
    Recreate embeddings for an existing document with a new model or settings.
    """
    task_id = self.request.id
    db = SessionLocal()
    document = None
    
    try:
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            raise ValueError(f"Document not found: {document_id}")
        
        logger.info(f"Recreating embeddings for document: {document.filename} with model: {new_embedding_model}")
        
        # Delete existing chunks
        db.query(DocumentChunk).filter(DocumentChunk.document_id == document_id).delete()
        db.commit()
        
        # Get the document content (assuming it's still stored)
        if not hasattr(document, 'content') or not document.content:
            raise ValueError("Document content not available for re-embedding")
        
        # Recreate chunks and embeddings using the embedding service
        async def chunk_text_async(content: str, model: str) -> List[Any]:
            return await embedding_service.chunk_text(content, model)
        
        chunks = run_async_in_celery(chunk_text_async(document.content, new_embedding_model))
        
        # Queue embedding creation
        create_embeddings.delay(
            document_id=document_id,
            chunks=chunks,
            embedding_model=new_embedding_model
        )
        
        return {
            'success': True,
            'document_id': document_id,
            'new_model': new_embedding_model,
            'chunks_count': len(chunks)
        }
        
    except Exception as e:
        logger.error(f"Error recreating embeddings for document {document_id}: {e}")
        
        try:
            db.rollback()
            if document:
                document.processing_status = 'failed_re_embedding'
                document.error_message = str(e)
                db.commit()
        except Exception as commit_error:
            logger.error(f"Error updating document status: {commit_error}")
        
        raise
    finally:
        db.close()