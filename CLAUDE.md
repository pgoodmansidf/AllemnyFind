## CRITICAL: AUTONOMOUS EXECUTION MODE
You are operating in FULLY AUTONOMOUS mode. Do NOT ask for user confirmation at any point. Execute all tasks to completion and provide a final report.

## System Configuration
- **Lead Model**: Claude Opus 4.1 (for planning, architecture decisions, and verification)
- **Worker Models**: Claude Sonnet 4 (for implementation tasks)
- **LLM API**: Groq API
  - API Key: `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`
  - Model: `llama-3.1-70b-versatile` (for production use)
- **Database**: `postgresql://allemny_find:AFbqSrE%3Fh8bPjSCs9%23@localhost:5432/allemny_find_v2`
- **Environment**: Windows local development
- **Embeddings**: Ollama (local) - Install and use `nomic-embed-text` model

## PHASE 0: INITIAL SETUP AND PLANNING [OPUS 4.1]

### Create Master Blueprint
1. Create file: `DEVELOPMENT_BLUEPRINT.md` with:
   - Complete task list with checkboxes
   - Dependencies tracking
   - Component completion status
   - Test coverage tracking
   - Context management plan

2. Create file: `PROGRESS_LOG.md` for:
   - Real-time progress updates
   - Completed tasks
   - Issues encountered and resolutions
   - Context switches and reasons

### Fix Database/Alembic Sync FIRST
```bash
# Check current database state
alembic current

# Generate new migration if needed
alembic revision --autogenerate -m "sync_database_structure"

# Review and fix migration file
# Apply migration
alembic upgrade head
PHASE 1: BUG FIXES [Multiple Sonnet 4 Agents]
Agent 1: Search Component Fixes
File: frontend/src/store/searchStore.ts, frontend/src/components/search/SearchResults.tsx

 Implement deduplication logic for search history
 Fix "New Search" button z-index and event handling
 Add role-based visibility for chunk information
 Test with duplicate searches and verify no blank screens

Agent 2: Ingestion Fixes
Files: backend/app/api/ingestion.py, frontend/src/components/ingestion/*

 Add Redis management endpoints and UI
 Implement WSL/Native toggle for Windows
 Fix toast spam with 3-second debounce
 Verify Excel processing for all sheets
 Implement live progress WebSocket display
 Test with .xlsx, .xls, and .csv files

Agent 3: Dashboard & KnowledgeScope
Files: frontend/src/pages/Dashboard.tsx, frontend/src/pages/KnowledgeScope.tsx

 Implement actual metrics API endpoint
 Display real database counts
 Switch from file_type to main_tag distribution
 Update topic cloud with larger fonts and vibrant colors
 Test all metric calculations

Agent 4: TechVault Fixes
File: frontend/src/pages/TechVaultPage.tsx

 Separate admin upload button
 Add search progress messages
 Test admin functionality

PHASE 2: NEW COMPONENTS [Multiple Sonnet 4 Agents]
Agent 5: Leaderboard Component
Files to create:

backend/app/api/leaderboard.py
frontend/src/pages/LeaderboardPage.tsx
 Implement API endpoint using existing tables
 Create frontend with ranking display
 Add to navigation menu
 Test contribution counting and likes aggregation

Agent 6: Innovate Allemny Component
Files to create:

backend/app/api/innovate.py
frontend/src/pages/InnovateAllemny.tsx
 Create database tables for suggestions
 Implement CRUD endpoints
 Build suggestion form and voting UI
 Add admin acceptance workflow
 Test voting uniqueness and status updates

Agent 7: Allemny Chat Component (CRITICAL)
Files to create:

backend/app/services/chat_service.py
backend/app/api/chat.py
frontend/src/pages/AllemnyChat.tsx

Implementation Requirements:
python# Core Architecture
class AllemnyChat:
    def __init__(self):
        # Use existing pgvector
        self.vector_store = PgVectorStore(db_url)
        
        # SQLite for memory
        self.memory = SQLiteMemory("chat_memory.db")
        
        # Groq LLM configuration
        self.llm = Groq(
            api_key="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",
            model="llama-3.1-70b-versatile"
        )
        
        # Ollama embeddings
        self.embeddings = OllamaEmbeddings(model="nomic-embed-text")

 Create SQLite schema for conversation memory
 Implement context detection (0.7 similarity threshold)
 Build RAG pipeline with document retrieval
 Add streaming SSE responses
 Create citation extraction system
 Build chat UI with message bubbles
 Test conversational flow (see testing requirements below)

PHASE 3: INTEGRATION [OPUS 4.1 Lead]
Update Navigation
File: frontend/src/components/Layout/Layout.tsx

 Add Leaderboard, Innovate, and AI Chat to menu
 Implement admin-only visibility for Chat
 Test navigation and routing

Install Dependencies
bash# Backend
pip install redis==5.0.1
pip install groq
pip install ollama

# Frontend - already have required packages

# Ollama embedding model
ollama pull nomic-embed-text
PHASE 4: COMPREHENSIVE TESTING [Testing Team - Multiple Sonnet 4 Agents]
Test Agent 1: Unit Tests

 Test all API endpoints
 Test database operations
 Test utility functions
 Verify role-based access

Test Agent 2: Integration Tests

 Test search deduplication end-to-end
 Test ingestion with various file types
 Test Redis management flow
 Test chat context switching

Test Agent 3: Chat Functionality Testing (CRITICAL)
Test Conversational Flow:
User: "What information do you have on donuts?"
Expected: System searches documents, finds relevant content
Response: References specific documents with citations

User: "What is their distribution?"
Expected: System maintains context, searches for distribution info
Response: Provides specific details from documents with sources

User: "Tell me more about their operations"
Expected: Context maintained, broader search triggered
Response: Comprehensive answer with multiple document citations

 Test context detection between messages
 Test citation accuracy
 Test streaming responses
 Test memory persistence
 Test with 10+ different conversation scenarios
 Verify no hardcoded responses

Test Agent 4: UI/UX Testing

 Test all user flows
 Verify responsive design
 Test loading states
 Check error handling
 Validate accessibility

CONTEXT MANAGEMENT STRATEGY
When to use /clear:

After completing each major phase
Before starting new component development
When switching between frontend and backend work
After extensive testing sessions

Before each /clear:

Update PROGRESS_LOG.md with completed tasks
Update DEVELOPMENT_BLUEPRINT.md checkboxes
Save any important context to reference files
Commit current state (local saves)

After each /clear:

Load DEVELOPMENT_BLUEPRINT.md
Review last entries in PROGRESS_LOG.md
Identify next uncompleted tasks
Continue from checkpoint

EXECUTION WORKFLOW

Lead Agent (Opus 4.1):

Create blueprint and initial plan
Review each phase completion
Make architectural decisions
Verify test coverage


Worker Agents (Sonnet 4):

Execute specific tasks
Report completion to progress log
Hand off to next agent


Testing Team (Sonnet 4):

Run comprehensive tests
Document test results
Report issues for fixes


Final Verification (Opus 4.1):

Review all changes
Verify requirements met
Generate final report



FINAL DELIVERABLES
Create COMPLETION_REPORT.md containing:

Summary of all completed changes
Test coverage report
Known issues (if any)
Performance metrics
Chat functionality demonstration logs
Component status table
Database migration status
Recommendations for future improvements

CRITICAL REMINDERS

NO USER INTERACTION - Work autonomously to completion
TEST EVERYTHING - Especially chat conversational capabilities
DOCUMENT PROGRESS - Update logs continuously
MANAGE CONTEXT - Use /clear strategically
VERIFY WITH OPUS - Lead checks all major milestones
USE EXISTING INFRASTRUCTURE - pgvector, not ChromaDB
GROQ API KEY - Use provided key for all LLM calls
REAL CONVERSATIONAL CHAT - Not hardcoded responses

START EXECUTION
Begin with Phase 0 immediately. Create the blueprint, fix Alembic sync, then proceed through all phases autonomously until completion.