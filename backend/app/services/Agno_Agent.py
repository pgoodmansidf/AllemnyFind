from agno.agent import Agent
from agno.knowledge.combined import CombinedKnowledgeBase
from agno.embedder.ollama import OllamaEmbedder
from agno.models.groq import Groq
from agno.tools.reasoning import ReasoningTools
from agno.vectordb.lancedb import LanceDb, SearchType


# Define the database URL where the vector database will be stored
# Create Ollama embedder
embedder = OllamaEmbedder(id="nomic-embed-text:latest", dimensions=768)

# Connect to the database
knowledge_base = CombinedKnowledgeBase(
    vector_db=LanceDb(
        table_name="combined_documents",
        search_type=SearchType.hybrid,
        embedder=embedder,
    ),
)

# Load the knowledge base without recreating it if it already exists in Vector LanceDB
knowledge_base.load(recreate=False)

agent = Agent(
    model=Groq(id="meta-llama/llama-4-scout-17b-16e-instruct", api_key="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"),
    # Agentic RAG is enabled by default when `knowledge` is provided to the Agent.
    knowledge=knowledge_base,
    debug_mode=True,  # Enable debugging
    # search_knowledge=True gives the Agent the ability to search on demand
    # search_knowledge is True by default
    search_knowledge=True,
    tools=[ReasoningTools(add_instructions=True)],
    # Enable RAG by adding references from AgentKnowledge to the user prompt.
    add_references=True,
    instructions=[
        "If users input has an aplhanumeric string starting with 'SAU' (for example SAU1234) then treat this as the search term to find and use the search_knowledge_base function to look for a mathing or smimilar string (usually included in the file source name). Seperate your search results based on exact match and similar matches - then specificy whether you found it in the file source name or in the conent.  If you cannot find it then say so."
        "Only search your knowledge before answering the question.",
        "Dont include useless information or what steps you are taking",
        "CRITICALLY: ALWAYS Include sources in your response.",
    ],
    markdown=True,
)

if __name__ == "__main__":
    agent.print_response(
        "donut",
        stream=True,
        show_full_reasoning=True,
        stream_intermediate_steps=True,
    )