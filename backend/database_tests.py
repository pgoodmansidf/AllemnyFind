#!/usr/bin/env python3
"""
Database Operations Testing for Allemny Find V2
Test Agent 1 - Database Testing
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.orm import Session
from app.core.database import SessionLocal, engine, check_db_connection, init_db
from app.models.user import User, UserRole
from app.models.prescreen import PrescreenedUser
from app.models.document import Document
from app.models.search import SearchQuery
from app.models.stars import DocumentContribution, ContributionLike
from app.models.innovate import Suggestion
from app.core.security import security

def test_database_connection():
    """Test database connection"""
    print("[DB] Testing database connection...")
    try:
        connected = check_db_connection()
        print(f"[DB] Connection status: {'PASS' if connected else 'FAIL'}")
        return connected
    except Exception as e:
        print(f"[DB] Connection failed: {e}")
        return False

def test_basic_queries():
    """Test basic database queries"""
    print("[DB] Testing basic database queries...")

    db = SessionLocal()
    try:
        # Test user count
        user_count = db.query(User).count()
        print(f"[DB] Users in database: {user_count}")

        # Test admin user exists
        admin_user = db.query(User).filter(User.username == "admin").first()
        if admin_user:
            print(f"[DB] Admin user found: {admin_user.username} ({admin_user.role})")
        else:
            print("[DB] Admin user not found")

        # Test prescreened users
        prescreen_count = db.query(PrescreenedUser).count()
        print(f"[DB] Prescreened users: {prescreen_count}")

        # Test documents
        doc_count = db.query(Document).count()
        print(f"[DB] Documents in database: {doc_count}")

        # Test search queries
        search_count = db.query(SearchQuery).count()
        print(f"[DB] Search queries: {search_count}")

        return True

    except Exception as e:
        print(f"[DB] Basic queries failed: {e}")
        return False
    finally:
        db.close()

def setup_test_data():
    """Setup test data for API testing"""
    print("[DB] Setting up test data...")

    db = SessionLocal()
    try:
        # Add test prescreened users for registration testing
        test_emails = [
            ("test@test.com", "Test User"),
            ("apitest@test.com", "API Test User"),
            ("test2@test.com", "Test User 2")
        ]

        for email, full_name in test_emails:
            existing = db.query(PrescreenedUser).filter(PrescreenedUser.email == email).first()
            if not existing:
                prescreen_user = PrescreenedUser(
                    email=email,
                    full_name=full_name,
                    department="Test Department",
                    is_registered=False
                )
                db.add(prescreen_user)
                print(f"[DB] Added prescreened user: {email}")
            else:
                print(f"[DB] Prescreened user already exists: {email}")

        db.commit()
        print("[DB] Test data setup complete")
        return True

    except Exception as e:
        print(f"[DB] Test data setup failed: {e}")
        db.rollback()
        return False
    finally:
        db.close()

def test_user_operations():
    """Test user CRUD operations"""
    print("[DB] Testing user operations...")

    db = SessionLocal()
    try:
        # Test user creation
        test_user_email = "dbtest@test.com"

        # First ensure prescreened user exists
        prescreen_user = db.query(PrescreenedUser).filter(PrescreenedUser.email == test_user_email).first()
        if not prescreen_user:
            prescreen_user = PrescreenedUser(
                email=test_user_email,
                full_name="DB Test User",
                department="Test Department",
                is_registered=False
            )
            db.add(prescreen_user)
            db.commit()

        # Clean up existing test user
        existing_user = db.query(User).filter(User.email == test_user_email).first()
        if existing_user:
            db.delete(existing_user)
            db.commit()

        # Create new test user
        hashed_password = security.get_password_hash("testpass123")
        test_user = User(
            username=test_user_email,
            email=test_user_email,
            hashed_password=hashed_password,
            full_name="DB Test User",
            role=UserRole.STANDARD,
            api_key=security.generate_api_key()
        )

        db.add(test_user)
        db.commit()
        db.refresh(test_user)

        print(f"[DB] Created test user: {test_user.username}")

        # Test user retrieval
        retrieved_user = db.query(User).filter(User.email == test_user_email).first()
        if retrieved_user and retrieved_user.id == test_user.id:
            print("[DB] User retrieval: PASS")
        else:
            print("[DB] User retrieval: FAIL")
            return False

        # Test user update
        retrieved_user.full_name = "Updated DB Test User"
        db.commit()

        updated_user = db.query(User).filter(User.id == test_user.id).first()
        if updated_user.full_name == "Updated DB Test User":
            print("[DB] User update: PASS")
        else:
            print("[DB] User update: FAIL")
            return False

        # Clean up
        db.delete(test_user)
        db.commit()
        print("[DB] Test user cleanup complete")

        return True

    except Exception as e:
        print(f"[DB] User operations failed: {e}")
        db.rollback()
        return False
    finally:
        db.close()

def test_auth_functionality():
    """Test authentication functionality"""
    print("[DB] Testing authentication functionality...")

    try:
        # Test password hashing
        password = "testpassword123"
        hashed = security.get_password_hash(password)

        if security.verify_password(password, hashed):
            print("[DB] Password hashing: PASS")
        else:
            print("[DB] Password hashing: FAIL")
            return False

        # Test API key generation
        api_key = security.generate_api_key()
        if api_key and len(api_key) > 0:
            print("[DB] API key generation: PASS")
        else:
            print("[DB] API key generation: FAIL")
            return False

        # Test token creation
        token_data = {"sub": "123", "username": "test"}
        token = security.create_access_token(data=token_data)

        if token:
            print("[DB] Token creation: PASS")

            # Test token verification
            payload = security.verify_token(token)
            if payload and payload.get("sub") == "123":
                print("[DB] Token verification: PASS")
            else:
                print("[DB] Token verification: FAIL")
                return False
        else:
            print("[DB] Token creation: FAIL")
            return False

        return True

    except Exception as e:
        print(f"[DB] Authentication functionality failed: {e}")
        return False

def run_database_tests():
    """Run all database tests"""
    print("[START] Database Operations Testing")
    print("=" * 50)

    tests = [
        ("Database Connection", test_database_connection),
        ("Basic Queries", test_basic_queries),
        ("Test Data Setup", setup_test_data),
        ("User Operations", test_user_operations),
        ("Auth Functionality", test_auth_functionality)
    ]

    results = []

    for test_name, test_func in tests:
        print(f"\n[TEST] {test_name}")
        try:
            success = test_func()
            results.append((test_name, "PASS" if success else "FAIL"))
        except Exception as e:
            print(f"[ERROR] {test_name} failed with exception: {e}")
            results.append((test_name, "FAIL"))

    print("\n" + "=" * 50)
    print("[REPORT] Database Test Results")
    print("=" * 50)

    passed = 0
    total = len(results)

    for test_name, status in results:
        status_prefix = "[PASS]" if status == "PASS" else "[FAIL]"
        print(f"{status_prefix} {test_name}")
        if status == "PASS":
            passed += 1

    success_rate = (passed / total * 100) if total > 0 else 0
    print(f"\nSuccess Rate: {success_rate:.1f}% ({passed}/{total})")

    return results

if __name__ == "__main__":
    run_database_tests()