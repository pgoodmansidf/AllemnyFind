# app/api/auth.py - COMPLETE FIXED VERSION
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr, validator
from app.core.database import get_db
from app.core.security import security
from app.models.user import User, UserRole
from app.models.prescreen import PrescreenedUser

router = APIRouter()
bearer_scheme = HTTPBearer()

class EmailCheckRequest(BaseModel):
    email: EmailStr

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    confirm_password: str

class UserLogin(BaseModel):
    username: str  # This will be the email
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    expires_in: int
    user_role: str

class UserResponse(BaseModel):
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

class UserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    department: Optional[str] = None
    phone: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get user by email"""
    return db.query(User).filter(User.email == email).first()

def get_user_by_username(db: Session, username: str) -> Optional[User]:
    """Get user by username"""
    return db.query(User).filter(User.username == username).first()

def get_user_by_id(db: Session, user_id: int) -> Optional[User]:
    """Get user by ID"""
    return db.query(User).filter(User.id == user_id).first()

def check_prescreened_user(db: Session, email: str) -> Optional[PrescreenedUser]:
    """Check if email is in prescreened users"""
    return db.query(PrescreenedUser).filter(PrescreenedUser.email == email).first()

def create_user_from_prescreen(db: Session, user_create: UserCreate) -> User:
    """Create new user after prescreen validation with optimized transaction handling"""
    try:
        # Check if email is prescreened with explicit query optimization
        prescreened = db.query(PrescreenedUser).filter(
            PrescreenedUser.email == user_create.email.lower().strip()
        ).first()

        if not prescreened:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your email is not authorized. Please contact IT at allemny@sidf.gov.sa"
            )

        # Check if user already exists with efficient query
        existing_user = db.query(User).filter(
            (User.email == user_create.email) | (User.username == user_create.email)
        ).first()

        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User already registered"
            )

        # Validate password confirmation
        if user_create.password != user_create.confirm_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Passwords do not match"
            )

        # Create user with email as username
        hashed_password = security.get_password_hash(user_create.password)
        db_user = User(
            username=user_create.email,  # Using email as username
            email=user_create.email,
            hashed_password=hashed_password,
            full_name=prescreened.full_name,
            role=UserRole.STANDARD,  # String constant
            api_key=security.generate_api_key()
        )

        # Mark prescreened user as registered
        prescreened.is_registered = True

        # Use explicit transaction management
        db.add(db_user)
        db.flush()  # Flush to get the ID without committing

        # Commit the transaction
        db.commit()

        # Refresh to get all database-generated values
        db.refresh(db_user)

        return db_user

    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"User creation failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="User creation failed due to database error"
        )

def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    """Authenticate user credentials with optimized queries"""
    try:
        # Optimize query with specific conditions
        user = db.query(User).filter(
            ((User.username == username) | (User.email == username)),
            User.is_active == True
        ).first()

        if not user:
            return None

        if not security.verify_password(password, user.hashed_password):
            return None

        # Update last login with separate transaction to avoid locks
        try:
            user.last_login = datetime.utcnow()
            db.commit()
        except Exception as e:
            logger.warning(f"Failed to update last login for user {user.id}: {e}")
            db.rollback()
            # Don't fail authentication if last_login update fails

        return user

    except Exception as e:
        logger.error(f"Authentication error: {e}")
        db.rollback()
        return None

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db)
) -> User:
    """Get current authenticated user with optimized database queries"""
    try:
        # Check if credentials are present
        if not credentials:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="No authentication credentials provided",
                headers={"WWW-Authenticate": "Bearer"},
            )

        token = credentials.credentials

        # Verify token
        payload = security.verify_token(token)

        if payload is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_id_str = payload.get("sub")

        if user_id_str is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials - no user ID",
            )

        # Convert user_id to int
        try:
            user_id = int(user_id_str)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid user ID format",
            )

        # Optimized user query with explicit conditions
        user = db.query(User).filter(
            User.id == user_id,
            User.is_active == True
        ).first()

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found or inactive",
            )

        return user

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Authentication error: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication service temporarily unavailable"
        )

def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """Verify user is admin"""
    if current_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user

@router.post("/check-email")
async def check_email(
    request: EmailCheckRequest,
    db: Session = Depends(get_db)
):
    """Check if email is prescreened with enhanced validation"""
    try:
        email = request.email.lower().strip()  # Normalize email

        # Enhanced domain validation
        if not email or len(email) > 254:  # RFC 5321 limit
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid email format"
            )

        # Check for suspicious patterns
        if ".." in email or email.startswith(".") or email.endswith("."):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid email format"
            )

        prescreened = check_prescreened_user(db, email)

        if not prescreened:
            # More specific error based on domain
            domain = email.split("@")[-1] if "@" in email else ""
            if domain and not domain.endswith(".gov.sa"):
                return {
                    "authorized": False,
                    "message": "Only official government emails (.gov.sa) are authorized. Please contact IT at allemny@sidf.gov.sa"
                }
            else:
                return {
                    "authorized": False,
                    "message": "Your email is not authorized. Please contact IT at allemny@sidf.gov.sa"
                }

        # Check if already registered
        existing = get_user_by_email(db, email)
        if existing:
            return {
                "authorized": True,
                "already_registered": True,
                "message": "This email is already registered. Please login."
            }

        return {
            "authorized": True,
            "already_registered": False,
            "full_name": prescreened.full_name,
            "message": "Email verified. Please create your password."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Email validation service temporarily unavailable"
        )

@router.post("/register", response_model=UserResponse)
async def register(
    email: EmailStr = Form(...),
    password: str = Form(...),
    confirm_password: str = Form(...),
    db: Session = Depends(get_db)
):
    """Register new user with prescreen check"""
    try:
        user_data = UserCreate(
            email=email,
            password=password,
            confirm_password=confirm_password
        )
        
        user = create_user_from_prescreen(db, user_data)
        
        # Return user response with role as string
        return UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            role=user.role if user.role else UserRole.STANDARD,
            department=user.department,
            phone=user.phone,
            is_active=user.is_active,
            created_at=user.created_at,
            last_login=user.last_login
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

@router.post("/login", response_model=Token)
async def login(
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    """User login with email as username"""
    user = authenticate_user(db, username, password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=security.access_token_expire_minutes)
    access_token = security.create_access_token(
        data={"sub": str(user.id), "username": user.username},
        expires_delta=access_token_expires
    )
    
    return Token(
        access_token=access_token,
        token_type="bearer",
        expires_in=security.access_token_expire_minutes * 60,
        user_role=user.role if user.role else UserRole.STANDARD
    )

@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user information"""
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email if current_user.email else current_user.username,
        full_name=current_user.full_name if current_user.full_name else current_user.username,
        role=current_user.role if current_user.role else UserRole.STANDARD,
        department=current_user.department,
        phone=current_user.phone,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
        last_login=current_user.last_login
    )

@router.put("/profile", response_model=UserResponse)
async def update_profile(
    update_data: UserUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user profile"""
    # Update basic info
    if update_data.full_name:
        current_user.full_name = update_data.full_name
    if update_data.department:
        current_user.department = update_data.department
    if update_data.phone:
        current_user.phone = update_data.phone
    
    # Update password if provided
    if update_data.current_password and update_data.new_password:
        if not security.verify_password(update_data.current_password, current_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect"
            )
        current_user.hashed_password = security.get_password_hash(update_data.new_password)
    
    current_user.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(current_user)
    
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email if current_user.email else current_user.username,
        full_name=current_user.full_name if current_user.full_name else current_user.username,
        role=current_user.role if current_user.role else UserRole.STANDARD,
        department=current_user.department,
        phone=current_user.phone,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
        last_login=current_user.last_login
    )

@router.post("/logout")
async def logout(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    current_user: User = Depends(get_current_user)
):
    """User logout with token blacklist"""
    try:
        # Blacklist the current token
        token = credentials.credentials
        security.blacklist_token(token)

        return {"message": "Successfully logged out"}
    except Exception as e:
        # Even if blacklisting fails, return success for UX
        return {"message": "Successfully logged out"}

