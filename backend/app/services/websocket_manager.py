import json
import logging
from typing import Dict, Set, Any
from fastapi import WebSocket
from datetime import datetime
import asyncio

logger = logging.getLogger(__name__)

class ConnectionManager:
    """Manages WebSocket connections for real-time updates"""
    
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {
            "ingestion": set(),
            "search": set()
        }
        self.job_subscriptions: Dict[str, Set[WebSocket]] = {}
        self._last_toast_messages: Dict[str, str] = {}
        self._toast_cooldown = 2  # seconds between similar toasts
        
    async def connect(self, websocket: WebSocket, channel: str):
        """Connect a WebSocket to a channel"""
        await websocket.accept()
        self.active_connections[channel].add(websocket)
        logger.info(f"WebSocket connected to {channel} channel")
        
    def disconnect(self, websocket: WebSocket, channel: str):
        """Disconnect a WebSocket from a channel"""
        self.active_connections[channel].discard(websocket)
        # Remove from job subscriptions
        for job_id, subscribers in self.job_subscriptions.items():
            subscribers.discard(websocket)
            
    async def subscribe_to_job(self, websocket: WebSocket, job_id: str):
        """Subscribe a WebSocket to job updates"""
        if job_id not in self.job_subscriptions:
            self.job_subscriptions[job_id] = set()
        self.job_subscriptions[job_id].add(websocket)
        
    async def send_job_update(self, job_id: str, data: Dict[str, Any]):
        """Send update to all subscribers of a job"""
        if job_id in self.job_subscriptions:
            disconnected = set()
            
            # Add timestamp
            data['timestamp'] = datetime.now().isoformat()
            message = json.dumps(data)
            
            for websocket in self.job_subscriptions[job_id]:
                try:
                    await websocket.send_text(message)
                except Exception as e:
                    logger.error(f"Error sending to websocket: {e}")
                    disconnected.add(websocket)
                    
            # Clean up disconnected websockets
            for ws in disconnected:
                self.job_subscriptions[job_id].discard(ws)
                
    async def send_ingestion_progress(
        self, 
        job_id: str, 
        progress: float,
        stage: str,
        current_file: str = None,
        processed_files: int = 0,
        total_files: int = 0,
        message: str = None
    ):
        """Send ingestion progress update"""
        data = {
            'type': 'job_progress',
            'job_id': job_id,
            'progress': progress,
            'stage': stage,
            'current_file': current_file,
            'processed_files': processed_files,
            'total_files': total_files,
            'message': message
        }
        
        await self.send_job_update(job_id, data)
        
        # Send toast only for important state changes
        if self._should_send_toast(job_id, stage, message):
            await self.send_toast(
                'ingestion',
                'info' if stage not in ['failed', 'completed'] else stage,
                message or f"Job {stage}: {current_file or 'Processing...'}"
            )
            
    async def send_toast(self, channel: str, level: str, message: str):
        """Send toast notification with deduplication"""
        key = f"{channel}:{level}:{message[:50]}"
        
        # Check if similar toast was sent recently
        if key in self._last_toast_messages:
            return
            
        self._last_toast_messages[key] = message
        
        # Remove from cache after cooldown
        asyncio.create_task(self._clear_toast_cache(key))
        
        data = {
            'type': 'toast',
            'level': level,
            'message': message,
            'timestamp': datetime.now().isoformat()
        }
        
        await self.broadcast(channel, data)
        
    async def _clear_toast_cache(self, key: str):
        """Clear toast cache after cooldown"""
        await asyncio.sleep(self._toast_cooldown)
        self._last_toast_messages.pop(key, None)
        
    def _should_send_toast(self, job_id: str, stage: str, message: str) -> bool:
        """Determine if a toast should be sent"""
        important_stages = {
            'started', 'scanning', 'processing', 'embedding', 
            'completed', 'failed', 'cancelled'
        }
        
        important_messages = {
            'error', 'warning', 'success', 'failed', 'completed'
        }
        
        # Send toast for important stages
        if stage in important_stages:
            return True
            
        # Send toast for important message keywords
        if message and any(keyword in message.lower() for keyword in important_messages):
            return True
            
        return False
        
    async def broadcast(self, channel: str, data: Dict[str, Any]):
        """Broadcast message to all connections in a channel"""
        if channel in self.active_connections:
            disconnected = set()
            message = json.dumps(data)
            
            for websocket in self.active_connections[channel]:
                try:
                    await websocket.send_text(message)
                except Exception as e:
                    logger.error(f"Error broadcasting: {e}")
                    disconnected.add(websocket)
                    
            # Clean up disconnected websockets
            for ws in disconnected:
                self.active_connections[channel].discard(ws)

# Create singleton instance
manager = ConnectionManager()