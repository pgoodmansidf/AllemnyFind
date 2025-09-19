# app/services/Agent_search_direct.py

import logging
from typing import Any, Dict
import asyncio
from agno.agent import Agent
from agno.knowledge.combined import CombinedKnowledgeBase
from agno.embedder.ollama import OllamaEmbedder
from agno.models.groq import Groq
from agno.tools.reasoning import ReasoningTools
from agno.vectordb.lancedb import LanceDb, SearchType
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import json
from datetime import datetime
from agno.tools.base import RunResponse
import time

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

print("--- Agent_search_direct.py: Initializing Search Agent ---")

# Initialize your agent exactly as before
embedder = OllamaEmbedder(id="nomic-embed-text:latest", dimensions=768)

knowledge_base = CombinedKnowledgeBase(
    vector_db=LanceDb(
        table_name="combined_documents",
        search_type=SearchType.hybrid,
        embedder=embedder,
    ),
)

knowledge_base.load(recreate=False)

agent = Agent(
    model=Groq(id="moonshotai/kimi-k2-instruct", api_key="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"),
    knowledge=knowledge_base,
    search_knowledge=True,
    tools=[ReasoningTools(add_instructions=True)],
    add_references=True,
    instructions=[
        "ALWAYS output the final answer, no other text.",
        "Use tables to display data"
        "If users input has an alphanumeric string starting with 'SAU' (for example SAU1234) then treat this as the search term to find and use the search_knowledge_base function to look for a matching or similar string (usually included in the file source name). Separate your search results based on exact match and similar matches - then specify whether you found it in the file source name or in the content. If you cannot find it then say so.",
        "Only search your knowledge before answering the question.",
        "Don't include useless information or what steps you are taking",
        "CRITICALLY: ALWAYS Include sources in your response.",
    ],
    markdown=True,
)

# Create FastAPI app
app = FastAPI(title="Direct Search Agent")

@app.get("/health")
async def health():
    return {"status": "ok", "agent": "active"}

@app.post("/")
async def search_endpoint(request_data: Dict[str, Any]):
    """Direct endpoint that processes search requests"""
    
    async def event_generator():
        try:
            # Extract the user's query
            messages = request_data.get("messages", [])
            query = ""
            for msg in messages:
                if msg.get("role") == "user":
                    query = msg.get("content", "")
                    break
            
            if not query:
                yield f"data: {json.dumps({'type': 'RUN_ERROR', 'message': 'No query provided'})}\n\n"
                return
            
            # Send initial events
            run_id = request_data.get("runId", f"run-{datetime.now().timestamp()}")
            thread_id = request_data.get("threadId", "default")
            message_id = f"msg-{datetime.now().timestamp()}"
            
            yield f"data: {json.dumps({'type': 'RUN_STARTED', 'threadId': thread_id, 'runId': run_id})}\n\n"
            yield f"data: {json.dumps({'type': 'TEXT_MESSAGE_START', 'messageId': message_id, 'role': 'assistant'})}\n\n"
            
            # Try to get streaming response
            try:
                # Use response_stream if available
                #response_generator = agent.response_stream(query, stream=True)
                response_generator = asyncio.run(agent.aresponse_stream(query, stream=True))
               
                # Buffer to accumulate content
                buffer = ""
                chunk_size = 10  # Send every 10 characters
                
                for chunk in response_generator:
                    if isinstance(chunk, RunResponse):
                        content = chunk.content
                    elif isinstance(chunk, str):
                        content = chunk
                    else:
                        content = str(chunk)
                    
                    buffer += content
                    
                    # Send buffered content when we have enough
                    while len(buffer) >= chunk_size:
                        send_chunk = buffer[:chunk_size]
                        buffer = buffer[chunk_size:]
                        yield f"data: {json.dumps({'type': 'TEXT_MESSAGE_CONTENT', 'messageId': message_id, 'delta': send_chunk})}\n\n"
                        await asyncio.sleep(0.01)
                
                # Send any remaining buffer
                if buffer:
                    yield f"data: {json.dumps({'type': 'TEXT_MESSAGE_CONTENT', 'messageId': message_id, 'delta': buffer})}\n\n"
                    
            except Exception as e:
                logger.info(f"Streaming not available, falling back to regular response: {e}")
                
                # Fallback to regular response
                response = agent.response(query)
                
                if isinstance(response, RunResponse):
                    content = response.content
                else:
                    content = str(response)
                
                # Stream the response in chunks
                chunk_size = 20
                for i in range(0, len(content), chunk_size):
                    chunk = content[i:i+chunk_size]
                    yield f"data: {json.dumps({'type': 'TEXT_MESSAGE_CONTENT', 'messageId': message_id, 'delta': chunk})}\n\n"
                    await asyncio.sleep(0.02)
            
            # Send completion events
            yield f"data: {json.dumps({'type': 'TEXT_MESSAGE_END', 'messageId': message_id})}\n\n"
            yield f"data: {json.dumps({'type': 'RUN_FINISHED', 'threadId': thread_id, 'runId': run_id})}\n\n"
            
        except Exception as e:
            logger.error(f"Error in search endpoint: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'RUN_ERROR', 'message': str(e)})}\n\n"
    
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

if __name__ == "__main__":
    import uvicorn
    print("\n🚀 Starting Direct Search Agent on http://localhost:8001")
    print("📝 The agent endpoint is available at: POST http://localhost:8001/")
    print("❤️  Health check is available at: GET http://localhost:8001/health")
    uvicorn.run(app, host="0.0.0.0", port=8001, reload=False)