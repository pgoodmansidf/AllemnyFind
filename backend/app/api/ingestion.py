import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from uuid import UUID
import json
import io
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status, Form, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc, func

from pydantic import BaseModel, ConfigDict

from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.ingestion import IngestionJob, IngestionStatistics
from app.models.document import Document, DocumentChunk
from app.services.file_scanner import file_scanner
from app.services.langchain_processor import langchain_processor
from app.services.websocket_manager import manager
#from app.workers.langchain_worker import process_ingestion_job
from app.core.celery_app import celery_app

from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Pydantic models
class CreateIngestionJobRequest(BaseModel):
    name: str
    description: Optional[str] = None
    source_path: str
    source_type: str = "local"  # local, network_share
    main_tag: str
    embedding_model: str = "nomic-embed-text"
    chunk_size: int = 1000
    chunk_overlap: int = 200

class IngestionJobResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    source_path: str
    source_type: str
    main_tag: str
    status: str
    progress: float
    total_files: int
    processed_files: int
    failed_files: int
    skipped_files: int
    embedding_model: str
    chunk_size: int
    chunk_overlap: int
    created_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error_message: Optional[str]

    model_config = ConfigDict(from_attributes=True)

class DirectoryScanRequest(BaseModel):
    path: str
    recursive: bool = True
    include_patterns: Optional[List[str]] = None
    exclude_patterns: Optional[List[str]] = None
    max_files: Optional[int] = 1000

class DocumentResponse(BaseModel):
    id: UUID
    filename: str
    original_path: str
    file_type: str
    file_size: int
    mime_type: Optional[str]
    processing_status: str
    title: Optional[str] = None
    author: Optional[str] = None
    creation_date: Optional[datetime] = None
    modification_date: Optional[datetime] = None
    summary: Optional[str]
    main_topics: Optional[List[str]]
    product_tags: Optional[List[str]]
    has_tables: bool = False
    table_count: int = 0
    table_metadata: Optional[Dict[str, Any]] = None
    ingestion_job_id: UUID
    main_tag: Optional[str] = None
    created_at: datetime
    processed_at: Optional[datetime]
    error_message: Optional[str]
    storage_type: str
    total_chunks: int

    model_config = ConfigDict(from_attributes=True)

class JobStatisticsResponse(BaseModel):
    job: IngestionJobResponse
    statistics: Optional[Dict[str, Any]]
    document_status_counts: Dict[str, int]
    total_chunks: int
    total_documents: int
    average_chunks_per_document: float
    total_size_mb: float
    processing_speed_mbps: Optional[float]
    success: bool

# Custom JSON encoder for datetime objects and UUIDs
class DateTimeEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        elif isinstance(obj, UUID):
            return str(obj)
        return json.JSONEncoder.default(self, obj)

# Redis Management endpoints
@router.get("/redis/health")
async def get_redis_health(current_user: User = Depends(get_current_user)):
    """Get Redis connection health status"""
    try:
        import redis
        from app.core.config import settings

        r = redis.from_url(settings.redis_url)
        # Test connection
        r.ping()

        # Get Redis info
        info = r.info()

        return JSONResponse(content={
            'status': 'connected',
            'version': info.get('redis_version', 'unknown'),
            'memory_usage': info.get('used_memory_human', 'unknown'),
            'connected_clients': info.get('connected_clients', 0),
            'uptime': info.get('uptime_in_seconds', 0),
            'keyspace': dict(r.info('keyspace')),
            'last_checked': datetime.utcnow().isoformat()
        })
    except Exception as e:
        return JSONResponse(
            content={
                'status': 'error',
                'error': str(e),
                'last_checked': datetime.utcnow().isoformat()
            },
            status_code=500
        )

@router.get("/redis/stats")
async def get_redis_stats(current_user: User = Depends(get_current_user)):
    """Get detailed Redis statistics"""
    try:
        import redis
        from app.core.config import settings

        r = redis.from_url(settings.redis_url)
        info = r.info()

        # Get key patterns for ingestion-related data
        ingestion_keys = r.keys("ingestion:*")
        celery_keys = r.keys("celery:*")
        job_keys = r.keys("job:*")

        return JSONResponse(content={
            'memory': {
                'used_memory': info.get('used_memory', 0),
                'used_memory_human': info.get('used_memory_human', '0B'),
                'used_memory_peak': info.get('used_memory_peak', 0),
                'used_memory_peak_human': info.get('used_memory_peak_human', '0B'),
                'maxmemory': info.get('maxmemory', 0)
            },
            'performance': {
                'total_commands_processed': info.get('total_commands_processed', 0),
                'instantaneous_ops_per_sec': info.get('instantaneous_ops_per_sec', 0),
                'keyspace_hits': info.get('keyspace_hits', 0),
                'keyspace_misses': info.get('keyspace_misses', 0),
                'hit_rate': info.get('keyspace_hits', 0) / max(1, info.get('keyspace_hits', 0) + info.get('keyspace_misses', 0)) * 100
            },
            'keys': {
                'total_keys': r.dbsize(),
                'ingestion_keys': len(ingestion_keys),
                'celery_keys': len(celery_keys),
                'job_keys': len(job_keys),
                'expires': len(r.keys("*")) - len(r.keys())  # Keys with TTL
            },
            'connections': {
                'connected_clients': info.get('connected_clients', 0),
                'blocked_clients': info.get('blocked_clients', 0),
                'tracking_clients': info.get('tracking_clients', 0)
            },
            'uptime': {
                'uptime_in_seconds': info.get('uptime_in_seconds', 0),
                'uptime_in_days': info.get('uptime_in_days', 0)
            }
        })
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get Redis statistics: {str(e)}"
        )

@router.post("/redis/clear-cache")
async def clear_redis_cache(
    pattern: str = "*",
    confirm: bool = False,
    current_user: User = Depends(get_current_user)
):
    """Clear Redis cache with optional pattern matching"""
    try:
        if not confirm:
            raise HTTPException(
                status_code=400,
                detail="Confirmation required. Set confirm=true to proceed."
            )

        import redis
        from app.core.config import settings

        r = redis.from_url(settings.redis_url)

        # Get keys matching pattern
        keys_to_delete = r.keys(pattern)

        if not keys_to_delete:
            return JSONResponse(content={
                'success': True,
                'message': f'No keys found matching pattern: {pattern}',
                'deleted_count': 0
            })

        # Delete keys
        deleted_count = r.delete(*keys_to_delete)

        logger.info(f"User {current_user.username} cleared {deleted_count} Redis keys with pattern: {pattern}")

        return JSONResponse(content={
            'success': True,
            'message': f'Successfully deleted {deleted_count} keys',
            'deleted_count': deleted_count,
            'pattern': pattern
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear cache: {str(e)}"
        )

@router.post("/redis/clear-ingestion-cache")
async def clear_ingestion_cache(
    job_id: Optional[str] = None,
    confirm: bool = False,
    current_user: User = Depends(get_current_user)
):
    """Clear ingestion-specific cache data"""
    try:
        if not confirm:
            raise HTTPException(
                status_code=400,
                detail="Confirmation required. Set confirm=true to proceed."
            )

        import redis
        from app.core.config import settings

        r = redis.from_url(settings.redis_url)

        # Define patterns for ingestion-related keys
        patterns = [
            "ingestion:*",
            "celery:*",
            "job:*"
        ]

        if job_id:
            patterns = [f"*{job_id}*"]

        total_deleted = 0
        for pattern in patterns:
            keys_to_delete = r.keys(pattern)
            if keys_to_delete:
                deleted_count = r.delete(*keys_to_delete)
                total_deleted += deleted_count

        logger.info(f"User {current_user.username} cleared {total_deleted} ingestion cache keys")

        return JSONResponse(content={
            'success': True,
            'message': f'Successfully cleared {total_deleted} ingestion cache entries',
            'deleted_count': total_deleted,
            'job_id': job_id
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to clear ingestion cache: {str(e)}"
        )

@router.get("/system/environment")
async def get_system_environment(current_user: User = Depends(get_current_user)):
    """Get system environment information including Windows/WSL detection"""
    try:
        import platform
        import subprocess
        import shutil
        import os

        system_info = {
            'platform': platform.system(),
            'platform_release': platform.release(),
            'platform_version': platform.version(),
            'architecture': platform.machine(),
            'processor': platform.processor(),
            'python_version': platform.python_version(),
            'is_windows': platform.system().lower() == 'windows',
            'is_wsl': False,
            'available_tools': {}
        }

        # Check if running in WSL
        try:
            if platform.system().lower() == 'linux':
                with open('/proc/version', 'r') as f:
                    version_info = f.read().lower()
                    system_info['is_wsl'] = 'microsoft' in version_info or 'wsl' in version_info
        except:
            pass

        # Check for WSL environment variables on Windows
        if system_info['is_windows']:
            system_info['is_wsl'] = os.environ.get('WSL_DISTRO_NAME') is not None

        # Check available document processing tools
        tools_to_check = [
            'tesseract',
            'libreoffice',
            'pandoc',
            'pdftotext',
            'java'  # for tabula-py
        ]

        for tool in tools_to_check:
            system_info['available_tools'][tool] = shutil.which(tool) is not None

        # Windows-specific paths and tools
        if system_info['is_windows']:
            windows_paths = [
                'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
                'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
                'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
                'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
            ]

            for path in windows_paths:
                if os.path.exists(path):
                    tool_name = 'tesseract' if 'tesseract' in path.lower() else 'libreoffice'
                    system_info['available_tools'][tool_name] = True

        return JSONResponse(content=system_info)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get system environment: {str(e)}"
        )

@router.post("/system/set-processing-mode")
async def set_processing_mode(
    mode: str,  # 'native' or 'wsl'
    current_user: User = Depends(get_current_user)
):
    """Set the processing mode for Windows systems (native vs WSL)"""
    try:
        if mode not in ['native', 'wsl']:
            raise HTTPException(
                status_code=400,
                detail="Mode must be either 'native' or 'wsl'"
            )

        # Store processing mode preference in user session or Redis
        import redis
        from app.core.config import settings

        r = redis.from_url(settings.redis_url)
        key = f"processing_mode:{current_user.id}"
        r.setex(key, 3600 * 24, mode)  # Store for 24 hours

        logger.info(f"User {current_user.username} set processing mode to: {mode}")

        return JSONResponse(content={
            'success': True,
            'mode': mode,
            'message': f'Processing mode set to {mode}'
        })
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to set processing mode: {str(e)}"
        )

@router.get("/system/processing-mode")
async def get_processing_mode(current_user: User = Depends(get_current_user)):
    """Get current processing mode for the user"""
    try:
        import redis
        from app.core.config import settings

        r = redis.from_url(settings.redis_url)
        key = f"processing_mode:{current_user.id}"
        mode = r.get(key)

        if mode:
            mode = mode.decode('utf-8')
        else:
            # Default based on system
            import platform
            mode = 'native' if platform.system().lower() == 'windows' else 'native'

        return JSONResponse(content={
            'mode': mode,
            'available_modes': ['native', 'wsl']
        })
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get processing mode: {str(e)}"
        )

# WebSocket endpoint for progress streaming
@router.websocket("/ws/ingestion/{user_id}")
async def websocket_ingestion(websocket: WebSocket, user_id: int):
    """WebSocket endpoint for real-time ingestion progress updates"""
    await manager.connect(websocket, "ingestion")
    try:
        while True:
            # Receive messages from client
            data = await websocket.receive_json()
            
            if data.get('type') == 'subscribe':
                job_id = data.get('job_id')
                if job_id:
                    await manager.subscribe_to_job(websocket, job_id)
                    await websocket.send_json({
                        'type': 'subscribed',
                        'job_id': job_id,
                        'message': f'Subscribed to job {job_id} updates'
                    })
            
            elif data.get('type') == 'unsubscribe':
                job_id = data.get('job_id')
                if job_id and job_id in manager.job_subscriptions:
                    manager.job_subscriptions[job_id].discard(websocket)
                    await websocket.send_json({
                        'type': 'unsubscribed',
                        'job_id': job_id,
                        'message': f'Unsubscribed from job {job_id} updates'
                    })
            
            elif data.get('type') == 'ping':
                await websocket.send_json({
                    'type': 'pong',
                    'timestamp': datetime.now().isoformat()
                })
                    
    except WebSocketDisconnect:
        manager.disconnect(websocket, "ingestion")
        logger.info(f"WebSocket disconnected for user {user_id}")

@router.post("/scan-directory")
async def scan_directory(
    request: DirectoryScanRequest,
    current_user: User = Depends(get_current_user)
):
    """Scan a directory for supported files with enhanced metadata"""
    try:
        logger.info(f"User {current_user.username} scanning directory: {request.path}")
        
        scan_result = file_scanner.scan_directory(
            directory_path=request.path,
            recursive=request.recursive,
            include_patterns=request.include_patterns,
            exclude_patterns=request.exclude_patterns,
            max_files=request.max_files
        )
        
        # Enhance scan result with preview of processable files
        if scan_result['success'] and scan_result['files']:
            # Group files by type
            file_groups = {}
            for file in scan_result['files']:
                ext = file['extension'].lower()
                if ext not in file_groups:
                    file_groups[ext] = []
                file_groups[ext].append(file['filename'])
            
            scan_result['file_preview'] = {
                'by_type': file_groups,
                'processable_count': len([f for f in scan_result['files'] 
                                         if f['extension'].lower() in 
                                         ['.pdf', '.docx', '.doc', '.txt', '.csv', '.xlsx', '.xls']])
            }
        
        return JSONResponse(content=json.loads(json.dumps(scan_result, cls=DateTimeEncoder)))
    except Exception as e:
        logger.error(f"Error scanning directory: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/validate-path")
async def validate_path(
    path: str = Form(...),
    current_user: User = Depends(get_current_user)
):
    """Validate if a path is accessible and contains supported files"""
    try:
        validation_result = file_scanner.validate_path(path)
        
        # Add additional validation for LangChain supported formats
        if validation_result['success']:
            supported_extensions = {'.pdf', '.docx', '.doc', '.txt', '.csv', '.xlsx', '.xls'}
            validation_result['langchain_compatible'] = True
            validation_result['supported_formats'] = list(supported_extensions)
        
        json_serializable_result = json.loads(json.dumps(validation_result, cls=DateTimeEncoder))
        return JSONResponse(content=json_serializable_result)
    except Exception as e:
        logger.error(f"Error validating path: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.get("/directory-tree")
async def get_directory_tree(
    path: str,
    max_depth: int = 3,
    current_user: User = Depends(get_current_user)
):
    """Get directory tree structure for UI navigation"""
    try:
        tree = file_scanner.get_directory_tree(path, max_depth)
        return JSONResponse(content=json.loads(json.dumps(tree, cls=DateTimeEncoder)))
    except Exception as e:
        logger.error(f"Error getting directory tree: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.get("/ollama/models")
async def get_ollama_models(current_user: User = Depends(get_current_user)):
    """Get available Ollama embedding models"""
    try:
        # Import here to avoid circular dependency
        from app.services.embedding_service import embedding_service
        
        models = await embedding_service.get_available_models()
        
        # Filter and enhance model information for LangChain compatibility
        langchain_models = []
        for model in models:
            if 'embed' in model['name'].lower():
                model['langchain_compatible'] = True
                model['dimensions'] = 768 if 'nomic' in model['name'] else 1536
                langchain_models.append(model)
        
        return JSONResponse(content={
            'models': langchain_models,
            'default_model': 'nomic-embed-text:latest',
            'success': True
        })
    except Exception as e:
        logger.error(f"Error fetching Ollama models: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch Ollama models: {str(e)}"
        )

@router.post("/test-connections")
async def test_connections(current_user: User = Depends(get_current_user)):
    """Test connections to Ollama and Groq services"""
    try:
        from app.services.embedding_service import embedding_service
        from app.services.groq_service import groq_service
        
        # Test Ollama connection
        ollama_status = await embedding_service.test_connection()
        
        # Test Groq connection
        groq_status = await groq_service.test_connection()
        
        # Test LangChain integration
        langchain_status = {
            'status': 'connected' if ollama_status['status'] == 'connected' else 'error',
            'framework': 'LangChain',
            'vector_store': 'PGVector',
            'tested_at': datetime.utcnow().isoformat()
        }
        
        response_content = {
            'ollama': json.loads(json.dumps(ollama_status, cls=DateTimeEncoder)),
            'groq': json.loads(json.dumps(groq_status, cls=DateTimeEncoder)),
            'langchain': langchain_status,
            'overall_status': 'connected' if all(
                [ollama_status['status'] == 'connected',
                 groq_status['status'] == 'connected',
                 langchain_status['status'] == 'connected']
            ) else 'error'
        }
        
        return JSONResponse(content=response_content)
    except Exception as e:
        logger.error(f"Error testing connections: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/jobs", response_model=IngestionJobResponse)
async def create_ingestion_job(
    request: CreateIngestionJobRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new ingestion job with enhanced configuration"""
    try:
        logger.info(f"User {current_user.username} creating ingestion job: {request.name}")
        
        # Validate source path
        validation = file_scanner.validate_path(request.source_path)
        if not validation['success']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid source path: {validation.get('error')}"
            )
        
        # Quick scan to get file count
        scan_result = file_scanner.scan_directory(
            request.source_path,
            recursive=True,
            max_files=10  # Quick scan for validation
        )
        
        if not scan_result['success']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot access directory: {scan_result.get('error')}"
            )
        
        # Create ingestion job
        job = IngestionJob(
            name=request.name,
            description=request.description,
            source_path=request.source_path,
            source_type=request.source_type,
            main_tag=request.main_tag,
            embedding_model=request.embedding_model,
            chunk_size=request.chunk_size,
            chunk_overlap=request.chunk_overlap,
            status='pending',
            configuration={
                'langchain_enabled': True,
                'table_extraction': True,
                'hybrid_storage': True,
                'storage_threshold_mb': 10
            }
        )
        
        db.add(job)
        db.commit()
        db.refresh(job)
        
        logger.info(f"Ingestion job created: {job.id}")
        
        # Send creation notification via WebSocket
        await manager.send_toast(
            'ingestion',
            'success',
            f'Ingestion job "{job.name}" created successfully'
        )
        
        return IngestionJobResponse.model_validate(job)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating ingestion job: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/jobs/{job_id}/start")
async def start_ingestion_job(
    job_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Start processing an ingestion job with real-time progress streaming"""
    try:
        # Get ingestion job
        job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ingestion job not found"
            )
        
        if job.status != 'pending':
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Job cannot be started. Current status: {job.status}"
            )
        
        # Update status to queued
        job.status = 'queued'
        db.commit()
        
        # Queue job processing
        from app.workers.langchain_worker import process_ingestion_job  # Import here
        process_ingestion_job.delay(str(job.id))
        
        # Send initial progress via WebSocket
        await manager.send_ingestion_progress(
            str(job.id),
            0,
            'started',
            message=f'Starting ingestion job: {job.name}'
        )
        
        logger.info(f"Started ingestion job: {job.id}")
        return JSONResponse(content={
            'success': True,
            'message': f'Ingestion job "{job.name}" started successfully',
            'job_id': str(job.id),
            'websocket_url': f'/api/v1/ingestion/ws/ingestion/{current_user.id}'
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting ingestion job: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/jobs", response_model=List[IngestionJobResponse])
async def get_ingestion_jobs(
    skip: int = 0,
    limit: int = 50,
    status_filter: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of ingestion jobs with filtering"""
    try:
        query = db.query(IngestionJob)
        
        if status_filter:
            query = query.filter(IngestionJob.status == status_filter)
        
        jobs = query.order_by(desc(IngestionJob.created_at)).offset(skip).limit(limit).all()
        return [IngestionJobResponse.model_validate(job) for job in jobs]
        
    except Exception as e:
        logger.error(f"Error fetching ingestion jobs: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/jobs/{job_id}", response_model=IngestionJobResponse)
async def get_ingestion_job(
    job_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get specific ingestion job details"""
    try:
        job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ingestion job not found"
            )
        
        return IngestionJobResponse.model_validate(job)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching ingestion job: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.delete("/jobs/{job_id}")
async def delete_ingestion_job(
    job_id: UUID,
    cascade: bool = True,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete ingestion job and optionally cascade delete documents"""
    try:
        job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ingestion job not found"
            )
        
        if cascade:
            # Delete all related documents and chunks
            documents = db.query(Document).filter(Document.ingestion_job_id == job_id).all()
            
            for document in documents:
                # Delete document chunks
                db.query(DocumentChunk).filter(DocumentChunk.document_id == document.id).delete()
                
                # Delete file from storage if stored in filesystem
                if document.storage_type == "filesystem" and document.storage_path:
                    try:
                        storage_path = Path(document.storage_path)
                        if storage_path.exists():
                            storage_path.unlink()
                    except Exception as e:
                        logger.warning(f"Failed to delete file {document.storage_path}: {e}")
                
                # Delete document
                db.query(Document).filter(Document.id == document.id).delete()
        
            # Delete statistics
            db.query(IngestionStatistics).filter(IngestionStatistics.job_id == job_id).delete()
        
        # Delete the job
        db.delete(job)
        db.commit()
        
        logger.info(f"Deleted ingestion job: {job_id} (cascade: {cascade})")
        
        # Send notification
        await manager.send_toast(
            'ingestion',
            'info',
            f'Ingestion job deleted successfully'
        )
        
        return JSONResponse(content={
            'success': True,
            'message': f'Ingestion job deleted successfully (cascade: {cascade})'
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting ingestion job: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/jobs/{job_id}/statistics", response_model=JobStatisticsResponse)
async def get_job_statistics(
    job_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get detailed statistics for an ingestion job"""
    try:
        job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ingestion job not found"
            )
        
        # Get statistics record
        stats = db.query(IngestionStatistics).filter(
            IngestionStatistics.job_id == job_id
        ).order_by(desc(IngestionStatistics.timestamp)).first()
        
        # Get document counts by status
        document_stats = db.query(
            Document.processing_status, 
            func.count(Document.id)
        ).filter(
            Document.ingestion_job_id == job_id
        ).group_by(Document.processing_status).all()
        
        # Get total documents
        total_documents = db.query(func.count(Document.id)).filter(
            Document.ingestion_job_id == job_id
        ).scalar() or 0
        
        # Get chunk statistics
        chunk_stats = db.query(
            func.count(DocumentChunk.id),
            func.avg(func.length(DocumentChunk.content))
        ).join(
            Document, DocumentChunk.document_id == Document.id
        ).filter(
            Document.ingestion_job_id == job_id
        ).first()
        
        total_chunks = chunk_stats[0] or 0
        avg_chunk_size = chunk_stats[1] or 0
        
        # Get table statistics
        table_stats = db.query(
            func.count(DocumentChunk.id)
        ).join(
            Document, DocumentChunk.document_id == Document.id
        ).filter(
            Document.ingestion_job_id == job_id,
            DocumentChunk.is_table == True
        ).scalar() or 0
        
        # Calculate total size
        total_size = db.query(func.sum(Document.file_size)).filter(
            Document.ingestion_job_id == job_id
        ).scalar() or 0
        
        # Prepare statistics
        serializable_stats = None
        if stats:
            serializable_stats = {
                'files_per_minute': stats.files_per_minute,
                'average_file_size': stats.average_file_size,
                'total_processing_time': stats.total_processing_time,
                'error_rate': stats.error_rate,
                'throughput_mbps': stats.throughput_mbps,
                'created_at': stats.timestamp.isoformat()
            }
        
        # Calculate processing speed if job is completed
        processing_speed = None
        if job.completed_at and job.started_at and total_size > 0:
            duration_seconds = (job.completed_at - job.started_at).total_seconds()
            if duration_seconds > 0:
                processing_speed = (total_size / 1024 / 1024) / duration_seconds
        
        return JobStatisticsResponse(
            job=IngestionJobResponse.model_validate(job),
            statistics=serializable_stats,
            document_status_counts={status: count for status, count in document_stats},
            total_chunks=total_chunks,
            total_documents=total_documents,
            average_chunks_per_document=total_chunks / total_documents if total_documents > 0 else 0,
            total_size_mb=total_size / 1024 / 1024,
            processing_speed_mbps=processing_speed,
            success=True
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching job statistics: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/documents", response_model=List[DocumentResponse])
async def get_processed_documents(
    skip: int = 0,
    limit: int = 50,
    job_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    has_tables: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get list of processed documents with enhanced filtering"""
    try:
        query = db.query(Document)
        
        if job_id:
            query = query.filter(Document.ingestion_job_id == UUID(job_id))
        
        if status_filter:
            query = query.filter(Document.processing_status == status_filter)
        
        if has_tables is not None:
            query = query.filter(Document.has_tables == has_tables)
        
        documents = query.order_by(desc(Document.created_at)).offset(skip).limit(limit).all()
        return [DocumentResponse.model_validate(doc) for doc in documents]
        
    except Exception as e:
        logger.error(f"Error fetching documents: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_processed_document(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get specific document details"""
    try:
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found"
            )
        
        return DocumentResponse.model_validate(document)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching document: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/documents/{document_id}/download")
async def download_document(
    document_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Download original document file"""
    try:
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found"
            )
        
        # Get file content based on storage type
        if document.storage_type == "database" and document.file_data:
            # Return from database
            content = document.file_data
        elif document.storage_type == "filesystem" and document.storage_path:
            # Read from filesystem
            file_path = Path(document.storage_path)
            if not file_path.exists():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Document file not found in storage"
                )
            with open(file_path, 'rb') as f:
                content = f.read()
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document content not available"
            )
        
        # Log download
        logger.info(f"User {current_user.username} downloaded document: {document.filename}")
        
        # Return file as streaming response
        return StreamingResponse(
            io.BytesIO(content),
            media_type=document.mime_type or 'application/octet-stream',
            headers={
                'Content-Disposition': f'attachment; filename="{document.filename}"',
                'Content-Length': str(len(content))
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error downloading document: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/documents/{document_id}/chunks")
async def get_document_chunks(
    document_id: UUID,
    chunk_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get chunks for a specific document"""
    try:
        # Verify document exists
        document = db.query(Document).filter(Document.id == document_id).first()
        if not document:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Document not found"
            )
        
        # Query chunks
        query = db.query(DocumentChunk).filter(DocumentChunk.document_id == document_id)
        
        if chunk_type:
            query = query.filter(DocumentChunk.chunk_type == chunk_type)
        
        chunks = query.order_by(DocumentChunk.chunk_index).all()
        
        # Prepare response
        chunk_data = []
        for chunk in chunks:
            chunk_info = {
                'id': str(chunk.id),
                'chunk_index': chunk.chunk_index,
                'content': chunk.content[:200] + '...' if len(chunk.content) > 200 else chunk.content,
                'chunk_type': chunk.chunk_type,
                'is_table': chunk.is_table,
                'table_name': chunk.table_name,
                'token_count': chunk.token_count,
                'has_embedding': chunk.embedding is not None
            }
            chunk_data.append(chunk_info)
        
        return JSONResponse(content={
            'document_id': str(document_id),
            'document_name': document.filename,
            'total_chunks': len(chunks),
            'chunks': chunk_data
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching document chunks: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/jobs/{job_id}/cancel")
async def cancel_ingestion_job(
    job_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Cancel a running ingestion job"""
    try:
        job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ingestion job not found"
            )
        
        if job.status not in ['pending', 'queued', 'running']:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Job cannot be cancelled. Current status: {job.status}"
            )
        
        # Update job status
        job.status = 'cancelled'
        job.completed_at = datetime.utcnow()
        job.error_message = "Job cancelled by user"
        db.commit()
        
        # Send cancellation notification
        await manager.send_ingestion_progress(
            str(job.id),
            job.progress,
            'cancelled',
            message=f'Job "{job.name}" has been cancelled'
        )
        
        logger.info(f"Cancelled ingestion job: {job.id}")
        
        return JSONResponse(content={
            'success': True,
            'message': 'Ingestion job cancelled successfully'
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling ingestion job: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/progress/{job_id}")
async def get_job_progress(
    job_id: UUID,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get real-time progress for a specific job"""
    try:
        job = db.query(IngestionJob).filter(IngestionJob.id == job_id).first()
        if not job:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Ingestion job not found"
            )
        
        # Get current processing document if any
        current_doc = db.query(Document).filter(
            Document.ingestion_job_id == job_id,
            Document.processing_status == 'processing'
        ).first()
        
        return JSONResponse(content={
            'job_id': str(job.id),
            'name': job.name,
            'status': job.status,
            'progress': job.progress,
            'total_files': job.total_files,
            'processed_files': job.processed_files,
            'failed_files': job.failed_files,
            'skipped_files': job.skipped_files,
            'current_file': current_doc.filename if current_doc else None,
            'started_at': job.started_at.isoformat() if job.started_at else None,
            'eta': None  # Could calculate based on processing speed
        })
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting job progress: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )