# app/services/machinery_service.py
import logging
import re
import asyncio
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func, text
from langchain_ollama import OllamaEmbeddings
from groq import Groq

from app.models.machinery import Machinery
from app.core.config import settings

logger = logging.getLogger(__name__)

class MachineryService:
    def __init__(self, groq_api_key: str, db: Session):
        self.groq_api_key = groq_api_key
        self.db = db
        self.embeddings = OllamaEmbeddings(
            model="nomic-embed-text:latest",
            base_url=settings.ollama_base_url
        )
        self.groq_client = Groq(api_key=groq_api_key) if groq_api_key else None
    
    def extract_sau_numbers(self, text: str) -> List[str]:
        """Extract SAU and APP numbers from text"""
        if not text:
            return []
        
        # Pattern to match various SAU/APP formats
        patterns = [
            r'(SAU|APP)[\s#-]?(\d+)',
            r'(SAU|APP)[\s]?#[\s]?(\d+)',
            r'(SAU|APP)-(\d+)',
            r'(SAU|APP)(\d+)'
        ]
        
        sau_numbers = set()
        text_upper = text.upper()
        
        for pattern in patterns:
            matches = re.findall(pattern, text_upper)
            for match in matches:
                # Standardize format to SAU1234 or APP1234
                sau_numbers.add(f"{match[0]}{match[1]}")
        
        return list(sau_numbers)
    
    def create_search_text(self, data: Dict[str, Any]) -> str:
        """Create concatenated search text for full-text search"""
        parts = []
        
        for key in ['sector', 'description', 'manufacturer', 'origin', 'unit_of_measure', 'unit']:
            if data.get(key):
                parts.append(str(data[key]))
        
        # Add SAU numbers if present
        sau_numbers = self.extract_sau_numbers(' '.join(parts))
        if sau_numbers:
            parts.extend(sau_numbers)
        
        return ' '.join(parts).lower()
    
    async def detect_product_and_suggest_machines(self, query: str) -> Tuple[bool, List[str], str]:
        """Detect if query is about a product and suggest relevant machinery"""
        if not self.groq_client:
            return False, [], ""
        
        try:
            # First, detect if it's a product query
            detection_prompt = f"""Analyze this search query and determine if it's asking about machinery for a specific product's production, manufacturing, or packaging.

Query: "{query}"

Respond in this exact format:
IS_PRODUCT: [YES/NO]
PRODUCT_NAME: [product name if YES, otherwise NONE]
MACHINERY_TYPES: [comma-separated list of machinery types if YES, otherwise NONE]

Examples:
Query: "machines for pasta production"
IS_PRODUCT: YES
PRODUCT_NAME: pasta
MACHINERY_TYPES: mixer, extruder, dryer, cutting machine, packaging machine

Query: "shock freezer"
IS_PRODUCT: NO
PRODUCT_NAME: NONE
MACHINERY_TYPES: NONE

Query: "equipment for chocolate manufacturing"
IS_PRODUCT: YES
PRODUCT_NAME: chocolate
MACHINERY_TYPES: roaster, grinder, concher, tempering machine, molding machine, wrapping machine"""

            response = self.groq_client.chat.completions.create(
                model=settings.groq_model or "openai/gpt-oss-120b",
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert in industrial machinery and food production equipment."
                    },
                    {
                        "role": "user",
                        "content": detection_prompt
                    }
                ],
                temperature=0.2,
                max_tokens=200
            )
            
            result = response.choices[0].message.content.strip()
            lines = result.split('\n')
            
            is_product = False
            product_name = ""
            machinery_types = []
            
            for line in lines:
                if line.startswith('IS_PRODUCT:'):
                    is_product = 'YES' in line.upper()
                elif line.startswith('PRODUCT_NAME:'):
                    product_name = line.split(':', 1)[1].strip()
                elif line.startswith('MACHINERY_TYPES:'):
                    types_str = line.split(':', 1)[1].strip()
                    if types_str != 'NONE':
                        machinery_types = [t.strip() for t in types_str.split(',')]
            
            if is_product and machinery_types:
                # Generate a comprehensive list of machinery
                machinery_prompt = f"""List all types of machinery and equipment used in the production, processing, manufacturing, and packaging of {product_name}.

Include:
1. Primary processing equipment
2. Secondary processing equipment
3. Packaging machinery
4. Quality control equipment
5. Storage and handling equipment

Provide a comprehensive list of specific machine types, separated by commas."""

                machinery_response = self.groq_client.chat.completions.create(
                    model=settings.groq_model or "openai/gpt-oss-120b",
                    messages=[
                        {
                            "role": "system",
                            "content": "You are an expert in industrial machinery and production equipment."
                        },
                        {
                            "role": "user",
                            "content": machinery_prompt
                        }
                    ],
                    temperature=0.3,
                    max_tokens=500
                )
                
                extended_machinery = machinery_response.choices[0].message.content.strip()
                all_machinery = [m.strip() for m in extended_machinery.split(',')]
                
                # Create search message
                search_message = f"Searching for machinery related to {product_name} production..."
                
                return True, all_machinery[:15], search_message  # Limit to 15 types
            
            return False, [], ""
            
        except Exception as e:
            logger.error(f"Error detecting product and suggesting machines: {e}")
            return False, [], ""
    
    async def search_machinery(
        self,
        query: str,
        limit: int = 20,
        offset: int = 0,
        filters: Dict[str, Any] = None
    ) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        """Main search method with product detection"""
        
        # Detect if it's a product query
        is_product, suggested_machines, search_message = await self.detect_product_and_suggest_machines(query)
        
        if is_product and suggested_machines:
            # Search for each suggested machine type
            all_results = []
            found_types = []
            not_found_types = []
            
            for machine_type in suggested_machines[:10]:  # Limit initial search
                # Search for this machine type
                machinery_items = await self.hybrid_search(
                    query=machine_type,
                    sau_numbers=[],
                    limit=3,  # Get top 3 for each type
                    offset=0,
                    filters=filters
                )
                
                if machinery_items:
                    found_types.append(machine_type)
                    for item in machinery_items:
                        if str(item.id) not in [r['id'] for r in all_results]:
                            all_results.append(self._format_machinery_item(item))
                else:
                    not_found_types.append(machine_type)
            
            # Create informative message
            message = f"Found {len(all_results)} machines in the knowledge hub related to {query.lower()} production."
            if not_found_types:
                message += f" Additional machinery typically used but not in database: {', '.join(not_found_types[:5])}"
            
            return all_results[:limit], message
        
        # Regular search if not a product query
        sau_numbers = self.extract_sau_numbers(query)
        
        # Perform hybrid search
        machinery_items = await self.hybrid_search(
            query=query,
            sau_numbers=sau_numbers,
            limit=limit,
            offset=offset,
            filters=filters
        )
        
        # Format results
        results = [self._format_machinery_item(item) for item in machinery_items]
        
        return results, None
    
    def _format_machinery_item(self, item: Machinery) -> Dict[str, Any]:
        """Format a machinery item for response"""
        return {
            'id': str(item.id),
            'sector': item.sector,
            'project_name': item.project_name,
            'sau_number': item.sau_number,
            'description': item.description,
            'manufacturer': item.manufacturer,
            'origin': item.origin,
            'cost': float(item.cost) if item.cost else None,
            'cost_index': float(item.cost_index) if item.cost_index else None,
            'unit_of_measure': item.unit_of_measure,
            'unit': item.unit,
            'production_year': item.production_year,
            'last_update': item.last_update.isoformat() if item.last_update else None,
            'sau_numbers': item.sau_numbers or [],
            'similarity_score': getattr(item, 'similarity_score', None)
        }
    
    async def get_related_machinery(
        self,
        machinery_id: str,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Find related machinery items based on a given machinery ID"""
        try:
            # Get the original machinery item
            original = self.db.query(Machinery).filter(Machinery.id == machinery_id).first()
            if not original:
                return []
            
            # Search for related items using description and manufacturer
            search_terms = []
            if original.description:
                # Extract key words from description
                words = original.description.lower().split()
                # Filter out common words and keep important ones
                important_words = [w for w in words[:5] if len(w) > 3]
                search_terms.extend(important_words)
            
            if original.manufacturer and original.manufacturer != 'N/A':
                search_terms.append(original.manufacturer.lower())
            
            if original.sector:
                search_terms.append(original.sector.lower())
            
            # Perform search with extracted terms
            if search_terms:
                query = self.db.query(Machinery).filter(
                    and_(
                        Machinery.id != machinery_id,
                        or_(*[
                            func.lower(Machinery.description).contains(term)
                            for term in search_terms[:3]  # Limit to first 3 terms
                        ])
                    )
                )
                
                related = query.limit(limit).all()
                
                # Format results
                return [self._format_machinery_item(item) for item in related]
            
            return []
            
        except Exception as e:
            logger.error(f"Error finding related machinery: {e}")
            return []
    
    async def generate_specifications(
        self,
        description: str,
        manufacturer: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate detailed specifications for machinery using Groq LLM"""
        if not self.groq_client:
            return {
                "error": "Groq API not configured",
                "specifications": {}
            }
        
        try:
            prompt = f"""Generate detailed technical specifications for the following industrial machinery:

Description: {description}
Manufacturer: {manufacturer or 'Not specified'}

Please provide comprehensive specifications including:
1. Technical specifications (dimensions, weight, power requirements)
2. Performance metrics (capacity, speed, efficiency)
3. Operating conditions (temperature range, humidity requirements)
4. Safety features and certifications
5. Maintenance requirements
6. Common applications and industries

Format the response as a structured list with clear categories and specific values where applicable."""

            response = self.groq_client.chat.completions.create(
                model=settings.groq_model or "openai/gpt-oss-120b",
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expert in industrial machinery and equipment specifications."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                temperature=0.3,
                max_tokens=1500
            )
            
            specifications_text = response.choices[0].message.content
            
            # Parse the text into structured format
            specifications = self._parse_specifications(specifications_text)
            
            return {
                "raw_text": specifications_text,
                "specifications": specifications,
                "generated_at": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error generating specifications: {e}")
            return {
                "error": str(e),
                "specifications": {}
            }
    
    def _parse_specifications(self, text: str) -> Dict[str, Any]:
        """Parse specification text into structured format"""
        specifications = {}
        current_section = None
        
        lines = text.split('\n')
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # Check if it's a section header (usually numbered or in caps)
            if re.match(r'^\d+\.', line) or line.isupper():
                current_section = line.replace(':', '').strip()
                specifications[current_section] = []
            elif current_section and line:
                # Add to current section
                if current_section in specifications:
                    specifications[current_section].append(line)
        
        return specifications
    
    async def generate_all_embeddings(self):
        """Generate embeddings for all machinery items without embeddings"""
        try:
            # Get machinery without embeddings
            machinery_list = self.db.query(Machinery).filter(
                Machinery.embedding.is_(None)
            ).all()
            
            logger.info(f"Generating embeddings for {len(machinery_list)} machinery items")
            
            for machinery in machinery_list:
                try:
                    # Create text for embedding
                    text = f"{machinery.description} {machinery.manufacturer or ''} {machinery.sector or ''}"
                    
                    # Generate embedding
                    embedding = self.embeddings.embed_query(text)
                    
                    # Update machinery
                    machinery.embedding = embedding
                    self.db.commit()
                    
                except Exception as e:
                    logger.error(f"Error generating embedding for machinery {machinery.id}: {e}")
                    self.db.rollback()
            
            logger.info("Embedding generation completed")
            
        except Exception as e:
            logger.error(f"Error in batch embedding generation: {e}")
    
    async def hybrid_search(
        self,
        query: str,
        sau_numbers: List[str] = None,
        limit: int = 20,
        offset: int = 0,
        filters: Dict[str, Any] = None
    ) -> List[Machinery]:
        """Perform hybrid search using vector similarity and keyword matching"""
        
        results = []
        result_ids = set()  # Track IDs to avoid duplicates
        
        # First: If SAU numbers are provided, prioritize exact matches
        if sau_numbers:
            sau_query = self.db.query(Machinery)
            for sau in sau_numbers:
                sau_query = sau_query.filter(
                    or_(
                        Machinery.sau_number == sau,
                        Machinery.sau_numbers.any(sau)
                    )
                )
            sau_results = sau_query.limit(10).all()
            for result in sau_results:
                if result.id not in result_ids:
                    results.append(result)
                    result_ids.add(result.id)
        
        # Second: Try vector similarity search
        try:
            # Generate embedding for the query
            query_embedding = self.embeddings.embed_query(query)
            
            # Use raw SQL for vector similarity search to avoid SQLAlchemy issues
            vector_sql = text("""
                SELECT *, 
                    1 - (embedding <=> CAST(:query_embedding AS vector)) AS similarity_score
                FROM machinery
                WHERE embedding IS NOT NULL
                AND 1 - (embedding <=> CAST(:query_embedding AS vector)) > 0.1
                ORDER BY similarity_score DESC
                LIMIT :limit
                OFFSET :offset
            """)
            
            # Execute the query
            vector_results = self.db.execute(
                vector_sql,
                {
                    'query_embedding': str(query_embedding),
                    'limit': limit,
                    'offset': offset
                }
            ).fetchall()
            
            # Convert results to Machinery objects
            for row in vector_results:
                if row.id not in result_ids:
                    # Get the actual Machinery object
                    machinery = self.db.query(Machinery).filter(Machinery.id == row.id).first()
                    if machinery:
                        machinery.similarity_score = row.similarity_score
                        results.append(machinery)
                        result_ids.add(row.id)
        
        except Exception as e:
            logger.warning(f"Vector search failed, falling back to keyword search: {e}")
        
        # Third: Keyword/text search fallback or supplement
        if len(results) < limit:
            keyword_query = self.db.query(Machinery).filter(
                or_(
                    func.lower(Machinery.description).contains(query.lower()),
                    func.lower(Machinery.manufacturer).contains(query.lower()) if query.lower() != 'none' else False,
                    func.lower(Machinery.sector).contains(query.lower()) if query.lower() != 'none' else False,
                    func.lower(Machinery.project_name).contains(query.lower()) if query.lower() != 'none' else False,
                    func.lower(Machinery.search_text).contains(query.lower())
                )
            )
            
            # Apply filters if provided
            if filters:
                if filters.get('sector'):
                    keyword_query = keyword_query.filter(
                        func.lower(Machinery.sector) == filters['sector'].lower()
                    )
                if filters.get('manufacturer'):
                    keyword_query = keyword_query.filter(
                        func.lower(Machinery.manufacturer).contains(filters['manufacturer'].lower())
                    )
                if filters.get('min_cost'):
                    keyword_query = keyword_query.filter(
                        Machinery.cost >= filters['min_cost']
                    )
                if filters.get('max_cost'):
                    keyword_query = keyword_query.filter(
                        Machinery.cost <= filters['max_cost']
                    )
            
            # Exclude already found items
            if result_ids:
                keyword_query = keyword_query.filter(~Machinery.id.in_(result_ids))
            
            keyword_results = keyword_query.limit(limit - len(results)).all()
            
            for result in keyword_results:
                if result.id not in result_ids:
                    results.append(result)
                    result_ids.add(result.id)
        
        # Special handling for multi-word queries
        if len(results) < 5 and ' ' in query:
            # Try searching for each word separately
            words = query.lower().split()
            for word in words:
                if word in ['the', 'a', 'an', 'all', 'show', 'me', 'find', 'get', 'for', 'production', 'manufacturing', 'equipment', 'machinery', 'machines']:
                    continue  # Skip common words
                    
                word_query = self.db.query(Machinery).filter(
                    or_(
                        func.lower(Machinery.description).contains(word),
                        func.lower(Machinery.search_text).contains(word)
                    )
                )
                
                # Exclude already found items
                if result_ids:
                    word_query = word_query.filter(~Machinery.id.in_(result_ids))
                
                word_results = word_query.limit(5).all()
                
                for result in word_results:
                    if result.id not in result_ids and len(results) < limit:
                        results.append(result)
                        result_ids.add(result.id)
        
        return results[:limit]
    
    async def find_by_sau_number(self, sau_number: str, exclude_id: str = None) -> List[Machinery]:
        """Find machinery by SAU number"""
        query = self.db.query(Machinery).filter(
            Machinery.sau_numbers.any(sau_number.upper())
        )
        
        if exclude_id:
            query = query.filter(Machinery.id != exclude_id)
        
        return query.limit(10).all()
    
    def generate_embeddings_batch(self):
        """Generate embeddings for all machinery without embeddings (synchronous version)"""
        try:
            # Get machinery without embeddings
            machinery_list = self.db.query(Machinery).filter(
                Machinery.embedding.is_(None)
            ).limit(100).all()
            
            for machinery in machinery_list:
                try:
                    # Create text for embedding
                    text = f"{machinery.description} {machinery.manufacturer or ''} {machinery.sector or ''}"
                    
                    # Generate embedding
                    embedding = self.embeddings.embed_query(text)
                    
                    # Update machinery
                    machinery.embedding = embedding
                    self.db.commit()
                    
                except Exception as e:
                    logger.error(f"Error generating embedding for machinery {machinery.id}: {e}")
                    self.db.rollback()
        
        except Exception as e:
            logger.error(f"Error in batch embedding generation: {e}")