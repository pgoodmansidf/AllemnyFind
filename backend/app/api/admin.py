# app/api/admin.py - COMPLETE FIXED VERSION
from typing import List, Optional, Union
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, Field, ConfigDict
import csv
import io
from datetime import datetime

from app.core.database import get_db
from app.core.security import security
from app.models.user import User, UserRole
from app.models.prescreen import PrescreenedUser
from app.api.auth import get_admin_user

router = APIRouter()

class PrescreenedUserResponse(BaseModel):
    id: int
    email: str
    full_name: str
    created_at: datetime
    is_registered: bool
    
    class Config:
        from_attributes = True

class AdminUserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    role: str
    department: Optional[str]
    phone: Optional[str]
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime]
    
    class Config:
        from_attributes = True

class AddPrescreenedUserRequest(BaseModel):
    email: EmailStr
    full_name: str

class UserStatusUpdate(BaseModel):
    is_active: Optional[bool] = Field(default=None)
    role: Optional[str] = Field(default=None)

class PasswordResetRequest(BaseModel):
    user_id: int
    new_password: str

@router.get("/users", response_model=List[AdminUserResponse])
async def get_all_users(
    skip: int = 0,
    limit: int = 100,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Get all users (admin only)"""
    users = db.query(User).offset(skip).limit(limit).all()
    return [
        AdminUserResponse(
            id=user.id,
            username=user.username,
            email=user.email if user.email else user.username,
            full_name=user.full_name if user.full_name else user.username,
            role=user.role if user.role else UserRole.STANDARD,
            department=user.department,
            phone=user.phone,
            is_active=user.is_active,
            created_at=user.created_at,
            last_login=user.last_login
        ) for user in users
    ]

@router.get("/prescreened-users", response_model=List[PrescreenedUserResponse])
async def get_prescreened_users(
    skip: int = 0,
    limit: int = 100,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Get all prescreened users (admin only)"""
    try:
        # Validate pagination parameters
        if skip < 0 or limit <= 0 or limit > 1000:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid pagination parameters"
            )

        prescreened = db.query(PrescreenedUser).offset(skip).limit(limit).all()
        return prescreened
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to retrieve prescreened users"
        )

@router.post("/prescreened-users", response_model=PrescreenedUserResponse)
async def add_prescreened_user(
    request: AddPrescreenedUserRequest,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Add a single prescreened user (admin only)"""
    # Check if already exists
    existing = db.query(PrescreenedUser).filter(
        PrescreenedUser.email == request.email
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already in prescreened list"
        )
    
    prescreened = PrescreenedUser(
        email=request.email,
        full_name=request.full_name,
        created_by=admin_user.id
    )
    
    db.add(prescreened)
    db.commit()
    db.refresh(prescreened)
    
    return prescreened

@router.post("/prescreened-users/bulk-upload")
async def bulk_upload_prescreened(
    file: UploadFile = File(...),
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Bulk upload prescreened users via CSV (admin only)"""
    if not file.filename.endswith('.csv'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please upload a CSV file"
        )
    
    contents = await file.read()
    csv_file = io.StringIO(contents.decode('utf-8'))
    csv_reader = csv.DictReader(csv_file)
    
    added = 0
    skipped = 0
    errors = []
    
    for row in csv_reader:
        try:
            email = row.get('email', '').strip()
            full_name = row.get('full_name', '').strip()
            
            if not email or not full_name:
                errors.append(f"Missing data in row: {row}")
                continue
            
            # Check if already exists
            existing = db.query(PrescreenedUser).filter(
                PrescreenedUser.email == email
            ).first()
            
            if existing:
                skipped += 1
                continue
            
            prescreened = PrescreenedUser(
                email=email,
                full_name=full_name,
                created_by=admin_user.id
            )
            
            db.add(prescreened)
            added += 1
            
        except Exception as e:
            errors.append(f"Error processing row {row}: {str(e)}")
    
    db.commit()
    
    return {
        "success": True,
        "added": added,
        "skipped": skipped,
        "errors": errors,
        "message": f"Successfully added {added} users, skipped {skipped} duplicates"
    }

@router.delete("/prescreened-users/{user_id}")
async def delete_prescreened_user(
    user_id: int,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Delete a prescreened user (admin only)"""
    prescreened = db.query(PrescreenedUser).filter(
        PrescreenedUser.id == user_id
    ).first()
    
    if not prescreened:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prescreened user not found"
        )
    
    if prescreened.is_registered:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete - user has already registered"
        )
    
    db.delete(prescreened)
    db.commit()
    
    return {"message": "Prescreened user deleted successfully"}

@router.put("/users/{user_id}/status", response_model=AdminUserResponse)
async def update_user_status(
    user_id: int,
    update_data: UserStatusUpdate,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Update user status and role (admin only)"""
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent admin from modifying super admin
    if user.role == UserRole.SUPER_ADMIN and admin_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify super admin user"
        )
    
    if update_data.is_active is not None:
        user.is_active = update_data.is_active
    
    if update_data.role:
        # Validate role string
        if update_data.role not in [UserRole.STANDARD, UserRole.ADMIN, UserRole.SUPER_ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid role. Must be 'standard', 'admin', or 'super_admin'"
            )
        
        # Only super admin can assign super admin role
        if update_data.role == UserRole.SUPER_ADMIN and admin_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only super admin can assign super admin role"
            )
        user.role = update_data.role
    
    user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    
    return AdminUserResponse(
        id=user.id,
        username=user.username,
        email=user.email if user.email else user.username,
        full_name=user.full_name if user.full_name else user.username,
        role=user.role if user.role else UserRole.STANDARD,
        department=user.department,
        phone=user.phone,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login=user.last_login
    )

@router.post("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: int,
    request: PasswordResetRequest,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Reset user password (admin only)"""
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent admin from resetting super admin password
    if user.role == UserRole.SUPER_ADMIN and admin_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot reset super admin password"
        )
    
    user.hashed_password = security.get_password_hash(request.new_password)
    user.updated_at = datetime.utcnow()
    db.commit()
    
    return {"message": "Password reset successfully"}

@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    admin_user: User = Depends(get_admin_user),
    db: Session = Depends(get_db)
):
    """Delete a user (admin only)"""
    user = db.query(User).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Prevent deletion of super admin
    if user.role == UserRole.SUPER_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot delete super admin user"
        )
    
    # Prevent self-deletion
    if user.id == admin_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own account"
        )
    
    db.delete(user)
    db.commit()
    
    return {"message": "User deleted successfully"}