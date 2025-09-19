import logging
import asyncio
import httpx
from typing import List, Dict, Any, Optional, Tuple
import tiktoken
import json
from datetime import datetime, timezone

from app.core.config import settings

logger = logging.getLogger(__name__)

class OllamaEmbeddingService:
    """Service for creating embeddings using Ollama locally"""
    
    def __init__(self):
        self.base_url = settings.ollama_base_url
        self.default_model = "nomic-embed-text"  # Default embedding model
        self.chunk_size = settings.chunk_size
        self.chunk_overlap = settings.chunk_overlap
        # Initialize httpx.AsyncClient. It will now remain open for the app's lifetime.
        self.client = httpx.AsyncClient(timeout=300.0)  # 5 minutes timeout
        
    async def get_available_models(self) -> List[Dict[str, Any]]:
        """Get list of available embedding models from Ollama"""
        try:
            response = await self.client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            
            data = response.json()
            models = data.get('models', [])
            
            # Filter for embedding models (those that typically contain 'embed' in name)
            embedding_models = []
            for model in models:
                model_name = model.get('name', '')
                model_info = {
                    'name': model_name,
                    'size': model.get('size', 0),
                    'modified_at': model.get('modified_at'),
                    'is_embedding_model': 'embed' in model_name.lower() or 'embedding' in model_name.lower(),
                    'digest': model.get('digest', ''),
                    'family': model.get('details', {}).get('family', 'unknown')
                }
                embedding_models.append(model_info)
            
            logger.info(f"Found {len(embedding_models)} models in Ollama")
            return embedding_models
            
        except Exception as e:
            logger.error(f"Error fetching Ollama models: {e}")
            return []
    
    async def check_model_availability(self, model_name: str) -> bool:
        """Check if a specific model is available in Ollama"""
        try:
            models = await self.get_available_models()
            return any(model['name'] == model_name for model in models)
        except Exception as e:
            logger.error(f"Error checking model availability: {e}")
            return False
    
    async def pull_model(self, model_name: str) -> bool:
        """Pull a model from Ollama registry"""
        try:
            logger.info(f"Pulling model: {model_name}")
            
            async with self.client.stream(
                'POST',
                f"{self.base_url}/api/pull",
                json={"name": model_name},
                timeout=1800  # 30 minutes for model download
            ) as response:
                response.raise_for_status()
                
                async for line in response.aiter_lines():
                    if line:
                        try:
                            data = json.loads(line)
                            status = data.get('status', '')
                            if 'error' in data:
                                logger.error(f"Error pulling model: {data['error']}")
                                return False
                            if status:
                                logger.info(f"Model pull status: {status}")
                        except json.JSONDecodeError:
                            continue
            
            logger.info(f"Successfully pulled model: {model_name}")
            return True
            
        except Exception as e:
            logger.error(f"Error pulling model {model_name}: {e}")
            return False
    
    def _chunk_text_sync(self, text: str, model_name: str = None) -> List[Dict[str, Any]]:
        """
        Split text into overlapping chunks using tiktoken approach
        
        Args:
            text: Text to chunk
            model_name: Model name for tokenization (falls back to tiktoken)
            
        Returns:
            List of chunk dictionaries with content, token_count, and metadata
        """
        try:
            # For now, use tiktoken as a fallback since Ollama doesn't expose tokenization directly
            try:
                encoding = tiktoken.get_encoding("cl100k_base")  # GPT-4 encoding
            except Exception:
                # Fallback to simple word-based chunking
                return self._chunk_by_words(text)
            
            # Tokenize the entire text
            tokens = encoding.encode(text)
            chunks = []
            
            start_idx = 0
            chunk_idx = 0
            
            while start_idx < len(tokens):
                # Calculate end index for this chunk
                end_idx = min(start_idx + self.chunk_size, len(tokens))
                
                # Extract chunk tokens
                chunk_tokens = tokens[start_idx:end_idx]
                chunk_text = encoding.decode(chunk_tokens)
                
                # Find the actual character positions in the original text
                start_char = len(encoding.decode(tokens[:start_idx])) if start_idx > 0 else 0
                end_char = len(encoding.decode(tokens[:end_idx]))
                
                chunk_data = {
                    'content': chunk_text,
                    'text': chunk_text,  # Add 'text' field for compatibility
                    'chunk_index': chunk_idx,
                    'token_count': len(chunk_tokens),
                    'start_char': start_char,
                    'end_char': end_char,
                    'start_token': start_idx,
                    'end_token': end_idx,
                    'overlap_tokens': self.chunk_overlap if start_idx > 0 else 0
                }
                
                chunks.append(chunk_data)
                
                # Move to next chunk with overlap
                if end_idx >= len(tokens):
                    break
                    
                start_idx = end_idx - self.chunk_overlap
                chunk_idx += 1
            
            logger.info(f"Created {len(chunks)} chunks from text ({len(tokens)} tokens)")
            return chunks
            
        except Exception as e:
            logger.error(f"Error chunking text: {e}")
            return self._chunk_by_words(text)
    
    def _chunk_by_words(self, text: str) -> List[Dict[str, Any]]:
        """Fallback word-based chunking when tokenization fails"""
        words = text.split()
        chunks = []
        chunk_idx = 0
        
        # Approximate words per token ratio (rough estimate)
        words_per_chunk = int(self.chunk_size * 0.75)  # Rough approximation
        words_overlap = int(self.chunk_overlap * 0.75)
        
        start_idx = 0
        
        while start_idx < len(words):
            end_idx = min(start_idx + words_per_chunk, len(words))
            chunk_words = words[start_idx:end_idx]
            chunk_text = ' '.join(chunk_words)
            
            chunk_data = {
                'content': chunk_text,
                'text': chunk_text,  # Add 'text' field for compatibility
                'chunk_index': chunk_idx,
                'token_count': len(chunk_words),  # Word count as approximation
                'start_char': 0,  # Would need more complex calculation
                'end_char': len(chunk_text),
                'overlap_tokens': words_overlap if start_idx > 0 else 0
            }
            
            chunks.append(chunk_data)
            
            if end_idx >= len(words):
                break
                
            start_idx = end_idx - words_overlap
            chunk_idx += 1
        
        return chunks
    
    async def get_embedding(self, text: str, model_name: str = None) -> List[float]:
        """
        Get embedding vector for a single text (interface method for worker compatibility)
        
        Args:
            text: Text to embed
            model_name: Ollama model to use
            
        Returns:
            List of floats representing the embedding vector
        """
        if not model_name:
            model_name = self.default_model
        
        try:
            result = await self.create_embedding(text, model_name)
            if result.get('success') and result.get('embedding'):
                return result['embedding']
            else:
                raise ValueError(f"Failed to create embedding: {result.get('error', 'Unknown error')}")
        except Exception as e:
            logger.error(f"Error getting embedding: {e}")
            raise
    
    async def chunk_text(self, text: str, model_name: str = None, chunk_size: int = None, chunk_overlap: int = None) -> List[Dict[str, Any]]:
        """
        Chunk text and create embeddings for each chunk (async version for worker compatibility)
        
        Args:
            text: Text to chunk
            model_name: Ollama model to use for embeddings
            chunk_size: Override default chunk size
            chunk_overlap: Override default chunk overlap
            
        Returns:
            List of chunk dictionaries with embeddings included
        """
        if not model_name:
            model_name = self.default_model
        
        # Use provided chunk settings or fall back to defaults
        original_chunk_size = self.chunk_size
        original_chunk_overlap = self.chunk_overlap
        
        if chunk_size is not None:
            self.chunk_size = chunk_size
        if chunk_overlap is not None:
            self.chunk_overlap = chunk_overlap
        
        try:
            # First, chunk the text
            chunks = self._chunk_text_sync(text, model_name)
            
            # Then create embeddings for each chunk
            chunks_with_embeddings = await self.process_document_chunks(chunks, model_name)
            
            return chunks_with_embeddings
            
        except Exception as e:
            logger.error(f"Error in async chunk_text: {e}")
            raise
        finally:
            # Restore original settings
            self.chunk_size = original_chunk_size
            self.chunk_overlap = original_chunk_overlap
    
    async def create_embedding(self, text: str, model_name: str = None) -> Dict[str, Any]:
        """
        Create embedding for a single text using Ollama
        
        Args:
            text: Text to embed
            model_name: Ollama model to use
            
        Returns:
            Dictionary with embedding vector and metadata
        """
        if not model_name:
            model_name = self.default_model
        
        try:
            # Ensure model is available
            if not await self.check_model_availability(model_name):
                logger.info(f"Model {model_name} not available, attempting to pull...")
                if not await self.pull_model(model_name):
                    raise ValueError(f"Failed to pull model: {model_name}")
            
            # Create embedding
            response = await self.client.post(
                f"{self.base_url}/api/embeddings",
                json={
                    "model": model_name,
                    "prompt": text
                }
            )
            response.raise_for_status()
            
            data = response.json()
            embedding = data.get('embedding', [])
            
            if not embedding:
                raise ValueError("No embedding returned from Ollama")
            
            result = {
                'embedding': embedding,
                'model': model_name,
                'dimension': len(embedding),
                'text_length': len(text),
                'created_at': datetime.now(timezone.utc),
                'success': True
            }
            
            logger.debug(f"Created embedding with dimension {len(embedding)}")
            return result
            
        except Exception as e:
            logger.error(f"Error creating embedding: {e}")
            return {
                'embedding': None,
                'model': model_name,
                'error': str(e),
                'text_length': len(text),
                'created_at': datetime.now(timezone.utc),
                'success': False
            }
    
    async def create_embeddings_batch(self, texts: List[str], model_name: str = None) -> List[Dict[str, Any]]:
        """
        Create embeddings for multiple texts
        
        Args:
            texts: List of texts to embed
            model_name: Ollama model to use
            
        Returns:
            List of embedding results
        """
        if not model_name:
            model_name = self.default_model
        
        logger.info(f"Creating embeddings for {len(texts)} texts using model: {model_name}")
        
        # Process embeddings concurrently with limit
        semaphore = asyncio.Semaphore(5)  # Limit concurrent requests
        
        async def create_single_embedding(text: str) -> Dict[str, Any]:
            async with semaphore:
                return await self.create_embedding(text, model_name)
        
        tasks = [create_single_embedding(text) for text in texts]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Handle exceptions
        processed_results = []
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error(f"Error processing embedding {i}: {result}")
                processed_results.append({
                    'embedding': None,
                    'model': model_name,
                    'error': str(result),
                    'text_length': len(texts[i]),
                    'created_at': datetime.now(timezone.utc),
                    'success': False
                })
            else:
                processed_results.append(result)
        
        successful_count = sum(1 for r in processed_results if r.get('success', False))
        logger.info(f"Successfully created {successful_count}/{len(texts)} embeddings")
        
        return processed_results
    
    async def process_document_chunks(self, chunks: List[Dict[str, Any]], model_name: str = None) -> List[Dict[str, Any]]:
        """
        Process document chunks to create embeddings
        
        Args:
            chunks: List of document chunks from document_processor
            model_name: Ollama model to use
            
        Returns:
            List of chunk data with embeddings
        """
        texts = [chunk['content'] for chunk in chunks]
        embeddings = await self.create_embeddings_batch(texts, model_name)
        
        # Combine chunk data with embeddings
        processed_chunks = []
        for chunk, embedding_result in zip(chunks, embeddings):
            chunk_with_embedding = {
                **chunk,
                'embedding': embedding_result.get('embedding'),
                'embedding_model': embedding_result.get('model'),
                'embedding_dimension': embedding_result.get('dimension'),
                'embedding_success': embedding_result.get('success', False),
                'embedding_error': embedding_result.get('error'),
                'embedding_created_at': embedding_result.get('created_at')
            }
            processed_chunks.append(chunk_with_embedding)
        
        return processed_chunks
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test connection to Ollama service"""
        try:
            response = await self.client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            
            return {
                'status': 'connected',
                'ollama_url': self.base_url,
                'available_models': len(response.json().get('models', [])),
                'tested_at': datetime.now(timezone.utc)
            }
            
        except Exception as e:
            return {
                'status': 'error',
                'ollama_url': self.base_url,
                'error': str(e),
                'tested_at': datetime.now(timezone.utc)
            }
    
    async def close(self):
        """Close the HTTP client"""
        if self.client:
            await self.client.aclose()
    
    def __del__(self):
        """Cleanup on deletion"""
        if hasattr(self, 'client') and self.client:
            try:
                asyncio.create_task(self.client.aclose())
            except Exception:
                pass  # Ignore cleanup errors

# Create global instance
embedding_service = OllamaEmbeddingService()