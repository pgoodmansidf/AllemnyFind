# app/core/admin_setup.py - Robust Admin User Creation
import logging
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from app.core.database import SessionLocal, engine
from app.core.security import security
from app.models.user import User, UserRole
from datetime import datetime

logger = logging.getLogger(__name__)

def create_admin_user(
    username: str = "admin",
    password: str = "admin123",
    email: str = "admin@allemny.com",
    full_name: str = "System Administrator"
) -> bool:
    """
    Create default admin user if it doesn't exist.

    Args:
        username: Admin username (default: "admin")
        password: Admin password (default: "admin123")
        email: Admin email (default: "admin@allemny.com")
        full_name: Admin full name (default: "System Administrator")

    Returns:
        bool: True if admin was created or already exists, False if error occurred
    """

    db: Session = None
    try:
        # Create a new database session
        db = SessionLocal()

        # Check if admin user already exists
        existing_admin = db.query(User).filter(
            (User.username == username) | (User.email == email)
        ).first()

        if existing_admin:
            logger.info(f"Admin user already exists: {existing_admin.username}")
            return True

        # Hash password using the security module (skip validation for admin setup)
        try:
            hashed_password = security.get_password_hash(password, skip_validation=True)
        except Exception as e:
            logger.error(f"Failed to hash admin password: {e}")
            return False

        # Create admin user
        admin_user = User(
            username=username,
            email=email,
            hashed_password=hashed_password,
            full_name=full_name,
            role=UserRole.ADMIN,
            is_active=True,
            is_superuser=True,
            api_key=security.generate_api_key(),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        # Add and commit to database
        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)

        logger.info(f"✅ Default admin user created successfully!")
        logger.info(f"   Username: {username}")
        logger.info(f"   Password: {password}")
        logger.info(f"   Email: {email}")
        logger.info(f"   Role: {admin_user.role}")
        logger.info(f"   User ID: {admin_user.id}")

        return True

    except SQLAlchemyError as e:
        logger.error(f"Database error creating admin user: {e}")
        if db:
            db.rollback()
        return False

    except Exception as e:
        logger.error(f"Unexpected error creating admin user: {e}")
        if db:
            db.rollback()
        return False

    finally:
        if db:
            db.close()

def ensure_admin_exists() -> bool:
    """
    Ensure at least one admin user exists in the system.
    Creates default admin if no admin users are found.

    Returns:
        bool: True if admin exists or was created, False if error occurred
    """

    db: Session = None
    try:
        # Create a new database session
        db = SessionLocal()

        # Check if any admin users exist
        admin_count = db.query(User).filter(
            User.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN])
        ).count()

        if admin_count > 0:
            logger.info(f"Found {admin_count} admin user(s) in system")
            return True

        logger.info("No admin users found. Creating default admin...")
        return create_admin_user()

    except SQLAlchemyError as e:
        logger.error(f"Database error checking admin users: {e}")
        return False

    except Exception as e:
        logger.error(f"Unexpected error checking admin users: {e}")
        return False

    finally:
        if db:
            db.close()

def verify_admin_login(username: str = "admin", password: str = "admin123") -> bool:
    """
    Verify that admin user can login successfully.

    Args:
        username: Admin username to test
        password: Admin password to test

    Returns:
        bool: True if login successful, False otherwise
    """

    db: Session = None
    try:
        # Create a new database session
        db = SessionLocal()

        # Find admin user
        admin_user = db.query(User).filter(
            (User.username == username) | (User.email == username)
        ).first()

        if not admin_user:
            logger.error(f"Admin user not found: {username}")
            return False

        # Verify password
        if not security.verify_password(password, admin_user.hashed_password):
            logger.error("Admin password verification failed")
            return False

        # Verify role
        if admin_user.role not in [UserRole.ADMIN, UserRole.SUPER_ADMIN]:
            logger.error(f"User {username} does not have admin role: {admin_user.role}")
            return False

        # Test JWT token creation
        from datetime import timedelta
        token_data = {"sub": str(admin_user.id), "username": admin_user.username}
        access_token = security.create_access_token(
            data=token_data,
            expires_delta=timedelta(minutes=30)
        )

        if not access_token:
            logger.error("Failed to create JWT token for admin")
            return False

        # Verify token
        payload = security.verify_token(access_token)
        if not payload or payload.get("sub") != str(admin_user.id):
            logger.error("JWT token verification failed for admin")
            return False

        logger.info(f"✅ Admin login verification successful for: {username}")
        logger.info(f"   User ID: {admin_user.id}")
        logger.info(f"   Role: {admin_user.role}")
        logger.info(f"   JWT Token: Generated and verified successfully")

        return True

    except Exception as e:
        logger.error(f"Error verifying admin login: {e}")
        return False

    finally:
        if db:
            db.close()

def get_admin_info() -> dict:
    """
    Get information about admin users in the system.

    Returns:
        dict: Admin users information
    """

    db: Session = None
    try:
        # Create a new database session
        db = SessionLocal()

        # Get all admin users
        admin_users = db.query(User).filter(
            User.role.in_([UserRole.ADMIN, UserRole.SUPER_ADMIN])
        ).all()

        admin_info = {
            "total_admins": len(admin_users),
            "admins": []
        }

        for admin in admin_users:
            admin_info["admins"].append({
                "id": admin.id,
                "username": admin.username,
                "email": admin.email,
                "full_name": admin.full_name,
                "role": admin.role,
                "is_active": admin.is_active,
                "is_superuser": admin.is_superuser,
                "created_at": admin.created_at,
                "last_login": admin.last_login
            })

        return admin_info

    except Exception as e:
        logger.error(f"Error getting admin info: {e}")
        return {"total_admins": 0, "admins": [], "error": str(e)}

    finally:
        if db:
            db.close()