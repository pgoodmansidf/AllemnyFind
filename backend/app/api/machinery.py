# app/api/machinery.py - Complete updated file with streaming comparison

import logging
import csv
import io
import re
import json
import asyncio
from datetime import datetime, date
from typing import List, Optional, Dict, Any, AsyncGenerator, Tuple
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Query, Body
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func, text
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from app.core.database import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.machinery import Machinery
from app.services.machinery_service import MachineryService
from app.core.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# Pydantic models
class MachinerySearchRequest(BaseModel):
    query: str
    filters: Optional[Dict[str, Any]] = None
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)

class MachineryResponse(BaseModel):
    id: str
    sector: Optional[str]
    project_name: Optional[str]
    sau_number: Optional[str]
    description: str
    manufacturer: Optional[str]
    origin: Optional[str]
    cost: Optional[float]
    cost_index: Optional[float]
    unit_of_measure: Optional[str]
    unit: Optional[str]
    production_year: Optional[int]
    last_update: Optional[str]
    sau_numbers: List[str]
    similarity_score: Optional[float] = None
    highlighted_sau: Optional[List[str]] = None

class MachinerySpecRequest(BaseModel):
    machinery_id: str
    description: str
    manufacturer: Optional[str]

class AdminUploadResponse(BaseModel):
    success: bool
    total_records: int
    imported: int
    errors: List[str]

# Initialize service
def get_machinery_service(db: Session) -> MachineryService:
    return MachineryService(settings.groq_api_key, db)

# Search endpoint with product detection
@router.post("/machinery_search")
async def search_machinery(
    request: MachinerySearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Hybrid search for machinery with product detection and intelligent suggestions"""
    try:
        service = get_machinery_service(db)
        
        # Use the new search_machinery method that includes product detection
        results, search_message = await service.search_machinery(
            query=request.query,
            limit=request.limit,
            offset=request.offset,
            filters=request.filters
        )
        
        # Extract SAU numbers for highlighting
        sau_pattern = r'(SAU|APP)[\s#-]?(\d+)'
        sau_matches = re.findall(sau_pattern, request.query.upper())
        
        # Format results with uppercase conversion and SAU highlighting
        formatted_results = []
        for result in results:
            # Convert to uppercase where needed
            machinery_data = {
                "id": result.get('id'),
                "sector": result.get('sector').upper() if result.get('sector') else None,
                "project_name": result.get('project_name').upper() if result.get('project_name') else None,
                "sau_number": result.get('sau_number').upper() if result.get('sau_number') else None,
                "description": result.get('description').upper() if result.get('description') else "",
                "manufacturer": result.get('manufacturer').upper() if result.get('manufacturer') else None,
                "origin": result.get('origin').upper() if result.get('origin') else None,
                "cost": result.get('cost'),
                "cost_index": result.get('cost_index'),
                "unit_of_measure": result.get('unit_of_measure').upper() if result.get('unit_of_measure') else None,
                "unit": result.get('unit').upper() if result.get('unit') else None,
                "production_year": result.get('production_year'),
                "last_update": result.get('last_update'),
                "sau_numbers": result.get('sau_numbers', []),
                "similarity_score": result.get('similarity_score')
            }
            
            # Highlight matching SAU numbers
            if sau_matches and machinery_data["sau_numbers"]:
                highlighted = []
                for sau in machinery_data["sau_numbers"]:
                    for match in sau_matches:
                        if f"{match[0]}{match[1]}" in sau.upper():
                            highlighted.append(sau)
                            break
                machinery_data["highlighted_sau"] = highlighted
            
            formatted_results.append(machinery_data)
        
        # Find related machinery by SAU numbers
        related_machinery = {}
        for result in formatted_results[:10]:  # Limit to first 10 results for performance
            if result["sau_numbers"]:
                for sau in result["sau_numbers"][:2]:  # Limit SAUs per result
                    related = await service.find_by_sau_number(sau, exclude_id=result["id"])
                    if related:
                        related_machinery[sau] = [
                            {
                                "id": str(r.id),
                                "description": r.description.upper(),
                                "manufacturer": r.manufacturer.upper() if r.manufacturer else None
                            }
                            for r in related[:3]
                        ]
        
        return {
            "results": formatted_results,
            "total": len(formatted_results),
            "related_machinery": related_machinery,
            "query": request.query,
            "search_message": search_message,  # Include the search message for product-based searches
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error searching machinery: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/specifications")
async def get_specifications(
    request: MachinerySpecRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate detailed specifications for machinery using AI"""
    try:
        service = get_machinery_service(db)
        
        specifications = await service.generate_specifications(
            description=request.description,
            manufacturer=request.manufacturer
        )
        
        return specifications
        
    except Exception as e:
        logger.error(f"Error generating specifications: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/related/{machinery_id}")
async def get_related_machinery(
    machinery_id: str,
    limit: int = Query(5, ge=1, le=20),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get related machinery items based on similarity"""
    try:
        service = get_machinery_service(db)
        
        related = await service.get_related_machinery(
            machinery_id=machinery_id,
            limit=limit
        )
        
        return {
            "related": related,
            "count": len(related),
            "machinery_id": machinery_id
        }
        
    except Exception as e:
        logger.error(f"Error getting related machinery: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/compare")
async def compare_equipment(
    request: Dict[str, Any] = Body(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate AI-powered comparison analysis for selected machinery"""
    try:
        machinery_items = request.get('machinery_items', [])
        
        if len(machinery_items) < 2:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least 2 items required for comparison"
            )
        
        # Generate comparison prompt - MODIFIED FOR SPECIFIC REQUIREMENTS
        prompt = f"""You are an industrial equipment expert. Analyze and compare the following machinery:

"""
        for idx, item in enumerate(machinery_items, 1):
            prompt += f"""
Machine {idx}:
- Description: {item.get('description', 'N/A')}
- Manufacturer: {item.get('manufacturer', 'N/A')}
- Origin: {item.get('origin', 'N/A')}
- Sector: {item.get('sector', 'N/A')}
"""

        prompt += """

Please provide ONLY the following two sections:

1. EQUIPMENT DESCRIPTION AND APPLICATIONS
   - Explain what this type of equipment does and its primary functions
   - List the specific products it is used to manufacture, process, or package
   - Describe the typical industries and sectors where this equipment is utilized
   - Mention common production processes where this equipment is essential

2. BRAND REPUTATION AND RELIABILITY
   - Compare the manufacturers' overall reputation in the industry (NOT specific to these models)
   - Discuss the general reliability and quality perception of equipment from these manufacturers
   - Consider the countries of origin and their reputation for industrial equipment quality
   - Provide insights on manufacturer support, service networks, and parts availability

Format your response with clear headers. Focus on general manufacturer reputation rather than specific model comparisons. Be concise but informative.
DO NOT include cost analysis, technical specifications, or specific model comparisons."""

        # Call Groq API for analysis
        from groq import Groq
        client = Groq(api_key=settings.groq_api_key)
        
        completion = client.chat.completions.create(
            model=settings.groq_model or "openai/gpt-oss-120b",
            messages=[
                {
                    "role": "system", 
                    "content": "You are an expert in industrial machinery. Provide analysis focusing only on equipment applications and manufacturer reputation."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=1500,
        )
        
        analysis = completion.choices[0].message.content
        
        return {
            "analysis": analysis,
            "comparison_count": len(machinery_items),
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error generating comparison: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

# Admin endpoints
@router.post("/admin/upload")
async def upload_machinery_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload CSV file to replace machinery data"""
    try:
        # Check if user is admin
        if current_user.role != 'admin':
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can upload machinery data"
            )
        
        # Read CSV file
        contents = await file.read()
        
        # Try to decode with UTF-8 BOM handling
        try:
            csv_text = contents.decode('utf-8-sig')
        except:
            csv_text = contents.decode('utf-8')
        
        # Parse CSV with SEMICOLON delimiter
        csv_data = io.StringIO(csv_text)
        reader = csv.DictReader(csv_data, delimiter=';')
        
        # Log the headers we found
        logger.info(f"CSV Headers found: {reader.fieldnames}")
        
        service = get_machinery_service(db)
        
        # Clear existing data
        db.query(Machinery).delete()
        db.commit()
        
        # Import new data
        imported = 0
        errors = []
        
        for row_num, row in enumerate(reader, start=2):
            try:
                # Log the raw row data
                logger.info(f"Processing row {row_num}: {row}")
                
                # Now the row should be properly parsed with semicolon delimiter
                # Just clean up the keys and values
                normalized_row = {}
                for key, value in row.items():
                    if key:
                        # Clean the key - remove spaces and convert to lowercase
                        clean_key = key.strip().lower().replace(' ', '_')
                        # Clean the value
                        normalized_row[clean_key] = value.strip() if value else ''
                
                logger.info(f"Normalized row: {normalized_row}")
                
                # Check if we have essential data
                description = normalized_row.get('description', '').strip()
                if not description:
                    logger.warning(f"Row {row_num}: No description found, skipping")
                    errors.append(f"Row {row_num}: No description found")
                    continue
                
                # Get the primary SAU number
                primary_sau = normalized_row.get('sau_number', '').strip()
                
                # Extract additional SAU numbers from text
                text_to_search = f"{description} {normalized_row.get('project_name', '')} {primary_sau}"
                additional_sau_numbers = service.extract_sau_numbers(text_to_search)
                
                # Combine all SAU numbers
                all_sau_numbers = []
                if primary_sau:
                    all_sau_numbers.append(primary_sau)
                all_sau_numbers.extend([sau for sau in additional_sau_numbers if sau not in all_sau_numbers])
                
                # Parse date
                last_update = None
                date_str = normalized_row.get('last_update', '').strip()
                if date_str:
                    for date_format in ['%d/%m/%Y', '%Y-%m-%d', '%m/%d/%Y', '%Y/%m/%d']:
                        try:
                            last_update = datetime.strptime(date_str, date_format).date()
                            break
                        except:
                            continue
                
                # Parse production year
                production_year = None
                year_str = normalized_row.get('production_year', '').strip()
                if year_str:
                    try:
                        production_year = int(float(year_str))
                    except:
                        pass
                
                # Parse cost
                cost = None
                cost_str = normalized_row.get('cost', '').strip()
                if cost_str:
                    try:
                        cost_str = cost_str.replace(',', '').replace('SAR', '').replace('$', '').strip()
                        cost = float(cost_str) if cost_str else None
                    except:
                        pass
                
                # Parse cost index
                cost_index = None
                cost_index_str = normalized_row.get('cost_index', '').strip()
                if cost_index_str:
                    try:
                        cost_index = float(cost_index_str)
                    except:
                        pass
                
                # Create search text for optimization
                search_text = service.create_search_text({
                    'sector': normalized_row.get('sector', ''),
                    'project_name': normalized_row.get('project_name', ''),
                    'description': description,
                    'manufacturer': normalized_row.get('manufacturer', ''),
                    'origin': normalized_row.get('origin', ''),
                    'unit_of_measure': normalized_row.get('unit_of_measure', ''),
                    'unit': normalized_row.get('unit', ''),
                })
                
                # Create machinery record
                machinery = Machinery(
                    sector=normalized_row.get('sector', '').strip() or None,
                    project_name=normalized_row.get('project_name', '').strip() or None,
                    sau_number=primary_sau or None,
                    description=description,
                    manufacturer=normalized_row.get('manufacturer', '').strip() or None,
                    origin=normalized_row.get('origin', '').strip() or None,
                    cost=cost,
                    cost_index=cost_index,
                    unit_of_measure=normalized_row.get('unit_of_measure', '').strip() or None,
                    unit=normalized_row.get('unit', '').strip() or None,
                    production_year=production_year,
                    last_update=last_update,
                    sau_numbers=all_sau_numbers if all_sau_numbers else None,
                    search_text=search_text,
                    machinery_metadata={
                        'original_row': row_num,
                        'import_date': datetime.utcnow().isoformat()
                    }
                )
                
                db.add(machinery)
                imported += 1
                logger.info(f"Successfully imported row {row_num}: {description[:50]}...")
                
                # Commit in batches
                if imported % 50 == 0:
                    db.commit()
                    logger.info(f"Committed batch - Total imported: {imported}")
                    
            except Exception as e:
                error_msg = f"Row {row_num}: {str(e)}"
                errors.append(error_msg)
                logger.error(f"Error importing row {row_num}: {e}", exc_info=True)
        
        # Final commit
        db.commit()
        logger.info(f"Import complete - Total imported: {imported}, Errors: {len(errors)}")
        
        # Start background task to generate embeddings
        try:
            service.generate_embeddings_batch()
        except Exception as e:
            logger.warning(f"Could not start embedding generation: {e}")
        
        return AdminUploadResponse(
            success=True if imported > 0 else False,
            total_records=imported + len(errors),
            imported=imported,
            errors=errors[:10]  # Return only first 10 errors
        )
        
    except Exception as e:
        logger.error(f"Error uploading CSV: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/admin/list")
async def list_machinery(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get paginated list of machinery"""
    try:
        # Check if user is admin
        if current_user.role != 'admin':
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can view machinery list"
            )
        
        query = db.query(Machinery)
        
        # Apply search filter
        if search:
            search_filter = or_(
                Machinery.description.ilike(f"%{search}%"),
                Machinery.manufacturer.ilike(f"%{search}%"),
                Machinery.sector.ilike(f"%{search}%"),
                Machinery.sau_numbers.any(search.upper())
            )
            query = query.filter(search_filter)
        
        # Get total count
        total = query.count()
        
        # Apply pagination
        offset = (page - 1) * page_size
        machinery_list = query.offset(offset).limit(page_size).all()
        
        # Format results
        results = []
        for item in machinery_list:
            results.append({
                "id": str(item.id),
                "sector": item.sector,
                "project_name": item.project_name,
                "sau_number": item.sau_number,
                "description": item.description,
                "manufacturer": item.manufacturer,
                "origin": item.origin,
                "cost": float(item.cost) if item.cost else None,
                "cost_index": float(item.cost_index) if item.cost_index else None,
                "unit_of_measure": item.unit_of_measure,
                "unit": item.unit,
                "production_year": item.production_year,
                "last_update": item.last_update.isoformat() if item.last_update else None,
                "sau_numbers": item.sau_numbers or [],
                "created_at": item.created_at.isoformat()
            })
        
        return {
            "results": results,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size
            }
        }
        
    except Exception as e:
        logger.error(f"Error listing machinery: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.get("/admin/export")
async def export_machinery_csv(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Export machinery data as CSV"""
    try:
        # Check if user is admin
        if current_user.role != 'admin':
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can export machinery data"
            )
        
        # Get all machinery
        machinery_list = db.query(Machinery).all()
        
        # Create CSV with SEMICOLON delimiter
        output = io.StringIO()
        writer = csv.writer(output, delimiter=';')
        
        # Write header
        writer.writerow([
            'Sector', 'Description', 'Project_Name', 'SAU_Number',
            'Production_Year', 'Manufacturer', 'Origin', 'Cost',
            'Cost Index', 'Unit', 'Unit of Measure', 'Last Update'
        ])
        
        # Write data
        for item in machinery_list:
            writer.writerow([
                item.sector or '',
                item.description or '',
                item.project_name or '',
                item.sau_number or '',
                item.production_year or '',
                item.manufacturer or '',
                item.origin or '',
                item.cost or '',
                item.cost_index or '',
                item.unit or '',
                item.unit_of_measure or '',
                item.last_update.strftime('%d/%m/%Y') if item.last_update else ''
            ])
        
        # Return as downloadable file
        output.seek(0)
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=machinery_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            }
        )
        
    except Exception as e:
        logger.error(f"Error exporting CSV: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.delete("/admin/clear")
async def clear_machinery_table(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Clear all machinery data"""
    try:
        # Check if user is admin
        if current_user.role != 'admin':
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can clear machinery data"
            )
        
        count = db.query(Machinery).count()
        db.query(Machinery).delete()
        db.commit()
        
        return {
            "success": True,
            "deleted_count": count,
            "message": f"Successfully deleted {count} machinery records"
        }
        
    except Exception as e:
        logger.error(f"Error clearing machinery table: {e}")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )

@router.post("/admin/generate-embeddings")
async def generate_embeddings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Generate embeddings for all machinery items"""
    try:
        # Check if user is admin
        if current_user.role != 'admin':
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can generate embeddings"
            )
        
        service = get_machinery_service(db)
        
        # Run embedding generation
        await service.generate_all_embeddings()
        
        return {
            "success": True,
            "message": "Embedding generation started"
        }
        
    except Exception as e:
        logger.error(f"Error generating embeddings: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )