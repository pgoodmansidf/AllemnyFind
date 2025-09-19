import logging
import json
from typing import Dict, List, Any, Optional
from datetime import datetime
import asyncio
import httpx
from groq import Groq

from app.core.config import settings # Ensure settings is imported

logger = logging.getLogger(__name__)

class GroqSummarizationService:
    """Service for document summarization and tag extraction using Groq API"""
    
    def __init__(self):
        # Initialize self.api_key from settings. It might be None at startup if not in .env
        self.api_key = settings.groq_api_key
        self.model = settings.groq_model
        self.client = None # Client is initialized lazily
        self.max_retries = 3
        self.retry_delay = 1.0
        
    def _initialize_client(self):
        """
        Initialize Groq client with API key. 
        Always ensures self.api_key is consistent with global settings.
        """
        # CRITICAL: Always re-fetch the API key from settings before initializing
        # This allows dynamic updates (e.g., from frontend) to take effect
        self.api_key = settings.groq_api_key 

        if not self.api_key:
            raise ValueError("Groq API key not configured. Please set GROQ_API_KEY in settings.")
        
        self.client = Groq(api_key=self.api_key)
        logger.info("Groq client initialized successfully")
    
    def set_api_key(self, api_key: str):
        """Set or update the Groq API key and force re-initialization of client."""
        # Update both the instance's API key and the global settings object's API key
        self.api_key = api_key
        settings.groq_api_key = api_key # Update settings for persistence across app if needed
        self.client = None  # Force re-initialization on next API call
        logger.info("Groq API key updated on service instance and settings")
    
    async def test_connection(self) -> Dict[str, Any]:
        """Test connection to Groq API"""
        try:
            if not self.client:
                # This will now pick up the latest settings.groq_api_key due to _initialize_client logic
                self._initialize_client()
            
            # Test with a simple completion
            response = self.client.chat.completions.create(
                messages=[{"role": "user", "content": "Test connection. Respond with 'OK'."}],
                model=self.model,
                max_tokens=10
            )
            
            return {
                'status': 'connected',
                'model': self.model,
                'api_key_configured': bool(self.api_key),
                'response': response.choices[0].message.content.strip(),
                'tested_at': datetime.utcnow()
            }
            
        except Exception as e:
            logger.error(f"Groq connection test failed: {e}")
            return {
                'status': 'error',
                'model': self.model,
                'api_key_configured': bool(self.api_key),
                'error': str(e),
                'tested_at': datetime.utcnow()
            }
    
    async def summarize_document(self, content: str, document_metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Create a comprehensive summary of a document
        
        Args:
            content: Full document content
            document_metadata: Document metadata for context
            
        Returns:
            Dictionary containing summary and extracted information
        """
        try:
            if not self.client:
                self._initialize_client()
            
            # Prepare context from metadata
            context_info = ""
            if document_metadata:
                filename = document_metadata.get('filename', 'Unknown')
                file_type = document_metadata.get('file_type', 'Unknown')
                context_info = f"\nDocument: {filename} (Type: {file_type})"
            
            # Create comprehensive prompt for summarization
            prompt = f"""
You are an expert document analyst. Analyze the following document and provide a comprehensive summary along with extracted information.

{context_info}

Document Content:
{content[:8000]}  # Limit content to avoid token limits

Please provide your analysis in the following JSON format:
{{
    "summary": "A comprehensive 2-3 paragraph summary of the document's main content and key points",
    "executive_summary": "A brief 1-2 sentence executive summary",
    "main_topics": ["topic1", "topic2", "topic3"],
    "key_concepts": ["concept1", "concept2", "concept3"],
    "product_tags": ["product1", "product2", "product3"],
    "entities": {{
        "people": ["person1", "person2"],
        "organizations": ["org1", "org2"],
        "locations": ["location1", "location2"],
        "technologies": ["tech1", "tech2"]
    }},
    "document_type": "classification of document type",
    "sentiment": "positive/negative/neutral",
    "complexity_level": "basic/intermediate/advanced",
    "target_audience": "description of intended audience",
    "key_insights": ["insight1", "insight2", "insight3"],
    "actionable_items": ["action1", "action2"],
    "metadata_extracted": {{
        "title_suggestions": ["title1", "title2"],
        "category": "document category",
        "priority": "high/medium/low"
    }}
}}

Ensure all arrays contain relevant, unique items. If no relevant items are found for a category, use an empty array.
"""
            
            # Make API call with retries
            for attempt in range(self.max_retries):
                try:
                    response = self.client.chat.completions.create(
                        messages=[
                            {
                                "role": "system", 
                                "content": "You are an expert document analyst. Always respond with valid JSON format as requested."
                            },
                            {
                                "role": "user", 
                                "content": prompt
                            }
                        ],
                        model=self.model,
                        max_tokens=2000,
                        temperature=0.3  # Lower temperature for more consistent output
                    )
                    
                    response_content = response.choices[0].message.content.strip()
                    
                    # Try to parse JSON response
                    try:
                        analysis_data = json.loads(response_content)
                    except json.JSONDecodeError:
                        # If JSON parsing fails, extract JSON from response
                        import re
                        json_match = re.search(r'\{.*\}', response_content, re.DOTALL)
                        if json_match:
                            analysis_data = json.loads(json_match.group())
                        else:
                            raise ValueError("Could not extract valid JSON from response")
                    
                    # Validate and clean the response
                    result = self._validate_and_clean_analysis(analysis_data)
                    
                    # Add processing metadata
                    result.update({
                        'groq_model': self.model,
                        'processing_time': response.usage.total_tokens if hasattr(response, 'usage') else None,
                        'processed_at': datetime.utcnow(),
                        'success': True,
                        'raw_response': response_content,
                        'attempt': attempt + 1
                    })
                    
                    logger.info(f"Successfully processed document summary (attempt {attempt + 1})")
                    return result
                    
                except Exception as e:
                    logger.warning(f"Attempt {attempt + 1} failed: {e}")
                    if attempt < self.max_retries - 1:
                        await asyncio.sleep(self.retry_delay * (attempt + 1))
                        continue
                    raise e
            
        except Exception as e:
            logger.error(f"Error in document summarization: {e}")
            return {
                'summary': 'Failed to generate summary',
                'executive_summary': 'Processing failed',
                'main_topics': [],
                'product_tags': [],
                'error': str(e),
                'success': False,
                'processed_at': datetime.utcnow()
            }
    
    def _validate_and_clean_analysis(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and clean the analysis data from Groq"""
        cleaned = {
            'summary': str(data.get('summary', '')).strip(),
            'executive_summary': str(data.get('executive_summary', '')).strip(),
            'main_topics': self._clean_string_array(data.get('main_topics', [])),
            'key_concepts': self._clean_string_array(data.get('key_concepts', [])),
            'product_tags': self._clean_string_array(data.get('product_tags', [])),
            'entities': {
                'people': self._clean_string_array(data.get('entities', {}).get('people', [])),
                'organizations': self._clean_string_array(data.get('entities', {}).get('organizations', [])),
                'locations': self._clean_string_array(data.get('entities', {}).get('locations', [])),
                'technologies': self._clean_string_array(data.get('entities', {}).get('technologies', []))
            },
            'document_type': str(data.get('document_type', '')).strip(),
            'sentiment': str(data.get('sentiment', 'neutral')).lower(),
            'complexity_level': str(data.get('complexity_level', 'intermediate')).lower(),
            'target_audience': str(data.get('target_audience', '')).strip(),
            'key_insights': self._clean_string_array(data.get('key_insights', [])),
            'actionable_items': self._clean_string_array(data.get('actionable_items', [])),
            'metadata_extracted': {
                'title_suggestions': self._clean_string_array(data.get('metadata_extracted', {}).get('title_suggestions', [])),
                'category': str(data.get('metadata_extracted', {}).get('category', '')).strip(),
                'priority': str(data.get('metadata_extracted', {}).get('priority', 'medium')).lower()
            }
        }
        
        return cleaned
    
    def _clean_string_array(self, arr: List[Any]) -> List[str]:
        """Clean and validate string arrays"""
        if not isinstance(arr, list):
            return []
        
        cleaned = []
        for item in arr:
            if isinstance(item, str) and item.strip():
                cleaned.append(item.strip())
            elif item:  # Convert non-string items to string
                cleaned.append(str(item).strip())
        
        # Remove duplicates while preserving order
        seen = set()
        unique_cleaned = []
        for item in cleaned:
            if item.lower() not in seen:
                seen.add(item.lower())
                unique_cleaned.append(item)
        
        return unique_cleaned[:10]  # Limit to 10 items per array
    
    async def extract_tags_from_chunks(self, chunks: List[str]) -> Dict[str, Any]:
        """
        Extract tags and topics from document chunks
        
        Args:
            chunks: List of text chunks from document
            
        Returns:
            Dictionary with extracted tags and topics
        """
        try:
            if not self.client:
                self._initialize_client()
            
            # Combine chunks for processing (with length limit)
            combined_text = "\n\n".join(chunks)[:10000]  # Limit to 10k chars
            
            prompt = f"""
Analyze the following text segments and extract key tags and topics.

Text Content:
{combined_text}

Please provide your analysis in JSON format:
{{
    "main_topics": ["topic1", "topic2", "topic3"],
    "product_tags": ["product1", "product2", "product3"],
    "technology_tags": ["tech1", "tech2"],
    "industry_tags": ["industry1", "industry2"],
    "concept_tags": ["concept1", "concept2"],
    "entity_tags": ["entity1", "entity2"]
}}

Focus on identifying concrete products, technologies, concepts, and industry terms mentioned in the text.
"""
            
            response = self.client.chat.completions.create(
                messages=[
                    {"role": "system", "content": "You are an expert at extracting tags and topics from text. Always respond with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                model=self.model,
                max_tokens=1000,
                temperature=0.2
            )
            
            response_content = response.choices[0].message.content.strip()
            
            try:
                tags_data = json.loads(response_content)
            except json.JSONDecodeError:
                import re
                json_match = re.search(r'\{.*\}', response_content, re.DOTALL)
                if json_match:
                    tags_data = json.loads(json_match.group())
                else:
                    raise ValueError("Could not extract valid JSON from tags response")
            
            cleaned_tags = {
                'main_topics': self._clean_string_array(tags_data.get('main_topics', [])),
                'product_tags': self._clean_string_array(tags_data.get('product_tags', [])),
                'technology_tags': self._clean_string_array(tags_data.get('technology_tags', [])),
                'industry_tags': self._clean_string_array(tags_data.get('industry_tags', [])),
                'concept_tags': self._clean_string_array(tags_data.get('concept_tags', [])),
                'entity_tags': self._clean_string_array(tags_data.get('entity_tags', [])),
                'processed_at': datetime.utcnow(),
                'success': True
            }
            
            logger.info("Successfully extracted tags from document chunks")
            return cleaned_tags
            
        except Exception as e:
            logger.error(f"Error extracting tags from chunks: {e}")
            return {
                'main_topics': [],
                'product_tags': [],
                'technology_tags': [],
                'industry_tags': [],
                'concept_tags': [],
                'entity_tags': [],
                'error': str(e),
                'success': False,
                'processed_at': datetime.utcnow()
            }
    
    async def generate_document_title(self, content: str, existing_title: str = None) -> str:
        """
        Generate an improved title for a document
        
        Args:
            content: Document content (first portion)
            existing_title: Current document title if any
            
        Returns:
            Generated title string
        """
        try:
            if not self.client:
                self._initialize_client()
            
            context = f"Current title: {existing_title}\n\n" if existing_title else ""
            
            prompt = f"""
Generate a clear, descriptive title for this document based on its content.

{context}Document Content (first section):
{content[:2000]}

Requirements:
- Title should be 3-12 words
- Should clearly indicate the document's main topic
- Should be professional and descriptive
- Avoid generic terms like "document" or "file"

Respond with just the title, no additional text.
"""
            
            response = self.client.chat.completions.create(
                messages=[
                    {"role": "system", "content": "You are an expert at creating clear, descriptive document titles."},
                    {"role": "user", "content": prompt}
                ],
                model=self.model,
                max_tokens=50,
                temperature=0.3
            )
            
            generated_title = response.choices[0].message.content.strip().strip('"\'')
            
            # Fallback to existing title if generation fails
            if not generated_title or len(generated_title) < 3:
                return existing_title or "Untitled Document"
            
            logger.debug(f"Generated title: {generated_title}")
            return generated_title
            
        except Exception as e:
            logger.error(f"Error generating document title: {e}")
            return existing_title or "Untitled Document"
    
    def get_models(self) -> List[str]:
        """Get list of available Groq models"""
        return [
            "llama3-70b-8192",
            "llama3-8b-8192", 
            "mixtral-8x7b-32768",
            "gemma-7b-it",
            "gemma2-9b-it"
        ]
    
    def set_model(self, model_name: str):
        """Set the Groq model to use"""
        if model_name in self.get_models():
            self.model = model_name
            settings.groq_model = model_name
            logger.info(f"Groq model set to: {model_name}")
        else:
            raise ValueError(f"Invalid model: {model_name}. Available models: {self.get_models()}")

# Create global instance
groq_service = GroqSummarizationService()
