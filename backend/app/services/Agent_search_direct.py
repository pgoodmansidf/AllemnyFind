# app/services/Agent_search_direct.py

import logging
from typing import Any, Dict
import io
import sys
from contextlib import redirect_stdout
from agno.agent import Agent
from agno.knowledge.combined import CombinedKnowledgeBase
from agno.embedder.ollama import OllamaEmbedder
from agno.models.groq import Groq
from agno.tools.reasoning import ReasoningTools
from agno.vectordb.lancedb import LanceDb, SearchType
from fastapi import FastAPI
from fastapi.responses import StreamingResponse
import json
import asyncio
from datetime import datetime
import re

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
    model=Groq(id="meta-llama/llama-4-scout-17b-16e-instruct", api_key="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"),
    knowledge=knowledge_base,
    search_knowledge=True,
    tools=[ReasoningTools(add_instructions=True)],
    add_references=True,
    instructions=[
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
            
            # Capture the output from print_response
            output_buffer = io.StringIO()
            
            # Run the agent in a separate thread to capture output
            def run_agent():
                with redirect_stdout(output_buffer):
                    agent.print_response(query, stream=True, stream_intermediate_steps=True)
            
            # Execute in thread
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, run_agent)
            
            # Get the captured output
            output = output_buffer.getvalue()
            
            # Clean the output to extract just the response content
            # Remove ANSI codes and formatting
            clean_output = re.sub(r'\x1b\[[0-9;]*m', '', output)
            # Extract content after "Response" line
            response_match = re.search(r'Response.*?\n(.*)', clean_output, re.DOTALL)
            if response_match:
                content = response_match.group(1).strip()
                # Remove box drawing characters
                content = re.sub(r'[┏┓┗┛━┃─]', '', content)
                content = content.strip()
            else:
                content = clean_output
            
            # Send content in chunks
            chunk_size = 50
            for i in range(0, len(content), chunk_size):
                chunk = content[i:i+chunk_size]
                yield f"data: {json.dumps({'type': 'TEXT_MESSAGE_CONTENT', 'messageId': message_id, 'delta': chunk})}\n\n"
                await asyncio.sleep(0.01)
            
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