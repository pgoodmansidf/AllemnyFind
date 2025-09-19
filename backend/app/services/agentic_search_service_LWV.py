import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional, AsyncGenerator, Callable
import httpx
import json
import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import text, create_engine
from sqlalchemy.orm import sessionmaker

from agno.agent import Agent
from agno.models.groq import Groq

from app.core.config import settings
from app.core.database import get_db
from app.models.document import Document, DocumentChunk

logger = logging.getLogger(__name__)


class DatabaseSearchTool:
    """Direct database search that ACTUALLY retrieves documents"""
    
    def __init__(self, db_url: str):
        self.db_url = db_url
        
    def search_documents(self, query: str, limit: int = 10) -> tuple[List[Dict[str, Any]], str]:
        """
        Search documents and return both structured data and formatted text
        This is the ONLY source of truth - no hallucinations allowed
        """
        logger.info(f"Searching database for: '{query}'")
        try:
            engine = create_engine(self.db_url)
            SessionLocal = sessionmaker(bind=engine)
            
            with SessionLocal() as session:
                # First try full-text search
                search_query = text("""
                    SELECT 
                        dc.id, 
                        dc.content, 
                        dc.document_id,
                        d.filename,
                        d.file_type,
                        ts_rank(to_tsvector('english', dc.content), 
                               plainto_tsquery('english', :query)) as rank
                    FROM document_chunks dc
                    JOIN documents d ON dc.document_id = d.id
                    WHERE to_tsvector('english', dc.content) @@ plainto_tsquery('english', :query)
                    ORDER BY rank DESC
                    LIMIT :limit
                """)
                
                results = session.execute(search_query, {"query": query, "limit": limit}).fetchall()
                
                if not results:
                    # Try broader ILIKE search
                    logger.info("No results from full-text search, trying ILIKE search")
                    broader_query = text("""
                        SELECT 
                            dc.id, 
                            dc.content, 
                            dc.document_id,
                            d.filename,
                            d.file_type,
                            1.0 as rank
                        FROM document_chunks dc
                        JOIN documents d ON dc.document_id = d.id
                        WHERE LOWER(dc.content) LIKE LOWER(:pattern)
                        ORDER BY dc.id
                        LIMIT :limit
                    """)
                    
                    pattern = f"%{query}%"
                    results = session.execute(broader_query, {"pattern": pattern, "limit": limit}).fetchall()
                
                if not results:
                    logger.warning(f"No documents found for query: {query}")
                    return [], "No documents found in the knowledge base for this query."
                
                # Format results
                documents = []
                formatted_text = f"Found {len(results)} relevant documents for '{query}':\n\n"
                
                for i, (chunk_id, content, doc_id, filename, file_type, rank) in enumerate(results, 1):
                    doc_info = {
                        "chunk_id": str(chunk_id),
                        "document_id": str(doc_id),
                        "filename": filename or "Unknown",
                        "file_type": file_type or "Unknown",
                        "content": content,
                        "rank": float(rank)
                    }
                    documents.append(doc_info)
                    
                    formatted_text += f"**[Document {i}]** {filename} (Type: {file_type})\n"
                    formatted_text += f"Relevance Score: {rank:.4f}\n\n"
                    formatted_text += f"{content}\n\n"
                    formatted_text += "---\n\n"
                
                logger.info(f"Successfully retrieved {len(documents)} documents")
                return documents, formatted_text
                
        except Exception as e:
            logger.error(f"Database search error: {e}", exc_info=True)
            return [], f"Error searching database: {str(e)}"


class AgenticSearchService:
    """Search service that ONLY uses actual documents - no hallucinations"""
    
    def __init__(self):
        logger.info("Initializing AgenticSearchService")
        self.db_url = settings.database_url
        self.db_tool = DatabaseSearchTool(self.db_url)
        self.search_agent = None
        self.analysis_agent = None
        self.formatter_agent = None
        self.verification_agent = None  # NEW: Verification agent
        self._initialized = False
        
        # Test database and initialize
        self._test_database_connection()
        self._initialize_agents()
    
    def _test_database_connection(self):
        """Test database connection and count documents"""
        logger.info("Testing database connection...")
        try:
            engine = create_engine(self.db_url)
            SessionLocal = sessionmaker(bind=engine)
            
            with SessionLocal() as session:
                # Count documents
                chunk_count = session.execute(text("SELECT COUNT(*) FROM document_chunks")).scalar()
                doc_count = session.execute(text("SELECT COUNT(*) FROM documents")).scalar()
                logger.info(f"✓ Database connected - {doc_count} documents, {chunk_count} chunks")
                
                # Sample content
                sample = session.execute(text("""
                    SELECT dc.content, d.filename 
                    FROM document_chunks dc 
                    JOIN documents d ON dc.document_id = d.id 
                    LIMIT 1
                """)).first()
                
                if sample:
                    logger.info(f"✓ Sample document: {sample[1]}")
                    logger.info(f"  Content preview: {sample[0][:100]}...")
                    
        except Exception as e:
            logger.error(f"✗ Database connection test failed: {e}", exc_info=True)
    
    def _initialize_agents(self):
        """Initialize agents with strict instructions to use only document content"""
        logger.info("Initializing agents...")
        try:
            groq_api_key = settings.groq_api_key if hasattr(settings, 'groq_api_key') else None
            if not groq_api_key:
                raise ValueError("Groq API key not found")
            
            # Search coordinator - finds and retrieves documents
            self.search_agent = Agent(
                name="Document Search Agent",
                model=Groq(
                    id="meta-llama/llama-4-maverick-17b-128e-instruct",
                    api_key=groq_api_key
                ),
                instructions=[
                    "You are a document search agent that ONLY uses provided search results.",
                    "NEVER make up or invent information.",
                    "When given search results, summarize and organize them clearly.",
                    "Always cite which document the information comes from using [Document X] format.",
                    "If no relevant documents are found, clearly state this.",
                    "Use markdown formatting for clarity."
                ],
                markdown=True,
                show_tool_calls=False
            )
            
            # Analysis agent - analyzes retrieved documents
            self.analysis_agent = Agent(
                name="Document Analyst",
                model=Groq(
                    id="meta-llama/llama-4-maverick-17b-128e-instruct",
                    api_key=groq_api_key
                ),
                instructions=[
                    "You are a document analyst who ONLY analyzes provided documents.",
                    "NEVER add information not present in the documents.",
                    "Extract key insights and patterns from the documents.",
                    "Highlight important information and connections.",
                    "Always reference which document contains each piece of information.",
                    "If information is missing, explicitly state what wasn't found."
                ],
                markdown=True,
                show_tool_calls=False
            )
            
            # Formatter agent - formats the final response
            self.formatter_agent = Agent(
                name="Response Formatter",
                model=Groq(
                    id="meta-llama/llama-4-maverick-17b-128e-instruct",
                    api_key=groq_api_key
                ),
                instructions=[
                    "You format responses based ONLY on provided content.",
                    "NEVER add new information.",
                    "Create well-structured responses with:",
                    "- Executive Summary (2-3 sentences)",
                    "- Key Information (from documents)",
                    "- Document References",
                    "Use clear markdown formatting.",
                    "Include document citations for every fact."
                ],
                markdown=True,
                show_tool_calls=False
            )
            
            # NEW: Verification agent - ensures no hallucinations
            self.verification_agent = Agent(
                name="Verification Agent",
                model=Groq(
                    id="meta-llama/llama-4-maverick-17b-128e-instruct",
                    api_key=groq_api_key
                ),
                instructions=[
                    "You are a strict verification agent that checks responses for compliance.",
                    "Check if the response:",
                    "1. ONLY contains information from the provided documents",
                    "2. Has proper citations for every claim [Document X]",
                    "3. Does NOT contain any information not in the documents",
                    "4. Explicitly states when information was not found",
                    "If the response fails ANY criteria, return 'FAILED' and explain why.",
                    "If the response passes ALL criteria, return 'PASSED'.",
                    "Be extremely strict - any unsourced claim means failure."
                ],
                markdown=False,
                show_tool_calls=False
            )
            
            self._initialized = True
            logger.info("✓ All agents initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize agents: {e}", exc_info=True)
            self._initialized = False
    
    async def _search_and_analyze_with_verification(self, query: str, max_retries: int = 3) -> tuple[str, List[str]]:
        """
        Search, analyze, and verify results with retry logic
        Returns (final_content, stage_messages)
        """
        stage_messages = []
        
        # Step 1: Get actual documents from database
        stage_messages.append("🔍 Searching document database...")
        documents, formatted_results = self.db_tool.search_documents(query)
        
        if not documents:
            no_results_msg = "No documents found in the knowledge base for your query. Please try different search terms."
            stage_messages.append("❌ No documents found")
            return no_results_msg, stage_messages
        
        stage_messages.append(f"✅ Found {len(documents)} relevant documents")
        
        for retry in range(max_retries):
            logger.info(f"Analysis attempt {retry + 1}/{max_retries}")
            
            # Step 2: Analyze documents
            stage_messages.append(f"🧠 Analyzing documents (Attempt {retry + 1})...")
            
            analysis_prompt = f"""
            Analyze these search results for the query: "{query}"
            
            CRITICAL RULES:
            1. You must ONLY use information from these documents
            2. NEVER add any external information
            3. Always cite which document each fact comes from using [Document X]
            4. If information is not in the documents, say "not found in documents"
            
            Documents Retrieved:
            {formatted_results}
            
            Provide:
            1. Summary of key information about {query} (with citations)
            2. Relevant details from each document (with citations)
            3. What information was NOT found
            """
            
            try:
                response = await self.search_agent.arun(analysis_prompt)
                content = response.content if hasattr(response, 'content') else str(response)
                
                # Step 3: Format the response
                stage_messages.append("📝 Formatting response...")
                
                if self.formatter_agent:
                    format_prompt = f"""
                    Format this analysis with STRICT rules:
                    - ONLY use information provided below
                    - Keep ALL citations [Document X]
                    - Do NOT add ANY new information
                    
                    Content to format:
                    {content}
                    
                    Original Documents for reference:
                    {formatted_results}
                    """
                    
                    formatted_response = await self.formatter_agent.arun(format_prompt)
                    final_content = formatted_response.content if hasattr(formatted_response, 'content') else str(formatted_response)
                else:
                    final_content = content
                
                # Step 4: Verify the response
                stage_messages.append("✔️ Verifying response accuracy...")
                
                verification_prompt = f"""
                Verify this response against the original documents.
                
                Original Documents:
                {formatted_results}
                
                Response to verify:
                {final_content}
                
                Check:
                1. Every claim has a [Document X] citation
                2. All information exists in the original documents
                3. No external information was added
                4. Missing information is explicitly stated
                
                Return ONLY 'PASSED' or 'FAILED: [reason]'
                """
                
                verification_response = await self.verification_agent.arun(verification_prompt)
                verification_result = verification_response.content if hasattr(verification_response, 'content') else str(verification_response)
                
                if "PASSED" in verification_result:
                    stage_messages.append("✅ Verification passed - response is accurate")
                    return final_content, stage_messages
                else:
                    stage_messages.append(f"⚠️ Verification failed: {verification_result}")
                    logger.warning(f"Verification failed on attempt {retry + 1}: {verification_result}")
                    
            except Exception as e:
                logger.error(f"Error in analysis attempt {retry + 1}: {e}")
                stage_messages.append(f"❌ Error in analysis: {str(e)}")
        
        # If all retries failed, return raw search results
        stage_messages.append("⚠️ Using raw search results after verification failures")
        return f"## Search Results (Raw)\n\n{formatted_results}", stage_messages
    
    def _serialize_datetime(self, obj: Any) -> Any:
        """Convert datetime objects to ISO format strings"""
        if isinstance(obj, datetime):
            return obj.isoformat()
        elif isinstance(obj, dict):
            return {k: self._serialize_datetime(v) for k, v in obj.items()}
        elif isinstance(obj, list):
            return [self._serialize_datetime(item) for item in obj]
        return obj
    
    async def stream_search_response(self, 
                                   query: str, 
                                   include_online: bool = False) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream search results with all stages visible"""
        logger.info(f">>> stream_search_response called with query: '{query}'")
        try:
            # Initial status
            yield self._serialize_datetime({
                "type": "search_started",
                "message": "Starting document search...",
                "timestamp": datetime.utcnow()
            })
            
            # Perform search with verification and collect stage messages
            final_content, stage_messages = await self._search_and_analyze_with_verification(query)
            
            # Send each stage message to the user
            for stage_msg in stage_messages:
                yield self._serialize_datetime({
                    "type": "stage_update",
                    "stage": "search",
                    "message": stage_msg,
                    "timestamp": datetime.utcnow()
                })
                await asyncio.sleep(0.5)  # Small delay so user can see stages
            
            # Send the final content
            yield self._serialize_datetime({
                "type": "content_complete",
                "stage": "search",
                "content": final_content,
                "timestamp": datetime.utcnow()
            })
            
            # Completion
            yield self._serialize_datetime({
                "type": "search_complete",
                "message": "Search completed with verification",
                "timestamp": datetime.utcnow()
            })
            
        except Exception as e:
            logger.error(f"Error in stream_search_response: {e}", exc_info=True)
            yield self._serialize_datetime({
                "type": "error",
                "message": str(e),
                "timestamp": datetime.utcnow()
            })
    
    async def search_knowledge_base(self, 
                                  query: str, 
                                  include_online: bool = False,
                                  max_results: int = 10) -> Dict[str, Any]:
        """Search knowledge base with verification"""
        logger.info(f">>> search_knowledge_base called with query: '{query}'")
        try:
            final_content, stage_messages = await self._search_and_analyze_with_verification(query)
            
            return self._serialize_datetime({
                "query": query,
                "final_response": final_content,
                "search_stages": [{"stage": "search", "content": final_content, "timestamp": datetime.utcnow()}],
                "stage_messages": stage_messages,
                "include_online": include_online,
                "timestamp": datetime.utcnow(),
                "success": True
            })
            
        except Exception as e:
            logger.error(f"Error in search_knowledge_base: {e}", exc_info=True)
            return self._serialize_datetime({
                "query": query,
                "final_response": f"Search error: {str(e)}",
                "error": str(e),
                "timestamp": datetime.utcnow(),
                "success": False
            })
    
    async def analyze_query(self, query: str, user_context: Dict[str, Any] = None) -> Dict[str, Any]:
        """Simple query analysis"""
        return self._serialize_datetime({
            "analysis": f"Preparing to search documents for: {query}",
            "timestamp": datetime.utcnow(),
            "success": True
        })
    
    async def get_search_suggestions(self, partial_query: str) -> List[str]:
        """No suggestions"""
        return []
    
    def get_agent_status(self) -> Dict[str, Any]:
        """Get agent status"""
        return self._serialize_datetime({
            "search_agent": "active" if self._initialized else "inactive",
            "analysis_agent": "active" if self.analysis_agent else "inactive",
            "formatter_agent": "active" if self.formatter_agent else "inactive",
            "verification_agent": "active" if self.verification_agent else "inactive",
            "knowledge_base": "postgresql_direct",
            "vector_db": "postgresql_fulltext",
            "embedding_model": "none_required",
            "llm_model": "groq/meta-llama/llama-4-maverick-17b-128e-instruct",
            "timestamp": datetime.utcnow(),
            "initialized": self._initialized
        })

# Create global instance
logger.info("Creating global agentic_search_service instance")
agentic_search_service = AgenticSearchService()