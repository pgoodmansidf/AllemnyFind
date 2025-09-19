import logging
import json
import asyncio
from typing import Dict, Any, List
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
import redis.asyncio as redis

from app.core.config import settings
from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.ingestion import IngestionJob

logger = logging.getLogger(__name__)
router = APIRouter()

class ConnectionManager:
    """Manage WebSocket connections for real-time updates"""
    
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.redis_client = None
        
    async def connect(self, websocket: WebSocket, user_id: str):
        """Accept WebSocket connection and add to user's connections"""
        await websocket.accept()
        
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        
        self.active_connections[user_id].append(websocket)
        logger.info(f"WebSocket connected for user: {user_id}")
        
        # Initialize Redis connection if needed
        if not self.redis_client:
            try:
                self.redis_client = redis.from_url(settings.redis_url)
                # Test the connection
                await self.redis_client.ping()
                logger.info("Redis connection established for WebSocket")
            except Exception as e:
                logger.warning(f"Redis connection failed for WebSocket: {e}. WebSocket will work without Redis.")
                self.redis_client = None
    
    def disconnect(self, websocket: WebSocket, user_id: str):
        """Remove WebSocket connection"""
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            
            # Clean up empty connection lists
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
        
        logger.info(f"WebSocket disconnected for user: {user_id}")
    
    async def send_personal_message(self, message: Dict[str, Any], user_id: str):
        """Send message to specific user's connections"""
        if user_id in self.active_connections:
            message_json = json.dumps(message)
            connections_to_remove = []
            
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(message_json)
                except Exception as e:
                    logger.warning(f"Error sending message to WebSocket: {e}")
                    connections_to_remove.append(connection)
            
            # Remove dead connections
            for connection in connections_to_remove:
                self.active_connections[user_id].remove(connection)
    
    async def broadcast_to_all(self, message: Dict[str, Any]):
        """Broadcast message to all connected users"""
        message_json = json.dumps(message)
        
        for user_id, connections in self.active_connections.items():
            connections_to_remove = []
            
            for connection in connections:
                try:
                    await connection.send_text(message_json)
                except Exception as e:
                    logger.warning(f"Error broadcasting to WebSocket: {e}")
                    connections_to_remove.append(connection)
            
            # Remove dead connections
            for connection in connections_to_remove:
                connections.remove(connection)
    
    async def send_job_update(self, job_id: str, update_data: Dict[str, Any], user_id: str = None):
        """Send job progress update"""
        message = {
            'type': 'job_update',
            'job_id': job_id,
            'timestamp': datetime.utcnow().isoformat(),
            'data': update_data
        }
        
        if user_id:
            await self.send_personal_message(message, user_id)
        else:
            await self.broadcast_to_all(message)
    
    async def send_task_update(self, task_id: str, task_data: Dict[str, Any], user_id: str = None):
        """Send Celery task progress update"""
        message = {
            'type': 'task_update',
            'task_id': task_id,
            'timestamp': datetime.utcnow().isoformat(),
            'data': task_data
        }
        
        if user_id:
            await self.send_personal_message(message, user_id)
        else:
            await self.broadcast_to_all(message)
    
    async def listen_for_updates(self):
        """Listen for Redis updates from Celery tasks"""
        if not self.redis_client:
            return
        
        pubsub = self.redis_client.pubsub()
        await pubsub.subscribe('celery_task_updates')
        
        try:
            async for message in pubsub.listen():
                if message['type'] == 'message':
                    try:
                        data = json.loads(message['data'])
                        await self.send_task_update(
                            task_id=data.get('task_id'),
                            task_data=data,
                            user_id=data.get('user_id')
                        )
                    except Exception as e:
                        logger.error(f"Error processing Redis message: {e}")
        except Exception as e:
            logger.error(f"Error in Redis listener: {e}")

# Global connection manager
manager = ConnectionManager()

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: str):
    """WebSocket endpoint for real-time updates"""
    await manager.connect(websocket, user_id)
    
    try:
        # Send initial connection confirmation
        await websocket.send_text(json.dumps({
            'type': 'connection_established',
            'user_id': user_id,
            'timestamp': datetime.utcnow().isoformat(),
            'message': 'WebSocket connection established'
        }))
        
        # Keep connection alive and handle incoming messages
        while True:
            try:
                # Wait for client messages with timeout
                message = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                
                try:
                    data = json.loads(message)
                    await handle_client_message(data, user_id, websocket)
                except json.JSONDecodeError:
                    await websocket.send_text(json.dumps({
                        'type': 'error',
                        'message': 'Invalid JSON format'
                    }))
                    
            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                await websocket.send_text(json.dumps({
                    'type': 'ping',
                    'timestamp': datetime.utcnow().isoformat()
                }))
                
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
    except Exception as e:
        logger.error(f"WebSocket error for user {user_id}: {e}")
        manager.disconnect(websocket, user_id)

async def handle_client_message(data: Dict[str, Any], user_id: str, websocket: WebSocket):
    """Handle messages from WebSocket clients"""
    message_type = data.get('type')
    
    if message_type == 'ping':
        await websocket.send_text(json.dumps({
            'type': 'pong',
            'timestamp': datetime.utcnow().isoformat()
        }))
    
    elif message_type == 'subscribe_job':
        job_id = data.get('job_id')
        if job_id:
            # Send current job status
            # This would typically fetch current status from database
            await websocket.send_text(json.dumps({
                'type': 'job_status',
                'job_id': job_id,
                'timestamp': datetime.utcnow().isoformat(),
                'message': f'Subscribed to job updates: {job_id}'
            }))
    
    elif message_type == 'get_job_status':
        job_id = data.get('job_id')
        if job_id:
            # Fetch and send current job status
            await send_job_status(job_id, websocket)

async def send_job_status(job_id: str, websocket: WebSocket):
    """Send current job status to WebSocket"""
    try:
        # This would fetch from database in a real implementation
        status_message = {
            'type': 'job_status_response',
            'job_id': job_id,
            'timestamp': datetime.utcnow().isoformat(),
            'status': 'fetching...'  # Would be actual status
        }
        
        await websocket.send_text(json.dumps(status_message))
        
    except Exception as e:
        logger.error(f"Error sending job status: {e}")

# Start Redis listener when module loads
@router.on_event("startup")
async def startup_event():
    """Start the Redis listener for Celery updates"""
    asyncio.create_task(manager.listen_for_updates())