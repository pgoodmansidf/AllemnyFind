import logging
import asyncio
import json
from typing import Dict, Any, List, Optional, AsyncGenerator, Tuple
from datetime import datetime
from uuid import UUID
import re
from collections import defaultdict
import tiktoken

from sqlalchemy import text, select
from sqlalchemy.orm import Session
from langchain_groq import ChatGroq
from langchain.prompts import PromptTemplate
from langchain.text_splitter import RecursiveCharacterTextSplitter

from app.core.database import SessionLocal
from app.core.config import settings
from app.models.summarization import DocumentSummary
from app.models.document import Document, DocumentChunk

logger = logging.getLogger(__name__)


class DocumentSummarizationService:
    """Service for intelligent document summarization with token management"""
    
    def __init__(self, groq_api_key: str):
        self.llm = ChatGroq(
            api_key=groq_api_key,
            model=settings.groq_model,
            temperature=0.3,
            streaming=True,
            max_tokens=4000  # Set max output tokens
        )
        
        self.db = SessionLocal()
        
        # Initialize tokenizer for token counting (using cl100k_base as approximation)
        try:
            self.encoding = tiktoken.get_encoding("cl100k_base")
        except:
            self.encoding = None
            logger.warning("Tiktoken not available, using character-based estimation")
        
        # Token limits
        self.MAX_INPUT_TOKENS = 8000  # Conservative limit to leave room for output
        self.MAX_CHUNK_TOKENS = 3000  # Max tokens per chunk for initial summarization
        self.MAX_CHARS_FALLBACK = 12000  # Fallback if tiktoken not available
        
        # Chunk summarization template (shorter, focused)
        self.chunk_summary_prompt = PromptTemplate(
            template="""Summarize this document section concisely while preserving key information:

{content}

Provide a summary that includes:
1. Main points discussed
2. Any important data, statistics, or numbers
3. Key findings or conclusions

Keep the summary under 500 words but include all critical information.""",
            input_variables=["content"]
        )
        
        # Combination template for multiple chunk summaries
        self.combine_summaries_prompt = PromptTemplate(
            template="""Combine these section summaries into a cohesive {summary_type} summary:

{summaries}

Document Metadata:
- Total documents: {doc_count}
- Topics: {topics}

Create a {summary_type} with these sections:

**Overview:** Brief introduction (2-3 sentences)

**Key Points:**
- [List the 5-7 most important points from all sections]

**Data & Statistics:**
- [Extract all numerical data with context]
- [Format multi-value data as tables where appropriate]

**Conclusions:**
[Synthesize main insights in 2-3 paragraphs]

{additional_sections}

Keep the final summary comprehensive but concise. Use tables for data with multiple values.""",
            input_variables=["summaries", "summary_type", "doc_count", "topics", "additional_sections"]
        )
        
        # Final refinement template
        self.refinement_prompt = PromptTemplate(
            template="""Refine and format this summary for final presentation:

{draft_summary}

Ensure the summary:
1. Has clear section headers
2. Includes all statistics and data points in tables where appropriate
3. Provides actionable insights where applicable
4. Maintains professional tone
5. Has proper markdown formatting

Output the refined summary:""",
            input_variables=["draft_summary"]
        )
    
    def __del__(self):
        """Cleanup database connection"""
        if hasattr(self, 'db') and self.db:
            try:
                self.db.close()
            except:
                pass
    
    def count_tokens(self, text: str) -> int:
        """Count tokens in text"""
        if self.encoding:
            try:
                return len(self.encoding.encode(text))
            except:
                # Fallback if encoding fails
                return len(text) // 4
        else:
            # Rough estimation: 1 token ≈ 4 characters
            return len(text) // 4
    
    def truncate_to_token_limit(self, text: str, max_tokens: int) -> str:
        """Truncate text to fit within token limit"""
        if self.encoding:
            try:
                tokens = self.encoding.encode(text)
                if len(tokens) > max_tokens:
                    tokens = tokens[:max_tokens]
                    return self.encoding.decode(tokens)
            except:
                # Fallback if encoding fails
                max_chars = max_tokens * 4
                if len(text) > max_chars:
                    return text[:max_chars]
        else:
            # Character-based fallback
            max_chars = max_tokens * 4
            if len(text) > max_chars:
                return text[:max_chars]
        return text
    
    async def create_summary_stream(
        self,
        user_id: int,
        document_ids: List[str],
        summary_type: str = "general",
        topic: Optional[str] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Create a summary with streaming progress updates and token management"""
        
        start_time = datetime.now()
        
        try:
            # Stage 1: Loading documents
            yield {
                'type': 'stage_update',
                'stage': 'loading',
                'message': f'Loading {len(document_ids)} document(s)...',
                'timestamp': datetime.now().isoformat()
            }
            
            # Fetch documents and chunks
            documents_data = self._fetch_documents_with_chunks(document_ids)
            
            if not documents_data:
                yield {
                    'type': 'error',
                    'message': 'No documents found with the provided IDs',
                    'timestamp': datetime.now().isoformat()
                }
                return
            
            # Stage 2: Chunking and preprocessing
            total_chunks = sum(len(d["chunks"]) for d in documents_data)
            yield {
                'type': 'stage_update',
                'stage': 'preprocessing',
                'message': f'Processing {total_chunks} chunks from {len(documents_data)} documents...',
                'timestamp': datetime.now().isoformat()
            }
            
            # Create manageable content chunks
            content_chunks = self._create_smart_chunks(documents_data)
            
            # Stage 3: Summarizing chunks
            yield {
                'type': 'stage_update',
                'stage': 'summarizing_chunks',
                'message': f'Creating summaries for {len(content_chunks)} content sections...',
                'timestamp': datetime.now().isoformat()
            }
            
            # Summarize each chunk
            chunk_summaries = []
            for i, chunk in enumerate(content_chunks):
                # Update progress
                if i % 3 == 0:  # Update every 3 chunks to avoid too many updates
                    yield {
                        'type': 'stage_update',
                        'stage': 'summarizing_chunks',
                        'message': f'Processing section {i+1} of {len(content_chunks)}...',
                        'timestamp': datetime.now().isoformat()
                    }
                
                # Summarize this chunk
                chunk_summary = await self._summarize_chunk(chunk)
                if chunk_summary:
                    chunk_summaries.append(chunk_summary)
            
            # Stage 4: Combining summaries
            yield {
                'type': 'stage_update',
                'stage': 'combining',
                'message': 'Combining section summaries into final document...',
                'timestamp': datetime.now().isoformat()
            }
            
            # Stage 5: Streaming final summary
            yield {
                'type': 'stage_update',
                'stage': 'generating',
                'message': f'Generating final {summary_type} summary...',
                'timestamp': datetime.now().isoformat()
            }
            
            # Combine all chunk summaries and stream the result
            full_summary = ""
            async for part in self._combine_summaries(
                chunk_summaries, 
                summary_type, 
                documents_data,
                topic
            ):
                full_summary += part
                yield {
                    'type': 'content_chunk',
                    'content': part,
                    'timestamp': datetime.now().isoformat()
                }
            
            # Parse structured data
            statistics = self._extract_statistics_from_summary(full_summary)
            structured_data = self._parse_summary_sections(full_summary, summary_type)
            
            # Stage 6: Saving
            yield {
                'type': 'stage_update',
                'stage': 'saving',
                'message': 'Saving summary to database...',
                'timestamp': datetime.now().isoformat()
            }
            
            # Create summary record
            processing_time = (datetime.now() - start_time).total_seconds()
            
            summary_record = DocumentSummary(
                user_id=user_id,
                summary_type=summary_type,
                document_ids=[UUID(doc_id) for doc_id in document_ids],
                document_count=len(document_ids),
                title=self._generate_title(documents_data, summary_type),
                executive_summary=structured_data.get('overview', ''),
                key_findings=structured_data.get('key_findings', []),
                trends=structured_data.get('trends', []),
                statistics=statistics,
                conclusions=structured_data.get('conclusions', ''),
                recommendations=structured_data.get('recommendations', []),
                full_summary=full_summary,
                citations=self._generate_citations(documents_data),
                source_documents=[
                    {
                        'id': str(doc['id']),
                        'filename': doc['filename'],
                        'title': doc.get('title', ''),
                        'pages': doc.get('total_pages', 0)
                    }
                    for doc in documents_data
                ],
                summary_metadata={
                    'total_chunks_processed': len(content_chunks),
                    'chunk_summaries_created': len(chunk_summaries),
                    'summary_type': summary_type,
                    'topic': topic
                },
                topics=self._extract_topics_from_summary(full_summary),
                tags=self._extract_tags(documents_data),
                word_count=len(full_summary.split()),
                processing_time=processing_time,
                processing_status='completed',
                completed_at=datetime.now()
            )
            
            self.db.add(summary_record)
            self.db.commit()
            
            # Send completion
            yield {
                'type': 'summary_complete',
                'summary_id': str(summary_record.id),
                'processing_time': processing_time * 1000,
                'statistics': statistics,
                'document_count': len(document_ids),
                'word_count': summary_record.word_count,
                'chunks_processed': len(content_chunks),
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error creating summary: {e}", exc_info=True)
            yield {
                'type': 'error',
                'message': f"Failed to create summary: {str(e)}",
                'timestamp': datetime.now().isoformat()
            }
    
    def _fetch_documents_with_chunks(self, document_ids: List[str]) -> List[Dict[str, Any]]:
        """Fetch documents and their chunks from database"""
        documents_data = []
        
        for doc_id in document_ids:
            try:
                # Fetch document
                doc_query = text("""
                    SELECT 
                        d.id, d.filename, d.title, d.content,
                        d.main_tag, d.product_tags, d.summary,
                        d.creation_date, d.modification_date,
                        d.table_metadata, d.has_tables
                    FROM documents d
                    WHERE d.id = :doc_id
                """)
                
                doc_result = self.db.execute(doc_query, {'doc_id': doc_id}).first()
                
                if doc_result:
                    # Fetch chunks (limited to avoid memory issues)
                    chunks_query = text("""
                        SELECT 
                            dc.id, dc.content, dc.chunk_index,
                            dc.page_number, dc.chunk_metadata,
                            dc.table_summary, dc.is_table
                        FROM document_chunks dc
                        WHERE dc.document_id = :doc_id
                        ORDER BY dc.chunk_index
                        LIMIT 100
                    """)
                    
                    chunks_result = self.db.execute(chunks_query, {'doc_id': doc_id})
                    
                    chunks = []
                    for chunk in chunks_result:
                        chunks.append({
                            'id': str(chunk.id),
                            'content': chunk.content,
                            'page_number': chunk.page_number,
                            'is_table': chunk.is_table,
                            'table_summary': chunk.table_summary,
                            'metadata': chunk.chunk_metadata
                        })
                    
                    documents_data.append({
                        'id': str(doc_result.id),
                        'filename': doc_result.filename,
                        'title': doc_result.title or doc_result.filename,
                        'chunks': chunks,
                        'main_tag': doc_result.main_tag,
                        'product_tags': doc_result.product_tags or [],
                        'has_tables': doc_result.has_tables,
                        'table_metadata': doc_result.table_metadata,
                        'total_pages': max([c['page_number'] for c in chunks if c['page_number']] + [0])
                    })
            
            except Exception as e:
                logger.error(f"Error fetching document {doc_id}: {e}")
                continue
        
        return documents_data
    
    def _create_smart_chunks(self, documents_data: List[Dict]) -> List[str]:
        """Create token-aware chunks from documents"""
        content_chunks = []
        current_chunk = []
        current_tokens = 0
        
        for doc in documents_data:
            doc_header = f"\n--- Document: {doc['filename']} ---\n"
            
            # Add document header to current chunk
            header_tokens = self.count_tokens(doc_header)
            if current_tokens + header_tokens > self.MAX_CHUNK_TOKENS and current_chunk:
                # Save current chunk and start new one
                content_chunks.append('\n'.join(current_chunk))
                current_chunk = [doc_header]
                current_tokens = header_tokens
            else:
                current_chunk.append(doc_header)
                current_tokens += header_tokens
            
            # Process document chunks
            for chunk in doc['chunks'][:50]:  # Limit chunks per document
                if chunk['is_table'] and chunk['table_summary']:
                    chunk_text = f"[Table p.{chunk['page_number']}]: {chunk['table_summary']}"
                else:
                    # Truncate very long chunks
                    chunk_text = chunk['content'][:2000] if len(chunk['content']) > 2000 else chunk['content']
                
                chunk_tokens = self.count_tokens(chunk_text)
                
                # Check if adding this chunk would exceed limit
                if current_tokens + chunk_tokens > self.MAX_CHUNK_TOKENS and current_chunk:
                    # Save current chunk and start new one
                    content_chunks.append('\n'.join(current_chunk))
                    current_chunk = [chunk_text]
                    current_tokens = chunk_tokens
                else:
                    current_chunk.append(chunk_text)
                    current_tokens += chunk_tokens
        
        # Add remaining content
        if current_chunk:
            content_chunks.append('\n'.join(current_chunk))
        
        # Limit total number of chunks to process
        if len(content_chunks) > 20:
            logger.warning(f"Too many chunks ({len(content_chunks)}), limiting to 20")
            content_chunks = content_chunks[:20]
        
        return content_chunks
    
    async def _summarize_chunk(self, chunk_content: str) -> str:
        """Summarize a single chunk of content"""
        try:
            # Ensure chunk fits within token limit
            chunk_content = self.truncate_to_token_limit(chunk_content, self.MAX_CHUNK_TOKENS)
            
            prompt = self.chunk_summary_prompt.format(content=chunk_content)
            
            summary = ""
            async for response_chunk in self.llm.astream(prompt):
                if response_chunk.content:
                    summary += response_chunk.content
            
            return summary
        
        except Exception as e:
            logger.error(f"Error summarizing chunk: {e}")
            # Return a basic summary on error
            return f"Section summary: {chunk_content[:500]}..."
    
    async def _combine_summaries(
        self, 
        chunk_summaries: List[str], 
        summary_type: str,
        documents_data: List[Dict],
        topic: Optional[str] = None
    ) -> AsyncGenerator[str, None]:
        """Combine chunk summaries into final summary"""
        
        try:
            # Join summaries with clear separation
            combined_summaries = "\n\n=== Section Summary ===\n".join(chunk_summaries)
            
            # Truncate if still too long
            combined_summaries = self.truncate_to_token_limit(combined_summaries, 6000)
            
            # Prepare metadata
            all_topics = set()
            for doc in documents_data:
                if doc.get('product_tags'):
                    all_topics.update(doc['product_tags'][:3])
            
            # Define additional sections based on summary type
            additional_sections = ""
            if summary_type == "executive":
                additional_sections = """
**Recommendations:**
- [Provide 3-5 actionable recommendations]

**Next Steps:**
- [Suggest immediate actions]"""
            elif summary_type == "research_brief":
                additional_sections = f"""
**Research Focus:** {topic or 'General Analysis'}

**Methodology Notes:**
[Brief description of analysis approach]

**Implications:**
[Key implications of findings]

**Areas for Further Research:**
- [Identify gaps or future research needs]"""
            
            # Generate combined summary
            prompt = self.combine_summaries_prompt.format(
                summaries=combined_summaries,
                summary_type=summary_type.replace('_', ' ').title(),
                doc_count=len(documents_data),
                topics=', '.join(list(all_topics)[:5]) or 'Various',
                additional_sections=additional_sections
            )
            
            # Stream the response
            async for chunk in self.llm.astream(prompt):
                if chunk.content:
                    yield chunk.content
                    
        except Exception as e:
            logger.error(f"Error combining summaries: {e}")
            yield f"\n\nError combining summaries: {str(e)}\n\n"
            # Fallback: just return the chunk summaries
            yield "\n\n".join(chunk_summaries)
    
    def _extract_statistics_from_summary(self, summary: str) -> List[Dict[str, Any]]:
        """Extract statistics from the generated summary with clean context"""
        statistics = []
        
        # Enhanced patterns for different types of statistics
        patterns = [
            (r'([+\-~]?\d+(?:\.\d+)?)\s*(%|percent)', 'percentage'),
            (r'(\d+(?:\.\d+)?)\s*(%|percent)', 'percentage'),
            (r'(\$[\d,]+(?:\.\d+)?(?:\s*(?:million|billion|M|B))?)', 'currency'),
            (r'(\d+(?:,\d{3})*(?:\.\d+)?)\s+(units?|items?|employees?|years?|deliveries)', 'measurement'),
        ]
        
        for pattern, stat_type in patterns:
            try:
                for match in re.finditer(pattern, summary, re.IGNORECASE):
                    # Get broader context
                    start = max(0, match.start() - 100)
                    end = min(len(summary), match.end() + 100)
                    full_context = summary[start:end].strip()
                    
                    # Clean and shorten context
                    value = match.group(0)
                    
                    # Extract key information from context
                    clean_context = self._extract_clean_context(value, full_context, stat_type)
                    
                    statistics.append({
                        'type': stat_type,
                        'value': value,
                        'context': clean_context
                    })
            except Exception as e:
                logger.warning(f"Error extracting statistics: {e}")
                continue
        
        # Remove duplicates based on value
        seen_values = set()
        unique_stats = []
        for stat in statistics:
            if stat['value'] not in seen_values:
                seen_values.add(stat['value'])
                unique_stats.append(stat)
        
        return unique_stats[:15]
    
    def _extract_clean_context(self, value: str, full_context: str, stat_type: str) -> str:
        """Extract clean, concise context for a statistic"""
        
        # Remove the value itself from context to avoid redundancy
        context = full_context.replace(value, '***').strip()
        
        # Common patterns to extract meaningful context
        city_pattern = r'(Riyadh|Jeddah|Dammam|Qassim|Madinah|Abha|Tabuk|Saudi Arabia)'
        year_pattern = r'(2018|2019|2020|2021|2022|2023|2024)'
        quarter_pattern = r'(Q[1-4])'
        period_pattern = r'(year-on-year|YoY|annual|monthly|quarterly)'
        metric_pattern = r'(sales|deliveries|growth|increase|decrease|revenue|profit|market share|wastage|units|waste)'
        descriptor_pattern = r'(largest|smallest|highest|lowest|average|total|strongest|sharpest)'
        
        # Extract key components
        cities = re.findall(city_pattern, context, re.IGNORECASE)
        years = re.findall(year_pattern, context)
        quarters = re.findall(quarter_pattern, context, re.IGNORECASE)
        periods = re.findall(period_pattern, context, re.IGNORECASE)
        metrics = re.findall(metric_pattern, context, re.IGNORECASE)
        descriptors = re.findall(descriptor_pattern, context, re.IGNORECASE)
        
        # Build concise context
        context_parts = []
        
        # Add city if found
        if cities:
            context_parts.append(cities[0])
            
        # Add descriptor if found
        if descriptors:
            context_parts.append(descriptors[0].lower())
        
        # Add metric
        if metrics:
            # Choose the most relevant metric
            metric = metrics[0].lower()
            if metric == 'waste' and 'wastage' in [m.lower() for m in metrics]:
                metric = 'wastage'
            context_parts.append(metric)
        
        # Add time period
        if years and quarters:
            context_parts.append(f"{quarters[0]} {years[0]}")
        elif years:
            if len(years) > 1 and '2018' in years and '2020' in years:
                context_parts.append("2018-2020")
            else:
                context_parts.append(years[0])
        elif periods:
            context_parts.append(periods[0])
        
        # Special handling for growth percentages
        if stat_type == 'percentage':
            if '+' in value or 'growth' in context.lower() or 'increase' in context.lower():
                if 'growth' not in ' '.join(context_parts).lower():
                    context_parts.insert(-1, 'growth')
            elif '-' in value or 'decrease' in context.lower() or 'fell' in context.lower():
                if 'decrease' not in ' '.join(context_parts).lower():
                    context_parts.insert(-1, 'decrease')
        
        if context_parts:
            # Format the context string nicely
            result = ' '.join(context_parts)
            # Capitalize first letter
            result = result[0].upper() + result[1:] if result else result
            # Clean up spacing
            result = re.sub(r'\s+', ' ', result).strip()
            return result
        
        # Fallback: extract the most relevant sentence fragment
        sentences = re.split(r'[.;,]', context)
        for sentence in sentences:
            if '***' in sentence and 10 < len(sentence) < 80:
                clean_sent = sentence.replace('***', value).strip()
                # Remove leading/trailing fragments
                clean_sent = re.sub(r'^[a-z]+\s+', '', clean_sent)
                clean_sent = re.sub(r'\s+[a-z]+$', '', clean_sent)
                return clean_sent.strip()
        
        # Last fallback: truncate
        if len(context) > 60:
            # Find position of *** and center around it
            pos = context.find('***')
            if pos > 30:
                context = '...' + context[pos-27:pos+30] + '...'
            else:
                context = context[:57] + '...'
        
        return context.replace('***', value).strip()
    
    def _parse_summary_sections(self, summary_text: str, summary_type: str) -> Dict[str, Any]:
        """Parse the generated summary into structured sections"""
        sections = {}
        
        try:
            # Extract overview
            overview_match = re.search(r'\*\*Overview:\*\*\s*(.*?)(?=\*\*|$)', summary_text, re.DOTALL)
            if overview_match:
                sections['overview'] = overview_match.group(1).strip()
            
            # Extract key points/findings
            findings_match = re.search(r'\*\*Key (?:Points|Findings):\*\*\s*(.*?)(?=\*\*|$)', summary_text, re.DOTALL)
            if findings_match:
                findings = []
                for line in findings_match.group(1).split('\n'):
                    line = line.strip()
                    if line and (line.startswith('•') or line.startswith('-')):
                        findings.append(line.lstrip('•- ').strip())
                sections['key_findings'] = findings
            
            # Extract conclusions
            conclusions_match = re.search(r'\*\*Conclusions?:\*\*\s*(.*?)(?=\*\*|$)', summary_text, re.DOTALL)
            if conclusions_match:
                sections['conclusions'] = conclusions_match.group(1).strip()
            
            # Extract recommendations (if present)
            recommendations_match = re.search(r'\*\*Recommendations?:\*\*\s*(.*?)(?=\*\*|$)', summary_text, re.DOTALL)
            if recommendations_match:
                recommendations = []
                for line in recommendations_match.group(1).split('\n'):
                    line = line.strip()
                    if line and (line.startswith('•') or line.startswith('-')):
                        recommendations.append(line.lstrip('•- ').strip())
                sections['recommendations'] = recommendations
                
        except Exception as e:
            logger.error(f"Error parsing summary sections: {e}")
        
        return sections
    
    def _generate_title(self, documents_data: List[Dict], summary_type: str) -> str:
        """Generate a title for the summary"""
        if len(documents_data) == 1:
            doc_title = documents_data[0].get('title') or documents_data[0]['filename']
            # Truncate if too long
            if len(doc_title) > 100:
                doc_title = doc_title[:97] + "..."
            return f"{summary_type.replace('_', ' ').title()} Summary: {doc_title}"
        else:
            return f"{summary_type.replace('_', ' ').title()} Summary of {len(documents_data)} Documents"
    
    def _generate_citations(self, documents_data: List[Dict]) -> List[Dict[str, Any]]:
        """Generate citations for the summary"""
        citations = []
        for doc in documents_data:
            try:
                citations.append({
                    'document_id': doc['id'],
                    'filename': doc['filename'],
                    'title': doc.get('title', doc['filename'])
                })
            except Exception as e:
                logger.warning(f"Error generating citation for document: {e}")
                continue
        return citations
    
    def _extract_topics_from_summary(self, summary: str) -> List[str]:
        """Extract topics from the summary"""
        topics = []
        
        try:
            # Look for emphasized words (in bold or headers)
            bold_pattern = r'\*\*([^*]+)\*\*'
            for match in re.finditer(bold_pattern, summary):
                topic = match.group(1).strip()
                if 3 < len(topic) < 30 and ':' not in topic:
                    topics.append(topic)
        except Exception as e:
            logger.warning(f"Error extracting topics: {e}")
        
        return list(set(topics))[:10]
    
    def _extract_tags(self, documents_data: List[Dict]) -> List[str]:
        """Extract tags from documents"""
        tags = set()
        
        for doc in documents_data:
            try:
                if doc.get('main_tag'):
                    tags.add(doc['main_tag'])
                if doc.get('product_tags'):
                    tags.update(doc['product_tags'][:3])
            except Exception as e:
                logger.warning(f"Error extracting tags: {e}")
                continue
        
        return list(tags)[:10]
    
    async def get_summary_history(
        self,
        user_id: int,
        limit: int = 20,
        offset: int = 0,
        summary_type: Optional[str] = None,
        starred_only: bool = False
    ) -> List[Dict[str, Any]]:
        """Get user's summary history"""
        try:
            query = self.db.query(DocumentSummary).filter(
                DocumentSummary.user_id == user_id
            )
            
            if summary_type:
                query = query.filter(DocumentSummary.summary_type == summary_type)
            
            if starred_only:
                query = query.filter(DocumentSummary.is_starred == True)
            
            summaries = query.order_by(
                DocumentSummary.created_at.desc()
            ).offset(offset).limit(limit).all()
            
            return [
                {
                    'id': str(summary.id),
                    'title': summary.title,
                    'summary_type': summary.summary_type,
                    'document_count': summary.document_count,
                    'word_count': summary.word_count,
                    'is_starred': summary.is_starred,
                    'created_at': summary.created_at.isoformat(),
                    'processing_time': summary.processing_time,
                    'topics': summary.topics or [],
                    'tags': summary.tags or []
                }
                for summary in summaries
            ]
        
        except Exception as e:
            logger.error(f"Error fetching summary history: {e}")
            return []
    
    async def get_summary_by_id(self, summary_id: str, user_id: int) -> Optional[Dict[str, Any]]:
        """Get a specific summary by ID"""
        try:
            summary = self.db.query(DocumentSummary).filter(
                DocumentSummary.id == summary_id,
                DocumentSummary.user_id == user_id
            ).first()
            
            if not summary:
                return None
            
            return {
                'id': str(summary.id),
                'title': summary.title,
                'summary_type': summary.summary_type,
                'document_count': summary.document_count,
                'executive_summary': summary.executive_summary,
                'key_findings': summary.key_findings or [],
                'trends': summary.trends or [],
                'statistics': summary.statistics or [],
                'conclusions': summary.conclusions,
                'recommendations': summary.recommendations or [],
                'full_summary': summary.full_summary,
                'citations': summary.citations or [],
                'source_documents': summary.source_documents or [],
                'word_count': summary.word_count,
                'is_starred': summary.is_starred,
                'created_at': summary.created_at.isoformat(),
                'processing_time': summary.processing_time,
                'topics': summary.topics or [],
                'tags': summary.tags or []
            }
        
        except Exception as e:
            logger.error(f"Error fetching summary: {e}")
            return None
    
    async def toggle_star(self, summary_id: str, user_id: int) -> bool:
        """Toggle star status for a summary"""
        try:
            summary = self.db.query(DocumentSummary).filter(
                DocumentSummary.id == summary_id,
                DocumentSummary.user_id == user_id
            ).first()
            
            if summary:
                summary.is_starred = not summary.is_starred
                self.db.commit()
                return summary.is_starred
            
            return False
        
        except Exception as e:
            logger.error(f"Error toggling star: {e}")
            self.db.rollback()
            return False
    
    async def delete_summary(self, summary_id: str, user_id: int) -> bool:
        """Delete a summary"""
        try:
            summary = self.db.query(DocumentSummary).filter(
                DocumentSummary.id == summary_id,
                DocumentSummary.user_id == user_id
            ).first()
            
            if summary:
                self.db.delete(summary)
                self.db.commit()
                return True
            
            return False
        
        except Exception as e:
            logger.error(f"Error deleting summary: {e}")
            self.db.rollback()
            return False


# Service singleton
_summarization_service = None

def get_summarization_service(groq_api_key: str) -> DocumentSummarizationService:
    """Get or create the summarization service singleton"""
    global _summarization_service
    if _summarization_service is None:
        _summarization_service = DocumentSummarizationService(groq_api_key)
    return _summarization_service