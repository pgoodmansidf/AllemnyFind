# app/api/machinery.py - Complete updated file with streaming comparison

import logging
import csv
import io
import re
import json
import asyncio
from datetime import datetime, date
from typing import List, Optional, Dict, Any, AsyncGenerator
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

# Search endpoint
@router.post("/machinery_search")
async def search_machinery(
    request: MachinerySearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Hybrid search for machinery using vector similarity and keyword matching"""
    try:
        service = get_machinery_service(db)
        
        # Extract SAU numbers from query
        sau_pattern = r'(SAU|APP)[\s#-]?(\d+)'
        sau_matches = re.findall(sau_pattern, request.query.upper())
        
        # Perform hybrid search
        results = await service.hybrid_search(
            query=request.query,
            sau_numbers=[f"{match[0]}{match[1]}" for match in sau_matches],
            limit=request.limit,
            offset=request.offset,
            filters=request.filters
        )
        
        # Format results
        formatted_results = []
        for result in results:
            machinery_data = {
                "id": str(result.id),
                "sector": result.sector.upper() if result.sector else None,
                "project_name": result.project_name.upper() if result.project_name else None,
                "sau_number": result.sau_number.upper() if result.sau_number else None,
                "description": result.description.upper() if result.description else "",
                "manufacturer": result.manufacturer.upper() if result.manufacturer else None,
                "origin": result.origin.upper() if result.origin else None,
                "cost": float(result.cost) if result.cost else None,
                "cost_index": float(result.cost_index) if result.cost_index else None,
                "unit_of_measure": result.unit_of_measure.upper() if result.unit_of_measure else None,
                "unit": result.unit.upper() if result.unit else None,
                "production_year": result.production_year,
                "last_update": result.last_update.isoformat() if result.last_update else None,
                "sau_numbers": result.sau_numbers or [],
                "similarity_score": getattr(result, 'similarity_score', None)
            }
            
            # Highlight matching SAU numbers
            if sau_matches and result.sau_numbers:
                highlighted = []
                for sau in result.sau_numbers:
                    for match in sau_matches:
                        if f"{match[0]}{match[1]}" in sau.upper():
                            highlighted.append(sau)
                            break
                machinery_data["highlighted_sau"] = highlighted
            
            formatted_results.append(machinery_data)
        
        # Find related machinery by SAU numbers
        related_machinery = {}
        for result in formatted_results:
            if result["sau_numbers"]:
                for sau in result["sau_numbers"]:
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
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Error searching machinery: {e}")
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
        
        # Generate comparison prompt
        prompt = f"""You are an industrial equipment expert. Analyze and compare the following machinery:

"""
        for idx, item in enumerate(machinery_items, 1):
            prompt += f"""
Machine {idx}:
- Description: {item.get('description', 'N/A')}
- Manufacturer: {item.get('manufacturer', 'N/A')}
- Origin: {item.get('origin', 'N/A')}
- Cost: {'SAR ' + str(item.get('cost')) if item.get('cost') else 'N/A'}
- Sector: {item.get('sector', 'N/A')}
- Production Year: {item.get('production_year', 'N/A')}
"""

        prompt += """

Please provide:

1. EQUIPMENT OVERVIEW
   Briefly explain what this type of equipment does, its primary functions, and which sectors commonly use it.

2. COMPARATIVE ANALYSIS
   Compare the machines across these dimensions:
   
   a) Quality & Reliability
      - Compare manufacturers' reputations
      - Assess build quality based on origin
      - Consider production year implications
   
   b) Cost-Value Assessment
      - Analyze cost differences
      - Determine value proposition for each
      - Identify best value option
   
   c) Technical Capabilities
      - Compare expected performance
      - Assess technological advancement
      - Identify unique features or advantages
   
   d) Suitability Recommendations
      - Which machine for high-volume operations?
      - Which for budget-conscious buyers?
      - Which for premium quality requirements?

3. RECOMMENDATION SUMMARY
   Provide a clear recommendation on which machine offers the best value for different use cases.

Format your response in clear sections with headers. Be specific and practical in your analysis."""

        # Call Groq API for analysis
        from groq import Groq
        client = Groq(api_key=settings.groq_api_key)
        
        completion = client.chat.completions.create(
            model=settings.groq_model,
            messages=[
                {
                    "role": "system", 
                    "content": "You are an expert in industrial machinery and equipment analysis. Provide detailed, practical comparisons."
                },
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            max_tokens=2000,
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

# Admin endpoints (keeping existing ones)
@router.post("/admin/upload")
async def upload_machinery_csv(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Upload CSV file to replace machinery data"""
    try:
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
                    search_text=' '.join([
                        normalized_row.get('sector', ''),
                        normalized_row.get('project_name', ''),
                        description,
                        normalized_row.get('manufacturer', ''),
                        normalized_row.get('origin', ''),
                        primary_sau
                    ]).lower(),
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
        
        return AdminUploadResponse(
            success=True if imported > 0 else False,
            total_records=imported + len(errors),
            imported=imported,
            errors=errors[:10]
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