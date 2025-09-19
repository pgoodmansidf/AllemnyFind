# app/services/langchain_search.py

import logging
import asyncio
import numpy as np
import re
from typing import Dict, Any, Optional, AsyncGenerator, List, Tuple
from datetime import datetime, timedelta, timezone
from uuid import UUID
from collections import defaultdict

from sqlalchemy import text, select, and_, or_, func
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from langchain_ollama import OllamaEmbeddings
from langchain_groq import ChatGroq
from langchain.schema import Document
from langchain.prompts import PromptTemplate

from app.core.database import SessionLocal
from app.core.config import settings

logger = logging.getLogger(__name__)


class DomainSpecificAgent:
    """Agent with domain expertise for specific product/topic"""
    
    def __init__(self, domain: str, llm: ChatGroq):
        self.domain = domain
        self.llm = llm
        
        # Domain-specific prompt for extracting definitions
        self.definition_prompt = PromptTemplate(
            template="""You are a domain expert in {domain}. 
            
Your task is to find and extract definitions from the provided context:
1. First, look for an exact definition of "{product}" 
2. If no exact definition exists, look for a definition of the base product (e.g., if searching for "chocolate donut", look for "donut")
3. Extract the most relevant definition found
4. NEVER respond with your thought process or steps taken

Context from documents:
{context}

Please provide:
1. **Cited Definition**: [Extract the exact definition from context. If no definition for the specific variant exists then say 'No definition for the specific variant exists in the studies documents. Check the response from Allemny'"]
2. **Source**: [Cite the document name and page if available]

Response:""",
            input_variables=["domain", "product", "context"]
        )
        
        # Updated prompt for AI-generated definition with Application/Usage
        self.ai_definition_prompt = PromptTemplate(
            template="""You are a domain expert in {domain}.

Write exactly 4 sentences about "{product}":
- Sentence 1: What it is
- Sentence 2: Its primary purpose or function  
- Sentence 3: A key characteristic
- Sentence 4: Its main application or usage

Output only the 4 sentences, nothing else:""",
            input_variables=["domain", "product"]
        )
        
        # Prompt for finding producers/competitors
        self.producers_prompt = PromptTemplate(
            template="""You are analyzing documents about {product}.

Based on the following context, identify any producers, manufacturers, suppliers, or competitors mentioned for "{product}".

Context from documents:
{context}

Extract information about each producer/manufacturer/competitor found. For each one, provide:
- Company Name
- Type (Producer/Manufacturer/Supplier/Competitor)
- Any additional details mentioned (location, capacity, specialization, etc.)

If no producers or competitors are found, respond with "No producers or competitors found in the documents."

Response:""",
            input_variables=["product", "context"]
        )


class AgenticRAGSearchSystem:
    """Enhanced search system with domain-specific agents"""
    
    def __init__(self, groq_api_key: str):
        self.embeddings = OllamaEmbeddings(
            model="nomic-embed-text:latest",
            base_url=settings.ollama_base_url
        )
        
        self.llm = ChatGroq(
            api_key=groq_api_key,
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            temperature=0.5,
            streaming=True
        )
        
        # Don't store db session as instance variable
        # Create new session for each operation
        self.domain_agents = {}
    
    def get_db(self) -> Session:
        """Get a new database session"""
        return SessionLocal()
    
    def __del__(self):
        """Cleanup"""
        pass
    
    def get_relative_date(self, date: Any) -> str:
        """Calculate relative date from today"""
        if not date:
            return "Date not available"
        
        # Handle both datetime and date objects
        if isinstance(date, str):
            try:
                date = datetime.fromisoformat(date)
            except:
                return "Date not available"
        
        # If it's a date object, convert to datetime
        if hasattr(date, 'date') and callable(date.date):
            # It's already a datetime
            pass
        elif hasattr(date, 'year') and hasattr(date, 'month') and hasattr(date, 'day'):
            # It's a date object, convert to datetime
            date = datetime.combine(date, datetime.min.time())
        else:
            return "Date not available"

        # Corrected code to handle timezone-aware vs naive datetimes
        if date.tzinfo is None or date.tzinfo.utcoffset(date) is None:
            # If date is naive, assume UTC for comparison
            aware_date = date.replace(tzinfo=timezone.utc)
        else:
            # If date is already aware, use it as is
            aware_date = date
        
        # Get current time as a timezone-aware object
        today = datetime.now(timezone.utc)
        
        diff = today - aware_date
        
        if diff.days == 0:
            return "Today"
        elif diff.days == 1:
            return "Yesterday"
        elif diff.days < 7:
            return f"{diff.days} days ago"
        elif diff.days < 30:
            weeks = diff.days // 7
            return f"{weeks} week{'s' if weeks > 1 else ''} ago"
        elif diff.days < 365:
            months = diff.days // 30
            return f"{months} month{'s' if months > 1 else ''} ago"
        else:
            years = diff.days // 365
            return f"{years} year{'s' if years > 1 else ''} ago"
    
    def extract_base_product(self, product: str) -> str:
        """Extract base product from a specific variant"""
        # Remove common modifiers and get the base product
        # E.g., "chocolate donut" -> "donut", "red bricks" -> "bricks"
        
        # Common patterns to remove
        modifiers = [
            r'^(frozen|fresh|hot|cold|warm)\s+',  # Temperature modifiers
            r'^(chocolate|vanilla|strawberry|caramel)\s+',  # Flavor modifiers
            r'^(red|blue|green|yellow|white|black|brown)\s+',  # Color modifiers
            r'^(large|small|medium|mini|jumbo|giant)\s+',  # Size modifiers
            r'^(premium|deluxe|special|classic|original)\s+',  # Quality modifiers
            r'^(sweet|sour|salty|spicy|bitter)\s+',  # Taste modifiers
        ]
        
        base_product = product.lower()
        for pattern in modifiers:
            base_product = re.sub(pattern, '', base_product, flags=re.IGNORECASE)
        
        # Also try to get the last word(s) as the base product
        # E.g., "KitKat Donuts" -> "Donuts"
        words = base_product.split()
        if len(words) > 1:
            # Try the last word as base
            last_word = words[-1]
            # Handle plurals
            if last_word.endswith('s'):
                singular = last_word[:-1]
                return singular.title()
            return last_word.title()
        
        return base_product.title()
    
    def get_domain_agent(self, domain: str) -> DomainSpecificAgent:
        """Get or create a domain-specific agent"""
        if domain not in self.domain_agents:
            self.domain_agents[domain] = DomainSpecificAgent(domain, self.llm)
        return self.domain_agents[domain]
    
    async def get_query_embedding(self, query: str) -> List[float]:
        """Generate embedding for the query"""
        try:
            embedding = await self.embeddings.aembed_query(query)
            return embedding
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            raise
    
    def retrieve_similar_chunks(
        self, 
        query_embedding: List[float], 
        k: int = 20,
        filters: Optional[Dict] = None
    ) -> List[Dict[str, Any]]:
        """Retrieve similar chunks from database using vector similarity"""
        db = self.get_db()
        try:
            # First, rollback any existing failed transaction
            db.rollback()
            
            embedding_str = '[' + ','.join(map(str, query_embedding)) + ']'
            
            # Build filter conditions
            filter_conditions = []
            params = {
                'embedding': embedding_str,
                'k': k
            }
            
            if filters:
                if filters.get('product_tags'):
                    # Filter by product tags
                    filter_conditions.append("d.product_tags && :product_tags")
                    params['product_tags'] = filters['product_tags']
                
                if filters.get('project_number'):
                    # Filter by project number (SAU number)
                    filter_conditions.append("d.project_number = :project_number")
                    params['project_number'] = filters['project_number']
                
                if filters.get('main_city'):
                    # Filter by main city
                    filter_conditions.append("d.main_city = :main_city")
                    params['main_city'] = filters['main_city']
            
            where_clause = "WHERE dc.embedding IS NOT NULL"
            if filter_conditions:
                where_clause += " AND " + " AND ".join(filter_conditions)
            
            sql = text(f"""
                SELECT 
                    dc.id,
                    dc.content,
                    dc.chunk_index,
                    dc.page_number,
                    dc.chunk_metadata,
                    dc.table_summary,
                    dc.is_table,
                    d.id as document_id,
                    d.filename,
                    d.title,
                    d.author,
                    d.main_tag,
                    d.product_tags,
                    d.project_number,
                    d.main_city,
                    d.companies,
                    d.file_size,
                    d.modification_date,
                    d.creation_date,
                    d.updated_at,
                    dc.embedding <=> CAST(:embedding AS vector) AS distance
                FROM document_chunks dc
                JOIN documents d ON dc.document_id = d.id
                {where_clause}
                ORDER BY dc.embedding <=> CAST(:embedding AS vector)
                LIMIT :k
            """)
            
            result = db.execute(sql, params)
            
            chunks = []
            for row in result:
                # Get the best available date
                mod_date = row.modification_date or row.updated_at or row.creation_date
                
                chunks.append({
                    'id': str(row.id),
                    'document_id': str(row.document_id),
                    'content': row.content,
                    'chunk_index': row.chunk_index,
                    'page_number': row.page_number,
                    'metadata': row.chunk_metadata,
                    'table_summary': row.table_summary,
                    'is_table': row.is_table,
                    'filename': row.filename,
                    'title': row.title,
                    'author': row.author,
                    'main_tag': row.main_tag,  # This is the document type
                    'product_tags': row.product_tags,  # These are the actual products
                    'project_number': row.project_number,
                    'main_city': row.main_city,
                    'companies': row.companies,
                    'file_size': row.file_size,
                    'modification_date': mod_date,
                    'creation_date': row.creation_date,
                    'distance': float(row.distance) if row.distance else 0.0
                })
            
            db.commit()
            return chunks
            
        except SQLAlchemyError as e:
            logger.error(f"Database error retrieving chunks: {e}")
            db.rollback()
            raise
        except Exception as e:
            logger.error(f"Error retrieving chunks: {e}")
            db.rollback()
            raise
        finally:
            db.close()
    
    def get_available_filters(self) -> Dict[str, List[str]]:
        """Get available filter values from the database"""
        db = self.get_db()
        try:
            # Rollback any existing failed transaction
            db.rollback()
            
            filters = {
                'product_tags': [],
                'project_numbers': [],  # Changed from project_names
                'main_cities': []
            }
            
            # Get unique product tags
            sql_products = text("""
                SELECT DISTINCT unnest(product_tags) as tag
                FROM documents
                WHERE product_tags IS NOT NULL AND array_length(product_tags, 1) > 0
                ORDER BY tag
            """)
            result = db.execute(sql_products)
            filters['product_tags'] = [row.tag for row in result if row.tag]
            
            # Get unique project numbers (SAU numbers)
            sql_projects = text("""
                SELECT DISTINCT project_number
                FROM documents
                WHERE project_number IS NOT NULL AND project_number != ''
                ORDER BY project_number
            """)
            result = db.execute(sql_projects)
            filters['project_numbers'] = [row.project_number for row in result if row.project_number]
            
            # Get unique main cities
            sql_cities = text("""
                SELECT DISTINCT main_city
                FROM documents
                WHERE main_city IS NOT NULL AND main_city != ''
                ORDER BY main_city
            """)
            result = db.execute(sql_cities)
            filters['main_cities'] = [row.main_city for row in result if row.main_city]
            
            db.commit()
            return filters
            
        except SQLAlchemyError as e:
            logger.error(f"Database error getting available filters: {e}")
            db.rollback()
            return {
                'product_tags': [],
                'project_numbers': [],
                'main_cities': []
            }
        except Exception as e:
            logger.error(f"Error getting available filters: {e}")
            db.rollback()
            return {
                'product_tags': [],
                'project_numbers': [],
                'main_cities': []
            }
        finally:
            db.close()
    
    
    def _format_producer_details(self, producer_info: Dict) -> str:
        """Format producer details into a readable string"""
        details_parts = []
        
        if producer_info.get('capacity') and producer_info['capacity'] != 'Not specified':
            details_parts.append(f"Capacity: {producer_info['capacity']}")
        
        if producer_info.get('location') and producer_info['location'] != 'Not specified':
            details_parts.append(f"Location: {producer_info['location']}")
        
        if producer_info.get('details_raw'):
            details_parts.append(producer_info['details_raw'])
        
        if not details_parts:
            return "Producer of the product"
        
        return " | ".join(details_parts)
    
    
    
    async def find_producers(self, product: str, chunks: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        """Find producers/competitors for a product by understanding the full context"""
        try:
            logger.info(f"=== STARTING PRODUCER SEARCH FOR: {product} ===")
            logger.info(f"Number of input chunks provided: {len(chunks)}")
            
            # Step 1: Gather relevant context from documents and chunks
            db = self.get_db()
            all_relevant_content = []
            
            try:
                # Search in documents table for product mentions
                logger.info(f"Searching documents table for: {product}")
                sql_docs = text("""
                    SELECT 
                        d.id,
                        d.filename,
                        d.content,
                        d.companies,
                        d.main_tag,
                        ts_rank(d.content_tsvector, plainto_tsquery(:query)) as rank
                    FROM documents d
                    WHERE d.content_tsvector @@ plainto_tsquery(:query)
                        AND d.content IS NOT NULL
                    ORDER BY rank DESC
                    LIMIT 5
                """)
                
                result = db.execute(sql_docs, {'query': product})
                doc_count = 0
                for row in result:
                    doc_count += 1
                    if row.content:
                        content_preview = row.content[:200]
                        logger.info(f"Found document {doc_count}: {row.filename} (rank: {row.rank})")
                        logger.info(f"Content preview: {content_preview}...")
                        logger.info(f"Companies in metadata: {row.companies}")
                        
                        all_relevant_content.append({
                            'source': row.filename,
                            'type': row.main_tag,
                            'content': row.content[:5000]  # Take substantial content
                        })
                
                logger.info(f"Total documents found: {doc_count}")
                
                # Search in chunks for more specific mentions
                logger.info(f"Searching document_chunks table for: {product}")
                sql_chunks = text("""
                    SELECT 
                        dc.content,
                        dc.page_number,
                        dc.table_summary,
                        dc.is_table,
                        d.filename,
                        ts_rank(dc.content_tsvector, plainto_tsquery(:query)) as rank
                    FROM document_chunks dc
                    JOIN documents d ON dc.document_id = d.id
                    WHERE dc.content_tsvector @@ plainto_tsquery(:query)
                    ORDER BY rank DESC
                    LIMIT 15
                """)
                
                result = db.execute(sql_chunks, {'query': product})
                chunk_count = 0
                for row in result:
                    chunk_count += 1
                    if row.content:
                        content_preview = row.content[:200]
                        logger.info(f"Found chunk {chunk_count}: {row.filename}, page {row.page_number}, is_table: {row.is_table}, rank: {row.rank}")
                        logger.info(f"Chunk preview: {content_preview}...")
                        if row.table_summary:
                            logger.info(f"Table summary: {row.table_summary}")
                        
                        all_relevant_content.append({
                            'source': row.filename,
                            'page': row.page_number,
                            'is_table': row.is_table,
                            'table_summary': row.table_summary,
                            'content': row.content
                        })
                
                logger.info(f"Total chunks found from DB: {chunk_count}")
                db.commit()
                
            except Exception as e:
                logger.error(f"Database error gathering content: {e}", exc_info=True)
                db.rollback()
            finally:
                db.close()
            
            # Step 2: Add content from provided chunks
            logger.info("Adding content from provided chunks")
            for i, chunk in enumerate(chunks[:10]):
                if chunk.get('content'):
                    content_preview = chunk['content'][:200]
                    logger.info(f"Provided chunk {i+1}: {chunk.get('filename', 'Unknown')}, page {chunk.get('page_number')}")
                    logger.info(f"Preview: {content_preview}...")
                    
                    all_relevant_content.append({
                        'source': chunk.get('filename', 'Unknown'),
                        'page': chunk.get('page_number'),
                        'content': chunk['content']
                    })
            
            logger.info(f"Total content pieces collected: {len(all_relevant_content)}")
            
            if not all_relevant_content:
                logger.warning(f"No relevant content found for {product}")
                return []
            
            # Step 3: Use LLM to intelligently extract producers from the context
            logger.info("Preparing LLM prompt for producer extraction")
            
            extraction_prompt = PromptTemplate(
                template="""You are an expert at extracting producer/manufacturer/supplier information from documents.

    Your task is to find ALL companies that produce, manufacture, supply, or import "{product}".

    Read through the following content carefully and extract producer information. The information might appear in various formats:
    - Tables with company names and production capacities
    - Lists of producers/manufacturers
    - Paragraphs describing companies
    - Sections about local producers, importers, competitors
    - Market analysis sections

    Content to analyze:
    {content}

    For each producer/manufacturer/supplier/importer found, extract:
    1. Company Name (exact name as mentioned)
    2. Type (Producer/Manufacturer/Supplier/Importer/Competitor)
    3. Production Capacity (if mentioned)
    4. Location (if mentioned)
    5. Any other relevant details (technology used, market share, remarks, etc.)

    IMPORTANT: 
    - Only include companies that are EXPLICITLY mentioned as producing/manufacturing/supplying/importing "{product}"
    - Do not make assumptions - only extract what is clearly stated
    - Include ALL companies mentioned, even if details are limited
    - If a company is mentioned multiple times, combine the information
    - DO NOT use markdown formatting in your response

    Format your response EXACTLY as shown below (no bold, no asterisks):
    COMPANY: [Company Name]
    TYPE: [Producer/Manufacturer/Supplier/Importer/Competitor]
    CAPACITY: [Production capacity if mentioned, otherwise "Not specified"]
    LOCATION: [Location if mentioned, otherwise "Not specified"]
    DETAILS: [Any other relevant information]
    ---

    If no producers are found, respond with: "No producers found for {product}"

    Response:""",
                input_variables=["product", "content"]
            )
            
            # Combine content for analysis
            combined_content = "\n\n".join([
                f"[Source: {item['source']}, Page {item.get('page', 'N/A')}]\n{item['content']}"
                for item in all_relevant_content[:10]  # Limit to avoid token limits
            ])
            
            # Log the actual prompt being sent
            logger.info(f"Combined content length: {len(combined_content)} characters")
            logger.info(f"First 1000 chars of combined content: {combined_content[:1000]}...")
            
            prompt_text = extraction_prompt.format(product=product, content=combined_content)
            logger.info(f"Prompt length: {len(prompt_text)} characters")
            
            # Get LLM response
            logger.info("Calling LLM for producer extraction...")
            extraction_response = ""
            async for chunk in self.llm.astream(prompt_text):
                if chunk.content:
                    extraction_response += chunk.content
            
            logger.info(f"LLM Response length: {len(extraction_response)} characters")
            logger.info(f"Full LLM Response:\n{extraction_response}")  # Log full response for debugging
            
            # Step 4: Parse the LLM response with improved parsing
            logger.info("Parsing LLM response...")
            producers = []
            
            if "No producers found" in extraction_response:
                logger.warning(f"LLM reported no producers found for {product}")
                return []
            
            # Remove markdown formatting from response
            extraction_response = extraction_response.replace('**', '').replace('*', '')
            
            # Parse the structured response
            current_producer = {}
            lines = extraction_response.split('\n')
            logger.info(f"Response has {len(lines)} lines")
            
            for line_num, line in enumerate(lines):
                # Strip line and remove any markdown
                line = line.strip().replace('**', '').replace('*', '')
                
                if not line:
                    continue
                    
                logger.debug(f"Line {line_num}: {line[:100]}")
                
                # Check for COMPANY line (handle various formats)
                if 'COMPANY:' in line.upper():
                    if current_producer.get('company'):
                        # Save previous producer
                        logger.info(f"Saving producer: {current_producer['company']}")
                        producers.append({
                            'company': current_producer['company'],
                            'type': current_producer.get('type', 'Producer'),
                            'details': self._format_producer_details(current_producer)
                        })
                    # Start new producer - extract company name after COMPANY:
                    company_match = line.split(':', 1)
                    if len(company_match) > 1:
                        company_name = company_match[1].strip()
                        logger.info(f"Found company: {company_name}")
                        current_producer = {'company': company_name}
                
                elif 'TYPE:' in line.upper():
                    type_match = line.split(':', 1)
                    if len(type_match) > 1:
                        producer_type = type_match[1].strip()
                        logger.debug(f"  Type: {producer_type}")
                        current_producer['type'] = producer_type
                
                elif 'CAPACITY:' in line.upper():
                    capacity_match = line.split(':', 1)
                    if len(capacity_match) > 1:
                        capacity = capacity_match[1].strip()
                        logger.debug(f"  Capacity: {capacity}")
                        current_producer['capacity'] = capacity
                
                elif 'LOCATION:' in line.upper():
                    location_match = line.split(':', 1)
                    if len(location_match) > 1:
                        location = location_match[1].strip()
                        logger.debug(f"  Location: {location}")
                        current_producer['location'] = location
                
                elif 'DETAILS:' in line.upper():
                    details_match = line.split(':', 1)
                    if len(details_match) > 1:
                        details = details_match[1].strip()
                        logger.debug(f"  Details: {details[:100]}...")
                        current_producer['details_raw'] = details
                
                elif line == '---' or '---' in line:
                    # End of current producer
                    if current_producer.get('company'):
                        logger.info(f"Saving producer at separator: {current_producer['company']}")
                        producers.append({
                            'company': current_producer['company'],
                            'type': current_producer.get('type', 'Producer'),
                            'details': self._format_producer_details(current_producer)
                        })
                        current_producer = {}
            
            # Don't forget the last producer if no separator at the end
            if current_producer.get('company'):
                logger.info(f"Saving final producer: {current_producer['company']}")
                producers.append({
                    'company': current_producer['company'],
                    'type': current_producer.get('type', 'Producer'),
                    'details': self._format_producer_details(current_producer)
                })
            
            logger.info(f"Total producers parsed: {len(producers)}")
            
            # Step 5: Deduplicate and validate
            seen_companies = set()
            unique_producers = []
            for producer in producers:
                company_key = producer['company'].lower().strip()
                if company_key not in seen_companies and producer['company']:
                    seen_companies.add(company_key)
                    unique_producers.append(producer)
                    logger.info(f"Added unique producer: {producer['company']} ({producer['type']})")
            
            logger.info(f"=== PRODUCER SEARCH COMPLETE: Found {len(unique_producers)} unique producers for {product} ===")
            
            # Log final results
            for i, prod in enumerate(unique_producers[:15]):
                logger.info(f"Producer {i+1}: {prod['company']} - {prod['type']} - {prod['details'][:100] if len(prod['details']) > 100 else prod['details']}...")
            
            # Return up to 15 producers
            return unique_producers[:15]
            
        except Exception as e:
            logger.error(f"Error finding producers: {e}", exc_info=True)
            return []
    
    def get_product_occurrences(self, product: str) -> Dict[str, Any]:
        """Get all SAU numbers and companies where a product is used"""
        db = self.get_db()
        try:
            # Rollback any existing failed transaction
            db.rollback()
            
            # Query to find all documents where product exists in product_tags
            sql = text("""
                SELECT DISTINCT
                    project_number,
                    companies,
                    main_city,
                    filename
                FROM documents
                WHERE :product = ANY(product_tags)
                    AND (project_number IS NOT NULL OR companies IS NOT NULL)
                ORDER BY project_number, companies
            """)
            
            result = db.execute(sql, {'product': product})
            
            occurrences = {
                'projects': [],
                'companies': set(),
                'total_occurrences': 0
            }
            
            for row in result:
                occurrences['total_occurrences'] += 1
                
                # Add project info
                if row.project_number:
                    occurrences['projects'].append({
                        'sau_number': row.project_number,
                        'city': row.main_city,
                        'source': row.filename
                    })
                
                # Add companies
                if row.companies:
                    for company in row.companies:
                        if company:
                            occurrences['companies'].add(company)
            
            # Convert set to list for JSON serialization
            occurrences['companies'] = list(occurrences['companies'])
            
            db.commit()
            return occurrences
            
        except SQLAlchemyError as e:
            logger.error(f"Database error getting product occurrences: {e}")
            db.rollback()
            return {
                'projects': [],
                'companies': [],
                'total_occurrences': 0
            }
        except Exception as e:
            logger.error(f"Error getting product occurrences: {e}")
            db.rollback()
            return {
                'projects': [],
                'companies': [],
                'total_occurrences': 0
            }
        finally:
            db.close()
    
    def identify_products_in_chunks(self, chunks: List[Dict[str, Any]], query: str) -> Dict[str, List[Dict]]:
        """Identify products mentioned in chunks based on content and tags"""
        product_chunks = defaultdict(list)
        query_lower = query.lower()
        
        for chunk in chunks:
            # First check if the query matches any product tags
            products_found = set()
            
            # Check product_tags field
            if chunk.get('product_tags'):
                for tag in chunk['product_tags']:
                    if tag and query_lower in tag.lower():
                        products_found.add(tag)
            
            # If no product tags match, search in content
            if not products_found:
                content_lower = chunk.get('content', '').lower()
                # Check if query appears in content
                if query_lower in content_lower:
                    # Use the query itself as the product if found in content
                    products_found.add(query.title())  # Capitalize for display
                
                # Also check product_tags for any products mentioned
                if chunk.get('product_tags'):
                    for tag in chunk['product_tags']:
                        if tag:
                            # Check if this product is mentioned in the content
                            if tag.lower() in content_lower:
                                products_found.add(tag)
            
            # Add chunk to each product it mentions
            for product in products_found:
                product_chunks[product].append(chunk)
        
        # If no products found but we have chunks, use the query as the product
        if not product_chunks and chunks:
            # Check if any chunks contain the query
            for chunk in chunks:
                if query_lower in chunk.get('content', '').lower():
                    product_chunks[query.title()].append(chunk)
                    break
        
        return dict(product_chunks)
    
    async def extract_product_definition(
        self,
        product: str,
        domain: str,
        chunks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Extract definition using domain-specific agent"""
        
        # Use the product as the domain for expertise
        agent = self.get_domain_agent(product)
        
        # Format context from chunks
        context = "\n\n".join([
            f"[Source: {chunk['filename']}, Page {chunk.get('page_number', 'N/A')}]\n{chunk['content']}"
            for chunk in chunks[:5]  # Use top 5 chunks
        ])
        
        # Get cited definition from documents
        cited_prompt = agent.definition_prompt.format(
            domain=product,  # Use product as domain
            product=product,
            context=context
        )
        
        cited_response = ""
        async for chunk in self.llm.astream(cited_prompt):
            if chunk.content:
                cited_response += chunk.content
        
        # Generate AI definition with Application/Usage (4 sentences)
        ai_prompt = agent.ai_definition_prompt.format(
            domain=product,  # Use product as domain
            product=product
        )
        
        ai_response = ""
        async for chunk in self.llm.astream(ai_prompt):
            if chunk.content:
                ai_response += chunk.content
        
        # Get producers/competitors
        producers = await self.find_producers(product, chunks)
        
        # Get occurrences
        occurrences = self.get_product_occurrences(product)
        
        # Get document info for download
        doc_info = chunks[0] if chunks else {}
        
        # Get and format date properly
        mod_date = doc_info.get('modification_date')
        if mod_date:
            if isinstance(mod_date, str):
                try:
                    mod_date = datetime.fromisoformat(mod_date)
                except:
                    mod_date = None
        
        # Get all unique document IDs from chunks for download
        document_ids = list(set([chunk['document_id'] for chunk in chunks if chunk.get('document_id')]))
        
        return {
            'product': product,
            'domain': product,  # Product is its own domain
            'cited_definition': cited_response,
            'ai_definition': ai_response.strip(),  # 4 sentences including application
            'producers': producers,
            'occurrences': occurrences,
            'source_document': {
                'document_id': doc_info.get('document_id'),
                'filename': doc_info.get('filename'),
                # Fix: Convert datetime object to ISO format string
                'modification_date': mod_date.isoformat() if mod_date else None,
                'relative_date': self.get_relative_date(mod_date),
                'main_tag': doc_info.get('main_tag'),  # Document type
                'file_size': doc_info.get('file_size')
            },
            'all_document_ids': document_ids,  # For downloading all source documents
            'chunks_used': len(chunks)
        }
    
    async def search_stream(
        self,
        query: str,
        k: int = 20,
        filters: Optional[Dict] = None,
        selected_product: Optional[str] = None  # For when user clicks a button
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Enhanced search with intelligent result handling"""
        
        start_time = datetime.now()
        
        try:
            # Stage 1: Query Analysis
            yield {
                'type': 'stage_update',
                'stage': 'analysis',
                'message': 'Analyzing your query...',
                'timestamp': datetime.now().isoformat()
            }
            
            # Send available filters
            available_filters = self.get_available_filters()
            yield {
                'type': 'available_filters',
                'filters': available_filters,
                'timestamp': datetime.now().isoformat()
            }
            
            # IMPORTANT: If selected_product is provided, search for the original query + product
            search_query = query if query else selected_product
            logger.info(f"Search query: {search_query}, Selected product: {selected_product}, Filters: {filters}")
            
            # Generate query embedding
            query_embedding = await self.get_query_embedding(search_query)
            
            # Stage 2: Retrieving Documents
            yield {
                'type': 'stage_update',
                'stage': 'retrieval',
                'message': 'Searching through documents...',
                'timestamp': datetime.now().isoformat()
            }
            
            # Retrieve similar chunks with filters
            chunks = self.retrieve_similar_chunks(query_embedding, k, filters)
            
            if not chunks:
                # Send a proper no results response
                yield {
                    'type': 'no_results',
                    'message': f'No results found for "{search_query}"',
                    'timestamp': datetime.now().isoformat()
                }
                return
            
            # If a specific product is selected, filter chunks to only that product
            if selected_product:
                # Filter chunks to only those related to the selected product
                filtered_chunks = []
                for chunk in chunks:
                    content_lower = chunk.get('content', '').lower()
                    selected_lower = selected_product.lower()
                    
                    # Check if the selected product is in the content or tags
                    product_in_content = selected_lower in content_lower
                    
                    # Also check for base product if it's a variant
                    base_product = self.extract_base_product(selected_product).lower()
                    base_in_content = base_product in content_lower
                    
                    product_in_tags = False
                    if chunk.get('product_tags'):
                        for tag in chunk['product_tags']:
                            if tag and (selected_lower in tag.lower() or base_product in tag.lower()):
                                product_in_tags = True
                                break
                    
                    if product_in_content or base_in_content or product_in_tags:
                        filtered_chunks.append(chunk)
                
                # Use filtered chunks if any were found
                if filtered_chunks:
                    chunks = filtered_chunks
                    # Process single product directly
                    yield {
                        'type': 'stage_update',
                        'stage': 'processing',
                        'message': f'Assigning domain expert for {selected_product}...',
                        'timestamp': datetime.now().isoformat()
                    }
                    
                    # Extract definition with domain agent
                    result = await self.extract_product_definition(
                        product=selected_product,
                        domain=selected_product,
                        chunks=chunks
                    )
                    
                    # Stream the response
                    yield {
                        'type': 'single_result',
                        'data': result,
                        'timestamp': datetime.now().isoformat()
                    }
                else:
                    # No chunks found for the selected product
                    yield {
                        'type': 'no_results',
                        'message': f'No information found for "{selected_product}"',
                        'timestamp': datetime.now().isoformat()
                    }
                    return
            else:
                # Normal search flow - identify products in chunks
                product_chunks = self.identify_products_in_chunks(chunks, query)
                products = list(product_chunks.keys())
                
                if len(products) == 1:
                    # Single product - automatically process
                    product = products[0]
                    product_specific_chunks = product_chunks[product]
                    
                    yield {
                        'type': 'stage_update',
                        'stage': 'processing',
                        'message': f'Assigning domain expert for {product}...',
                        'timestamp': datetime.now().isoformat()
                    }
                    
                    # Extract definition with domain agent
                    result = await self.extract_product_definition(
                        product=product,
                        domain=product,
                        chunks=product_specific_chunks
                    )
                    
                    yield {
                        'type': 'single_result',
                        'data': result,
                        'timestamp': datetime.now().isoformat()
                    }
                    
                elif len(products) > 1:
                    # Multiple products - provide list with buttons
                    yield {
                        'type': 'stage_update',
                        'stage': 'processing',
                        'message': f'Found {len(products)} different products...',
                        'timestamp': datetime.now().isoformat()
                    }
                    
                    # Create product list with metadata
                    product_list = []
                    for product in products[:10]:  # Limit to top 10 products
                        product_specific_chunks = product_chunks[product]
                        top_chunk = product_specific_chunks[0]
                        
                        # Get proper date
                        mod_date = top_chunk.get('modification_date')
                        
                        product_list.append({
                            'product': product,
                            'document_count': len(set([c['document_id'] for c in product_specific_chunks])),
                            'chunk_count': len(product_specific_chunks),
                            'best_match_score': 1 - top_chunk['distance'],
                            'sample_document': {
                                'filename': top_chunk['filename'],
                                # Fix: Convert datetime object to ISO format string
                                'modification_date': mod_date.isoformat() if mod_date and hasattr(mod_date, 'isoformat') else None,
                                'relative_date': self.get_relative_date(mod_date),
                                'document_id': top_chunk['document_id']
                            }
                        })
                    
                    yield {
                        'type': 'multiple_results',
                        'products': product_list,
                        'message': 'Select a product to get detailed information:',
                        'timestamp': datetime.now().isoformat()
                    }
                else:
                    # No specific products found
                    yield {
                        'type': 'stage_update',
                        'stage': 'processing',
                        'message': 'Processing search results...',
                        'timestamp': datetime.now().isoformat()
                    }
                    
                    result = await self.extract_product_definition(
                        product=query.title(),
                        domain=query,
                        chunks=chunks[:10]
                    )
                    
                    yield {
                        'type': 'single_result',
                        'data': result,
                        'timestamp': datetime.now().isoformat()
                    }
            
            # Complete
            processing_time = (datetime.now() - start_time).total_seconds()
            
            yield {
                'type': 'search_complete',
                'message': 'Search completed',
                'processing_time': processing_time * 1000,
                'metadata': {
                    'query': query,
                    'products_found': 1 if selected_product else len(products) if not selected_product else 0,
                    'total_chunks': len(chunks),
                    'selected_product': selected_product,
                    'filters_applied': filters is not None and len(filters) > 0
                },
                'timestamp': datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error in search: {e}", exc_info=True)
            yield {
                'type': 'error',
                'message': f"Search error: {str(e)}",
                'timestamp': datetime.now().isoformat()
            }
    
    async def get_document_for_download(self, document_id: str) -> Optional[Dict]:
        """Get document details for download"""
        db = self.get_db()
        try:
            # Rollback any existing failed transaction
            db.rollback()
            
            sql = text("""
                SELECT 
                    id,
                    filename,
                    original_path,
                    file_type,
                    file_size,
                    mime_type,
                    content,
                    file_data,
                    storage_path,
                    storage_type,
                    modification_date,
                    main_tag
                FROM documents
                WHERE id = :doc_id
            """)
            
            result = db.execute(sql, {'doc_id': document_id}).first()
            
            if result:
                return {
                    'id': str(result.id),
                    'filename': result.filename,
                    'original_path': result.original_path,
                    'file_type': result.file_type,
                    'file_size': result.file_size,
                    'mime_type': result.mime_type,
                    'content': result.content,
                    'file_data': result.file_data,
                    'storage_path': result.storage_path,
                    'storage_type': result.storage_type,
                    'modification_date': result.modification_date,
                    'main_tag': result.main_tag,
                    'relative_date': self.get_relative_date(result.modification_date)
                }
            return None
            
        except SQLAlchemyError as e:
            logger.error(f"Database error getting document: {e}")
            db.rollback()
            return None
        except Exception as e:
            logger.error(f"Error getting document: {e}")
            db.rollback()
            return None
        finally:
            db.close()


# Service singleton
_search_service = None

def get_search_service(groq_api_key: str) -> AgenticRAGSearchSystem:
    """Get or create the search service singleton"""
    global _search_service
    if _search_service is None:
        _search_service = AgenticRAGSearchSystem(groq_api_key)
    return _search_service