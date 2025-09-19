# DEVELOPMENT BLUEPRINT - Allemny Find V2
**Status**: IN PROGRESS | **Start Date**: 2025-09-17

## PHASE 0: INITIAL SETUP AND PLANNING ✅
- [x] Create DEVELOPMENT_BLUEPRINT.md with complete task list and tracking
- [ ] Create PROGRESS_LOG.md for real-time progress updates
- [ ] Check current database state with alembic
- [ ] Generate and apply database migration if needed
- [ ] Install required dependencies (Redis, Groq, Ollama)

## PHASE 1: BUG FIXES
### Agent 1: Search Component Fixes
**Files**: `frontend/src/store/searchStore.ts`, `frontend/src/components/search/SearchResults.tsx`
- [ ] Implement deduplication logic for search history
- [ ] Fix "New Search" button z-index and event handling
- [ ] Add role-based visibility for chunk information
- [ ] Test with duplicate searches and verify no blank screens

### Agent 2: Ingestion Fixes
**Files**: `backend/app/api/ingestion.py`, `frontend/src/components/ingestion/*`
- [ ] Add Redis management endpoints and UI
- [ ] Implement WSL/Native toggle for Windows
- [ ] Fix toast spam with 3-second debounce
- [ ] Verify Excel processing for all sheets
- [ ] Implement live progress WebSocket display
- [ ] Test with .xlsx, .xls, and .csv files

### Agent 3: Dashboard & KnowledgeScope
**Files**: `frontend/src/pages/Dashboard.tsx`, `frontend/src/pages/KnowledgeScope.tsx`
- [ ] Implement actual metrics API endpoint
- [ ] Display real database counts
- [ ] Switch from file_type to main_tag distribution
- [ ] Update topic cloud with larger fonts and vibrant colors
- [ ] Test all metric calculations

### Agent 4: TechVault Fixes
**File**: `frontend/src/pages/TechVaultPage.tsx`
- [ ] Separate admin upload button
- [ ] Add search progress messages
- [ ] Test admin functionality

## PHASE 2: NEW COMPONENTS
### Agent 5: Leaderboard Component
**Files to create**: `backend/app/api/leaderboard.py`, `frontend/src/pages/LeaderboardPage.tsx`
- [ ] Implement API endpoint using existing tables
- [ ] Create frontend with ranking display
- [ ] Add to navigation menu
- [ ] Test contribution counting and likes aggregation

### Agent 6: Innovate Allemny Component
**Files to create**: `backend/app/api/innovate.py`, `frontend/src/pages/InnovateAllemny.tsx`
- [ ] Create database tables for suggestions
- [ ] Implement CRUD endpoints
- [ ] Build suggestion form and voting UI
- [ ] Add admin acceptance workflow
- [ ] Test voting uniqueness and status updates

### Agent 7: Allemny Chat Component (CRITICAL)
**Files to create**: `backend/app/services/chat_service.py`, `backend/app/api/chat.py`, `frontend/src/pages/AllemnyChat.tsx`
- [ ] Create SQLite schema for conversation memory
- [ ] Implement context detection (0.7 similarity threshold)
- [ ] Build RAG pipeline with document retrieval
- [ ] Add streaming SSE responses
- [ ] Create citation extraction system
- [ ] Build chat UI with message bubbles
- [ ] Test conversational flow

## PHASE 3: INTEGRATION
**Lead**: Opus 4.1
- [ ] Update Navigation (Layout.tsx)
- [ ] Add Leaderboard, Innovate, and AI Chat to menu
- [ ] Implement admin-only visibility for Chat
- [ ] Test navigation and routing

## PHASE 4: COMPREHENSIVE TESTING
### Test Agent 1: Unit Tests
- [ ] Test all API endpoints
- [ ] Test database operations
- [ ] Test utility functions
- [ ] Verify role-based access

### Test Agent 2: Integration Tests
- [ ] Test search deduplication end-to-end
- [ ] Test ingestion with various file types
- [ ] Test Redis management flow
- [ ] Test chat context switching

### Test Agent 3: Chat Functionality Testing (CRITICAL)
- [ ] Test context detection between messages
- [ ] Test citation accuracy
- [ ] Test streaming responses
- [ ] Test memory persistence
- [ ] Test with 10+ different conversation scenarios
- [ ] Verify no hardcoded responses

### Test Agent 4: UI/UX Testing
- [ ] Test all user flows
- [ ] Verify responsive design
- [ ] Test loading states
- [ ] Check error handling
- [ ] Validate accessibility

## DEPENDENCIES TRACKING
- **Database**: PostgreSQL connection verified
- **Alembic**: Migration status to be checked
- **Redis**: Installation required
- **Groq API**: Key provided
- **Ollama**: Installation and model download required
- **pgvector**: Existing infrastructure to be used

## COMPONENT COMPLETION STATUS
| Component | Status | Progress | Notes |
|-----------|--------|----------|-------|
| Search Fixes | Not Started | 0% | Deduplication priority |
| Ingestion Fixes | Not Started | 0% | Redis integration needed |
| Dashboard | Not Started | 0% | Real metrics required |
| TechVault | Not Started | 0% | Admin separation |
| Leaderboard | Not Started | 0% | New component |
| Innovate | Not Started | 0% | New component |
| Chat System | Not Started | 0% | CRITICAL - RAG + Memory |
| Navigation | Not Started | 0% | Integration phase |
| Testing | Not Started | 0% | Comprehensive coverage |

## TEST COVERAGE TRACKING
- [ ] Unit Tests Coverage: 0%
- [ ] Integration Tests Coverage: 0%
- [ ] E2E Tests Coverage: 0%
- [ ] Chat Functionality Tests: 0%

## CONTEXT MANAGEMENT PLAN
**Clear Context Points**:
1. After Phase 0 completion
2. After Phase 1 completion (Bug Fixes)
3. After Phase 2 completion (New Components)
4. After Phase 3 completion (Integration)
5. Before final testing phase

**Context Preservation Strategy**:
- Update this blueprint before each /clear
- Maintain PROGRESS_LOG.md continuously
- Save important discoveries to reference files
- Document architectural decisions

## CRITICAL SUCCESS FACTORS
- ✅ Database sync with Alembic
- ❌ Real conversational AI (not hardcoded)
- ❌ Proper RAG implementation
- ❌ Context detection working
- ❌ All bugs fixed
- ❌ New components functional
- ❌ Comprehensive testing passed

**Last Updated**: 2025-09-17 - Phase 0 Blueprint Creation