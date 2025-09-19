#!/bin/bash

# Allemny Find V2 - Management Script
# Central management script for all application operations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Source environment if available
if [ -f "$SCRIPT_DIR/.env" ]; then
    source "$SCRIPT_DIR/.env"
fi

# Default ports
FRONTEND_PORT=${FRONTEND_PORT:-3001}
BACKEND_PORT=${BACKEND_PORT:-8002}

# Logging function
log() {
    local level=$1
    shift
    local message="$@"

    case $level in
        "INFO")  echo -e "${BLUE}[INFO]${NC} $message" ;;
        "WARN")  echo -e "${YELLOW}[WARN]${NC} $message" ;;
        "ERROR") echo -e "${RED}[ERROR]${NC} $message" ;;
        "SUCCESS") echo -e "${GREEN}[SUCCESS]${NC} $message" ;;
    esac
}

# Function to show banner
show_banner() {
    echo -e "${CYAN}"
    echo "╔══════════════════════════════════════════════════════════════╗"
    echo "║                 🚀 Allemny Find V2 Manager 🚀                ║"
    echo "║                 AI-Powered Document Search                    ║"
    echo "╚══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}\n"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        log "ERROR" "Docker is not running. Please start Docker first."
        return 1
    fi
    return 0
}

# Function to start services
start_services() {
    log "INFO" "Starting Allemny Find V2 services..."

    cd "$SCRIPT_DIR"

    # Check ports first
    ./port-manager.sh

    # Start services
    docker-compose up -d

    # Wait for services to be ready
    log "INFO" "Waiting for services to start..."
    sleep 15

    # Check health
    ./health-check.sh check

    log "SUCCESS" "Services started successfully"
    show_access_info
}

# Function to stop services
stop_services() {
    log "INFO" "Stopping Allemny Find V2 services..."

    cd "$SCRIPT_DIR"
    docker-compose down

    log "SUCCESS" "Services stopped successfully"
}

# Function to restart services
restart_services() {
    log "INFO" "Restarting Allemny Find V2 services..."

    cd "$SCRIPT_DIR"
    docker-compose restart

    # Wait for services to be ready
    log "INFO" "Waiting for services to restart..."
    sleep 15

    # Check health
    ./health-check.sh check

    log "SUCCESS" "Services restarted successfully"
    show_access_info
}

# Function to update application
update_application() {
    log "INFO" "Updating Allemny Find V2..."

    # Backup current configuration
    ./backup.sh

    # Pull latest changes
    cd "$PROJECT_ROOT"
    git pull origin main

    # Rebuild and restart services
    cd "$SCRIPT_DIR"
    docker-compose down
    docker-compose build --no-cache
    docker-compose up -d

    # Wait and check health
    log "INFO" "Waiting for updated services to start..."
    sleep 30
    ./health-check.sh check

    log "SUCCESS" "Application updated successfully"
    show_access_info
}

# Function to show logs
show_logs() {
    local service=${1:-}
    local follow=${2:-false}

    cd "$SCRIPT_DIR"

    if [ "$follow" = "true" ]; then
        if [ -z "$service" ]; then
            log "INFO" "Following logs for all services (Ctrl+C to stop)..."
            docker-compose logs -f
        else
            log "INFO" "Following logs for $service (Ctrl+C to stop)..."
            docker-compose logs -f "$service"
        fi
    else
        if [ -z "$service" ]; then
            log "INFO" "Showing recent logs for all services..."
            docker-compose logs --tail=50
        else
            log "INFO" "Showing recent logs for $service..."
            docker-compose logs --tail=50 "$service"
        fi
    fi
}

# Function to run database migrations
run_migrations() {
    log "INFO" "Running database migrations..."

    cd "$SCRIPT_DIR"

    # Check if backend container is running
    if ! docker-compose ps backend | grep -q "Up"; then
        log "ERROR" "Backend container is not running. Start services first."
        return 1
    fi

    # Run migrations
    docker-compose exec backend alembic upgrade head

    log "SUCCESS" "Database migrations completed"
}

# Function to create admin user
create_admin_user() {
    local email=${1:-"p.goodman@sidf.gov.sa"}
    local password=${2:-"S!DFAllemny1"}

    log "INFO" "Creating admin user: $email"

    cd "$SCRIPT_DIR"

    # Check if backend container is running
    if ! docker-compose ps backend | grep -q "Up"; then
        log "ERROR" "Backend container is not running. Start services first."
        return 1
    fi

    # Create admin user
    docker-compose exec backend python -c "
from app.models.user import User
from app.core.database import SessionLocal
from passlib.context import CryptContext

db = SessionLocal()
pwd_context = CryptContext(schemes=['bcrypt'], deprecated='auto')

# Check if user already exists
existing_user = db.query(User).filter(User.email == '$email').first()
if existing_user:
    print('Admin user already exists: $email')
else:
    # Create new admin user
    hashed_password = pwd_context.hash('$password')
    admin_user = User(
        email='$email',
        username='$email',
        hashed_password=hashed_password,
        is_active=True,
        is_admin=True,
        is_verified=True
    )
    db.add(admin_user)
    db.commit()
    print('Admin user created successfully: $email')

db.close()
"

    log "SUCCESS" "Admin user setup completed"
}

# Function to backup data
backup_data() {
    log "INFO" "Creating backup..."

    if [ -f "$SCRIPT_DIR/backup.sh" ]; then
        ./backup.sh
        log "SUCCESS" "Backup completed"
    else
        log "ERROR" "Backup script not found. Run linux-compatibility.sh first."
    fi
}

# Function to restore data
restore_data() {
    local backup_file=$1

    if [ -z "$backup_file" ]; then
        log "ERROR" "Please specify backup file"
        return 1
    fi

    if [ ! -f "$backup_file" ]; then
        log "ERROR" "Backup file not found: $backup_file"
        return 1
    fi

    log "INFO" "Restoring from backup: $backup_file"

    # Stop services
    stop_services

    # Restore database
    cd "$SCRIPT_DIR"
    gunzip -c "$backup_file" | docker-compose exec -T postgres psql -U allemny_find -d allemny_find_v2

    # Start services
    start_services

    log "SUCCESS" "Restore completed"
}

# Function to show status
show_status() {
    show_banner

    log "INFO" "Checking system status..."

    cd "$SCRIPT_DIR"

    # Check Docker
    if check_docker; then
        echo -e "${GREEN}✓${NC} Docker is running"
    else
        echo -e "${RED}✗${NC} Docker is not running"
        return 1
    fi

    # Check services
    echo -e "\n${PURPLE}📦 Docker Containers:${NC}"
    docker-compose ps

    # Check health
    echo -e "\n${PURPLE}🏥 Health Status:${NC}"
    ./health-check.sh check brief

    # Show access information
    show_access_info
}

# Function to show access information
show_access_info() {
    echo -e "\n${CYAN}🔗 Access URLs:${NC}"
    echo -e "${GREEN}Frontend:${NC}     http://localhost:$FRONTEND_PORT"
    echo -e "${GREEN}API Docs:${NC}     http://localhost:$BACKEND_PORT/docs"
    echo -e "${GREEN}Health:${NC}       http://localhost:$BACKEND_PORT/health"

    echo -e "\n${CYAN}👤 Default Admin Credentials:${NC}"
    echo -e "${GREEN}Email:${NC}        p.goodman@sidf.gov.sa"
    echo -e "${GREEN}Password:${NC}     S!DFAllemny1"
}

# Function to reset application
reset_application() {
    log "WARN" "This will delete all data and reset the application"
    read -p "Are you sure? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log "INFO" "Reset cancelled"
        return 0
    fi

    log "INFO" "Resetting application..."

    cd "$SCRIPT_DIR"

    # Stop services
    docker-compose down

    # Remove volumes
    docker-compose down -v

    # Remove images
    docker-compose down --rmi all

    # Start fresh
    docker-compose up -d

    # Wait for services
    sleep 30

    # Run migrations
    run_migrations

    # Create admin user
    create_admin_user

    log "SUCCESS" "Application reset completed"
    show_access_info
}

# Function to show resource usage
show_resources() {
    echo -e "${PURPLE}💾 System Resources:${NC}"
    echo "=================================="

    # System resources
    echo -e "${BLUE}System Memory:${NC}"
    free -h

    echo -e "\n${BLUE}Disk Usage:${NC}"
    df -h "$SCRIPT_DIR"

    echo -e "\n${BLUE}System Load:${NC}"
    uptime

    # Docker resources
    echo -e "\n${BLUE}Docker Resources:${NC}"
    docker system df

    echo -e "\n${BLUE}Container Stats:${NC}"
    docker stats --no-stream
}

# Function to clean up
cleanup() {
    log "INFO" "Cleaning up unused resources..."

    # Clean Docker system
    docker system prune -f

    # Clean old logs
    find "$SCRIPT_DIR" -name "*.log" -mtime +30 -delete 2>/dev/null || true

    # Clean old backups
    find "$SCRIPT_DIR/backups" -name "*.gz" -mtime +30 -delete 2>/dev/null || true

    log "SUCCESS" "Cleanup completed"
}

# Function to show usage
show_usage() {
    echo "Allemny Find V2 - Management Script"
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  start                   Start all services"
    echo "  stop                    Stop all services"
    echo "  restart                 Restart all services"
    echo "  status                  Show system status"
    echo "  logs [service] [follow] Show logs (optional: specific service, follow)"
    echo "  update                  Update application to latest version"
    echo "  migrate                 Run database migrations"
    echo "  admin [email] [password] Create admin user"
    echo "  backup                  Create backup"
    echo "  restore [file]          Restore from backup"
    echo "  reset                   Reset application (WARNING: deletes all data)"
    echo "  resources               Show system resource usage"
    echo "  cleanup                 Clean up unused resources"
    echo "  health                  Run health check"
    echo "  help                    Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 start               # Start all services"
    echo "  $0 logs backend        # Show backend logs"
    echo "  $0 logs frontend true  # Follow frontend logs"
    echo "  $0 admin admin@example.com mypassword  # Create admin user"
    echo "  $0 backup              # Create backup"
    echo "  $0 restore backup.sql.gz  # Restore from backup"
}

# Main function
main() {
    local command=${1:-status}

    # Check if we're in the right directory
    if [ ! -f "$SCRIPT_DIR/docker-compose.yml" ]; then
        log "ERROR" "docker-compose.yml not found. Run from the Pre-Prod directory."
        exit 1
    fi

    case $command in
        "start")
            check_docker && start_services
            ;;
        "stop")
            stop_services
            ;;
        "restart")
            check_docker && restart_services
            ;;
        "status")
            show_status
            ;;
        "logs")
            show_logs "$2" "$3"
            ;;
        "update")
            check_docker && update_application
            ;;
        "migrate")
            run_migrations
            ;;
        "admin")
            create_admin_user "$2" "$3"
            ;;
        "backup")
            backup_data
            ;;
        "restore")
            restore_data "$2"
            ;;
        "reset")
            reset_application
            ;;
        "resources")
            show_resources
            ;;
        "cleanup")
            cleanup
            ;;
        "health")
            ./health-check.sh check detailed
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