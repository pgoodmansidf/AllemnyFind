#!/usr/bin/env python3
"""
Utility Functions Testing for Allemny Find V2
Test Agent 1 - Utility Testing
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def test_imports():
    """Test that all critical modules can be imported"""
    print("[UTIL] Testing module imports...")

    results = []

    # Test core imports
    modules_to_test = [
        ("app.core.config", "settings"),
        ("app.core.database", "SessionLocal, engine, check_db_connection"),
        ("app.core.security", "security"),
        ("app.models.user", "User, UserRole"),
        ("app.models.prescreen", "PrescreenedUser"),
        ("app.api.auth", "router"),
        ("app.api.search", "router"),
        ("app.api.leaderboard", "router"),
        ("app.api.innovate", "router"),
        ("app.api.chat", "router"),
        ("app.api.metrics", "router"),
    ]

    for module_name, import_items in modules_to_test:
        try:
            exec(f"from {module_name} import {import_items}")
            results.append((f"{module_name}", "PASS"))
            print(f"[UTIL] {module_name}: PASS")
        except Exception as e:
            results.append((f"{module_name}", f"FAIL - {str(e)}"))
            print(f"[UTIL] {module_name}: FAIL - {str(e)}")

    return results

def test_config():
    """Test configuration loading"""
    print("[UTIL] Testing configuration...")

    try:
        from app.core.config import settings

        # Check required settings exist
        required_attrs = [
            'project_name',
            'api_v1_str',
            'database_url',
            'secret_key',
            'access_token_expire_minutes'
        ]

        missing = []
        for attr in required_attrs:
            if not hasattr(settings, attr):
                missing.append(attr)

        if missing:
            print(f"[UTIL] Missing config attributes: {missing}")
            return False
        else:
            print(f"[UTIL] Configuration loaded successfully")
            print(f"[UTIL] Project: {settings.project_name}")
            print(f"[UTIL] API Version: {settings.api_v1_str}")
            return True

    except Exception as e:
        print(f"[UTIL] Configuration test failed: {e}")
        return False

def test_security_functions():
    """Test security utility functions"""
    print("[UTIL] Testing security functions...")

    try:
        from app.core.security import security

        # Test password hashing
        password = "testpassword123"
        hashed = security.get_password_hash(password)

        if not hashed or len(hashed) < 10:
            print("[UTIL] Password hashing failed - hash too short")
            return False

        # Test password verification
        if not security.verify_password(password, hashed):
            print("[UTIL] Password verification failed")
            return False

        # Test wrong password
        if security.verify_password("wrongpassword", hashed):
            print("[UTIL] Password verification incorrectly passed with wrong password")
            return False

        # Test API key generation
        api_key = security.generate_api_key()
        if not api_key or len(api_key) < 10:
            print("[UTIL] API key generation failed")
            return False

        # Test token creation
        token_data = {"sub": "123", "username": "test"}
        token = security.create_access_token(data=token_data)

        if not token:
            print("[UTIL] Token creation failed")
            return False

        # Test token verification
        payload = security.verify_token(token)
        if not payload or payload.get("sub") != "123":
            print("[UTIL] Token verification failed")
            return False

        print("[UTIL] All security functions working correctly")
        return True

    except Exception as e:
        print(f"[UTIL] Security functions test failed: {e}")
        return False

def test_database_utils():
    """Test database utility functions"""
    print("[UTIL] Testing database utilities...")

    try:
        from app.core.database import check_db_connection, SessionLocal

        # Test database connection
        if not check_db_connection():
            print("[UTIL] Database connection failed")
            return False

        # Test session creation
        db = SessionLocal()
        if not db:
            print("[UTIL] Database session creation failed")
            return False

        db.close()
        print("[UTIL] Database utilities working correctly")
        return True

    except Exception as e:
        print(f"[UTIL] Database utilities test failed: {e}")
        return False

def test_model_enums():
    """Test model enums and constants"""
    print("[UTIL] Testing model enums...")

    try:
        from app.models.user import UserRole

        # Test UserRole enum
        roles = [UserRole.STANDARD, UserRole.ADMIN, UserRole.SUPER_ADMIN]
        if len(roles) != 3:
            print("[UTIL] UserRole enum incomplete")
            return False

        # Test string values
        if UserRole.STANDARD != "standard":
            print("[UTIL] UserRole.STANDARD value incorrect")
            return False

        print("[UTIL] Model enums working correctly")
        return True

    except Exception as e:
        print(f"[UTIL] Model enums test failed: {e}")
        return False

def run_utility_tests():
    """Run all utility tests"""
    print("[START] Utility Functions Testing")
    print("=" * 50)

    tests = [
        ("Module Imports", test_imports),
        ("Configuration", test_config),
        ("Security Functions", test_security_functions),
        ("Database Utils", test_database_utils),
        ("Model Enums", test_model_enums)
    ]

    results = []

    for test_name, test_func in tests:
        print(f"\n[TEST] {test_name}")
        try:
            if test_name == "Module Imports":
                # Special handling for imports test which returns detailed results
                import_results = test_func()
                overall_success = all(result[1] == "PASS" for result in import_results)
                results.append((test_name, "PASS" if overall_success else "FAIL"))
            else:
                success = test_func()
                results.append((test_name, "PASS" if success else "FAIL"))
        except Exception as e:
            print(f"[ERROR] {test_name} failed with exception: {e}")
            results.append((test_name, "FAIL"))

    print("\n" + "=" * 50)
    print("[REPORT] Utility Test Results")
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
    run_utility_tests()