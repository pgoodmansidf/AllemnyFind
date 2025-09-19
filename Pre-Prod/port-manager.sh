#!/bin/bash

# Allemny Find V2 - Dynamic Port Detection and Management
# This script finds available ports for the application services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default ports
DEFAULT_FRONTEND_PORT=3001
DEFAULT_BACKEND_PORT=8002
DEFAULT_DB_PORT=5432
DEFAULT_REDIS_PORT=6379
DEFAULT_OLLAMA_PORT=11434

# Maximum number of ports to try
MAX_PORT_ATTEMPTS=10

# Function to check if a port is available
check_port() {
    local port=$1
    local host=${2:-localhost}

    # Check if port is in use
    if command -v netstat &> /dev/null; then
        # Use netstat if available
        if netstat -tuln 2>/dev/null | grep -q ":$port "; then
            return 1  # Port is in use
        fi
    elif command -v ss &> /dev/null; then
        # Use ss if netstat is not available
        if ss -tuln 2>/dev/null | grep -q ":$port "; then
            return 1  # Port is in use
        fi
    else
        # Fallback: try to connect to the port
        if timeout 1 bash -c "cat < /dev/null > /dev/tcp/$host/$port" 2>/dev/null; then
            return 1  # Port is in use
        fi
    fi

    return 0  # Port is available
}

# Function to find an available port starting from a base port
find_available_port() {
    local base_port=$1
    local service_name=$2
    local current_port=$base_port
    local attempts=0

    echo -e "${BLUE}Finding available port for $service_name (starting from $base_port)...${NC}" >&2

    while [ $attempts -lt $MAX_PORT_ATTEMPTS ]; do
        if check_port $current_port; then
            echo -e "${GREEN}✓ Port $current_port is available for $service_name${NC}" >&2
            echo $current_port
            return 0
        else
            echo -e "${YELLOW}  Port $current_port is in use, trying next...${NC}" >&2
            current_port=$((current_port + 1))
            attempts=$((attempts + 1))
        fi
    done

    echo -e "${RED}✗ Could not find available port for $service_name after $MAX_PORT_ATTEMPTS attempts${NC}" >&2
    return 1
}

# Function to create or update .env file with detected ports
update_env_file() {
    local frontend_port=$1
    local backend_port=$2
    local db_port=$3
    local redis_port=$4
    local ollama_port=$5

    local env_file=".env"

    echo -e "${BLUE}Creating/updating $env_file with detected ports...${NC}"

    # Create .env from template if it doesn't exist
    if [ ! -f "$env_file" ]; then
        if [ -f ".env.template" ]; then
            cp .env.template $env_file
            echo -e "${GREEN}✓ Created $env_file from template${NC}"
        else
            touch $env_file
            echo -e "${YELLOW}✓ Created empty $env_file${NC}"
        fi
    fi

    # Update port configurations
    sed -i "s/^FRONTEND_PORT=.*/FRONTEND_PORT=$frontend_port/" $env_file
    sed -i "s/^BACKEND_PORT=.*/BACKEND_PORT=$backend_port/" $env_file
    sed -i "s/^DB_PORT=.*/DB_PORT=$db_port/" $env_file
    sed -i "s/^REDIS_PORT=.*/REDIS_PORT=$redis_port/" $env_file
    sed -i "s/^OLLAMA_PORT=.*/OLLAMA_PORT=$ollama_port/" $env_file

    # Add lines if they don't exist
    if ! grep -q "^FRONTEND_PORT=" $env_file; then
        echo "FRONTEND_PORT=$frontend_port" >> $env_file
    fi
    if ! grep -q "^BACKEND_PORT=" $env_file; then
        echo "BACKEND_PORT=$backend_port" >> $env_file
    fi
    if ! grep -q "^DB_PORT=" $env_file; then
        echo "DB_PORT=$db_port" >> $env_file
    fi
    if ! grep -q "^REDIS_PORT=" $env_file; then
        echo "REDIS_PORT=$redis_port" >> $env_file
    fi
    if ! grep -q "^OLLAMA_PORT=" $env_file; then
        echo "OLLAMA_PORT=$ollama_port" >> $env_file
    fi

    echo -e "${GREEN}✓ Updated $env_file with detected ports${NC}"
}

# Function to update frontend configuration
update_frontend_config() {
    local frontend_port=$1
    local backend_port=$2

    echo -e "${BLUE}Updating frontend configuration...${NC}"

    local vite_config="../frontend/vite.config.ts"
    if [ -f "$vite_config" ]; then
        # Update Vite config with new ports
        sed -i "s/port: [0-9]*/port: $frontend_port/" $vite_config
        sed -i "s/'http:\/\/localhost:[0-9]*'/'http:\/\/localhost:$backend_port'/g" $vite_config
        echo -e "${GREEN}✓ Updated Vite configuration${NC}"
    fi
}

# Function to update docker-compose ports
update_docker_compose() {
    local frontend_port=$1
    local backend_port=$2
    local db_port=$3
    local redis_port=$4
    local ollama_port=$5

    echo -e "${BLUE}Updating docker-compose.yml with detected ports...${NC}"

    local compose_file="docker-compose.yml"
    if [ -f "$compose_file" ]; then
        # Create a backup
        cp $compose_file "${compose_file}.backup"

        # Update environment variables in docker-compose
        sed -i "s/\${FRONTEND_PORT:-[0-9]*}/\${FRONTEND_PORT:-$frontend_port}/g" $compose_file
        sed -i "s/\${BACKEND_PORT:-[0-9]*}/\${BACKEND_PORT:-$backend_port}/g" $compose_file
        sed -i "s/\${DB_PORT:-[0-9]*}/\${DB_PORT:-$db_port}/g" $compose_file
        sed -i "s/\${REDIS_PORT:-[0-9]*}/\${REDIS_PORT:-$redis_port}/g" $compose_file
        sed -i "s/\${OLLAMA_PORT:-[0-9]*}/\${OLLAMA_PORT:-$ollama_port}/g" $compose_file

        echo -e "${GREEN}✓ Updated docker-compose.yml${NC}"
    fi
}

# Function to display port summary
display_port_summary() {
    local frontend_port=$1
    local backend_port=$2
    local db_port=$3
    local redis_port=$4
    local ollama_port=$5

    echo -e "\n${GREEN}📋 Port Configuration Summary:${NC}"
    echo -e "${GREEN}================================${NC}"
    echo -e "Frontend (Web UI):    http://localhost:$frontend_port"
    echo -e "Backend API:          http://localhost:$backend_port"
    echo -e "PostgreSQL Database:  localhost:$db_port"
    echo -e "Redis Cache:          localhost:$redis_port"
    echo -e "Ollama AI:            http://localhost:$ollama_port"
    echo -e "${GREEN}================================${NC}\n"
}

# Main port detection function
main() {
    echo -e "${BLUE}🚀 Allemny Find V2 - Port Detection & Configuration${NC}"
    echo -e "${BLUE}===================================================${NC}\n"

    # Detect available ports for each service
    frontend_port=$(find_available_port $DEFAULT_FRONTEND_PORT "Frontend")
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to find available port for Frontend${NC}"
        exit 1
    fi

    backend_port=$(find_available_port $DEFAULT_BACKEND_PORT "Backend API")
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to find available port for Backend API${NC}"
        exit 1
    fi

    db_port=$(find_available_port $DEFAULT_DB_PORT "PostgreSQL Database")
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to find available port for PostgreSQL Database${NC}"
        exit 1
    fi

    redis_port=$(find_available_port $DEFAULT_REDIS_PORT "Redis Cache")
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to find available port for Redis Cache${NC}"
        exit 1
    fi

    ollama_port=$(find_available_port $DEFAULT_OLLAMA_PORT "Ollama AI")
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to find available port for Ollama AI${NC}"
        exit 1
    fi

    echo ""

    # Update configuration files
    update_env_file $frontend_port $backend_port $db_port $redis_port $ollama_port
    update_frontend_config $frontend_port $backend_port
    update_docker_compose $frontend_port $backend_port $db_port $redis_port $ollama_port

    # Display summary
    display_port_summary $frontend_port $backend_port $db_port $redis_port $ollama_port

    # Export environment variables for use by other scripts
    export FRONTEND_PORT=$frontend_port
    export BACKEND_PORT=$backend_port
    export DB_PORT=$db_port
    export REDIS_PORT=$redis_port
    export OLLAMA_PORT=$ollama_port

    echo -e "${GREEN}✅ Port detection and configuration completed successfully!${NC}"
    echo -e "${BLUE}You can now start the application with the configured ports.${NC}\n"
}

# Check if script is being sourced or executed
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    # Script is being executed directly
    main "$@"
fi