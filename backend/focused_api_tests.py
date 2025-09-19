#!/usr/bin/env python3
"""
Focused API Testing - Testing specific endpoints one by one
"""

import requests
import json

BASE_URL = "http://localhost:8000"
API_V1 = "/api/v1"

def test_health():
    """Test health endpoint"""
    print("[TEST] Health endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/health", timeout=10)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_root():
    """Test root endpoint"""
    print("[TEST] Root endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/", timeout=10)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_admin_login():
    """Test admin login"""
    print("[TEST] Admin login...")
    try:
        data = {"username": "admin", "password": "admin123"}
        response = requests.post(f"{BASE_URL}{API_V1}/auth/login", data=data, timeout=10)
        print(f"Status: {response.status_code}")
        if response.content:
            try:
                print(f"Response: {response.json()}")
            except:
                print(f"Response text: {response.text}")
        else:
            print("Empty response")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_user_registration():
    """Test user registration"""
    print("[TEST] User registration...")
    try:
        data = {
            "email": "test@test.com",
            "password": "testpass123",
            "confirm_password": "testpass123"
        }
        response = requests.post(f"{BASE_URL}{API_V1}/auth/register", data=data, timeout=10)
        print(f"Status: {response.status_code}")
        if response.content:
            try:
                print(f"Response: {response.json()}")
            except:
                print(f"Response text: {response.text}")
        else:
            print("Empty response")
        return response.status_code in [200, 201, 400]  # 400 might be expected if user exists
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_docs_endpoint():
    """Test docs endpoint"""
    print("[TEST] Docs endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/docs", timeout=10)
        print(f"Status: {response.status_code}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

def main():
    print("=" * 50)
    print("FOCUSED API TESTING")
    print("=" * 50)

    tests = [
        ("Health Endpoint", test_health),
        ("Root Endpoint", test_root),
        ("Docs Endpoint", test_docs_endpoint),
        ("Admin Login", test_admin_login),
        ("User Registration", test_user_registration)
    ]

    results = []
    for test_name, test_func in tests:
        print(f"\n{test_name}:")
        print("-" * 30)
        success = test_func()
        results.append((test_name, "PASS" if success else "FAIL"))
        print()

    print("=" * 50)
    print("RESULTS SUMMARY")
    print("=" * 50)
    for test_name, status in results:
        print(f"{status}: {test_name}")

if __name__ == "__main__":
    main()