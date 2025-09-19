from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from typing import Optional
import os

class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql://allemny_find:AFbqSrE%3Fh8bPjSCs9%23@localhost:5432/allemny_find_v2"
    
    # Security
    secret_key: str = "allemny-find-super-secret-key-change-in-production-2024"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"
    
    # API Settings
    api_v1_str: str = "/api/v1"
    project_name: str = "Allemny Find"
    

    # Groq API
    groq_api_key: str = "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"
    groq_model: str = "openai/gpt-oss-120b"
    
    # Ollama
    ollama_base_url: str = "http://localhost:11434"
    
    # File Processing
    max_file_size: int = 100 * 1024 * 1024  # 100MB
    chunk_size: int = 1000
    chunk_overlap: int = 200
    
    # Storage
    document_storage_path: str = "./document_storage"
    storage_threshold_mb: int = 10  # Files larger than this go to filesystem
    
    # Performance
    max_concurrent_jobs: int = 10
    batch_size: int = 100
    
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

settings = Settings()

# Create storage directory if it doesn't exist
os.makedirs(settings.document_storage_path, exist_ok=True)