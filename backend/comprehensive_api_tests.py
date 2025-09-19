#!/usr/bin/env python3
"""
Comprehensive API Test Suite for Allemny Find V2
Test Agent 1 - Unit Tests and API Testing
"""

import requests
import json
import time
import sys
from typing import Dict, List, Any, Optional
from dataclasses import dataclass

# Test configuration
BASE_URL = "http://localhost:8000"
API_V1 = "/api/v1"

@dataclass
class TestResult:
    endpoint: str
    method: str
    status: str  # PASS, FAIL, SKIP
    status_code: Optional[int] = None
    error_message: Optional[str] = None
    response_data: Optional[Dict] = None
    execution_time: Optional[float] = None

class APITester:
    def __init__(self):
        self.results: List[TestResult] = []
        self.session = requests.Session()
        self.admin_token = None
        self.user_token = None

    def log_result(self, result: TestResult):
        """Log test result"""
        self.results.append(result)
        status_emoji = "[PASS]" if result.status == "PASS" else "[FAIL]" if result.status == "FAIL" else "[SKIP]"
        print(f"{status_emoji} {result.method} {result.endpoint} - {result.status}")
        if result.error_message:
            print(f"   Error: {result.error_message}")
        if result.status_code:
            print(f"   Status Code: {result.status_code}")
        if result.execution_time:
            print(f"   Execution Time: {result.execution_time:.3f}s")
        print()

    def test_endpoint(self, method: str, endpoint: str, data: Dict = None,
                     headers: Dict = None, expected_status: int = 200,
                     description: str = None, use_form: bool = False) -> TestResult:
        """Test a single endpoint"""
        start_time = time.time()
        full_url = f"{BASE_URL}{endpoint}"

        try:
            if method.upper() == "GET":
                response = self.session.get(full_url, headers=headers, timeout=10)
            elif method.upper() == "POST":
                if use_form:
                    response = self.session.post(full_url, data=data, headers=headers, timeout=10)
                else:
                    response = self.session.post(full_url, json=data, headers=headers, timeout=10)
            elif method.upper() == "PUT":
                if use_form:
                    response = self.session.put(full_url, data=data, headers=headers, timeout=10)
                else:
                    response = self.session.put(full_url, json=data, headers=headers, timeout=10)
            elif method.upper() == "DELETE":
                response = self.session.delete(full_url, headers=headers, timeout=10)
            else:
                return TestResult(
                    endpoint=endpoint,
                    method=method,
                    status="FAIL",
                    error_message=f"Unsupported method: {method}"
                )

            execution_time = time.time() - start_time

            # Check status code
            if response.status_code == expected_status:
                try:
                    response_data = response.json() if response.content else {}
                    return TestResult(
                        endpoint=endpoint,
                        method=method,
                        status="PASS",
                        status_code=response.status_code,
                        response_data=response_data,
                        execution_time=execution_time
                    )
                except json.JSONDecodeError:
                    return TestResult(
                        endpoint=endpoint,
                        method=method,
                        status="PASS",
                        status_code=response.status_code,
                        response_data={"text": response.text},
                        execution_time=execution_time
                    )
            else:
                return TestResult(
                    endpoint=endpoint,
                    method=method,
                    status="FAIL",
                    status_code=response.status_code,
                    error_message=f"Expected {expected_status}, got {response.status_code}",
                    execution_time=execution_time
                )

        except requests.exceptions.RequestException as e:
            execution_time = time.time() - start_time
            return TestResult(
                endpoint=endpoint,
                method=method,
                status="FAIL",
                error_message=str(e),
                execution_time=execution_time
            )

    def authenticate(self):
        """Authenticate and get tokens"""
        print("[AUTH] Setting up authentication...")

        # Test admin login
        login_data = {
            "username": "admin",
            "password": "admin123"
        }

        result = self.test_endpoint("POST", f"{API_V1}/auth/login", data=login_data, use_form=True)
        if result.status == "PASS" and result.response_data:
            self.admin_token = result.response_data.get("access_token")
            print(f"[PASS] Admin authentication successful")
        else:
            print(f"[FAIL] Admin authentication failed: {result.error_message}")

        # Try to create test user and authenticate
        test_user_data = {
            "email": "test@test.com",
            "password": "testpass123",
            "confirm_password": "testpass123"
        }

        # Create test user (might fail if already exists)
        create_result = self.test_endpoint("POST", f"{API_V1}/auth/register", data=test_user_data, expected_status=201, use_form=True)

        # Login as test user
        login_data = {
            "username": "test@test.com",
            "password": "testpass123"
        }
        result = self.test_endpoint("POST", f"{API_V1}/auth/login", data=login_data, use_form=True)
        if result.status == "PASS" and result.response_data:
            self.user_token = result.response_data.get("access_token")
            print(f"[PASS] User authentication successful")
        else:
            print(f"[FAIL] User authentication failed: {result.error_message}")

    def get_auth_headers(self, admin: bool = False) -> Dict:
        """Get authorization headers"""
        token = self.admin_token if admin else self.user_token
        if token:
            return {"Authorization": f"Bearer {token}"}
        return {}

    def test_health_endpoint(self):
        """Test health check endpoint"""
        print("[HEALTH] Testing Health Endpoint...")
        result = self.test_endpoint("GET", "/health")
        self.log_result(result)

    def test_auth_endpoints(self):
        """Test authentication endpoints"""
        print("[AUTH] Testing Authentication Endpoints...")

        # Test login endpoint
        login_data = {"username": "admin", "password": "admin123"}
        result = self.test_endpoint("POST", f"{API_V1}/auth/login", data=login_data, use_form=True)
        self.log_result(result)

        # Test register endpoint
        register_data = {
            "email": "apitest@test.com",
            "password": "testpass123",
            "confirm_password": "testpass123"
        }
        result = self.test_endpoint("POST", f"{API_V1}/auth/register", data=register_data, expected_status=201, use_form=True)
        self.log_result(result)

        # Test me endpoint (requires auth)
        headers = self.get_auth_headers(admin=True)
        result = self.test_endpoint("GET", f"{API_V1}/auth/me", headers=headers)
        self.log_result(result)

    def test_metrics_endpoints(self):
        """Test metrics endpoints"""
        print("[METRICS] Testing Metrics Endpoints...")

        headers = self.get_auth_headers(admin=True)

        # Test dashboard metrics
        result = self.test_endpoint("GET", f"{API_V1}/metrics/dashboard", headers=headers)
        self.log_result(result)

        # Test knowledge scope metrics
        result = self.test_endpoint("GET", f"{API_V1}/metrics/knowledgescope", headers=headers)
        self.log_result(result)

        # Test search metrics
        result = self.test_endpoint("GET", f"{API_V1}/metrics/search", headers=headers)
        self.log_result(result)

    def test_leaderboard_endpoints(self):
        """Test leaderboard endpoints"""
        print("[LEADERBOARD] Testing Leaderboard Endpoints...")

        headers = self.get_auth_headers()

        # Test leaderboard main
        result = self.test_endpoint("GET", f"{API_V1}/leaderboard", headers=headers)
        self.log_result(result)

        # Test leaderboard stats
        result = self.test_endpoint("GET", f"{API_V1}/leaderboard/stats", headers=headers)
        self.log_result(result)

        # Test departments
        result = self.test_endpoint("GET", f"{API_V1}/leaderboard/departments", headers=headers)
        self.log_result(result)

        # Test my rank
        result = self.test_endpoint("GET", f"{API_V1}/leaderboard/my-rank", headers=headers)
        self.log_result(result)

    def test_innovate_endpoints(self):
        """Test innovate endpoints"""
        print("[INNOVATE] Testing Innovate Endpoints...")

        headers = self.get_auth_headers()
        admin_headers = self.get_auth_headers(admin=True)

        # Test get suggestions
        result = self.test_endpoint("GET", f"{API_V1}/innovate/suggestions", headers=headers)
        self.log_result(result)

        # Test create suggestion
        suggestion_data = {
            "title": "Test API Suggestion",
            "description": "This is a test suggestion created by API test",
            "category": "feature"
        }
        result = self.test_endpoint("POST", f"{API_V1}/innovate/suggestions", data=suggestion_data, headers=headers, expected_status=201)
        self.log_result(result)
        suggestion_id = result.response_data.get("id") if result.response_data else None

        if suggestion_id:
            # Test vote on suggestion
            vote_data = {"vote_type": "up"}
            result = self.test_endpoint("POST", f"{API_V1}/innovate/suggestions/{suggestion_id}/vote", data=vote_data, headers=headers)
            self.log_result(result)

            # Test get suggestion by ID
            result = self.test_endpoint("GET", f"{API_V1}/innovate/suggestions/{suggestion_id}", headers=headers)
            self.log_result(result)

            # Test admin endpoints
            if admin_headers:
                # Test accept suggestion (admin only)
                result = self.test_endpoint("POST", f"{API_V1}/innovate/suggestions/{suggestion_id}/accept", headers=admin_headers)
                self.log_result(result)

        # Test categories
        result = self.test_endpoint("GET", f"{API_V1}/innovate/categories", headers=headers)
        self.log_result(result)

        # Test stats
        result = self.test_endpoint("GET", f"{API_V1}/innovate/stats", headers=headers)
        self.log_result(result)

    def test_chat_endpoints(self):
        """Test chat endpoints"""
        print("[CHAT] Testing Chat Endpoints...")

        admin_headers = self.get_auth_headers(admin=True)

        if not admin_headers:
            print("[SKIP] Skipping chat tests - admin authentication required")
            return

        # Test chat endpoint
        chat_data = {
            "message": "What information do you have about testing?",
            "conversation_id": "test_conversation_123"
        }
        result = self.test_endpoint("POST", f"{API_V1}/chat", data=chat_data, headers=admin_headers)
        self.log_result(result)

        # Test chat history
        result = self.test_endpoint("GET", f"{API_V1}/chat/history", headers=admin_headers)
        self.log_result(result)

        # Test conversation history
        result = self.test_endpoint("GET", f"{API_V1}/chat/conversations/test_conversation_123", headers=admin_headers)
        self.log_result(result)

        # Test clear conversation
        result = self.test_endpoint("DELETE", f"{API_V1}/chat/conversations/test_conversation_123", headers=admin_headers)
        self.log_result(result)

        # Test health check
        result = self.test_endpoint("GET", f"{API_V1}/chat/health", headers=admin_headers)
        self.log_result(result)

    def test_search_endpoints(self):
        """Test search endpoints"""
        print("[SEARCH] Testing Search Endpoints...")

        headers = self.get_auth_headers()

        # Test search
        search_data = {
            "query": "test query",
            "user_id": 1,
            "max_results": 10
        }
        result = self.test_endpoint("POST", f"{API_V1}/search", data=search_data, headers=headers)
        self.log_result(result)

        # Test search history
        result = self.test_endpoint("GET", f"{API_V1}/search/history", headers=headers)
        self.log_result(result)

    def test_ingestion_endpoints(self):
        """Test ingestion endpoints"""
        print("[INGESTION] Testing Ingestion Endpoints...")

        admin_headers = self.get_auth_headers(admin=True)

        if not admin_headers:
            print("[SKIP] Skipping ingestion tests - admin authentication required")
            return

        # Test ingestion status
        result = self.test_endpoint("GET", f"{API_V1}/ingestion/status", headers=admin_headers)
        self.log_result(result)

        # Test Redis endpoints
        result = self.test_endpoint("GET", f"{API_V1}/ingestion/redis/status", headers=admin_headers)
        self.log_result(result)

        result = self.test_endpoint("GET", f"{API_V1}/ingestion/redis/info", headers=admin_headers)
        self.log_result(result)

        result = self.test_endpoint("GET", f"{API_V1}/ingestion/redis/keys", headers=admin_headers)
        self.log_result(result)

    def test_admin_endpoints(self):
        """Test admin endpoints"""
        print("[ADMIN] Testing Admin Endpoints...")

        admin_headers = self.get_auth_headers(admin=True)

        if not admin_headers:
            print("[SKIP] Skipping admin tests - admin authentication required")
            return

        # Test get users
        result = self.test_endpoint("GET", f"{API_V1}/admin/users", headers=admin_headers)
        self.log_result(result)

        # Test system stats
        result = self.test_endpoint("GET", f"{API_V1}/admin/stats", headers=admin_headers)
        self.log_result(result)

    def test_stars_endpoints(self):
        """Test stars endpoints"""
        print("[STARS] Testing Stars Endpoints...")

        headers = self.get_auth_headers()

        # Test get starred documents
        result = self.test_endpoint("GET", f"{API_V1}/stars", headers=headers)
        self.log_result(result)

    def test_other_endpoints(self):
        """Test other miscellaneous endpoints"""
        print("[OTHER] Testing Other Endpoints...")

        headers = self.get_auth_headers()

        # Test summarization
        result = self.test_endpoint("GET", f"{API_V1}/summarization/status", headers=headers)
        self.log_result(result)

        # Test smartmatch
        result = self.test_endpoint("GET", f"{API_V1}/smartmatch/status", headers=headers)
        self.log_result(result)

        # Test machinery
        result = self.test_endpoint("GET", f"{API_V1}/machinery/status", headers=headers)
        self.log_result(result)

        # Test knowledgescope
        result = self.test_endpoint("GET", f"{API_V1}/knowledgescope", headers=headers)
        self.log_result(result)

    def run_all_tests(self):
        """Run all API tests"""
        print("[START] Starting Comprehensive API Testing...")
        print("=" * 60)

        # Setup
        self.authenticate()
        print()

        # Run all test suites
        self.test_health_endpoint()
        self.test_auth_endpoints()
        self.test_metrics_endpoints()
        self.test_leaderboard_endpoints()
        self.test_innovate_endpoints()
        self.test_chat_endpoints()
        self.test_search_endpoints()
        self.test_ingestion_endpoints()
        self.test_admin_endpoints()
        self.test_stars_endpoints()
        self.test_other_endpoints()

        # Generate report
        self.generate_report()

    def generate_report(self):
        """Generate test report"""
        print("=" * 60)
        print("[REPORT] TEST RESULTS SUMMARY")
        print("=" * 60)

        total_tests = len(self.results)
        passed_tests = len([r for r in self.results if r.status == "PASS"])
        failed_tests = len([r for r in self.results if r.status == "FAIL"])
        skipped_tests = len([r for r in self.results if r.status == "SKIP"])

        print(f"Total Tests: {total_tests}")
        print(f"[PASS] Passed: {passed_tests}")
        print(f"[FAIL] Failed: {failed_tests}")
        print(f"[SKIP] Skipped: {skipped_tests}")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%" if total_tests > 0 else "No tests run")
        print()

        if failed_tests > 0:
            print("[FAIL] FAILED TESTS:")
            for result in self.results:
                if result.status == "FAIL":
                    print(f"  • {result.method} {result.endpoint}: {result.error_message}")
            print()

        # Performance summary
        execution_times = [r.execution_time for r in self.results if r.execution_time]
        if execution_times:
            avg_time = sum(execution_times) / len(execution_times)
            max_time = max(execution_times)
            print(f"[PERFORMANCE] PERFORMANCE:")
            print(f"  Average Response Time: {avg_time:.3f}s")
            print(f"  Slowest Response: {max_time:.3f}s")
            print()

        # Endpoint coverage
        print("[COVERAGE] ENDPOINT COVERAGE:")
        endpoints_tested = set(r.endpoint for r in self.results)
        print(f"  Unique Endpoints Tested: {len(endpoints_tested)}")
        print()

        return {
            "total_tests": total_tests,
            "passed": passed_tests,
            "failed": failed_tests,
            "skipped": skipped_tests,
            "success_rate": (passed_tests/total_tests*100) if total_tests > 0 else 0,
            "failed_tests": [r for r in self.results if r.status == "FAIL"],
            "performance": {
                "avg_time": sum(execution_times) / len(execution_times) if execution_times else 0,
                "max_time": max(execution_times) if execution_times else 0
            }
        }

if __name__ == "__main__":
    tester = APITester()
    tester.run_all_tests()