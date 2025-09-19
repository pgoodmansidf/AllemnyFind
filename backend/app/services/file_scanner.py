import os
import logging
from pathlib import Path
from typing import List, Dict, Any, Generator, Optional
import fnmatch
from datetime import datetime, timezone # Import timezone
import hashlib
import mimetypes
import time
from collections import defaultdict

from app.core.config import settings

logger = logging.getLogger(__name__)

class FileScanner:
    """Service for scanning and discovering files in local and network locations"""
    
    def __init__(self):
        self.supported_extensions = {
            '.txt', '.rtf', '.csv',  # Text formats
            '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',  # Microsoft Office
            '.odt', '.ods',  # Open Document
            '.pdf',  # PDF
            '.html', '.htm', '.xml',  # Web formats
            '.eml',  # Email
            '.png', '.jpg', '.jpeg', '.gif', '.bmp'  # Images
        }
        self.max_file_size = settings.max_file_size
        self.scan_stats = defaultdict(int)
    
    def scan_directory(self, 
                      directory_path: str, 
                      recursive: bool = True,
                      include_patterns: List[str] = None,
                      exclude_patterns: List[str] = None,
                      max_files: int = None) -> Dict[str, Any]:
        """
        Scan a directory for supported document files
        """
        start_time = time.time()
        
        try:
            directory_path = Path(directory_path)
            
            if not directory_path.exists():
                raise FileNotFoundError(f"Directory not found: {directory_path}")
            
            if not directory_path.is_dir():
                raise ValueError(f"Path is not a directory: {directory_path}")
            
            logger.info(f"Starting directory scan: {directory_path}")
            
            # Reset stats
            self.scan_stats.clear()
            
            # Collect files
            files_found = []
            
            if recursive:
                file_generator = directory_path.rglob('*')
            else:
                file_generator = directory_path.glob('*')
            
            for file_path in file_generator:
                if not file_path.is_file():
                    continue
                
                # Check if we've hit the file limit
                if max_files and len(files_found) >= max_files:
                    self.scan_stats['limit_reached'] = True
                    break
                
                # Apply filters
                if not self._should_include_file(file_path, include_patterns, exclude_patterns):
                    self.scan_stats['filtered_out'] += 1
                    continue
                
                # Process file
                file_info = self._process_file(file_path)
                if file_info:
                    files_found.append(file_info)
                    self.scan_stats['files_found'] += 1
                else:
                    self.scan_stats['files_skipped'] += 1
            
            end_time = time.time()
            scan_duration = end_time - start_time
            
            # Organize results
            result = {
                'scan_info': {
                    'directory': str(directory_path.absolute()),
                    'recursive': recursive,
                    'include_patterns': include_patterns or [],
                    'exclude_patterns': exclude_patterns or [],
                    'max_files': max_files,
                    'scan_duration': scan_duration,
                    'scanned_at': datetime.utcnow()
                },
                'statistics': dict(self.scan_stats),
                'files': files_found,
                'total_files': len(files_found),
                'total_size': sum(f['size'] for f in files_found),
                'file_types': self._analyze_file_types(files_found),
                'success': True
            }
            
            logger.info(f"Scan completed: {len(files_found)} files found in {scan_duration:.2f}s")
            return result
            
        except Exception as e:
            logger.error(f"Error scanning directory {directory_path}: {e}")
            return {
                'scan_info': {
                    'directory': str(directory_path) if 'directory_path' in locals() else directory_path,
                    'error': str(e),
                    'scanned_at': datetime.utcnow()
                },
                'statistics': dict(self.scan_stats),
                'files': [],
                'total_files': 0,
                'total_size': 0,
                'file_types': {},
                'success': False
            }
    
    def _should_include_file(self, 
                           file_path: Path,
                           include_patterns: List[str] = None,
                           exclude_patterns: List[str] = None) -> bool:
        """Check if file should be included based on patterns and extension"""
        
        filename = file_path.name

        # Skip temporary files (e.g., ~$document.docx, .tmp files, etc.)
        if (filename.startswith('~$') or 
            filename.startswith('.~') or 
            filename.endswith('.tmp') or
            filename.endswith('.temp') or
            filename.startswith('.')):
            self.scan_stats['temp_files_skipped'] += 1
            return False

        # Check file extension
        if file_path.suffix.lower() not in self.supported_extensions:
            self.scan_stats['unsupported_extensions'] += 1
            return False
        
        # Check file size
        try:
            file_size = file_path.stat().st_size
            if file_size == 0:
                self.scan_stats['empty_files'] += 1
                return False
            if file_size > self.max_file_size:
                self.scan_stats['oversized_files'] += 1
                return False
        except OSError as e:
            logger.warning(f"Cannot access file {file_path}: {e}")
            self.scan_stats['access_errors'] += 1
            return False
        
        # Apply exclude patterns first
        if exclude_patterns:
            for pattern in exclude_patterns:
                if fnmatch.fnmatch(filename.lower(), pattern.lower()):
                    self.scan_stats['pattern_excluded'] += 1
                    return False
        
        # Apply include patterns
        if include_patterns:
            for pattern in include_patterns:
                if fnmatch.fnmatch(filename.lower(), pattern.lower()):
                    return True
            self.scan_stats['pattern_not_included'] += 1
            return False
        
        return True
    
    def _process_file(self, file_path: Path) -> Optional[Dict[str, Any]]:
        """Extract basic information about a file"""
        try:
            file_stats = file_path.stat()
            mime_type, _ = mimetypes.guess_type(str(file_path))
            
            # Generate file hash (based on path and modification time for speed)
            hash_input = f"{file_path.absolute()}:{file_stats.st_mtime}:{file_stats.st_size}"
            file_hash = hashlib.md5(hash_input.encode()).hexdigest()
            
            # Additional validation for Office files
            if file_path.suffix.lower() in ['.docx', '.xlsx', '.pptx']:
                try:
                    # Try to verify it's a valid zip file (Office files are zip archives)
                    import zipfile
                    with zipfile.ZipFile(file_path, 'r') as zip_ref:
                        # Just try to list files to verify it's a valid zip
                        zip_ref.namelist()
                except (zipfile.BadZipFile, zipfile.LargeZipFile) as e:
                    logger.warning(f"Invalid Office file {file_path}: {e}")
                    self.scan_stats['corrupted_files'] += 1
                    return None
            
            file_info = {
                'path': str(file_path.absolute()),
                'filename': file_path.name,
                'stem': file_path.stem,
                'extension': file_path.suffix.lower(),
                'size': file_stats.st_size,
                'size_formatted': self._format_file_size(file_stats.st_size),
                # Changed keys to match document_worker.py's expectations
                'creation_time': datetime.fromtimestamp(file_stats.st_ctime, tz=timezone.utc), # Ensure timezone awareness
                'modification_time': datetime.fromtimestamp(file_stats.st_mtime, tz=timezone.utc), # Ensure timezone awareness
                'mime_type': mime_type,
                'file_hash': file_hash,
                'relative_path': str(file_path.relative_to(file_path.parents[len(file_path.parents)-1])) if len(file_path.parents) > 0 else file_path.name,
                'directory': str(file_path.parent),
                'accessible': True
            }
            
            return file_info
            
        except Exception as e:
            logger.warning(f"Error processing file {file_path}: {e}")
            self.scan_stats['processing_errors'] += 1
            return None
    
    def _analyze_file_types(self, files: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze file types distribution"""
        type_stats = defaultdict(lambda: {'count': 0, 'total_size': 0})
        
        for file_info in files:
            extension = file_info['extension']
            type_stats[extension]['count'] += 1
            type_stats[extension]['total_size'] += file_info['size']
        
        # Convert to regular dict and add formatted sizes
        result = {}
        for ext, stats in type_stats.items():
            result[ext] = {
                'count': stats['count'],
                'total_size': stats['total_size'],
                'total_size_formatted': self._format_file_size(stats['total_size']),
                'percentage': round((stats['count'] / len(files)) * 100, 1) if files else 0
            }
        
        return result
    
    def _format_file_size(self, size_bytes: int) -> str:
        """Format file size in human readable format"""
        if size_bytes == 0:
            return "0 B"
        
        size_names = ["B", "KB", "MB", "GB", "TB"]
        import math
        i = int(math.floor(math.log(size_bytes, 1024)))
        p = math.pow(1024, i)
        s = round(size_bytes / p, 2)
        return f"{s} {size_names[i]}"
    
    def validate_path(self, path: str) -> Dict[str, Any]:
        """
        Validate if a path is accessible and contains supported files
        """
        try:
            path_obj = Path(path)
            
            validation_result = {
                'path': str(path_obj.absolute()),
                'exists': path_obj.exists(),
                'is_directory': path_obj.is_dir() if path_obj.exists() else False,
                'is_file': path_obj.is_file() if path_obj.exists() else False,
                'accessible': False,
                'supported_files_preview': [],
                'estimated_file_count': 0,
                'validation_time': datetime.utcnow(),
                'success': False
            }
            
            if not path_obj.exists():
                validation_result['error'] = 'Path does not exist'
                return validation_result
            
            # Test accessibility
            try:
                list(path_obj.iterdir())
                validation_result['accessible'] = True
            except PermissionError:
                validation_result['error'] = 'Permission denied'
                return validation_result
            except Exception as e:
                validation_result['error'] = f'Access error: {str(e)}'
                return validation_result
            
            # Quick preview scan (first 10 supported files)
            preview_files = []
            file_count = 0
            
            for file_path in path_obj.rglob('*'):
                if file_path.is_file():
                    file_count += 1
                    
                    if (file_path.suffix.lower() in self.supported_extensions and 
                        not file_path.name.startswith('~$') and
                        len(preview_files) < 10):
                        try:
                            preview_files.append({
                                'filename': file_path.name,
                                'extension': file_path.suffix.lower(),
                                'size': file_path.stat().st_size,
                                'size_formatted': self._format_file_size(file_path.stat().st_size)
                            })
                        except Exception:
                            continue
            
            validation_result['supported_files_preview'] = preview_files
            validation_result['estimated_file_count'] = file_count
            validation_result['has_supported_files'] = len(preview_files) > 0
            validation_result['success'] = True
            
            return validation_result
            
        except Exception as e:
            logger.error(f"Error validating path {path}: {e}")
            return {
                'path': path,
                'exists': False,
                'accessible': False,
                'error': str(e),
                'success': False,
                'validation_time': datetime.utcnow()
            }
    
    def get_directory_tree(self, path: str, max_depth: int = 3) -> Dict[str, Any]:
        """
        Get a directory tree structure for UI display
        """
        try:
            root_path = Path(path)
            
            if not root_path.exists() or not root_path.is_dir():
                raise ValueError(f"Invalid directory path: {path}")
            
            def build_tree(current_path: Path, current_depth: int = 0) -> Dict[str, Any]:
                tree_node = {
                    'name': current_path.name or str(current_path),
                    'path': str(current_path.absolute()),
                    'type': 'directory',
                    'children': [],
                    'file_count': 0,
                    'supported_file_count': 0
                }
                
                if current_depth >= max_depth:
                    return tree_node
                
                try:
                    for child in sorted(current_path.iterdir()):
                        if child.is_dir() and not child.name.startswith('.'):
                            child_tree = build_tree(child, current_depth + 1)
                            tree_node['children'].append(child_tree)
                            tree_node['file_count'] += child_tree['file_count']
                            tree_node['supported_file_count'] += child_tree['supported_file_count']
                        elif child.is_file() and not child.name.startswith('~$'):
                            tree_node['file_count'] += 1
                            if child.suffix.lower() in self.supported_extensions:
                                tree_node['supported_file_count'] += 1
                
                except PermissionError:
                    tree_node['error'] = 'Permission denied'
                except Exception as e:
                    tree_node['error'] = str(e)
                
                return tree_node
            
            tree = build_tree(root_path)
            tree['success'] = True
            tree['generated_at'] = datetime.utcnow()
            
            return tree
            
        except Exception as e:
            logger.error(f"Error building directory tree: {e}")
            return {
                'name': path,
                'path': path,
                'type': 'directory',
                'children': [],
                'file_count': 0,
                'supported_file_count': 0,
                'error': str(e),
                'success': False,
                'generated_at': datetime.utcnow()
            }

# Create global instance
file_scanner = FileScanner()
