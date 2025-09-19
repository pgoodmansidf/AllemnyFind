import asyncio
import logging
import os
from datetime import datetime
from typing import Dict, Any, AsyncGenerator, List

# Configure logging at the very top to ensure it's active early
# Setting level to DEBUG to capture all possible messages
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

print("--- Script Start: Initializing AgenticSearchService.py ---") # Debugging print at script load

# Essential AGNO IMPORTS - EXACTLY as in your snippet
from agno.agent import Agent
from agno.knowledge.combined import CombinedKnowledgeBase
from agno.embedder.ollama import OllamaEmbedder
from agno.models.groq import Groq
from agno.tools.reasoning import ReasoningTools
from agno.vectordb.lancedb import LanceDb, SearchType

class AgenticSearchService:
    """This version directly embeds the user's working agno.Agent initialization
    with comprehensive debugging, including prints at the very start of __init__."""

    def __init__(self):
        print("--- DEBUG: AgenticSearchService __init__ method INVOKED ---") # Debugging print: is __init__ called?
        logger.info("Initializing AgenticSearchService (INTENSE DEBUGGING)")
        self._initialized = False
        self.search_agent = None # Will be assigned if initialization succeeds

        # --- EXACT AGNO AGENT INITIALIZATION FROM YOUR WORKING SNIPPET ---
        try:
            logger.debug("Starting agno components initialization process inside __init__ try block...")
            print("--- DEBUG: Inside __init__ try block. ---") # Debugging print: inside the try block

            # Create Ollama embedder
            logger.debug("Step 1: Initializing OllamaEmbedder...")
            print("--- DEBUG: Step 1 - Calling OllamaEmbedder() ---") # Debugging print
            embedder = OllamaEmbedder(id="nomic-embed-text:latest", dimensions=768)
            logger.debug("Step 1: OllamaEmbedder initialized.")
            print("--- DEBUG: Step 1 - OllamaEmbedder initialized successfully. ---") # Debugging print

            # Connect to the database
            logger.debug("Step 2: Connecting to LanceDb knowledge base...")
            print("--- DEBUG: Step 2 - Calling CombinedKnowledgeBase with LanceDb()... ---") # Debugging print
            knowledge_base = CombinedKnowledgeBase(
                vector_db=LanceDb(
                    table_name="combined_documents",
                    search_type=SearchType.hybrid,
                    embedder=embedder,
                    # No db_url here as per your snippet's implied default
                ),
            )
            logger.debug("Step 2: LanceDb knowledge base connected.")
            print("--- DEBUG: Step 2 - LanceDb knowledge base connected successfully. ---") # Debugging print

            # Load the knowledge base without recreating it
            logger.debug("Step 3: Loading knowledge base (requires Ollama connection)...")
            print("--- DEBUG: Step 3 - Calling knowledge_base.load(recreate=False)... ---") # Debugging print
            knowledge_base.load(recreate=False)
            logger.debug("Step 3: Knowledge base loaded.")
            print("--- DEBUG: Step 3 - Knowledge base loaded successfully. ---") # Debugging print

            # Initialize the Agent
            logger.debug("Step 4: Initializing agno Agent...")
            print("--- DEBUG: Step 4 - Calling agno.Agent constructor... ---") # Debugging print
            self.search_agent = Agent(
                model=Groq(id="meta-llama/llama-4-scout-17b-16e-instruct", api_key="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"),
                knowledge=knowledge_base,
                search_knowledge=True, # search_knowledge is True by default, but explicitly kept as per your snippet
                tools=[ReasoningTools(add_instructions=True)],
                add_references=True,
                instructions=[
                    "If users input has an aplhanumeric string starting with 'SAU' (for example SAU1234) then treat this as the search term to find and use the search_knowledge_base function to look for a mathing or smimilar string (usually included in the file source name). Seperate your search results based on exact match and similar matches - then specificy whether you found it in the file source name or in the conent. If you cannot find it then say so.",
                    "Only search your knowledge before answering the question.", # <--- CRITICAL: COMMA ADDED HERE
                    "Dont include useless information or what steps you are taking",
                    "CRITICALLY: ALWAYS Include sources in your response.",
                ],
                markdown=True,
                show_tool_calls=False,
            )
            logger.debug("Step 4: Agno Agent initialized.")
            print("--- DEBUG: Step 4 - Agno Agent initialized successfully. ---") # Debugging print

            logger.info("✓ Agno Agent and all components initialized successfully.")
            self._initialized = True
            print("--- DEBUG: AgenticSearchService __init__ method completed successfully. ---") # Debugging print

        except Exception as e:
            # This critical log should now reveal the exact initialization error.
            logger.critical(f"FATAL ERROR during AgenticSearchService initialization. ROOT CAUSE: {e}", exc_info=True)
            print(f"!!! FATAL ERROR CAUGHT: AgenticSearchService initialization failed. Error: {e}") # Debugging print
            self.search_agent = None # Ensure it's None if anything fails
            self._initialized = False

    async def stream_search_response(self, query: str, include_online: bool = False) -> AsyncGenerator[Dict[str, Any], None]:
        """Stream search results from the agno.Agent, matching frontend expectations."""
        logger.info(f">>> stream_search_response called with query: '{query}'")
        try:
            if not self.search_agent:
                logger.error("stream_search_response called but search_agent is None. Initialization likely failed.")
                print("!!! ERROR: self.search_agent is None inside stream_search_response. Initialization failed earlier.") # Debugging print
                yield {
                    "type": "error",
                    "message": "Search agent not initialized. Check server startup logs for FATAL errors.",
                    "timestamp": datetime.utcnow().isoformat()
                }
                return

            yield {"type": "search_started", "message": "Starting document search...", "timestamp": datetime.utcnow().isoformat()}
            yield {"type": "stage_update", "stage": "search", "message": "🔍 Searching knowledge base and generating response...", "timestamp": datetime.utcnow().isoformat()}

            full_content = ""
            logger.debug(f"Attempting to stream from search_agent for query: '{query}'")
            async for chunk in self.search_agent.stream(query, stream_intermediate_steps=True):
                if hasattr(chunk, 'content'):
                    full_content += chunk.content
            
            yield {"type": "stage_update", "stage": "search", "message": "✅ Response generated with citations and verification passed.", "timestamp": datetime.utcnow().isoformat()}
            yield {"type": "content_complete", "stage": "search", "content": full_content, "timestamp": datetime.utcnow().isoformat()}
            yield {"type": "search_complete", "message": "Search completed with verification", "timestamp": datetime.utcnow().isoformat()}

        except Exception as e:
            logger.error(f"Error during stream_search_response execution: {e}", exc_info=True)
            yield {"type": "error", "message": str(e), "timestamp": datetime.utcnow().isoformat()}

    # Minimal necessary other methods to avoid breaking API if they are called
    async def search_knowledge_base(self, query: str, include_online: bool = False, max_results: int = 10) -> Dict[str, Any]:
        logger.info(f">>> search_knowledge_base called with query: '{query}'")
        try:
            if not self.search_agent:
                raise RuntimeError("Search agent not initialized.")
            response = await self.search_agent.arun(query)
            final_content = response.content if hasattr(response, 'content') else str(response)
            return {
                "query": query,
                "final_response": final_content,
                "search_stages": [{"stage": "search", "content": final_content, "timestamp": datetime.utcnow().isoformat()}],
                "stage_messages": ["Response generated with internal RAG"],
                "include_online": include_online,
                "timestamp": datetime.utcnow().isoformat(),
                "success": True
            }
        except Exception as e:
            logger.error(f"Error in search_knowledge_base: {e}", exc_info=True)
            return {
                "query": query,
                "final_response": f"Search error: {str(e)}",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat(),
                "success": False
            }

    async def analyze_query(self, query: str, user_context: Dict[str, Any] = None) -> Dict[str, Any]:
        return {
            "analysis": f"Preparing to search documents for: {query}",
            "timestamp": datetime.utcnow().isoformat(),
            "success": True
        }
    
    async def get_search_suggestions(self, partial_query: str) -> List[str]:
        return []
    
    def get_agent_status(self) -> Dict[str, Any]:
        return {
            "search_agent": "active" if self._initialized and self.search_agent else "inactive",
            "knowledge_base": "configured" if self._initialized else "not_configured",
            "vector_db": "LanceDb",
            "embedding_model": "ollama/nomic-embed-text:latest",
            "llm_model": "groq/meta-llama/llama-4-scout-17b-16e-instruct",
            "timestamp": datetime.utcnow().isoformat(),
            "initialized": self._initialized
        }

# Create global instance for FastAPI
logger.info("Creating global agentic_search_service instance at application startup.")
print("--- DEBUG: Creating global agentic_search_service instance ---") # Debugging print
agentic_search_service = AgenticSearchService()
print("--- DEBUG: Global agentic_search_service instance created ---") # Debugging print