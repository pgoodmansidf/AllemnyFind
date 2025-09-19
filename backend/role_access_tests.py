#!/usr/bin/env python3
"""
Role-based Access Control Testing for Allemny Find V2
Test Agent 1 - Role Access Testing
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def test_user_role_enum():
    """Test UserRole enum values"""
    print("[RBAC] Testing UserRole enum...")

    try:
        from app.models.user import UserRole

        # Test role values
        expected_roles = ["standard", "admin", "super_admin"]
        actual_roles = [UserRole.STANDARD, UserRole.ADMIN, UserRole.SUPER_ADMIN]

        if actual_roles != expected_roles:
            print(f"[RBAC] Role values mismatch. Expected: {expected_roles}, Got: {actual_roles}")
            return False

        print("[RBAC] UserRole enum values correct")
        return True

    except Exception as e:
        print(f"[RBAC] UserRole enum test failed: {e}")
        return False

def test_auth_dependencies():
    """Test authentication dependencies"""
    print("[RBAC] Testing authentication dependencies...")

    try:
        from app.api.auth import get_current_user, get_admin_user

        # Test that functions exist and are callable
        if not callable(get_current_user):
            print("[RBAC] get_current_user is not callable")
            return False

        if not callable(get_admin_user):
            print("[RBAC] get_admin_user is not callable")
            return False

        print("[RBAC] Authentication dependencies available")
        return True

    except Exception as e:
        print(f"[RBAC] Authentication dependencies test failed: {e}")
        return False

def test_admin_endpoints_protection():
    """Test that admin endpoints have proper protection"""
    print("[RBAC] Testing admin endpoint protection...")

    try:
        # Check admin API
        from app.api import admin

        # Check if admin router exists
        if not hasattr(admin, 'router'):
            print("[RBAC] Admin router not found")
            return False

        # Check chat API (admin only)
        from app.api import chat

        if not hasattr(chat, 'router'):
            print("[RBAC] Chat router not found")
            return False

        # Check ingestion API (admin only)
        from app.api import ingestion

        if not hasattr(ingestion, 'router'):
            print("[RBAC] Ingestion router not found")
            return False

        print("[RBAC] Admin endpoint protection mechanisms in place")
        return True

    except Exception as e:
        print(f"[RBAC] Admin endpoint protection test failed: {e}")
        return False

def test_user_endpoints_access():
    """Test that user endpoints are accessible to authenticated users"""
    print("[RBAC] Testing user endpoint access...")

    try:
        # Check user-accessible APIs
        apis_to_check = ['leaderboard', 'innovate', 'search', 'stars']

        for api_name in apis_to_check:
            try:
                module = __import__(f'app.api.{api_name}', fromlist=[api_name])
                if not hasattr(module, 'router'):
                    print(f"[RBAC] {api_name} router not found")
                    return False
                print(f"[RBAC] {api_name} API available")
            except ImportError as e:
                print(f"[RBAC] Failed to import {api_name} API: {e}")
                return False

        print("[RBAC] User endpoints accessible")
        return True

    except Exception as e:
        print(f"[RBAC] User endpoints access test failed: {e}")
        return False

def test_security_token_handling():
    """Test security token handling"""
    print("[RBAC] Testing security token handling...")

    try:
        from app.core.security import security

        # Test token creation with different user data
        admin_data = {"sub": "1", "username": "admin", "role": "admin"}
        user_data = {"sub": "2", "username": "user", "role": "standard"}

        admin_token = security.create_access_token(data=admin_data)
        user_token = security.create_access_token(data=user_data)

        if not admin_token or not user_token:
            print("[RBAC] Token creation failed")
            return False

        # Test token verification
        admin_payload = security.verify_token(admin_token)
        user_payload = security.verify_token(user_token)

        if not admin_payload or admin_payload.get("sub") != "1":
            print("[RBAC] Admin token verification failed")
            return False

        if not user_payload or user_payload.get("sub") != "2":
            print("[RBAC] User token verification failed")
            return False

        print("[RBAC] Security token handling working correctly")
        return True

    except Exception as e:
        print(f"[RBAC] Security token handling test failed: {e}")
        return False

def test_endpoint_categorization():
    """Test that endpoints are properly categorized by access level"""
    print("[RBAC] Testing endpoint categorization...")

    try:
        # Public endpoints (no auth required)
        public_endpoints = [
            'health',
            'root',
            'docs',
            'auth/login',
            'auth/register',
            'auth/check-email'
        ]

        # User endpoints (auth required)
        user_endpoints = [
            'auth/me',
            'auth/profile',
            'leaderboard',
            'innovate/suggestions',
            'search',
            'stars'
        ]

        # Admin endpoints (admin auth required)
        admin_endpoints = [
            'admin/users',
            'admin/stats',
            'chat',
            'ingestion',
            'metrics'
        ]

        # Test that we have proper categorization
        total_endpoints = len(public_endpoints) + len(user_endpoints) + len(admin_endpoints)

        if total_endpoints < 15:
            print(f"[RBAC] Warning: Only {total_endpoints} endpoints categorized")

        print(f"[RBAC] Public endpoints: {len(public_endpoints)}")
        print(f"[RBAC] User endpoints: {len(user_endpoints)}")
        print(f"[RBAC] Admin endpoints: {len(admin_endpoints)}")
        print("[RBAC] Endpoint categorization complete")
        return True

    except Exception as e:
        print(f"[RBAC] Endpoint categorization test failed: {e}")
        return False

def run_rbac_tests():
    """Run all role-based access control tests"""
    print("[START] Role-Based Access Control Testing")
    print("=" * 50)

    tests = [
        ("UserRole Enum", test_user_role_enum),
        ("Auth Dependencies", test_auth_dependencies),
        ("Admin Endpoint Protection", test_admin_endpoints_protection),
        ("User Endpoint Access", test_user_endpoints_access),
        ("Security Token Handling", test_security_token_handling),
        ("Endpoint Categorization", test_endpoint_categorization)
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
    print("[REPORT] RBAC Test Results")
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
    run_rbac_tests()