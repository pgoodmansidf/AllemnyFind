#!/usr/bin/env python3
"""
Setup admin user for testing
"""

from sqlalchemy.orm import Session
from app.core.database import get_db, engine
from app.models.user import User, UserRole
from app.models.prescreen import PrescreenedUser
from app.core.security import security

def create_admin_user():
    # Create database session
    db = next(get_db())

    try:
        # Check if admin already exists
        admin_email = "admin@sidf.gov.sa"
        existing_admin = db.query(User).filter(User.email == admin_email).first()

        if existing_admin:
            print(f"Admin user already exists: {existing_admin.email}")
            print(f"Role: {existing_admin.role}")
            print(f"Active: {existing_admin.is_active}")
            return existing_admin

        # Check if admin is prescreened
        prescreened = db.query(PrescreenedUser).filter(PrescreenedUser.email == admin_email).first()
        if not prescreened:
            # Add to prescreened list
            prescreened = PrescreenedUser(
                email=admin_email,
                full_name="System Administrator",
                created_by=None
            )
            db.add(prescreened)
            db.commit()
            print(f"Added {admin_email} to prescreened list")

        # Create admin user
        hashed_password = security.get_password_hash("AdminPassword123!")
        admin_user = User(
            username=admin_email,
            email=admin_email,
            hashed_password=hashed_password,
            full_name="System Administrator",
            role=UserRole.SUPER_ADMIN,
            is_active=True,
            api_key=security.generate_api_key()
        )

        # Mark as registered
        prescreened.is_registered = True

        db.add(admin_user)
        db.commit()
        db.refresh(admin_user)

        print(f"Created admin user: {admin_user.email}")
        print(f"Role: {admin_user.role}")
        print(f"Active: {admin_user.is_active}")

        return admin_user

    except Exception as e:
        print(f"Error creating admin user: {str(e)}")
        db.rollback()
        return None
    finally:
        db.close()

def list_existing_users():
    db = next(get_db())
    try:
        users = db.query(User).all()
        print(f"\nExisting users ({len(users)}):")
        for user in users:
            print(f"  - {user.email} ({user.role}) - Active: {user.is_active}")

        prescreened = db.query(PrescreenedUser).all()
        print(f"\nPrescreened users ({len(prescreened)}):")
        for user in prescreened:
            print(f"  - {user.email} ({user.full_name}) - Registered: {user.is_registered}")

    except Exception as e:
        print(f"Error listing users: {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    print("Setting up admin user for testing...")
    list_existing_users()
    create_admin_user()
    print("\nFinal user list:")
    list_existing_users()