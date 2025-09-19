#!/bin/bash

# Allemny Find V2 - Health Check and Monitoring Script
# This script monitors the health of all application services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
LOG_FILE="$SCRIPT_DIR/health-check.log"
ALERT_THRESHOLD=3  # Number of consecutive failures before alert
STATUS_FILE="$SCRIPT_DIR/.health_status"

# Load environment variables
if [ -f "$ENV_FILE" ]; then
    source "$ENV_FILE"
else
    echo -e "${RED}Error: .env file not found at $ENV_FILE${NC}"
    exit 1
fi

# Default ports if not set in .env
FRONTEND_PORT=${FRONTEND_PORT:-3001}
BACKEND_PORT=${BACKEND_PORT:-8002}
DB_PORT=${DB_PORT:-5432}
REDIS_PORT=${REDIS_PORT:-6379}
OLLAMA_PORT=${OLLAMA_PORT:-11434}

# Logging function
log() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local message="$1"
    echo "[$timestamp] $message" >> "$LOG_FILE"
    if [ "${2:-}" = "console" ]; then
        echo -e "$message"
    fi
}

# Function to check if a port is responding
check_port() {
    local host=$1
    local port=$2
    local timeout=${3:-5}

    if timeout $timeout bash -c "cat < /dev/null > /dev/tcp/$host/$port" 2>/dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to check HTTP endpoint
check_http() {
    local url=$1
    local expected_status=${2:-200}
    local timeout=${3:-10}

    local response=$(curl -s -o /dev/null -w "%{http_code}" --max-time $timeout "$url" 2>/dev/null || echo "000")

    if [ "$response" = "$expected_status" ]; then
        return 0
    else
        return 1
    fi
}

# Function to check Docker container
check_container() {
    local container_name=$1

    if docker ps --filter "name=$container_name" --filter "status=running" --format "{{.Names}}" | grep -q "^$container_name$"; then
        return 0
    else
        return 1
    fi
}

# Function to get container stats
get_container_stats() {
    local container_name=$1

    if check_container "$container_name"; then
        docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}" "$container_name"
    else
        echo "$container_name: Container not running"
    fi
}

# Function to check database connectivity
check_database() {
    local container_name="allemny_postgres"

    if check_container "$container_name"; then
        if docker exec "$container_name" pg_isready -U allemny_find -d allemny_find_v2 >/dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

# Function to check Redis connectivity
check_redis() {
    local container_name="allemny_redis"

    if check_container "$container_name"; then
        if docker exec "$container_name" redis-cli ping 2>/dev/null | grep -q "PONG"; then
            return 0
        fi
    fi
    return 1
}

# Function to check disk space
check_disk_space() {
    local threshold=${1:-85}  # Alert if disk usage > 85%

    local usage=$(df -h "$SCRIPT_DIR" | awk 'NR==2{print $5}' | sed 's/%//')

    if [ "$usage" -lt "$threshold" ]; then
        return 0
    else
        return 1
    fi
}

# Function to check memory usage
check_memory() {
    local threshold=${1:-90}  # Alert if memory usage > 90%

    local usage=$(free | awk 'FNR==2{printf "%.0f", $3/($3+$4)*100}')

    if [ "$usage" -lt "$threshold" ]; then
        return 0
    else
        return 1
    fi
}

# Function to update service status
update_status() {
    local service=$1
    local status=$2

    # Create status file if it doesn't exist
    touch "$STATUS_FILE"

    # Update or add service status
    if grep -q "^$service:" "$STATUS_FILE"; then
        sed -i "s/^$service:.*/$service:$status:$(date +%s)/" "$STATUS_FILE"
    else
        echo "$service:$status:$(date +%s)" >> "$STATUS_FILE"
    fi
}

# Function to get service status
get_status() {
    local service=$1

    if [ -f "$STATUS_FILE" ]; then
        grep "^$service:" "$STATUS_FILE" 2>/dev/null | cut -d':' -f2 || echo "unknown"
    else
        echo "unknown"
    fi
}

# Function to count consecutive failures
count_failures() {
    local service=$1
    local count=0

    if [ -f "$STATUS_FILE" ]; then
        # Get last N entries for this service
        local recent_statuses=$(grep "^$service:" "$STATUS_FILE" | tail -5 | cut -d':' -f2)

        # Count consecutive failures from the end
        echo "$recent_statuses" | tac | while read status; do
            if [ "$status" = "down" ]; then
                ((count++))
            else
                break
            fi
        done
    fi

    echo $count
}

# Function to send alert (placeholder for notification system)
send_alert() {
    local service=$1
    local message=$2

    log "ALERT: $service - $message" console

    # TODO: Implement actual alerting (email, Slack, etc.)
    # For now, just log to a separate alert file
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ALERT: $service - $message" >> "$SCRIPT_DIR/alerts.log"
}

# Function to check individual service
check_service() {
    local service_name=$1
    local check_function=$2
    shift 2
    local args=("$@")

    if $check_function "${args[@]}"; then
        echo -e "${GREEN}✓${NC} $service_name"
        update_status "$service_name" "up"
        return 0
    else
        echo -e "${RED}✗${NC} $service_name"
        update_status "$service_name" "down"

        # Check for consecutive failures
        local failures=$(count_failures "$service_name")
        if [ "$failures" -ge "$ALERT_THRESHOLD" ]; then
            send_alert "$service_name" "Service has been down for $failures consecutive checks"
        fi

        return 1
    fi
}

# Function to perform comprehensive health check
health_check() {
    local mode=${1:-brief}

    echo -e "${BLUE}🏥 Allemny Find V2 - Health Check${NC}"
    echo -e "${BLUE}================================${NC}"
    echo -e "Timestamp: $(date)"
    echo -e "Mode: $mode\n"

    local total_services=0
    local healthy_services=0

    # Check Docker containers
    echo -e "${PURPLE}📦 Docker Containers:${NC}"
    ((total_services++))
    if check_service "Frontend Container" check_container "allemny_frontend"; then
        ((healthy_services++))
    fi

    ((total_services++))
    if check_service "Backend Container" check_container "allemny_backend"; then
        ((healthy_services++))
    fi

    ((total_services++))
    if check_service "Database Container" check_container "allemny_postgres"; then
        ((healthy_services++))
    fi

    ((total_services++))
    if check_service "Redis Container" check_container "allemny_redis"; then
        ((healthy_services++))
    fi

    ((total_services++))
    if check_service "Ollama Container" check_container "allemny_ollama"; then
        ((healthy_services++))
    fi

    echo ""

    # Check HTTP endpoints
    echo -e "${PURPLE}🌐 HTTP Endpoints:${NC}"
    ((total_services++))
    if check_service "Frontend HTTP" check_http "http://localhost:$FRONTEND_PORT"; then
        ((healthy_services++))
    fi

    ((total_services++))
    if check_service "Backend HTTP" check_http "http://localhost:$BACKEND_PORT/health"; then
        ((healthy_services++))
    fi

    ((total_services++))
    if check_service "Backend API Docs" check_http "http://localhost:$BACKEND_PORT/docs"; then
        ((healthy_services++))
    fi

    echo ""

    # Check database connectivity
    echo -e "${PURPLE}🗄️ Database Services:${NC}"
    ((total_services++))
    if check_service "PostgreSQL Database" check_database; then
        ((healthy_services++))
    fi

    ((total_services++))
    if check_service "Redis Cache" check_redis; then
        ((healthy_services++))
    fi

    echo ""

    # Check system resources
    echo -e "${PURPLE}💾 System Resources:${NC}"
    ((total_services++))
    if check_service "Disk Space" check_disk_space 85; then
        ((healthy_services++))
    fi

    ((total_services++))
    if check_service "Memory Usage" check_memory 90; then
        ((healthy_services++))
    fi

    echo ""

    # Detailed mode: Show container stats
    if [ "$mode" = "detailed" ]; then
        echo -e "${PURPLE}📊 Container Statistics:${NC}"
        echo "----------------------------------------"
        get_container_stats "allemny_frontend"
        get_container_stats "allemny_backend"
        get_container_stats "allemny_postgres"
        get_container_stats "allemny_redis"
        get_container_stats "allemny_ollama"
        echo ""

        # Show system info
        echo -e "${PURPLE}🖥️ System Information:${NC}"
        echo "----------------------------------------"
        echo "Uptime: $(uptime -p)"
        echo "Load Average: $(uptime | awk -F'load average:' '{print $2}')"
        echo "Memory: $(free -h | awk 'NR==2{printf "Used: %s/%s (%.1f%%)", $3,$2,$3*100/$2}')"
        echo "Disk: $(df -h $SCRIPT_DIR | awk 'NR==2{printf "Used: %s/%s (%s)", $3,$2,$5}')"
        echo ""
    fi

    # Summary
    echo -e "${BLUE}📋 Health Summary:${NC}"
    echo "=================="

    local health_percentage=$((healthy_services * 100 / total_services))

    if [ $healthy_services -eq $total_services ]; then
        echo -e "${GREEN}✅ All services healthy ($healthy_services/$total_services - 100%)${NC}"
        log "Health check passed: $healthy_services/$total_services services healthy"
    elif [ $health_percentage -ge 80 ]; then
        echo -e "${YELLOW}⚠️ Most services healthy ($healthy_services/$total_services - $health_percentage%)${NC}"
        log "Health check warning: $healthy_services/$total_services services healthy"
    else
        echo -e "${RED}❌ Multiple services unhealthy ($healthy_services/$total_services - $health_percentage%)${NC}"
        log "Health check failed: $healthy_services/$total_services services healthy"
    fi

    # Service URLs for quick access
    echo -e "\n${BLUE}🔗 Quick Access:${NC}"
    echo "Frontend:     http://localhost:$FRONTEND_PORT"
    echo "API Docs:     http://localhost:$BACKEND_PORT/docs"
    echo "Health API:   http://localhost:$BACKEND_PORT/health"

    echo ""
    log "Health check completed: $healthy_services/$total_services services healthy"

    return $((total_services - healthy_services))
}

# Function to watch services continuously
watch_services() {
    local interval=${1:-30}

    echo -e "${BLUE}👀 Starting continuous monitoring (interval: ${interval}s)${NC}"
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}\n"

    while true; do
        clear
        health_check brief
        echo -e "\n${BLUE}Next check in ${interval} seconds...${NC}"
        sleep $interval
    done
}

# Function to restart unhealthy services
restart_services() {
    echo -e "${BLUE}🔄 Restarting unhealthy services...${NC}"

    cd "$SCRIPT_DIR"

    # Check each service and restart if needed
    if ! check_container "allemny_frontend"; then
        echo -e "${YELLOW}Restarting frontend container...${NC}"
        docker-compose restart frontend
    fi

    if ! check_container "allemny_backend"; then
        echo -e "${YELLOW}Restarting backend container...${NC}"
        docker-compose restart backend
    fi

    if ! check_container "allemny_postgres"; then
        echo -e "${YELLOW}Restarting database container...${NC}"
        docker-compose restart postgres
    fi

    if ! check_container "allemny_redis"; then
        echo -e "${YELLOW}Restarting Redis container...${NC}"
        docker-compose restart redis
    fi

    if ! check_container "allemny_ollama"; then
        echo -e "${YELLOW}Restarting Ollama container...${NC}"
        docker-compose restart ollama
    fi

    echo -e "${GREEN}Service restart completed${NC}"

    # Wait and check again
    echo -e "${BLUE}Waiting 30 seconds for services to stabilize...${NC}"
    sleep 30

    health_check brief
}

# Function to show usage
show_usage() {
    echo "Allemny Find V2 - Health Check Script"
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  check [brief|detailed]  Run health check (default: brief)"
    echo "  watch [interval]        Continuous monitoring (default: 30s)"
    echo "  restart                 Restart unhealthy services"
    echo "  status                  Show current service status"
    echo "  logs [service]          Show service logs"
    echo "  help                    Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 check               # Quick health check"
    echo "  $0 check detailed      # Detailed health check with stats"
    echo "  $0 watch 60            # Monitor every 60 seconds"
    echo "  $0 restart             # Restart unhealthy services"
    echo "  $0 logs backend        # Show backend service logs"
}

# Function to show service logs
show_logs() {
    local service=${1:-}

    cd "$SCRIPT_DIR"

    if [ -z "$service" ]; then
        echo -e "${BLUE}Showing logs for all services:${NC}"
        docker-compose logs --tail=50 -f
    else
        echo -e "${BLUE}Showing logs for $service:${NC}"
        docker-compose logs --tail=50 -f "$service"
    fi
}

# Function to show current status
show_status() {
    echo -e "${BLUE}📊 Current Service Status:${NC}"
    echo "=========================="

    if [ -f "$STATUS_FILE" ]; then
        while IFS=':' read -r service status timestamp; do
            local time_ago=$(($(date +%s) - timestamp))
            local status_color

            case $status in
                "up") status_color="${GREEN}" ;;
                "down") status_color="${RED}" ;;
                *) status_color="${YELLOW}" ;;
            esac

            echo -e "$service: ${status_color}$status${NC} (${time_ago}s ago)"
        done < "$STATUS_FILE"
    else
        echo "No status information available"
    fi
}

# Main function
main() {
    local command=${1:-check}

    case $command in
        "check")
            health_check "${2:-brief}"
            ;;
        "watch")
            watch_services "${2:-30}"
            ;;
        "restart")
            restart_services
            ;;
        "status")
            show_status
            ;;
        "logs")
            show_logs "$2"
            ;;
        "help"|"--help"|"-h")
            show_usage
            ;;
        *)
            echo -e "${RED}Unknown command: $command${NC}"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"