from pathlib import Path
from typing import List

from agno.agent import Agent, RunResponse
from agno.knowledge.combined import CombinedKnowledgeBase
from agno.knowledge.docx import DocxKnowledgeBase
from agno.embedder.ollama import OllamaEmbedder
from agno.vectordb.pgvector import PgVector
from agno.document.chunking.agentic import AgenticChunking
from agno.models.groq import Groq
from pydantic import BaseModel, Field
from rich.pretty import pprint  # noqa


EMBEDDING_DIMENSION = 4096


db_url = "postgresql://allemny_find:AFbqSrE%3Fh8bPjSCs9%23@localhost:5432/allemny_find_v2"

class ProductInfo(BaseModel):
    setting: str = Field(
        ..., description="Provide an overview"
    )
    ending: str = Field(
        ...,
        description="Show the supply/demand. If not available, say that you found no information on the supply and demand.",
    )

    name: str = Field(..., description="Give a name to this movie")
    characters: List[str] = Field(..., description="Name of the associated companies")
    storyline: str = Field(
        ..., description="3 sentence on the subject!"
    )



# Create app knowledge base
#app_kb = DocxKnowledgeBase(
#    path=Path("data/Application"),
#    vector_db=PgVector(
#        table_name="app_documents",
#        collection="Applications",
#        db_url=db_url,
#        embedder=OllamaEmbedder(),
#
#    ),
#)

# Create industry knowledge base
#indus_kb = DocxKnowledgeBase(
#    path=Path("data/Industry"),
#    vector_db=PgVector(
#        table_name="indus_documents",
#        collection="Industy Study",
#        db_url=db_url,
#        embedder=OllamaEmbedder(),
#
#    ),
#)

# Combine knowledge bases
# knowledge_base = CombinedKnowledgeBase(
#    sources=[
#        indus_kb,
#        app_kb,
#    ],
#    vector_db=PgVector(
#        table_name="combined_documents",
#        db_url=db_url,
#        embedder=OllamaEmbedder(),
#    ),
#)


#knowledge_base = PDFKnowledgeBase(
#    path=[
#        {
#            "path": downloaded_cv_paths[0],
#            "metadata": {
#                "user_id": "jordan_mitchell",
#                "document_type": "cv",
#                "year": 2025,
#            },
#        },
#)


# jUST CONNECT TO THE DB
knowledge_base = CombinedKnowledgeBase(
    vector_db=PgVector(
        table_name="combined_documents",
        db_url=db_url,
        embedder=OllamaEmbedder(),
        #embedder=OllamaEmbedder(id="text-embedding-3-small")
    ),
)

# Initialize the Agent with the combined knowledge base
agent = Agent(
    model=Groq(id="llama-3.1-8b-instant", api_key="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"),
    description="You are a product expert.",
    knowledge=knowledge_base,
    search_knowledge=True,
    exponential_backoff=True
   # reasoning=True,
    markdown=True,
   # show_tool_calls=True,  # Expose tool calls for debugging and transparency.
    #stream_intermediate_steps=True,
    response_model=ProductInfo,
    use_json_mode=True,

)

#knowledge_base.load(recreate=False)

run: RunResponse = Agent.run("Donuts")
pprint(run.content)

# Use the agent
#agent.print_response("Give me information on donuts", markdown=True, stream=True)