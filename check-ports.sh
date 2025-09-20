#!/bin/bash

# Port conflict detection script for Allemny Find V2
# This script checks for existing services and sets environment variables to avoid conflicts

echo "🔍 Checking for port conflicts..."

# Function to check if a port is in use
check_port() {
    local port=$1
    local service_name=$2

    if netstat -tuln 2>/dev/null | grep -q ":$port " || ss -tuln 2>/dev/null | grep -q ":$port "; then
        echo "⚠️  Port $port is already in use (may be existing $service_name)"
        return 1
    else
        echo "✅ Port $port is available"
        return 0
    fi
}

# Function to find next available port
find_available_port() {
    local start_port=$1
    local max_attempts=100
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        local test_port=$((start_port + attempt))
        if ! netstat -tuln 2>/dev/null | grep -q ":$test_port " && ! ss -tuln 2>/dev/null | grep -q ":$test_port "; then
            echo $test_port
            return 0
        fi
        attempt=$((attempt + 1))
    done

    echo $start_port  # fallback to original port
    return 1
}

# Check PostgreSQL port (5432)
echo "Checking PostgreSQL port..."
if check_port 5432 "PostgreSQL"; then
    POSTGRES_HOST_PORT=5432
else
    POSTGRES_HOST_PORT=$(find_available_port 5433)
    echo "📍 Will use port $POSTGRES_HOST_PORT for PostgreSQL container"
fi

# Check Redis port (6379)
echo "Checking Redis port..."
if check_port 6379 "Redis"; then
    REDIS_HOST_PORT=6379
else
    REDIS_HOST_PORT=$(find_available_port 6380)
    echo "📍 Will use port $REDIS_HOST_PORT for Redis container"
fi

# Check Backend port (8000)
echo "Checking Backend port..."
if check_port 8000 "Backend service"; then
    BACKEND_HOST_PORT=8000
else
    BACKEND_HOST_PORT=$(find_available_port 8001)
    echo "📍 Will use port $BACKEND_HOST_PORT for Backend container"
fi

# Check Frontend port (3001)
echo "Checking Frontend port..."
if check_port 3001 "Frontend service"; then
    FRONTEND_HOST_PORT=3001
else
    FRONTEND_HOST_PORT=$(find_available_port 3002)
    echo "📍 Will use port $FRONTEND_HOST_PORT for Frontend container"
fi

# Create/update .env file with port mappings
echo "📝 Creating .env file with port configurations..."
cat > .env << EOF
# Auto-generated port configuration to avoid conflicts
# Generated on $(date)

POSTGRES_HOST_PORT=$POSTGRES_HOST_PORT
REDIS_HOST_PORT=$REDIS_HOST_PORT
BACKEND_HOST_PORT=$BACKEND_HOST_PORT
FRONTEND_HOST_PORT=$FRONTEND_HOST_PORT

# Database configuration
DB_PASSWORD=AFbqSrE?h8bPjSCs9#

# API Keys
GROQ_API_KEY=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
SECRET_KEY=allemny-find-super-secret-key-change-in-production-2024
EOF

echo ""
echo "🎯 Port Configuration Summary:"
echo "   PostgreSQL: localhost:$POSTGRES_HOST_PORT → container:5432"
echo "   Redis:      localhost:$REDIS_HOST_PORT → container:6379"
echo "   Backend:    localhost:$BACKEND_HOST_PORT → container:8000"
echo "   Frontend:   localhost:$FRONTEND_HOST_PORT → container:3001"
echo ""
echo "💡 Run 'docker-compose up' to start with these port mappings"
echo "   The .env file has been created with the optimal port configuration"