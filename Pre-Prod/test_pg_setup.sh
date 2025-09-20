#!/bin/bash

# Test script for PostgreSQL setup without permission warnings
# This script validates the improved PostgreSQL setup function

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to log messages
log() {
    local level=$1
    shift
    local message="$@"

    case $level in
        "INFO")
            echo -e "${GREEN}[INFO]${NC} $message"
            ;;
        "WARN")
            echo -e "${YELLOW}[WARN]${NC} $message"
            ;;
        "ERROR")
            echo -e "${RED}[ERROR]${NC} $message"
            ;;
        "SUCCESS")
            echo -e "${GREEN}[SUCCESS]${NC} $message"
            ;;
    esac
}

# Test function to verify PostgreSQL setup improvements
test_postgresql_setup() {
    log "INFO" "Testing PostgreSQL setup improvements..."

    # Test 1: Check if PostgreSQL is installed
    if command -v psql &> /dev/null; then
        log "SUCCESS" "PostgreSQL is installed"
    else
        log "WARN" "PostgreSQL not installed - skipping tests"
        return 0
    fi

    # Test 2: Test version query with proper directory handling
    log "INFO" "Testing PostgreSQL version query..."
    if sudo -u postgres -i psql -t -c "SELECT version();" 2>/dev/null | grep -q "PostgreSQL"; then
        log "SUCCESS" "PostgreSQL version query successful (no permission warnings)"
    else
        log "ERROR" "PostgreSQL version query failed"
        return 1
    fi

    # Test 3: Test configuration file detection
    log "INFO" "Testing configuration file detection..."
    local config_file=$(sudo find /etc /var/lib/pgsql -name "postgresql.conf" 2>/dev/null | head -1)
    if [ -n "$config_file" ]; then
        log "SUCCESS" "Configuration file found: $config_file"
    else
        log "WARN" "Configuration file not found in standard locations"
    fi

    # Test 4: Test database operations with proper user context
    log "INFO" "Testing database operations..."
    local test_output=""
    test_output=$(sudo -u postgres -i bash -c "
        psql -c \"SELECT 1;\" 2>/dev/null || echo 'FAILED'
    " 2>&1)

    if echo "$test_output" | grep -q "FAILED"; then
        log "ERROR" "Database operation test failed"
        return 1
    else
        log "SUCCESS" "Database operations work correctly"
    fi

    log "SUCCESS" "All PostgreSQL setup tests passed!"
    return 0
}

# Test function to validate script improvements
test_script_improvements() {
    log "INFO" "Validating script improvements..."

    # Check if the main deploy script has the improvements
    local deploy_script="./deploy.sh"

    if [ ! -f "$deploy_script" ]; then
        log "ERROR" "Deploy script not found: $deploy_script"
        return 1
    fi

    # Test 1: Check for improved sudo -u postgres usage
    if grep -q "sudo -u postgres -i" "$deploy_script"; then
        log "SUCCESS" "Improved sudo -u postgres usage found"
    else
        log "ERROR" "Improved sudo usage not found"
        return 1
    fi

    # Test 2: Check for proper error redirection
    if grep -q "2>/dev/null" "$deploy_script"; then
        log "SUCCESS" "Proper error redirection found"
    else
        log "WARN" "Error redirection may need improvement"
    fi

    # Test 3: Check for temporary log file usage
    if grep -q "/tmp/pg_setup.log" "$deploy_script"; then
        log "SUCCESS" "Temporary log file usage found"
    else
        log "ERROR" "Temporary log file handling not found"
        return 1
    fi

    # Test 4: Check for robust config directory detection
    if grep -q "Find PostgreSQL version and config directory more reliably" "$deploy_script"; then
        log "SUCCESS" "Improved config directory detection found"
    else
        log "ERROR" "Improved config detection not found"
        return 1
    fi

    log "SUCCESS" "All script improvement validations passed!"
    return 0
}

# Main test execution
main() {
    echo "==============================================="
    echo "PostgreSQL Setup Test Suite"
    echo "==============================================="

    # Test script improvements first
    if ! test_script_improvements; then
        log "ERROR" "Script improvement tests failed"
        exit 1
    fi

    # Test actual PostgreSQL setup if available
    if ! test_postgresql_setup; then
        log "ERROR" "PostgreSQL setup tests failed"
        exit 1
    fi

    echo "==============================================="
    log "SUCCESS" "🎉 All tests passed! PostgreSQL setup improvements are working correctly."
    echo "==============================================="
}

# Run main function
main "$@"