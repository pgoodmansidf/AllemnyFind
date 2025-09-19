# diagnostic_check.py
# Run this script to see what chunks are in your database

from sqlalchemy import create_engine, text
from app.core.database import SessionLocal
from app.models.document import Document, DocumentChunk
from app.core.config import settings

def check_database_chunks():
    """Check what chunks are stored in the database"""
    db = SessionLocal()
    
    try:
        print("=" * 80)
        print("DATABASE DIAGNOSTIC CHECK")
        print("=" * 80)
        
        # 1. Check total documents
        total_docs = db.query(Document).count()
        print(f"\nTotal Documents: {total_docs}")
        
        # 2. Check documents with tables
        docs_with_tables = db.query(Document).filter(Document.has_tables == True).count()
        print(f"Documents with Tables: {docs_with_tables}")
        
        # 3. Check chunk types distribution
        print("\n--- Chunk Type Distribution ---")
        chunk_types = db.query(
            DocumentChunk.chunk_type,
            func.count(DocumentChunk.id).label('count')
        ).group_by(DocumentChunk.chunk_type).all()
        
        for chunk_type, count in chunk_types:
            print(f"  {chunk_type}: {count}")
        
        # 4. Check table-specific chunks
        print("\n--- Table Chunks ---")
        table_chunks = db.query(DocumentChunk).filter(
            DocumentChunk.is_table == True
        ).count()
        print(f"  Chunks marked as tables (is_table=True): {table_chunks}")
        
        # 5. Check chunks with 'table' in chunk_type
        print("\n--- Chunks with 'table' in type ---")
        table_type_chunks = db.query(DocumentChunk).filter(
            DocumentChunk.chunk_type.like('%table%')
        ).all()
        
        for chunk in table_type_chunks[:5]:  # Show first 5
            print(f"  ID: {chunk.id}")
            print(f"  Type: {chunk.chunk_type}")
            print(f"  Table Name: {chunk.table_name}")
            print(f"  Content Preview: {chunk.content[:100]}...")
            print("  ---")
        
        # 6. Search for AAC-related chunks
        print("\n--- AAC-related Chunks ---")
        aac_chunks = db.query(DocumentChunk).filter(
            func.lower(DocumentChunk.content).contains('aac')
        ).limit(5).all()
        
        for chunk in aac_chunks:
            print(f"  Type: {chunk.chunk_type}")
            print(f"  Is Table: {chunk.is_table}")
            print(f"  Content Preview: {chunk.content[:100]}...")
            print("  ---")
        
        # 7. Check specific search for properties
        print("\n--- Searching for 'properties' keyword ---")
        properties_chunks = db.query(DocumentChunk).filter(
            func.lower(DocumentChunk.content).contains('properties')
        ).limit(5).all()
        
        for chunk in properties_chunks:
            print(f"  Type: {chunk.chunk_type}")
            print(f"  Content Preview: {chunk.content[:100]}...")
            print("  ---")
        
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        db.close()

if __name__ == "__main__":
    from sqlalchemy import func
    check_database_chunks()