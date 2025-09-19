# app/services/langchain_search.py

import logging
import asyncio
import numpy as np
import re
from typing import Dict, Any, Optional, AsyncGenerator, List, Tuple
from datetime import datetime, timedelta, timezone, date
from uuid import UUID
from collections import defaultdict
import json

from sqlalchemy import text, select, and_, or_, func, cast, String, Date
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from langchain_ollama import OllamaEmbeddings
from langchain_groq import ChatGroq
from langchain.schema import Document
from langchain.prompts import PromptTemplate

from app.core.database import SessionLocal
from app.core.config import settings

logger = logging.getLogger(__name__)


class NaturalLanguageQueryAgent:
    """Agent 1: Parses natural language queries into structured database filters"""
    
    def __init__(self, llm: ChatGroq):
        self.llm = llm
        self.known_values = {
            'product_tags': [],
            'companies': [],
            'main_cities': [],
            'main_topics': [],  # Added main_topics
            'project_numbers': [],
            'project_dates': []
        }
        
    def load_known_values(self, db: Session):
        """Pre-load all unique values from database for validation"""
        try:
            # Get unique product tags
            sql_products = text("""
                SELECT DISTINCT unnest(product_tags) as tag
                FROM documents
                WHERE product_tags IS NOT NULL AND array_length(product_tags, 1) > 0
                ORDER BY tag
            """)
            result = db.execute(sql_products)
            self.known_values['product_tags'] = [row.tag for row in result if row.tag]
            
            # Get unique companies
            sql_companies = text("""
                SELECT DISTINCT unnest(companies) as company
                FROM documents
                WHERE companies IS NOT NULL AND array_length(companies, 1) > 0
                ORDER BY company
            """)
            result = db.execute(sql_companies)
            self.known_values['companies'] = [row.company for row in result if row.company]
            
            # Get unique cities
            sql_cities = text("""
                SELECT DISTINCT main_city
                FROM documents
                WHERE main_city IS NOT NULL AND main_city != ''
                ORDER BY main_city
            """)
            result = db.execute(sql_cities)
            self.known_values['main_cities'] = [row.main_city for row in result if row.main_city]
            
            # Get unique main topics
            sql_topics = text("""
                SELECT DISTINCT unnest(main_topics) as topic
                FROM documents
                WHERE main_topics IS NOT NULL AND array_length(main_topics, 1) > 0
                ORDER BY topic
            """)
            result = db.execute(sql_topics)
            self.known_values['main_topics'] = [row.topic for row in result if row.topic]
            
            # Get unique project numbers
            sql_projects = text("""
                SELECT DISTINCT unnest(project_number) as proj_num
                FROM documents
                WHERE project_number IS NOT NULL AND array_length(project_number, 1) > 0
                ORDER BY proj_num
            """)
            result = db.execute(sql_projects)
            self.known_values['project_numbers'] = [row.proj_num for row in result if row.proj_num]
            
            # Get date range
            sql_dates = text("""
                SELECT 
                    MIN(project_date) as min_date,
                    MAX(project_date) as max_date,
                    COUNT(DISTINCT project_date) as date_count
                FROM documents
                WHERE project_date IS NOT NULL
            """)
            result = db.execute(sql_dates).first()
            if result and result.min_date:
                self.known_values['project_dates'] = {
                    'min_date': result.min_date.isoformat() if result.min_date else None,
                    'max_date': result.max_date.isoformat() if result.max_date else None,
                    'count': result.date_count
                }
            
            logger.info(f"Loaded known values: {len(self.known_values['product_tags'])} products, "
                       f"{len(self.known_values['companies'])} companies, "
                       f"{len(self.known_values['main_cities'])} cities, "
                       f"{len(self.known_values['main_topics'])} topics, "
                       f"{len(self.known_values['project_numbers'])} projects")
            
        except Exception as e:
            logger.error(f"Error loading known values: {e}")
    
    def find_best_matching_products(self, search_term: str) -> List[str]:
        """Find the best matching products for a search term using similarity scoring"""
        search_lower = search_term.lower().strip()
        matches = []
        
        for known_product in self.known_values['product_tags']:
            known_lower = known_product.lower()
            
            # Calculate similarity score
            score = 0
            
            # Exact match gets highest score
            if search_lower == known_lower:
                score = 1.0
            # Search term is contained in product name
            elif search_lower in known_lower:
                score = 0.8 + (0.2 * (len(search_lower) / len(known_lower)))
            # Product name is contained in search term
            elif known_lower in search_lower:
                score = 0.7 + (0.2 * (len(known_lower) / len(search_lower)))
            # Partial word matches
            else:
                search_words = set(search_lower.split())
                known_words = set(known_lower.split())
                
                # Check for matching words
                common_words = search_words.intersection(known_words)
                if common_words:
                    score = 0.5 * (len(common_words) / max(len(search_words), len(known_words)))
                
                # Check for partial word matches (e.g., "aac" matches "aac blocks")
                for search_word in search_words:
                    for known_word in known_words:
                        if search_word in known_word or known_word in search_word:
                            score = max(score, 0.4)
                            break
            
            if score > 0:
                matches.append((known_product, score))
        
        # Sort by score and return top matches
        matches.sort(key=lambda x: x[1], reverse=True)
        
        # Return best matches (score > 0.3) up to 5 items
        best_matches = [match[0] for match in matches if match[1] > 0.3][:5]
        
        return best_matches if best_matches else []
    
    def find_best_matching_topics(self, search_term: str) -> List[str]:
        """Find the best matching topics for a search term"""
        search_lower = search_term.lower().strip()
        matches = []
        
        for known_topic in self.known_values['main_topics']:
            known_lower = known_topic.lower()
            
            # Calculate similarity score (similar to products)
            score = 0
            
            if search_lower == known_lower:
                score = 1.0
            elif search_lower in known_lower:
                score = 0.8
            elif known_lower in search_lower:
                score = 0.7
            else:
                # Check word overlap
                search_words = set(search_lower.split())
                known_words = set(known_lower.split())
                common_words = search_words.intersection(known_words)
                if common_words:
                    score = 0.5 * (len(common_words) / max(len(search_words), len(known_words)))
            
            if score > 0:
                matches.append((known_topic, score))
        
        matches.sort(key=lambda x: x[1], reverse=True)
        best_matches = [match[0] for match in matches if match[1] > 0.3][:5]
        
        return best_matches if best_matches else []
    
    async def parse_query(self, query: str) -> Dict[str, Any]:
        """Parse natural language query into structured filters"""
        
        # Create a comprehensive prompt with known values
        parse_prompt = PromptTemplate(
            template="""You are a query parser that extracts structured information from natural language queries.

CRITICAL: Return ONLY a single JSON object. Do not include any explanatory text before or after the JSON.

Available values in our database:
PRODUCTS (product_tags field): {products}
TOPICS (main_topics field): {topics}
COMPANIES (companies field): {companies}
CITIES (main_city field): {cities}
PROJECT NUMBERS (project_number field): {project_numbers}
Date Range: {date_range}

User Query: "{query}"

Your task:
1. Identify what TYPE of thing the user is searching for (product, topic, company, city, etc.)
2. Check if search terms match known TOPICS first
3. If not in topics, check if they match PRODUCTS
4. Extract the EXACT search term from the query
5. DO NOT expand abbreviations or create multiple variations
6. Return the search term as the user typed it

IMPORTANT RULES:
- For product searches: return EXACTLY what the user typed (e.g., "aac panels" stays "aac panels")
- For topic searches: identify subject matter or themes
- DO NOT expand abbreviations (e.g., "AAC" should not become "Autoclaved Aerated Concrete")
- Return only ONE item per field unless the user explicitly mentions multiple items
- Use "OR" logic for products and topics by default (users typically want any matching item)
- Generic product terms go in "products" array
- Subject/theme terms go in "topics" array
- Company/brand names go in "companies" array  
- City names go in "cities" array

Return ONLY this JSON structure with no other text:
{{
    "products": ["single search term as typed"],
    "topics": ["list of subject areas/themes"],
    "companies": ["list of matched companies"],
    "cities": ["list of matched cities"],
    "project_numbers": ["list of matched project numbers"],
    "date_filter": {{
        "type": "exact|year|quarter|range",
        "value": "parsed date value",
        "start_date": "YYYY-MM-DD or null",
        "end_date": "YYYY-MM-DD or null"
    }},
    "logical_operators": {{
        "products": "OR",
        "topics": "OR",
        "companies": "OR",
        "cities": "OR"
    }},
    "interpretation": "Human readable interpretation of the query",
    "has_sufficient_info": true|false,
    "missing_info_message": "null or message about what's missing"
}}""",
            input_variables=["products", "topics", "companies", "cities", "project_numbers", "date_range", "query"]
        )
        
        # Format known values for prompt
        products_str = ", ".join(self.known_values['product_tags'][:50]) if self.known_values['product_tags'] else "None"
        topics_str = ", ".join(self.known_values['main_topics'][:50]) if self.known_values['main_topics'] else "None"
        companies_str = ", ".join(self.known_values['companies'][:50]) if self.known_values['companies'] else "None"
        cities_str = ", ".join(self.known_values['main_cities']) if self.known_values['main_cities'] else "None"
        projects_str = ", ".join(self.known_values['project_numbers'][:30]) if self.known_values['project_numbers'] else "None"
        date_range_str = f"From {self.known_values['project_dates'].get('min_date', 'N/A')} to {self.known_values['project_dates'].get('max_date', 'N/A')}" if self.known_values.get('project_dates') else "No dates"
        
        # Get LLM response
        prompt_text = parse_prompt.format(
            products=products_str,
            topics=topics_str,
            companies=companies_str,
            cities=cities_str,
            project_numbers=projects_str,
            date_range=date_range_str,
            query=query
        )
        
        response = ""
        async for chunk in self.llm.astream(prompt_text):
            if chunk.content:
                response += chunk.content
        
        # Log the raw response for debugging
        logger.info(f"Raw LLM response for query '{query}': {response[:500]}...")
        
        # Parse JSON response
        try:
            # Try to extract the first valid JSON object from the response
            # Remove any markdown code blocks
            cleaned_response = response.replace('```json', '').replace('```', '')
            
            # Find the first complete JSON object
            json_start = cleaned_response.find('{')
            if json_start == -1:
                raise ValueError("No JSON object found in response")
            
            # Find the matching closing brace
            brace_count = 0
            json_end = -1
            for i in range(json_start, len(cleaned_response)):
                if cleaned_response[i] == '{':
                    brace_count += 1
                elif cleaned_response[i] == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        json_end = i + 1
                        break
            
            if json_end == -1:
                raise ValueError("No complete JSON object found in response")
            
            json_str = cleaned_response[json_start:json_end]
            parsed = json.loads(json_str)
            
            # Force OR logic for products and topics
            if 'logical_operators' not in parsed:
                parsed['logical_operators'] = {}
            parsed['logical_operators']['products'] = 'OR'
            parsed['logical_operators']['topics'] = 'OR'
            
            # Validate that we have sufficient information
            has_info = (
                bool(parsed.get('products')) or
                bool(parsed.get('topics')) or
                bool(parsed.get('companies')) or
                bool(parsed.get('cities')) or
                bool(parsed.get('project_numbers')) or
                bool(parsed.get('date_filter', {}).get('start_date'))
            )
            
            if not has_info:
                parsed['has_sufficient_info'] = False
                parsed['missing_info_message'] = "Please provide more specific information. Include at least one of: product name, topic, company, city, project number, or date"
            else:
                parsed['has_sufficient_info'] = True
                
                # Process products with improved matching
                if parsed.get('products'):
                    all_matched_products = []
                    
                    for search_term in parsed['products']:
                        # Find best matches for this search term
                        matches = self.find_best_matching_products(search_term)
                        
                        if matches:
                            # Use the best matches found
                            all_matched_products.extend(matches)
                            logger.info(f"Found {len(matches)} matches for '{search_term}': {matches[:3]}")
                        else:
                            # No matches found, keep the original search term for fuzzy SQL search
                            all_matched_products.append(search_term)
                            logger.info(f"No exact matches for '{search_term}', will use fuzzy search")
                    
                    # Remove duplicates while preserving order
                    seen = set()
                    unique_products = []
                    for product in all_matched_products:
                        if product.lower() not in seen:
                            seen.add(product.lower())
                            unique_products.append(product)
                    
                    parsed['products'] = unique_products[:10]  # Limit to top 10 matches
                    
                    # Always use OR logic for product variations
                    parsed['logical_operators']['products'] = 'OR'
                    
                    logger.info(f"Final matched products: {parsed['products']}")
                
                # Process topics with matching
                if parsed.get('topics'):
                    all_matched_topics = []
                    
                    for search_term in parsed['topics']:
                        matches = self.find_best_matching_topics(search_term)
                        
                        if matches:
                            all_matched_topics.extend(matches)
                            logger.info(f"Found {len(matches)} topic matches for '{search_term}'")
                        else:
                            all_matched_topics.append(search_term)
                            logger.info(f"No exact topic matches for '{search_term}', will use fuzzy search")
                    
                    # Remove duplicates
                    seen = set()
                    unique_topics = []
                    for topic in all_matched_topics:
                        if topic.lower() not in seen:
                            seen.add(topic.lower())
                            unique_topics.append(topic)
                    
                    parsed['topics'] = unique_topics[:10]
                    parsed['logical_operators']['topics'] = 'OR'
                    
                    logger.info(f"Final matched topics: {parsed['topics']}")
                
                # Similar processing for companies with OR logic
                if parsed.get('companies'):
                    matched_companies = []
                    for search_term in parsed['companies']:
                        search_lower = search_term.lower()
                        for known_company in self.known_values['companies']:
                            if search_lower in known_company.lower() or known_company.lower() in search_lower:
                                matched_companies.append(known_company)
                    
                    if matched_companies:
                        parsed['companies'] = list(set(matched_companies))
                        logger.info(f"Matched companies: {parsed['companies']}")
                    
                    # Use OR logic for companies too
                    parsed['logical_operators']['companies'] = 'OR'
            
            # Log what was parsed
            logger.info(f"Parsed query '{query}' to filters: products={parsed.get('products')}, "
                       f"topics={parsed.get('topics')}, companies={parsed.get('companies')}, "
                       f"cities={parsed.get('cities')}, logic={parsed.get('logical_operators')}")
            
            return parsed
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {e}")
            logger.error(f"Attempted to parse: {json_str if 'json_str' in locals() else 'N/A'}")
            return {
                "has_sufficient_info": False,
                "missing_info_message": "Failed to understand query. Please try rephrasing.",
                "error": str(e)
            }
        except Exception as e:
            logger.error(f"Error parsing query response: {e}")
            return {
                "has_sufficient_info": False,
                "missing_info_message": "Failed to understand query. Please try rephrasing.",
                "error": str(e)
            }


class SQLQueryExecutorAgent:
    """Agent 2: Builds and executes SQL queries based on parsed filters"""
    
    def __init__(self, db_session_factory):
        self.get_db = db_session_factory
        
    def build_where_clause(self, filters: Dict[str, Any]) -> Tuple[str, Dict]:
        """Build SQL WHERE clause from parsed filters"""
        conditions = []
        params = {}
        
        # Handle products - ALWAYS use OR logic for product variations
        if filters.get('products'):
            # Force OR logic for products regardless of what was specified
            product_conditions = []
            
            for i, product in enumerate(filters['products']):
                # Use ILIKE for case-insensitive partial matching
                product_conditions.append(f"""
                    EXISTS (
                        SELECT 1 FROM unnest(product_tags) AS tag 
                        WHERE LOWER(tag) LIKE LOWER(:product_{i})
                    )
                """)
                # Add wildcards for partial matching
                params[f'product_{i}'] = f"%{product}%"
            
            # Always use OR for products (user typically wants any matching product)
            if product_conditions:
                conditions.append(f"({' OR '.join(product_conditions)})")
        
        # Handle topics - use OR logic by default
        if filters.get('topics'):
            topic_conditions = []
            
            for i, topic in enumerate(filters['topics']):
                topic_conditions.append(f"""
                    EXISTS (
                        SELECT 1 FROM unnest(main_topics) AS topic 
                        WHERE LOWER(topic) LIKE LOWER(:topic_{i})
                    )
                """)
                params[f'topic_{i}'] = f"%{topic}%"
            
            if topic_conditions:
                conditions.append(f"({' OR '.join(topic_conditions)})")
        
        # Handle companies - use OR logic by default
        if filters.get('companies'):
            logic = filters.get('logical_operators', {}).get('companies', 'OR')
            company_conditions = []
            
            for i, company in enumerate(filters['companies']):
                company_conditions.append(f"""
                    EXISTS (
                        SELECT 1 FROM unnest(companies) AS comp 
                        WHERE LOWER(comp) LIKE LOWER(:company_{i})
                    )
                """)
                params[f'company_{i}'] = f"%{company}%"
            
            if company_conditions:
                if logic == 'AND' and len(company_conditions) > 1:
                    conditions.append(f"({' AND '.join(company_conditions)})")
                else:
                    conditions.append(f"({' OR '.join(company_conditions)})")
        
        # Handle cities
        if filters.get('cities'):
            city_conditions = []
            for i, city in enumerate(filters['cities']):
                city_conditions.append(f"LOWER(main_city) LIKE LOWER(:city_{i})")
                params[f'city_{i}'] = f"%{city}%"
            if city_conditions:
                conditions.append(f"({' OR '.join(city_conditions)})")
        
        # Handle project numbers
        if filters.get('project_numbers'):
            project_conditions = []
            for i, proj_num in enumerate(filters['project_numbers']):
                project_conditions.append(f":project_{i} = ANY(project_number)")
                params[f'project_{i}'] = proj_num
            if project_conditions:
                conditions.append(f"({' OR '.join(project_conditions)})")
        
        # Handle date filter
        date_filter = filters.get('date_filter', {})
        if date_filter and date_filter.get('start_date'):
            if date_filter.get('type') == 'exact':
                conditions.append("project_date = :exact_date")
                params['exact_date'] = date_filter['start_date']
            elif date_filter.get('end_date'):
                conditions.append("project_date >= :start_date AND project_date <= :end_date")
                params['start_date'] = date_filter['start_date']
                params['end_date'] = date_filter['end_date']
            else:
                # Year only
                conditions.append("EXTRACT(YEAR FROM project_date) = :year")
                params['year'] = int(date_filter['start_date'][:4])
        
        where_clause = " AND ".join(conditions) if conditions else "1=1"
        
        # Log the SQL where clause for debugging
        logger.info(f"Built WHERE clause: {where_clause}")
        logger.info(f"With parameters: {params}")
        
        return where_clause, params
    
    def safe_datetime_to_iso(self, dt_value: Any) -> Optional[str]:
        """Safely convert datetime/date objects to ISO format string"""
        if dt_value is None:
            return None
        
        try:
            if isinstance(dt_value, datetime):
                return dt_value.isoformat()
            elif isinstance(dt_value, date):
                return dt_value.isoformat()
            elif isinstance(dt_value, str):
                # Already a string, return as is
                return dt_value
            else:
                return str(dt_value)
        except Exception as e:
            logger.error(f"Error converting datetime to ISO: {e}")
            return None
    
    def execute_filtered_search(self, filters: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Execute SQL query with filters and return documents"""
        db = self.get_db()
        try:
            where_clause, params = self.build_where_clause(filters)
            
            print("\n" + "="*50)
            print("EXECUTING SEARCH")
            print("="*50)
            print(f"WHERE CLAUSE: {where_clause}")
            print(f"PARAMETERS: {params}")
            print("="*50 + "\n")

            # Modified query to rank results by relevance and include main_topics
            sql = text(f"""
                WITH ranked_docs AS (
                    SELECT 
                        d.id,
                        d.filename,
                        d.title,
                        d.file_type,
                        d.file_size,
                        d.main_city,
                        d.companies,
                        d.project_date,
                        d.project_number,
                        d.product_tags,
                        d.main_topics,
                        d.modification_date,
                        d.creation_date,
                        d.summary,
                        d.main_tag,
                        -- Calculate relevance score based on product match
                        CASE 
                            WHEN product_tags IS NOT NULL THEN
                                array_length(product_tags, 1)
                            ELSE 0
                        END as relevance_score
                    FROM documents d
                    WHERE {where_clause}
                )
                SELECT * FROM ranked_docs
                ORDER BY relevance_score DESC, modification_date DESC
                LIMIT 100
            """)
            
            result = db.execute(sql, params)
            
            documents = []
            for row in result:
                documents.append({
                    'id': str(row.id),
                    'filename': row.filename,
                    'title': row.title,
                    'file_type': row.file_type,
                    'file_size': row.file_size,
                    'main_city': row.main_city,
                    'companies': row.companies or [],
                    'project_date': self.safe_datetime_to_iso(row.project_date),
                    'project_number': row.project_number or [],
                    'product_tags': row.product_tags or [],
                    'main_topics': row.main_topics or [],  # Added main_topics
                    'modification_date': self.safe_datetime_to_iso(row.modification_date),
                    'creation_date': self.safe_datetime_to_iso(row.creation_date),
                    'summary': row.summary,
                    'main_tag': row.main_tag
                })
            
            logger.info(f"Query returned {len(documents)} documents")
            
            db.commit()
            return documents
            
        except Exception as e:
            logger.error(f"Error executing filtered search: {e}")
            db.rollback()
            raise
        finally:
            db.close()


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
2. If no exact definition exists, look for a definition of the base product
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
    """Enhanced search system with natural language query parsing"""
    
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
        
        # Initialize agents
        self.query_parser = NaturalLanguageQueryAgent(self.llm)
        self.sql_executor = SQLQueryExecutorAgent(SessionLocal)
        self.domain_agents = {}
        
        # Load known values on initialization
        self._initialize_known_values()
    
    def _initialize_known_values(self):
        """Load known values from database on startup"""
        db = SessionLocal()
        try:
            self.query_parser.load_known_values(db)
        finally:
            db.close()
    
    def get_db(self) -> Session:
        """Get a new database session"""
        return SessionLocal()
    
    def safe_datetime_to_iso(self, dt_value: Any) -> Optional[str]:
        """Safely convert datetime/date objects to ISO format string"""
        if dt_value is None:
            return None
        
        try:
            if isinstance(dt_value, datetime):
                return dt_value.isoformat()
            elif isinstance(dt_value, date):
                return dt_value.isoformat()
            elif isinstance(dt_value, str):
                # Already a string, return as is
                return dt_value
            else:
                return str(dt_value)
        except Exception as e:
            logger.error(f"Error converting datetime to ISO: {e}")
            return None
    
    def get_relative_date(self, date_value: Any) -> str:
        """Calculate relative date from today"""
        if not date_value:
            return "Date not available"
        
        # Handle both datetime and date objects
        if isinstance(date_value, str):
            try:
                date_value = datetime.fromisoformat(date_value)
            except:
                return "Date not available"
        
        # If it's a date object, convert to datetime
        if hasattr(date_value, 'date') and callable(date_value.date):
            # It's already a datetime
            pass
        elif hasattr(date_value, 'year') and hasattr(date_value, 'month') and hasattr(date_value, 'day'):
            # It's a date object, convert to datetime
            date_value = datetime.combine(date_value, datetime.min.time())
        else:
            return "Date not available"

        # Corrected code to handle timezone-aware vs naive datetimes
        if date_value.tzinfo is None or date_value.tzinfo.utcoffset(date_value) is None:
            # If date is naive, assume UTC for comparison
            aware_date = date_value.replace(tzinfo=timezone.utc)
        else:
            # If date is already aware, use it as is
            aware_date = date_value
        
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
        modifiers = [
            r'^(frozen|fresh|hot|cold|warm)\s+',
            r'^(chocolate|vanilla|strawberry|caramel)\s+',
            r'^(red|blue|green|yellow|white|black|brown)\s+',
            r'^(large|small|medium|mini|jumbo|giant)\s+',
            r'^(premium|deluxe|special|classic|original)\s+',
            r'^(sweet|sour|salty|spicy|bitter)\s+',
        ]
        
        base_product = product.lower()
        for pattern in modifiers:
            base_product = re.sub(pattern, '', base_product, flags=re.IGNORECASE)
        
        # Also try to get the last word(s) as the base product
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
    
    def retrieve_chunks_for_documents(self, document_ids: List[str], k: Optional[int] = None) -> List[Dict[str, Any]]:
        """Retrieve chunks for specific documents.

        If `k` is provided (not None), only that many chunks will be returned. Otherwise,
        all chunks belonging to the given documents will be fetched. This flexibility
        allows callers to retrieve full document content when more context is needed,
        such as during producer/competitor extraction.
        """
        db = self.get_db()
        try:
            db.rollback()

            # Convert list of document IDs to a comma-separated string for SQL
            doc_ids_str = ','.join([f"'{doc_id}'" for doc_id in document_ids])

            # Build the base SQL query - include main_topics
            base_query = f"""
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
                    d.main_topics,
                    d.project_number,
                    d.main_city,
                    d.companies,
                    d.project_date,
                    d.file_size,
                    d.modification_date,
                    d.creation_date,
                    d.updated_at
                FROM document_chunks dc
                JOIN documents d ON dc.document_id = d.id
                WHERE d.id IN ({doc_ids_str})
                ORDER BY dc.chunk_index
            """

            # Append a LIMIT clause only when k is provided
            if k is not None:
                base_query += "\n                LIMIT :k"

            sql = text(base_query)

            # Execute with or without the k parameter
            if k is not None:
                result = db.execute(sql, {'k': k})
            else:
                result = db.execute(sql)

            chunks: List[Dict[str, Any]] = []
            for row in result:
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
                    'main_tag': row.main_tag,
                    'product_tags': row.product_tags,
                    'main_topics': row.main_topics,  # Added main_topics
                    'project_number': row.project_number,
                    'main_city': row.main_city,
                    'companies': row.companies,
                    'project_date': self.safe_datetime_to_iso(row.project_date),
                    'file_size': row.file_size,
                    'modification_date': self.safe_datetime_to_iso(mod_date),
                    'creation_date': self.safe_datetime_to_iso(row.creation_date),
                    'distance': 0.0  # No distance as we're not using vector search here
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
        return {
            'product_tags': self.query_parser.known_values.get('product_tags', []),
            'main_topics': self.query_parser.known_values.get('main_topics', []),  # Added main_topics
            'project_numbers': self.query_parser.known_values.get('project_numbers', []),
            'main_cities': self.query_parser.known_values.get('main_cities', []),
            'companies': self.query_parser.known_values.get('companies', [])
        }
    
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
            
            # Gather relevant content from all provided chunks
            all_relevant_content: List[Dict[str, Any]] = []
            max_chunks = min(len(chunks), 100)
            for idx, chunk in enumerate(chunks):
                if idx >= max_chunks:
                    break
                # Include textual content from the chunk if present
                if chunk.get('content'):
                    all_relevant_content.append({
                        'source': chunk.get('filename', 'Unknown'),
                        'page': chunk.get('page_number'),
                        'content': chunk['content']
                    })
                # Also include summaries of table chunks if available
                table_summary = chunk.get('table_summary')
                if table_summary:
                    all_relevant_content.append({
                        'source': chunk.get('filename', 'Unknown'),
                        'page': chunk.get('page_number'),
                        'content': table_summary
                    })
            
            if not all_relevant_content:
                logger.warning(f"No relevant content found for {product}")
                return []
            
            # Build a detailed extraction prompt
            prompt_template_text = (
                "You are an expert at extracting producer, manufacturer, supplier, importer, or competitor information from documents about \"{product}\".\n\n"
                "Your task is to read and fully comprehend the provided content and extract **all** companies that either produce, manufacture, supply, import, **or compete with** \"{product}\". "
                "For each company you find, decide whether it acts as a **Producer**, **Manufacturer**, **Supplier**, **Importer**, or **Competitor** in relation to \"{product}\" based on the context. "
                "Provide as much detail as possible about their role.\n\n"
                "Content to analyze:\n"
                "{content}\n\n"
                "For each company found, extract:\n"
                "1. **Company Name**: the exact name as mentioned in the document.\n"
                "2. **Type**: one of Producer / Manufacturer / Supplier / Importer / Competitor (choose the most appropriate based on context).\n"
                "3. **Production Capacity**: production capacity if mentioned; otherwise, \"Not specified\".\n"
                "4. **Location**: location if mentioned; otherwise, \"Not specified\".\n"
                "5. **Details**: any other relevant information that explains the company's relationship to \"{product}\" (e.g., operating regions, ownership, distribution roles, etc.).\n\n"
                "Format your response **exactly** as shown below (repeat the block for each company):\n"
                "COMPANY: [Company Name]\n"
                "TYPE: [Producer/Manufacturer/Supplier/Importer/Competitor]\n"
                "CAPACITY: [Production capacity if mentioned, otherwise \"Not specified\"]\n"
                "LOCATION: [Location if mentioned, otherwise \"Not specified\"]\n"
                "DETAILS: [Any other relevant information]\n"
                "---\n\n"
                "If no such companies are found, respond with: \"No producers found for {product}\"\n\n"
                "Response:"
            )
            extraction_prompt = PromptTemplate(
                template=prompt_template_text,
                input_variables=["product", "content"]
            )
            
            # Combine content for analysis
            combined_content = "\n\n".join([
                f"[Source: {item['source']}, Page {item.get('page', 'N/A')}]\n{item['content']}"
                for item in all_relevant_content
            ])
            
            prompt_text = extraction_prompt.format(product=product, content=combined_content)
            
            # Get LLM response
            extraction_response = ""
            async for chunk in self.llm.astream(prompt_text):
                if chunk.content:
                    extraction_response += chunk.content
            
            # Parse the LLM response
            producers = []
            
            if "No producers found" in extraction_response:
                return []
            
            # Remove markdown formatting from response
            extraction_response = extraction_response.replace('**', '').replace('*', '')
            
            # Parse the structured response
            current_producer = {}
            lines = extraction_response.split('\n')
            
            for line in lines:
                line = line.strip()
                
                if not line:
                    continue
                
                if 'COMPANY:' in line.upper():
                    if current_producer.get('company'):
                        producers.append({
                            'company': current_producer['company'],
                            'type': current_producer.get('type', 'Producer'),
                            'details': self._format_producer_details(current_producer)
                        })
                    company_match = line.split(':', 1)
                    if len(company_match) > 1:
                        current_producer = {'company': company_match[1].strip()}
                
                elif 'TYPE:' in line.upper():
                    type_match = line.split(':', 1)
                    if len(type_match) > 1:
                        current_producer['type'] = type_match[1].strip()
                
                elif 'CAPACITY:' in line.upper():
                    capacity_match = line.split(':', 1)
                    if len(capacity_match) > 1:
                        current_producer['capacity'] = capacity_match[1].strip()
                
                elif 'LOCATION:' in line.upper():
                    location_match = line.split(':', 1)
                    if len(location_match) > 1:
                        current_producer['location'] = location_match[1].strip()
                
                elif 'DETAILS:' in line.upper():
                    details_match = line.split(':', 1)
                    if len(details_match) > 1:
                        current_producer['details_raw'] = details_match[1].strip()
                
                elif line == '---' or '---' in line:
                    if current_producer.get('company'):
                        producers.append({
                            'company': current_producer['company'],
                            'type': current_producer.get('type', 'Producer'),
                            'details': self._format_producer_details(current_producer)
                        })
                        current_producer = {}
            
            # Don't forget the last producer
            if current_producer.get('company'):
                producers.append({
                    'company': current_producer['company'],
                    'type': current_producer.get('type', 'Producer'),
                    'details': self._format_producer_details(current_producer)
                })
            
            # Deduplicate
            seen_companies = set()
            unique_producers = []
            for producer in producers:
                company_key = producer['company'].lower().strip()
                if company_key not in seen_companies and producer['company']:
                    seen_companies.add(company_key)
                    unique_producers.append(producer)
            
            return unique_producers[:15]
            
        except Exception as e:
            logger.error(f"Error finding producers: {e}", exc_info=True)
            return []
    
    def get_product_occurrences(self, product: str) -> Dict[str, Any]:
        """Get all SAU numbers and companies where a product is used"""
        db = self.get_db()
        try:
            db.rollback()
            
            # Use fuzzy matching for product occurrences too
            sql = text("""
                SELECT DISTINCT
                    project_number,
                    companies,
                    main_city,
                    filename
                FROM documents
                WHERE EXISTS (
                    SELECT 1 FROM unnest(product_tags) AS tag
                    WHERE LOWER(tag) LIKE LOWER(:product)
                )
                    AND (project_number IS NOT NULL OR companies IS NOT NULL)
                ORDER BY project_number, companies
            """)
            
            result = db.execute(sql, {'product': f'%{product}%'})
            
            occurrences = {
                'projects': [],
                'companies': set(),
                'total_occurrences': 0
            }
            
            for row in result:
                occurrences['total_occurrences'] += 1
                
                # Add project info
                if row.project_number:
                    for proj_num in row.project_number:
                        if proj_num:
                            occurrences['projects'].append({
                                'sau_number': proj_num,
                                'project_name': f"Project {proj_num}",
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
        finally:
            db.close()
    
    def group_documents_by_product(self, documents: List[Dict[str, Any]], filters: Dict[str, Any]) -> Dict[str, List[Dict]]:
        """Group documents by product tags that match the provided filters"""
        from collections import defaultdict
        product_groups: Dict[str, List[Dict]] = defaultdict(list)

        # Prepare normalized search terms for comparison
        search_products = [p.lower() for p in filters.get('products', [])] if filters else []

        for doc in documents:
            tags = doc.get('product_tags') or []
            if not tags:
                continue

            # Prepare enhanced doc once
            enhanced_doc = {
                'document_id': doc['id'],
                'filename': doc['filename'],
                'title': doc.get('title', ''),
                'main_city': doc.get('main_city', ''),
                'companies': doc.get('companies', []),
                'main_topics': doc.get('main_topics', []),  # Added main_topics
                'project_date': doc.get('project_date'),
                'project_number': doc.get('project_number', []),
                'modification_date': doc.get('modification_date'),
                'file_size': doc.get('file_size'),
                'main_tag': doc.get('main_tag', ''),
                'relative_date': self.get_relative_date(doc.get('modification_date'))
            }

            for product in tags:
                if not product:
                    continue

                # If no search filters, include all tags
                if not search_products:
                    product_groups[product].append(enhanced_doc)
                    continue

                product_lower = product.lower()
                for sp in search_products:
                    if sp in product_lower or product_lower in sp:
                        product_groups[product].append(enhanced_doc)
                        break

        return dict(product_groups)
    
    def calculate_product_match_score(self, product: str, search_query: str) -> float:
        """Calculate how well a product matches the search query"""
        product_lower = product.lower()
        query_lower = search_query.lower()
        
        # Exact match
        if product_lower == query_lower:
            return 1.0
        
        # Query is contained in product
        if query_lower in product_lower:
            return 0.9
        
        # Product contains query
        if product_lower in query_lower:
            return 0.8
        
        # Word-level matching
        query_words = set(query_lower.split())
        product_words = set(product_lower.split())
        
        # All query words are in product
        if query_words.issubset(product_words):
            return 0.7
        
        # Some words match
        common_words = query_words.intersection(product_words)
        if common_words:
            return 0.5 * (len(common_words) / len(query_words))
        
        # Partial word matches
        for q_word in query_words:
            for p_word in product_words:
                if q_word in p_word or p_word in q_word:
                    return 0.3
        
        return 0.1  # Minimal match
    
    async def extract_product_definition(
        self,
        product: str,
        domain: str,
        chunks: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Extract definition using domain-specific agent"""
        
        agent = self.get_domain_agent(product)
        
        # Format context from chunks
        context = "\n\n".join([
            f"[Source: {chunk['filename']}, Page {chunk.get('page_number', 'N/A')}]\n{chunk['content']}"
            for chunk in chunks[:5]
        ])
        
        # Get cited definition from documents
        cited_prompt = agent.definition_prompt.format(
            domain=product,
            product=product,
            context=context
        )
        
        cited_response = ""
        async for chunk in self.llm.astream(cited_prompt):
            if chunk.content:
                cited_response += chunk.content
        
        # Generate AI definition with Application/Usage (4 sentences)
        ai_prompt = agent.ai_definition_prompt.format(
            domain=product,
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
        
        # Get document info for download - include all enhanced metadata
        doc_info = chunks[0] if chunks else {}
        
        # Get and format date properly
        mod_date = doc_info.get('modification_date')
        
        # Get all unique document IDs from chunks for download
        document_ids = list(set([chunk['document_id'] for chunk in chunks if chunk.get('document_id')]))
        
        return {
            'product': product,
            'domain': product,
            'cited_definition': cited_response,
            'ai_definition': ai_response.strip(),
            'producers': producers,
            'occurrences': occurrences,
            'source_document': {
                'document_id': doc_info.get('document_id'),
                'filename': doc_info.get('filename'),
                'modification_date': self.safe_datetime_to_iso(mod_date),
                'relative_date': self.get_relative_date(mod_date),
                'main_tag': doc_info.get('main_tag'),
                'file_size': doc_info.get('file_size'),
                'main_city': doc_info.get('main_city'),
                'companies': doc_info.get('companies', []),
                'main_topics': doc_info.get('main_topics', []),  # Added main_topics
                'project_date': doc_info.get('project_date'),
                'project_number': doc_info.get('project_number', [])
            },
            'all_document_ids': document_ids,
            'chunks_used': len(chunks)
        }
    
    async def search_stream(
        self,
        query: str,
        k: int = 20,
        filters: Optional[Dict] = None,
        selected_product: Optional[str] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """Enhanced search with natural language query parsing and detailed stage updates"""
        
        start_time = datetime.now()
        
        try:
            # Stage 1: Initialize and send available filters
            yield {
                'type': 'stage_update',
                'stage': 'initialization',
                'message': 'Initializing search system...',
                'timestamp': datetime.now().isoformat()
            }
            
            # Send available filters
            available_filters = self.get_available_filters()
            yield {
                'type': 'available_filters',
                'filters': available_filters,
                'timestamp': datetime.now().isoformat()
            }
            
            # Stage 2: Parse and understand query
            yield {
                'type': 'stage_update',
                'stage': 'analysis',
                'message': 'Understanding your query...',
                'timestamp': datetime.now().isoformat()
            }
            
            # If selected_product is provided, we're doing a product-specific search
            if selected_product:
                logger.info(f"Product-specific search for: {selected_product}")
                
                yield {
                    'type': 'stage_update',
                    'stage': 'product_search',
                    'message': f'Searching for documents about {selected_product}...',
                    'timestamp': datetime.now().isoformat()
                }
                
                # Get documents for this specific product
                db = self.get_db()
                try:
                    sql = text("""
                        SELECT id FROM documents 
                        WHERE EXISTS (
                            SELECT 1 FROM unnest(product_tags) AS tag
                            WHERE LOWER(tag) LIKE LOWER(:product)
                        )
                        LIMIT 50
                    """)
                    result = db.execute(sql, {'product': f'%{selected_product}%'})
                    document_ids = [str(row.id) for row in result]
                    db.commit()
                finally:
                    db.close()
                
                if not document_ids:
                    yield {
                        'type': 'no_results',
                        'message': f'No documents found for "{selected_product}"',
                        'timestamp': datetime.now().isoformat()
                    }
                    return
                
                yield {
                    'type': 'stage_update',
                    'stage': 'retrieving_chunks',
                    'message': f'Found {len(document_ids)} documents. Retrieving content chunks...',
                    'timestamp': datetime.now().isoformat()
                }
                
                # Get chunks for these documents
                chunks = self.retrieve_chunks_for_documents(document_ids, k=None)
                
                if chunks:
                    yield {
                        'type': 'stage_update',
                        'stage': 'extracting_definition',
                        'message': f'Extracting definition for {selected_product}...',
                        'timestamp': datetime.now().isoformat()
                    }
                    
                    # Start processing with detailed sub-stages
                    yield {
                        'type': 'stage_update',
                        'stage': 'generating_definition',
                        'message': 'Generating AI-powered definition...',
                        'timestamp': datetime.now().isoformat()
                    }
                    
                    yield {
                        'type': 'stage_update',
                        'stage': 'finding_producers',
                        'message': 'Identifying producers and competitors...',
                        'timestamp': datetime.now().isoformat()
                    }
                    
                    yield {
                        'type': 'stage_update',
                        'stage': 'analyzing_occurrences',
                        'message': 'Analyzing product occurrences in projects...',
                        'timestamp': datetime.now().isoformat()
                    }
                    
                    result = await self.extract_product_definition(
                        product=selected_product,
                        domain=selected_product,
                        chunks=chunks
                    )
                    
                    yield {
                        'type': 'single_result',
                        'data': result,
                        'timestamp': datetime.now().isoformat()
                    }
            else:
                # Parse natural language query
                yield {
                    'type': 'stage_update',
                    'stage': 'parsing_query',
                    'message': 'Parsing natural language query...',
                    'timestamp': datetime.now().isoformat()
                }
                
                parsed_query = await self.query_parser.parse_query(query)
                
                # Check if we have sufficient information
                if not parsed_query.get('has_sufficient_info', False):
                    yield {
                        'type': 'no_results',
                        'message': parsed_query.get('missing_info_message', 'Please provide more specific information'),
                        'timestamp': datetime.now().isoformat()
                    }
                    return
                
                # Send interpretation to user
                if parsed_query.get('interpretation'):
                    yield {
                        'type': 'stage_update',
                        'stage': 'interpretation',
                        'message': f"Query interpreted as: {parsed_query['interpretation']}",
                        'timestamp': datetime.now().isoformat()
                    }
                
                # Stage 3: Build SQL query
                yield {
                    'type': 'stage_update',
                    'stage': 'building_query',
                    'message': 'Building database query from filters...',
                    'timestamp': datetime.now().isoformat()
                }
                
                # Stage 4: Execute search
                yield {
                    'type': 'stage_update',
                    'stage': 'retrieval',
                    'message': 'Searching documents in database...',
                    'timestamp': datetime.now().isoformat()
                }
                
                # Execute filtered search
                documents = self.sql_executor.execute_filtered_search(parsed_query)
                
                if not documents:
                    yield {
                        'type': 'no_results',
                        'message': 'No results found matching your criteria',
                        'timestamp': datetime.now().isoformat()
                    }
                    return
                
                yield {
                    'type': 'stage_update',
                    'stage': 'found_documents',
                    'message': f'Found {len(documents)} matching documents',
                    'timestamp': datetime.now().isoformat()
                }
                
                # Stage 5: Group and process results
                yield {
                    'type': 'stage_update',
                    'stage': 'grouping',
                    'message': 'Grouping documents by product...',
                    'timestamp': datetime.now().isoformat()
                }
                
                # Group documents by product
                product_groups = self.group_documents_by_product(documents, parsed_query)
                
                if len(product_groups) == 1:
                    # Single product - process directly
                    product = list(product_groups.keys())[0]
                    product_docs = product_groups[product]
                    
                    yield {
                        'type': 'stage_update',
                        'stage': 'single_product',
                        'message': f'Processing single product: {product}',
                        'timestamp': datetime.now().isoformat()
                    }
                    
                    # Get document IDs for this product
                    doc_ids = [doc['document_id'] for doc in product_docs]
                    
                    yield {
                        'type': 'stage_update',
                        'stage': 'retrieving_content',
                        'message': f'Retrieving content from {len(doc_ids)} documents...',
                        'timestamp': datetime.now().isoformat()
                    }
                    
                    chunks = self.retrieve_chunks_for_documents(doc_ids, k=None)
                    
                    yield {
                        'type': 'stage_update',
                        'stage': 'extracting_definition',
                        'message': f'Extracting definition for {product}...',
                        'timestamp': datetime.now().isoformat()
                    }
                    
                    yield {
                        'type': 'stage_update',
                        'stage': 'generating_ai_definition',
                        'message': 'Generating AI-powered definition...',
                        'timestamp': datetime.now().isoformat()
                    }
                    
                    yield {
                        'type': 'stage_update',
                        'stage': 'finding_producers',
                        'message': 'Identifying producers and competitors...',
                        'timestamp': datetime.now().isoformat()
                    }
                    
                    yield {
                        'type': 'stage_update',
                        'stage': 'analyzing_usage',
                        'message': 'Analyzing product usage across projects...',
                        'timestamp': datetime.now().isoformat()
                    }
                    
                    result = await self.extract_product_definition(
                        product=product,
                        domain=product,
                        chunks=chunks
                    )
                    
                    yield {
                        'type': 'single_result',
                        'data': result,
                        'timestamp': datetime.now().isoformat()
                    }
                    
                elif len(product_groups) > 1:
                    # Multiple products
                    yield {
                        'type': 'stage_update',
                        'stage': 'multiple_products',
                        'message': f'Found {len(product_groups)} different products',
                        'timestamp': datetime.now().isoformat()
                    }
                    
                    yield {
                        'type': 'stage_update',
                        'stage': 'ranking',
                        'message': 'Ranking products by relevance...',
                        'timestamp': datetime.now().isoformat()
                    }
                    
                    product_list = []
                    for product, docs in product_groups.items():
                        # Calculate match score
                        match_score = self.calculate_product_match_score(product, query)
                        
                        top_doc = docs[0]
                        product_list.append({
                            'product': product,
                            'document_count': len(docs),
                            'chunk_count': len(docs) * 5,  # Estimate
                            'best_match_score': match_score,
                            'sample_document': {
                                'filename': top_doc['filename'],
                                'modification_date': top_doc.get('modification_date'),
                                'relative_date': top_doc.get('relative_date'),
                                'document_id': top_doc['document_id'],
                                'main_city': top_doc.get('main_city'),
                                'companies': top_doc.get('companies', []),
                                'main_topics': top_doc.get('main_topics', []),  # Added main_topics
                                'project_date': top_doc.get('project_date'),
                                'project_number': top_doc.get('project_number', [])
                            }
                        })
                    
                    # Sort by match score
                    product_list.sort(key=lambda x: x['best_match_score'], reverse=True)
                    
                    # Limit to top 10
                    product_list = product_list[:10]
                    
                    yield {
                        'type': 'stage_update',
                        'stage': 'ready_for_selection',
                        'message': 'Products ready for selection',
                        'timestamp': datetime.now().isoformat()
                    }
                    
                    yield {
                        'type': 'multiple_results',
                        'products': product_list,
                        'message': 'Select a product to get detailed information:',
                        'timestamp': datetime.now().isoformat()
                    }
            
            # Complete
            processing_time = (datetime.now() - start_time).total_seconds()
            
            yield {
                'type': 'search_complete',
                'message': 'Search completed successfully',
                'processing_time': processing_time * 1000,
                'metadata': {
                    'query': query,
                    'products_found': len(product_groups) if 'product_groups' in locals() else 0,
                    'total_documents': len(documents) if 'documents' in locals() else 0,
                    'selected_product': selected_product,
                    'filters_applied': bool(parsed_query) if 'parsed_query' in locals() else False
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
                    main_tag,
                    main_city,
                    companies,
                    main_topics,
                    project_date,
                    project_number
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
                    'modification_date': self.safe_datetime_to_iso(result.modification_date),
                    'main_tag': result.main_tag,
                    'main_city': result.main_city,
                    'companies': result.companies,
                    'main_topics': result.main_topics,  # Added main_topics
                    'project_date': self.safe_datetime_to_iso(result.project_date),
                    'project_number': result.project_number,
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