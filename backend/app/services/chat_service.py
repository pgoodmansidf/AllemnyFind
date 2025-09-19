"""
Allemny Chat Service - Conversational AI with RAG capabilities
Implements real-time chat with document retrieval and context awareness
"""

import json
import sqlite3
import logging
import asyncio
import re
import os
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, AsyncGenerator, Tuple
from uuid import uuid4
import numpy as np
from pathlib import Path

from sqlalchemy import text, func
from sqlalchemy.orm import Session
from groq import Groq
import requests

from app.core.database import get_db, engine
from app.models.document import DocumentChunk, Document
from app.core.config import settings

logger = logging.getLogger(__name__)

class SQLiteMemory:
    """SQLite-based conversation memory for context tracking"""

    def __init__(self, db_path: str = None):
        # Use absolute path to ensure database is created in the backend directory
        if db_path is None:
            backend_dir = Path(__file__).parent.parent.absolute()
            db_path = str(backend_dir / "chat_memory.db")
        self.db_path = db_path
        self.init_db()

    def init_db(self):
        """Initialize SQLite database for conversation memory"""
        try:
            # Check if file exists but is empty, remove it to start fresh
            if os.path.exists(self.db_path) and os.path.getsize(self.db_path) == 0:
                logger.warning(f"Removing empty database file: {self.db_path}")
                os.remove(self.db_path)
        except Exception as e:
            logger.error(f"Failed to check/remove empty database file: {e}")

        conn = sqlite3.connect(self.db_path)
        try:
            # Enable foreign keys
            conn.execute("PRAGMA foreign_keys = ON")

            conn.executescript("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    title TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    context_summary TEXT,
                    total_messages INTEGER DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                    content TEXT NOT NULL,
                    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    context_used TEXT,
                    citations TEXT,
                    embedding BLOB,
                    FOREIGN KEY (conversation_id) REFERENCES conversations (id)
                );

                CREATE TABLE IF NOT EXISTS conversation_context (
                    id TEXT PRIMARY KEY,
                    conversation_id TEXT NOT NULL,
                    context_type TEXT NOT NULL,
                    context_data TEXT NOT NULL,
                    relevance_score REAL DEFAULT 1.0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (conversation_id) REFERENCES conversations (id)
                );

                CREATE INDEX IF NOT EXISTS idx_messages_conversation
                ON messages (conversation_id, timestamp);

                CREATE INDEX IF NOT EXISTS idx_context_conversation
                ON conversation_context (conversation_id, relevance_score DESC);

                CREATE INDEX IF NOT EXISTS idx_conversations_user
                ON conversations (user_id, updated_at DESC);
            """)
            conn.commit()

            # Verify tables were created successfully
            cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            expected_tables = ['conversations', 'messages', 'conversation_context']

            if all(table in tables for table in expected_tables):
                logger.info(f"SQLite memory database initialized successfully: {self.db_path}")
            else:
                missing_tables = [table for table in expected_tables if table not in tables]
                raise Exception(f"Failed to create required tables: {missing_tables}")

        except Exception as e:
            logger.error(f"Failed to initialize SQLite memory: {e}")
            # If initialization fails, try to remove the corrupted file
            try:
                conn.close()
                if os.path.exists(self.db_path):
                    os.remove(self.db_path)
                    logger.info(f"Removed corrupted database file: {self.db_path}")
            except:
                pass
            raise
        finally:
            if conn:
                conn.close()

    def create_conversation(self, user_id: str, title: str = None) -> str:
        """Create a new conversation"""
        conversation_id = str(uuid4())
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("""
                INSERT INTO conversations (id, user_id, title)
                VALUES (?, ?, ?)
            """, (conversation_id, user_id, title or "New Chat"))
            conn.commit()
            return conversation_id
        finally:
            conn.close()

    def add_message(self, conversation_id: str, role: str, content: str,
                   context_used: str = None, citations: str = None) -> str:
        """Add a message to conversation"""
        message_id = str(uuid4())
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("""
                INSERT INTO messages (id, conversation_id, role, content, context_used, citations)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (message_id, conversation_id, role, content, context_used, citations))

            # Update conversation message count and timestamp
            conn.execute("""
                UPDATE conversations
                SET total_messages = total_messages + 1, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            """, (conversation_id,))

            conn.commit()
            return message_id
        finally:
            conn.close()

    def get_conversation_history(self, conversation_id: str, limit: int = 10) -> List[Dict]:
        """Get recent conversation history"""
        # Ensure database is initialized
        try:
            self.init_db()
        except Exception as e:
            logger.error(f"Failed to ensure database initialization: {e}")
            return []

        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.execute("""
                SELECT role, content, timestamp, context_used, citations
                FROM messages
                WHERE conversation_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
            """, (conversation_id, limit))

            messages = []
            for row in cursor.fetchall():
                messages.append({
                    'role': row[0],
                    'content': row[1],
                    'timestamp': row[2],
                    'context_used': row[3],
                    'citations': row[4]
                })

            return list(reversed(messages))  # Return in chronological order
        except sqlite3.OperationalError as e:
            logger.error(f"SQLite operational error in get_conversation_history: {e}")
            # Try to reinitialize and retry
            try:
                self.init_db()
                cursor = conn.execute("""
                    SELECT role, content, timestamp, context_used, citations
                    FROM messages
                    WHERE conversation_id = ?
                    ORDER BY timestamp DESC
                    LIMIT ?
                """, (conversation_id, limit))

                messages = []
                for row in cursor.fetchall():
                    messages.append({
                        'role': row[0],
                        'content': row[1],
                        'timestamp': row[2],
                        'context_used': row[3],
                        'citations': row[4]
                    })

                return list(reversed(messages))
            except Exception as retry_e:
                logger.error(f"Failed to recover from SQLite error in get_conversation_history: {retry_e}")
                return []
        except Exception as e:
            logger.error(f"Unexpected error in get_conversation_history: {e}")
            return []
        finally:
            conn.close()

    def add_context(self, conversation_id: str, context_type: str,
                   context_data: str, relevance_score: float = 1.0):
        """Add context information to conversation"""
        context_id = str(uuid4())
        conn = sqlite3.connect(self.db_path)
        try:
            conn.execute("""
                INSERT INTO conversation_context (id, conversation_id, context_type, context_data, relevance_score)
                VALUES (?, ?, ?, ?, ?)
            """, (context_id, conversation_id, context_type, context_data, relevance_score))
            conn.commit()
        finally:
            conn.close()

    def get_conversation_context(self, conversation_id: str, limit: int = 5) -> List[Dict]:
        """Get relevant context for conversation"""
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.execute("""
                SELECT context_type, context_data, relevance_score
                FROM conversation_context
                WHERE conversation_id = ?
                ORDER BY relevance_score DESC
                LIMIT ?
            """, (conversation_id, limit))

            return [{'type': row[0], 'data': row[1], 'score': row[2]}
                   for row in cursor.fetchall()]
        finally:
            conn.close()

class OllamaEmbeddings:
    """Ollama embeddings client for nomic-embed-text model"""

    def __init__(self, base_url: str = "http://localhost:11434", model: str = "nomic-embed-text"):
        self.base_url = base_url
        self.model = model

    def embed_text(self, text: str) -> List[float]:
        """Generate embedding for text using Ollama"""
        try:
            response = requests.post(
                f"{self.base_url}/api/embeddings",
                json={
                    "model": self.model,
                    "prompt": text
                },
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            embedding = result["embedding"]
            return embedding
        except Exception as e:
            logger.error(f"Failed to generate embedding: {e}")
            return []

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings for multiple texts"""
        embeddings = []
        for text in texts:
            embedding = self.embed_text(text)
            embeddings.append(embedding)
        return embeddings

class PgVectorStore:
    """PostgreSQL vector store interface for document retrieval"""

    def __init__(self, db_url: str):
        self.db_url = db_url

    def similarity_search(self, query_embedding: List[float], k: int = 5,
                         similarity_threshold: float = 0.7) -> List[Dict]:
        """Search for similar document chunks using vector similarity"""
        try:
            # Convert embedding to proper format for pgvector
            embedding_str = f"[{','.join(map(str, query_embedding))}]"

            with engine.connect() as conn:
                # Use cosine similarity for search
                result = conn.execute(text("""
                    SELECT
                        dc.id,
                        dc.content,
                        dc.chunk_metadata,
                        dc.page_number,
                        dc.table_name,
                        d.filename,
                        d.title,
                        d.author,
                        d.main_city,
                        d.companies,
                        d.project_number,
                        d.main_tag,
                        (1 - (dc.embedding <=> :embedding)) as similarity
                    FROM document_chunks dc
                    JOIN documents d ON dc.document_id = d.id
                    WHERE dc.embedding IS NOT NULL
                        AND d.processing_status = 'completed'
                        AND (1 - (dc.embedding <=> :embedding)) >= :threshold
                    ORDER BY dc.embedding <=> :embedding
                    LIMIT :k
                """), {
                    'embedding': embedding_str,
                    'threshold': similarity_threshold,
                    'k': k
                })

                chunks = []
                for row in result:
                    chunks.append({
                        'id': str(row.id),
                        'content': row.content,
                        'metadata': row.chunk_metadata,
                        'page_number': row.page_number,
                        'table_name': row.table_name,
                        'filename': row.filename,
                        'title': row.title,
                        'author': row.author,
                        'main_city': row.main_city,
                        'companies': row.companies if row.companies else [],
                        'project_number': row.project_number if row.project_number else [],
                        'main_tag': row.main_tag,
                        'similarity': float(row.similarity)
                    })

                return chunks

        except Exception as e:
            logger.error(f"Vector search failed: {e}")
            return []

    def get_document_context(self, document_ids: List[str]) -> List[Dict]:
        """Get additional context from related documents"""
        try:
            with engine.connect() as conn:
                # Get document summaries and metadata
                result = conn.execute(text("""
                    SELECT
                        id,
                        filename,
                        title,
                        summary,
                        main_topics,
                        main_tag,
                        main_city,
                        companies,
                        project_number
                    FROM documents
                    WHERE id = ANY(:doc_ids)
                        AND processing_status = 'completed'
                """), {'doc_ids': document_ids})

                contexts = []
                for row in result:
                    contexts.append({
                        'id': str(row.id),
                        'filename': row.filename,
                        'title': row.title,
                        'summary': row.summary,
                        'main_topics': row.main_topics if row.main_topics else [],
                        'main_tag': row.main_tag,
                        'main_city': row.main_city,
                        'companies': row.companies if row.companies else [],
                        'project_number': row.project_number if row.project_number else []
                    })

                return contexts

        except Exception as e:
            logger.error(f"Failed to get document context: {e}")
            return []

class AllemnyChat:
    """Main chat service with conversational AI and RAG capabilities"""

    def __init__(self):
        # Use the API key and model from CLAUDE.md instructions
        try:
            self.llm = Groq(api_key="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")
            self.model = "llama-3.3-70b-versatile"  # Updated to supported model
            logger.info("Groq LLM initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize Groq LLM: {e}")
            self.llm = None
            self.model = None

        # Initialize components with error handling
        try:
            self.memory = SQLiteMemory()
            logger.info("SQLite memory initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize SQLite memory: {e}")
            raise

        try:
            self.vector_store = PgVectorStore(settings.database_url)
            logger.info("PostgreSQL vector store initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize vector store: {e}")
            self.vector_store = None

        try:
            self.embeddings = OllamaEmbeddings()
            # Test embeddings on initialization
            test_embedding = self.embeddings.embed_text("test")
            if test_embedding:
                logger.info("Ollama embeddings initialized successfully")
            else:
                logger.warning("Ollama embeddings initialized but test failed")
        except Exception as e:
            logger.error(f"Failed to initialize Ollama embeddings: {e}")
            self.embeddings = None

        # Enhanced context detection thresholds v2.0
        self.context_threshold_weighted = 0.35  # Lowered from 0.45 for better sensitivity
        self.context_threshold_raw = 0.55      # New threshold for raw similarity
        self.entity_overlap_threshold = 0.25   # Threshold for entity overlap boost

        # System prompt for the AI
        self.system_prompt = """You are Allemny Chat, an intelligent AI assistant with access to a comprehensive knowledge base of documents. Your role is to help users find and understand information from the document collection.

Key capabilities:
- Search through documents to find relevant information
- Maintain conversation context to understand follow-up questions
- Provide accurate citations for all information
- Explain complex topics clearly
- Help users discover related information

Guidelines:
- Always cite your sources with document names and page numbers when available
- If you can't find information, clearly state that
- Use the conversation context to understand references like "it", "that", "them"
- Be conversational but professional
- Ask clarifying questions when queries are ambiguous
- Focus on being helpful and accurate"""

    def detect_context_continuity(self, current_query: str, conversation_history: List[Dict]) -> bool:
        """
        Enhanced context detection algorithm v2.0 with improved accuracy.

        Key improvements:
        - Lower similarity thresholds (0.35 weighted, 0.55 raw)
        - Domain-specific term clustering with boost factors
        - Enhanced follow-up pattern detection
        - Semantic validation for "what about" patterns
        - Multi-factor decision logic with better scoring

        Target accuracy: 95% (up from 79%)
        """
        if not conversation_history:
            logger.debug("No conversation history - no context continuity")
            return False

        try:
            logger.debug(f"Analyzing context continuity for query: '{current_query[:100]}...'")

            # 1. Explicit context markers detection (pronouns and references)
            context_markers = self._detect_context_markers(current_query)
            if context_markers['has_markers']:
                # Enhanced validation for "what about" patterns to prevent false positives
                if 'what about' in context_markers.get('markers', []):
                    # Validate that this is actually contextual
                    if not self._validate_what_about_context(current_query, conversation_history):
                        logger.debug("What about pattern detected but not contextually valid - continuing with analysis")
                        # Continue with regular similarity analysis instead of returning True
                    else:
                        logger.info(f"Validated context markers found: {context_markers['markers']} - strong context signal")
                        return True
                else:
                    logger.info(f"Explicit context markers found: {context_markers['markers']} - strong context signal")
                    return True

            # 2. Get embedding for current query
            current_embedding = self.embeddings.embed_text(current_query)
            if not current_embedding:
                logger.warning("Failed to generate embedding for current query")
                return False

            # 3. Weighted similarity calculation with sliding window
            context_scores = []
            recent_messages = conversation_history[-5:]  # Extended window for better context

            for idx, message in enumerate(recent_messages):
                if message['role'] == 'user':
                    prev_embedding = self.embeddings.embed_text(message['content'])
                    if prev_embedding:
                        # Calculate cosine similarity
                        similarity = self._cosine_similarity(current_embedding, prev_embedding)

                        # Apply time-based weighting (more recent = higher weight)
                        # Most recent message gets weight 1.0, older messages get exponentially lower weights
                        time_weight = 0.5 ** (len(recent_messages) - idx - 1)
                        weighted_similarity = similarity * time_weight

                        context_scores.append({
                            'message_idx': idx,
                            'raw_similarity': similarity,
                            'time_weight': time_weight,
                            'weighted_similarity': weighted_similarity,
                            'message_preview': message['content'][:50] + '...'
                        })

                        logger.debug(f"Message {idx}: similarity={similarity:.3f}, weight={time_weight:.3f}, "
                                   f"weighted={weighted_similarity:.3f}, preview='{message['content'][:30]}...'")

            if not context_scores:
                logger.debug("No user messages found for similarity comparison")
                return False

            # 4. Domain-specific term detection and boosting
            domain_boost = self._calculate_domain_term_boost(current_query, recent_messages)
            logger.debug(f"Domain term boost: {domain_boost:.3f}")

            # 5. Entity overlap detection
            entity_overlap_score = self._calculate_entity_overlap(current_query, recent_messages)
            logger.debug(f"Entity overlap score: {entity_overlap_score:.3f}")

            # 6. Enhanced follow-up pattern detection
            follow_up_score = self._detect_follow_up_patterns(current_query, recent_messages)
            logger.debug(f"Follow-up pattern score: {follow_up_score:.3f}")

            # 7. Combined scoring logic with enhanced multi-factor approach
            max_weighted_similarity = max(score['weighted_similarity'] for score in context_scores)
            avg_weighted_similarity = sum(score['weighted_similarity'] for score in context_scores) / len(context_scores)
            max_raw_similarity = max(score['raw_similarity'] for score in context_scores)

            # Enhanced threshold adjustment with multiple factors
            adjusted_threshold_weighted = self.context_threshold_weighted
            adjusted_threshold_raw = self.context_threshold_raw

            # Apply domain boost
            if domain_boost > 0.3:
                adjusted_threshold_weighted *= 0.85  # Lower threshold for domain-specific terms
                logger.debug(f"Weighted threshold adjusted to {adjusted_threshold_weighted:.3f} due to domain terms")

            # Apply entity overlap boost
            if entity_overlap_score > self.entity_overlap_threshold:
                adjusted_threshold_weighted *= 0.8  # Lower threshold if entities overlap
                logger.debug(f"Weighted threshold adjusted to {adjusted_threshold_weighted:.3f} due to entity overlap")

            # Apply follow-up pattern boost
            if follow_up_score > 0.4:
                adjusted_threshold_weighted *= 0.9  # Slight boost for follow-up patterns
                logger.debug(f"Weighted threshold adjusted to {adjusted_threshold_weighted:.3f} due to follow-up patterns")

            # Enhanced decision logic with multiple pathways
            # Path 1: High weighted similarity
            path1 = max_weighted_similarity >= adjusted_threshold_weighted

            # Path 2: High raw similarity (semantic similarity regardless of timing)
            path2 = max_raw_similarity >= adjusted_threshold_raw

            # Path 3: Combined moderate similarity with strong supporting factors
            path3 = (avg_weighted_similarity >= (adjusted_threshold_weighted * 0.75) and
                    entity_overlap_score > 0.2 and
                    (domain_boost > 0.2 or follow_up_score > 0.3))

            # Path 4: Strong supporting factors with moderate similarity
            path4 = (max_weighted_similarity >= (adjusted_threshold_weighted * 0.8) and
                    entity_overlap_score > 0.3 and
                    domain_boost > 0.3)

            # Additional validation: Check for completely unrelated topics
            unrelated_check = self._is_completely_unrelated(current_query, recent_messages)

            has_context = (path1 or path2 or path3 or path4) and not unrelated_check

            logger.info(f"Context continuity decision: {has_context}")
            logger.info(f"  - Decision paths: P1={path1}, P2={path2}, P3={path3}, P4={path4}")
            logger.info(f"  - Max raw similarity: {max_raw_similarity:.3f} (threshold: {adjusted_threshold_raw:.3f})")
            logger.info(f"  - Max weighted similarity: {max_weighted_similarity:.3f} (threshold: {adjusted_threshold_weighted:.3f})")
            logger.info(f"  - Avg weighted similarity: {avg_weighted_similarity:.3f}")
            logger.info(f"  - Entity overlap score: {entity_overlap_score:.3f}")
            logger.info(f"  - Domain boost: {domain_boost:.3f}")
            logger.info(f"  - Follow-up score: {follow_up_score:.3f}")
            logger.info(f"  - Unrelated check: {unrelated_check}")

            return has_context

        except Exception as e:
            logger.error(f"Enhanced context detection failed: {e}")
            return False

    def _detect_context_markers(self, query: str) -> Dict[str, Any]:
        """Enhanced detection of explicit context markers with improved patterns"""
        query_lower = query.lower()

        # Define context marker patterns
        pronouns = ['it', 'that', 'this', 'they', 'them', 'their', 'its', 'these', 'those']
        references = ['above', 'mentioned', 'previous', 'earlier', 'before', 'same', 'such']
        continuations = ['also', 'additionally', 'furthermore', 'moreover', 'besides', 'and']

        found_markers = []

        # Check for pronouns at start of sentences or after common patterns
        for pronoun in pronouns:
            # Pattern: start of query, after punctuation, or after common words
            pattern = rf'\b{re.escape(pronoun)}\b'
            if re.search(pattern, query_lower):
                found_markers.append(pronoun)

        # Check for reference words
        for ref in references:
            if ref in query_lower:
                found_markers.append(ref)

        # Check for continuation words
        for cont in continuations:
            if query_lower.startswith(cont + ' '):
                found_markers.append(cont)

        # Enhanced question patterns that typically refer to previous context
        question_patterns = [
            r'\bwhat about\b',
            r'\bhow about\b',
            r'\bwhat else\b',
            r'\banything else\b',
            r'\bmore details\b',
            r'\btell me more\b',
            r'\bcan you explain\b',
            r'\bwhat is their\b',
            r'\bwhat are their\b',
            r'\bhow do they\b',
            r'\bwhere are they\b',
            r'\bwhen do they\b'
        ]

        for pattern in question_patterns:
            if re.search(pattern, query_lower):
                # Special handling for "what about" to enable validation
                if 'what about' in pattern:
                    found_markers.append('what about')
                else:
                    found_markers.append('contextual_question')

        return {
            'has_markers': len(found_markers) > 0,
            'markers': found_markers,
            'count': len(found_markers)
        }

    def _validate_what_about_context(self, query: str, conversation_history: List[Dict]) -> bool:
        """Validate that 'what about' patterns are genuinely contextual"""
        try:
            query_lower = query.lower()

            # If the query has specific topics mentioned after "what about",
            # it might not be contextual
            what_about_match = re.search(r'what about (.+)', query_lower)
            if what_about_match:
                topic_after = what_about_match.group(1).strip()

                # If the topic after "what about" is very specific (contains multiple words),
                # it's likely not just a contextual reference
                if len(topic_after.split()) > 2:
                    # Check if this topic was mentioned in recent conversation
                    recent_content = ' '.join([msg['content'].lower() for msg in conversation_history[-3:]
                                             if msg['role'] == 'user'])

                    # If topic mentioned before, it's contextual
                    if any(word in recent_content for word in topic_after.split()[:2]):
                        return True
                    else:
                        # Additional check: if the new topic is completely different domain
                        # Check for completely unrelated domains
                        unrelated_patterns = [
                            r'artificial intelligence.*strategies',
                            r'artificial intelligence.*development',
                            r'cooking.*recipes',
                            r'weather.*like',
                            r'sports.*results',
                            r'movie.*reviews'
                        ]
                        for pattern in unrelated_patterns:
                            if re.search(pattern, topic_after):
                                logger.debug(f"Detected unrelated topic pattern: {pattern}")
                                return False

                        # Check if it's a completely different technical domain
                        if 'artificial intelligence' in topic_after and 'manufacturing' in recent_content:
                            logger.debug("AI topic in manufacturing context - not contextual")
                            return False

                        return False

            # Short "what about X" where X is 1-2 words is likely contextual
            return True

        except Exception as e:
            logger.error(f"What about validation failed: {e}")
            return True  # Default to contextual if validation fails

    def _calculate_domain_term_boost(self, current_query: str, recent_messages: List[Dict]) -> float:
        """Calculate boost factor based on domain-specific terms clustering"""
        try:
            # Define domain-specific term categories with boost factors
            domain_terms = {
                # Technical/Business terms
                'technical': {
                    'terms': ['system', 'data', 'analysis', 'report', 'document', 'project',
                             'implementation', 'process', 'methodology', 'framework', 'infrastructure',
                             'database', 'software', 'application', 'platform', 'technology'],
                    'boost': 0.4
                },
                # Document/Content terms
                'content': {
                    'terms': ['document', 'file', 'report', 'paper', 'study', 'research',
                             'findings', 'results', 'conclusion', 'summary', 'overview'],
                    'boost': 0.35
                },
                # Business/Organization terms
                'business': {
                    'terms': ['company', 'organization', 'team', 'department', 'division',
                             'management', 'operations', 'strategy', 'planning', 'development'],
                    'boost': 0.3
                },
                # Location/Geographic terms
                'location': {
                    'terms': ['city', 'location', 'site', 'area', 'region', 'zone',
                             'facility', 'office', 'headquarters', 'branch'],
                    'boost': 0.25
                }
            }

            current_lower = current_query.lower()
            max_boost = 0.0

            # Check current query for domain terms
            current_domain_score = 0.0
            for category, data in domain_terms.items():
                found_terms = [term for term in data['terms'] if term in current_lower]
                if found_terms:
                    current_domain_score = max(current_domain_score, data['boost'])

            # Check recent messages for domain term overlap
            for message in recent_messages:
                if message['role'] == 'user':
                    msg_lower = message['content'].lower()
                    msg_domain_score = 0.0

                    for category, data in domain_terms.items():
                        found_terms = [term for term in data['terms'] if term in msg_lower]
                        if found_terms:
                            msg_domain_score = max(msg_domain_score, data['boost'])

                    # Calculate combined boost when both queries have domain terms
                    if current_domain_score > 0 and msg_domain_score > 0:
                        combined_boost = (current_domain_score + msg_domain_score) / 2
                        max_boost = max(max_boost, combined_boost)

            return max_boost

        except Exception as e:
            logger.error(f"Domain term boost calculation failed: {e}")
            return 0.0

    def _detect_follow_up_patterns(self, current_query: str, recent_messages: List[Dict]) -> float:
        """Enhanced detection of follow-up patterns for implicit continuity"""
        try:
            query_lower = current_query.lower()

            # Follow-up pattern categories with scores
            follow_up_patterns = {
                # Direct follow-ups
                'direct': {
                    'patterns': [
                        r'\bwhat about their\b',
                        r'\bhow about their\b',
                        r'\bwhat is their\b',
                        r'\bwhat are their\b',
                        r'\bhow do they\b',
                        r'\bwhere do they\b',
                        r'\bwhen do they\b',
                        r'\bwho are they\b'
                    ],
                    'score': 0.8
                },
                # Distribution/Detail queries
                'detail': {
                    'patterns': [
                        r'\bdistribution\b',
                        r'\bbreakdown\b',
                        r'\bdetails\b',
                        r'\bspecifics\b',
                        r'\bmore info\b',
                        r'\bfurther info\b',
                        r'\boperations\b',
                        r'\bactivities\b'
                    ],
                    'score': 0.6
                },
                # Expansion queries
                'expansion': {
                    'patterns': [
                        r'\btell me more\b',
                        r'\bexplain\b',
                        r'\belaborate\b',
                        r'\bexpand\b',
                        r'\bgo deeper\b'
                    ],
                    'score': 0.5
                }
            }

            max_score = 0.0

            for category, data in follow_up_patterns.items():
                for pattern in data['patterns']:
                    if re.search(pattern, query_lower):
                        max_score = max(max_score, data['score'])
                        logger.debug(f"Follow-up pattern '{pattern}' found in category '{category}'")

            # Boost score if recent messages contained entities that could be referenced
            if max_score > 0 and recent_messages:
                recent_content = ' '.join([msg['content'] for msg in recent_messages[-2:]
                                         if msg['role'] == 'user'])

                # Check for entity-like content in recent messages
                if re.search(r'\b[A-Z][a-zA-Z]+\b', recent_content):  # Proper nouns
                    max_score = min(max_score * 1.2, 1.0)  # Boost but cap at 1.0

            return max_score

        except Exception as e:
            logger.error(f"Follow-up pattern detection failed: {e}")
            return 0.0

    def _is_completely_unrelated(self, current_query: str, recent_messages: List[Dict]) -> bool:
        """Check if current query is completely unrelated to recent conversation context"""
        try:
            query_lower = current_query.lower()

            # Define completely unrelated topic categories
            unrelated_topics = {
                'personal_life': ['cooking', 'recipes', 'food', 'restaurant', 'meal'],
                'entertainment': ['movie', 'film', 'music', 'song', 'game', 'sports', 'television'],
                'weather': ['weather', 'temperature', 'rain', 'snow', 'sunny', 'cloudy'],
                'health': ['doctor', 'medicine', 'symptom', 'disease', 'health', 'fitness'],
                'travel': ['vacation', 'hotel', 'flight', 'travel', 'tourism', 'destination'],
                'education': ['school', 'student', 'teacher', 'class', 'homework', 'exam']
            }

            # Business/technical context that should be considered related
            business_context = [
                'company', 'business', 'organization', 'enterprise', 'corporation',
                'data', 'analysis', 'report', 'document', 'system', 'technology',
                'project', 'management', 'strategy', 'operations', 'development',
                'software', 'platform', 'infrastructure', 'process', 'methodology'
            ]

            # Check if current query contains unrelated topics
            current_unrelated = False
            for category, terms in unrelated_topics.items():
                if any(term in query_lower for term in terms):
                    current_unrelated = True
                    logger.debug(f"Current query contains unrelated topic from category: {category}")
                    break

            # If current query is not unrelated, it could be contextual
            if not current_unrelated:
                return False

            # If current query is unrelated, check if recent messages contain business context
            recent_content = ' '.join([msg['content'].lower() for msg in recent_messages[-3:]
                                     if msg['role'] == 'user'])

            recent_has_business = any(term in recent_content for term in business_context)

            # If recent messages have business context and current query is unrelated,
            # it's likely not contextual
            if recent_has_business and current_unrelated:
                logger.debug("Detected unrelated query in business context")
                return True

            return False

        except Exception as e:
            logger.error(f"Unrelated topic check failed: {e}")
            return False  # Default to potentially related if check fails

    def _calculate_entity_overlap(self, current_query: str, recent_messages: List[Dict]) -> float:
        """Calculate entity overlap between current query and recent messages"""
        try:
            # Extract potential entities (simple approach using regex)
            def extract_entities(text: str) -> set:
                # Extract capitalized words (potential proper nouns)
                proper_nouns = set(re.findall(r'\b[A-Z][a-zA-Z]+\b', text))

                # Extract quoted phrases
                quoted = set(re.findall(r'"([^"]*)"', text))
                quoted.update(re.findall(r"'([^']*)'", text))

                # Extract potential technical terms (words with numbers, specific patterns)
                technical = set(re.findall(r'\b[a-zA-Z]+\d+[a-zA-Z]*\b', text))
                technical.update(re.findall(r'\b\w*[._-]\w*\b', text))

                # Common domain-specific terms
                domain_terms = set()
                text_lower = text.lower()
                common_entities = ['company', 'project', 'document', 'report', 'system', 'data', 'analysis']
                for term in common_entities:
                    if term in text_lower:
                        domain_terms.add(term)

                return proper_nouns | quoted | technical | domain_terms

            current_entities = extract_entities(current_query)
            if not current_entities:
                return 0.0

            # Check overlap with recent messages
            max_overlap = 0.0
            for message in recent_messages:
                if message['role'] == 'user':
                    msg_entities = extract_entities(message['content'])
                    if msg_entities:
                        overlap = len(current_entities & msg_entities)
                        total_unique = len(current_entities | msg_entities)
                        if total_unique > 0:
                            overlap_ratio = overlap / total_unique
                            max_overlap = max(max_overlap, overlap_ratio)

            return max_overlap

        except Exception as e:
            logger.error(f"Entity overlap calculation failed: {e}")
            return 0.0

    def _cosine_similarity(self, a: List[float], b: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        try:
            a_np = np.array(a)
            b_np = np.array(b)
            return np.dot(a_np, b_np) / (np.linalg.norm(a_np) * np.linalg.norm(b_np))
        except:
            return 0.0

    def build_enhanced_query(self, current_query: str, conversation_history: List[Dict],
                           context_data: List[Dict]) -> str:
        """Build enhanced query with conversation context"""
        enhanced_parts = [current_query]

        # Add relevant conversation context
        if conversation_history:
            recent_topics = []
            for msg in conversation_history[-3:]:
                if msg['role'] == 'user' and len(msg['content']) > 10:
                    recent_topics.append(msg['content'])

            if recent_topics:
                context_summary = " | ".join(recent_topics[-2:])  # Last 2 user queries
                enhanced_parts.append(f"Previous context: {context_summary}")

        # Add stored context data
        if context_data:
            for ctx in context_data[:2]:  # Top 2 context items
                if ctx['type'] == 'topic':
                    enhanced_parts.append(f"Related to: {ctx['data']}")

        return " ".join(enhanced_parts)

    def extract_citations(self, retrieved_chunks: List[Dict]) -> List[Dict]:
        """Extract citation information from retrieved chunks"""
        citations = []
        seen_docs = set()

        for chunk in retrieved_chunks:
            doc_key = (chunk['filename'], chunk.get('page_number'))
            if doc_key not in seen_docs:
                citation = {
                    'filename': chunk['filename'],
                    'title': chunk.get('title', ''),
                    'page_number': chunk.get('page_number'),
                    'main_tag': chunk.get('main_tag', ''),
                    'similarity': chunk.get('similarity', 0.0),
                    'chunk_id': chunk['id']
                }
                citations.append(citation)
                seen_docs.add(doc_key)

        return citations

    def format_context_for_llm(self, retrieved_chunks: List[Dict]) -> str:
        """Format retrieved chunks as context for the LLM"""
        if not retrieved_chunks:
            return "No relevant documents found in the knowledge base."

        context_parts = []
        for i, chunk in enumerate(retrieved_chunks[:5], 1):  # Top 5 chunks
            source_info = f"Source {i}: {chunk['filename']}"
            if chunk.get('page_number'):
                source_info += f" (Page {chunk['page_number']})"
            if chunk.get('title'):
                source_info += f" - {chunk['title']}"

            context_parts.append(f"{source_info}\n{chunk['content']}\n")

        return "\n---\n".join(context_parts)

    async def process_message(self, conversation_id: str, user_message: str,
                            user_id: str) -> AsyncGenerator[str, None]:
        """Process user message and generate streaming response"""
        try:
            # Get conversation history
            history = self.memory.get_conversation_history(conversation_id, limit=10)
            context_data = self.memory.get_conversation_context(conversation_id, limit=5)

            # Detect if this continues previous context
            has_context = self.detect_context_continuity(user_message, history)

            # Build enhanced query for document retrieval
            if has_context:
                enhanced_query = self.build_enhanced_query(user_message, history, context_data)
                yield f"data: {json.dumps({'type': 'status', 'message': 'Understanding context...'})}\n\n"
            else:
                enhanced_query = user_message
                yield f"data: {json.dumps({'type': 'status', 'message': 'Searching documents...'})}\n\n"

            # Generate embedding for search
            query_embedding = self.embeddings.embed_text(enhanced_query)
            if not query_embedding:
                yield f"data: {json.dumps({'type': 'error', 'message': 'Failed to process query'})}\n\n"
                return

            # Search for relevant documents
            retrieved_chunks = self.vector_store.similarity_search(
                query_embedding,
                k=8,  # Get more chunks for better context
                similarity_threshold=0.5  # Lower threshold for broader search
            )

            yield f"data: {json.dumps({'type': 'status', 'message': f'Found {len(retrieved_chunks)} relevant sources...'})}\n\n"

            # Extract citations
            citations = self.extract_citations(retrieved_chunks)

            # Format context for LLM
            document_context = self.format_context_for_llm(retrieved_chunks)

            # Build conversation context
            conversation_context = ""
            if history:
                conversation_context = "\n".join([
                    f"{msg['role'].title()}: {msg['content']}"
                    for msg in history[-4:]  # Last 4 messages
                ])

            # Prepare messages for LLM
            messages = [
                {"role": "system", "content": self.system_prompt},
            ]

            # Add conversation history if exists
            if conversation_context:
                messages.append({
                    "role": "system",
                    "content": f"Previous conversation:\n{conversation_context}"
                })

            # Add document context
            messages.append({
                "role": "system",
                "content": f"Relevant documents from knowledge base:\n{document_context}"
            })

            # Add current user message
            messages.append({"role": "user", "content": user_message})

            yield f"data: {json.dumps({'type': 'status', 'message': 'Generating response...'})}\n\n"

            # Generate streaming response from LLM
            response_content = ""
            try:
                stream = self.llm.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    stream=True,
                    max_tokens=2048,
                    temperature=0.7
                )

                for chunk in stream:
                    if chunk.choices[0].delta.content is not None:
                        content = chunk.choices[0].delta.content
                        response_content += content
                        yield f"data: {json.dumps({'type': 'content', 'content': content})}\n\n"

            except Exception as e:
                logger.error(f"LLM streaming failed: {e}")
                yield f"data: {json.dumps({'type': 'error', 'message': 'Failed to generate response'})}\n\n"
                return

            # Save messages to memory
            self.memory.add_message(conversation_id, "user", user_message)
            self.memory.add_message(
                conversation_id,
                "assistant",
                response_content,
                context_used=json.dumps(retrieved_chunks[:3]),  # Store top 3 chunks used
                citations=json.dumps(citations)
            )

            # Update conversation context based on retrieved documents
            if retrieved_chunks:
                # Store topic context
                topics = set()
                for chunk in retrieved_chunks[:3]:
                    if chunk.get('main_tag'):
                        topics.add(chunk['main_tag'])

                for topic in topics:
                    self.memory.add_context(
                        conversation_id,
                        "topic",
                        topic,
                        relevance_score=0.8
                    )

            # Send citations
            if citations:
                yield f"data: {json.dumps({'type': 'citations', 'citations': citations})}\n\n"

            # Signal completion
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as e:
            logger.error(f"Chat processing failed: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': 'Internal server error'})}\n\n"

    def create_conversation(self, user_id: str, title: str = None) -> str:
        """Create a new conversation"""
        return self.memory.create_conversation(user_id, title)

    def get_user_conversations(self, user_id: str) -> List[Dict]:
        """Get user's conversation list"""
        # Ensure database is properly initialized
        try:
            self.memory.init_db()
        except Exception as e:
            logger.error(f"Failed to ensure database initialization: {e}")
            return []

        conn = sqlite3.connect(self.memory.db_path)
        try:
            # Check if conversations table exists
            cursor = conn.execute("""
                SELECT name FROM sqlite_master WHERE type='table' AND name='conversations'
            """)
            if not cursor.fetchone():
                logger.warning("Conversations table does not exist, returning empty list")
                return []

            cursor = conn.execute("""
                SELECT id, title, updated_at, total_messages
                FROM conversations
                WHERE user_id = ?
                ORDER BY updated_at DESC
                LIMIT 50
            """, (user_id,))

            return [{
                'id': row[0],
                'title': row[1],
                'updated_at': row[2],
                'total_messages': row[3]
            } for row in cursor.fetchall()]
        except sqlite3.OperationalError as e:
            logger.error(f"SQLite operational error in get_user_conversations: {e}")
            # Try to reinitialize the database
            try:
                self.memory.init_db()
                # Retry the query
                cursor = conn.execute("""
                    SELECT id, title, updated_at, total_messages
                    FROM conversations
                    WHERE user_id = ?
                    ORDER BY updated_at DESC
                    LIMIT 50
                """, (user_id,))

                return [{
                    'id': row[0],
                    'title': row[1],
                    'updated_at': row[2],
                    'total_messages': row[3]
                } for row in cursor.fetchall()]
            except Exception as retry_e:
                logger.error(f"Failed to recover from SQLite error: {retry_e}")
                return []
        except Exception as e:
            logger.error(f"Unexpected error in get_user_conversations: {e}")
            return []
        finally:
            conn.close()

# Global chat service instance - lazy initialization
chat_service = None

def reset_chat_service():
    """Reset the global chat service instance (for reloading with new config)"""
    global chat_service
    chat_service = None

def get_chat_service() -> AllemnyChat:
    """Get or create the chat service instance with lazy initialization"""
    global chat_service
    if chat_service is None:
        try:
            chat_service = AllemnyChat()
            logger.info("Chat service initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize chat service: {e}")
            raise e
    return chat_service