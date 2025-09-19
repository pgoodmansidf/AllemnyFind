import logging
import os
from pathlib import Path
from typing import Dict, Any, Optional
import docx
import PyPDF2
import pandas as pd
from datetime import datetime

logger = logging.getLogger(__name__)

class DocumentProcessor:
    """Service for extracting content from various document types"""
    
    def __init__(self):
        self.supported_types = {
            '.docx': self._extract_docx,
            '.doc': self._extract_doc,
            '.pdf': self._extract_pdf,
            '.txt': self._extract_txt,
            '.csv': self._extract_csv,
            '.xlsx': self._extract_xlsx,
            '.xls': self._extract_xls,
        }
    
    def extract_content(self, file_path: str, mime_type: str = None) -> Dict[str, Any]:
        """
        Extract content from a document file
        
        Args:
            file_path: Path to the document file
            mime_type: MIME type of the file (optional)
            
        Returns:
            Dictionary containing extracted content and metadata
        """
        try:
            file_path = Path(file_path)
            
            if not file_path.exists():
                raise FileNotFoundError(f"File not found: {file_path}")
            
            file_extension = file_path.suffix.lower()
            
            if file_extension not in self.supported_types:
                raise ValueError(f"Unsupported file type: {file_extension}")
            
            logger.info(f"Extracting content from {file_extension} file: {file_path.name}")
            
            # Call the appropriate extraction method
            extractor = self.supported_types[file_extension]
            result = extractor(file_path)
            
            # Add common metadata
            file_stats = file_path.stat()
            result.update({
                'file_path': str(file_path),
                'file_name': file_path.name,
                'file_size': file_stats.st_size,
                'extracted_at': datetime.now(),
                'file_extension': file_extension,
                'mime_type': mime_type
            })
            
            logger.info(f"Successfully extracted {len(result.get('content', ''))} characters from {file_path.name}")
            return result
            
        except Exception as e:
            logger.error(f"Error extracting content from {file_path}: {e}")
            raise
    
    def _extract_docx(self, file_path: Path) -> Dict[str, Any]:
        """Extract content from DOCX files"""
        try:
            doc = docx.Document(file_path)
            
            # Extract text from paragraphs
            paragraphs = []
            for paragraph in doc.paragraphs:
                if paragraph.text.strip():
                    paragraphs.append(paragraph.text.strip())
            
            content = '\n\n'.join(paragraphs)
            
            # Extract basic properties
            props = doc.core_properties
            title = props.title or file_path.stem
            author = props.author or None
            
            return {
                'content': content,
                'title': title,
                'author': author,
                'paragraph_count': len(paragraphs),
                'word_count': len(content.split()) if content else 0
            }
            
        except Exception as e:
            logger.error(f"Error extracting DOCX content: {e}")
            raise ValueError(f"Failed to extract DOCX content: {e}")
    
    def _extract_doc(self, file_path: Path) -> Dict[str, Any]:
        """Extract content from DOC files (legacy format)"""
        try:
            # Try to read as text (basic fallback)
            with open(file_path, 'rb') as file:
                content = file.read().decode('utf-8', errors='ignore')
                # Clean up the content (DOC files have a lot of binary data)
                content = ''.join(char for char in content if char.isprintable() or char in '\n\r\t')
                
            return {
                'content': content,
                'title': file_path.stem,
                'author': None,
                'extraction_method': 'binary_fallback'
            }
        except Exception as e:
            logger.error(f"Error extracting DOC content: {e}")
            raise ValueError(f"Failed to extract DOC content: {e}")
    
    def _extract_pdf(self, file_path: Path) -> Dict[str, Any]:
        """Extract content from PDF files"""
        try:
            content = []
            
            with open(file_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                
                for page_num, page in enumerate(pdf_reader.pages):
                    try:
                        page_text = page.extract_text()
                        if page_text.strip():
                            content.append(page_text.strip())
                    except Exception as e:
                        logger.warning(f"Error extracting page {page_num}: {e}")
                        continue
            
            full_content = '\n\n'.join(content)
            
            # Try to get metadata
            metadata = pdf_reader.metadata or {}
            title = metadata.get('/Title') or file_path.stem
            author = metadata.get('/Author')
            
            return {
                'content': full_content,
                'title': title,
                'author': author,
                'page_count': len(pdf_reader.pages),
                'word_count': len(full_content.split()) if full_content else 0
            }
            
        except Exception as e:
            logger.error(f"Error extracting PDF content: {e}")
            raise ValueError(f"Failed to extract PDF content: {e}")
    
    def _extract_txt(self, file_path: Path) -> Dict[str, Any]:
        """Extract content from TXT files"""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as file:
                content = file.read()
            
            return {
                'content': content,
                'title': file_path.stem,
                'author': None,
                'line_count': len(content.splitlines()),
                'word_count': len(content.split()) if content else 0
            }
            
        except Exception as e:
            logger.error(f"Error extracting TXT content: {e}")
            raise ValueError(f"Failed to extract TXT content: {e}")
    
    def _extract_csv(self, file_path: Path) -> Dict[str, Any]:
        """Extract content from CSV files"""
        try:
            df = pd.read_csv(file_path)
            
            # Convert DataFrame to text representation
            content = df.to_string(index=False)
            
            return {
                'content': content,
                'title': file_path.stem,
                'author': None,
                'row_count': len(df),
                'column_count': len(df.columns),
                'columns': list(df.columns)
            }
            
        except Exception as e:
            logger.error(f"Error extracting CSV content: {e}")
            raise ValueError(f"Failed to extract CSV content: {e}")
    
    def _extract_xlsx(self, file_path: Path) -> Dict[str, Any]:
        """Extract content from XLSX files"""
        try:
            # Read all sheets
            excel_file = pd.ExcelFile(file_path)
            content_parts = []
            
            for sheet_name in excel_file.sheet_names:
                df = pd.read_excel(file_path, sheet_name=sheet_name)
                sheet_content = f"Sheet: {sheet_name}\n{df.to_string(index=False)}"
                content_parts.append(sheet_content)
            
            content = '\n\n'.join(content_parts)
            
            return {
                'content': content,
                'title': file_path.stem,
                'author': None,
                'sheet_count': len(excel_file.sheet_names),
                'sheets': excel_file.sheet_names
            }
            
        except Exception as e:
            logger.error(f"Error extracting XLSX content: {e}")
            raise ValueError(f"Failed to extract XLSX content: {e}")
    
    def _extract_xls(self, file_path: Path) -> Dict[str, Any]:
        """Extract content from XLS files (legacy Excel format)"""
        return self._extract_xlsx(file_path)  # pandas handles both formats

# Create global instance
document_processor = DocumentProcessor()