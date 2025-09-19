# app/models/__init__.py
"""
Models package - ensures all models are imported and registered with SQLAlchemy
"""

# Import all models to register them with SQLAlchemy
from .user import User, UserRole
from .document import Document
from .search import SearchQuery, SearchSession, SearchLog
from .ingestion import IngestionJob, IngestionStatistics

# Import any new models created by agents
try:
    from .leaderboard import *  # Leaderboard models if any
except ImportError:
    pass

try:
    from .innovate import Suggestion, SuggestionVote, SuggestionComment
except ImportError:
    pass

# List all models for easy import
__all__ = [
    "User",
    "UserRole",
    "Document",
    "SearchQuery",
    "SearchSession",
    "SearchLog",
    "IngestionJob",
    "IngestionStatistics",
    "Suggestion",
    "SuggestionVote",
    "SuggestionComment"
]