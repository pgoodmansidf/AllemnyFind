# app/core/fix_users.py - Run this once to fix existing users
from app.core.database import SessionLocal
from app.models.user import User, UserRole

def fix_existing_users():
    """Fix existing users with missing or invalid role data"""
    db = SessionLocal()
    try:
        users = db.query(User).all()
        for user in users:
            # Fix missing role
            if not user.role:
                if user.is_superuser or user.username == "admin":
                    user.role = UserRole.ADMIN
                else:
                    user.role = UserRole.STANDARD
            
            # Fix missing email
            if not user.email:
                user.email = user.username
            
            # Fix missing full_name
            if not user.full_name:
                user.full_name = user.username.title()
        
        db.commit()
        print(f"Fixed {len(users)} users")
    except Exception as e:
        print(f"Error fixing users: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    fix_existing_users()