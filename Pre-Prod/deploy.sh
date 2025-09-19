#!/bin/bash

# Allemny Find V2 - One-Command Deployment Script
# Usage: curl -sSL https://raw.githubusercontent.com/username/AllemnyFind/main/Pre-Prod/deploy.sh | bash

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
REPO_URL="https://github.com/pgoodmansidf/AllemnyFind.git"
PROJECT_NAME="AllemnyFind"
INSTALL_DIR="$HOME/allemny-find"
BRANCH="main"

# System requirements
MIN_DOCKER_VERSION="20.10"
MIN_COMPOSE_VERSION="2.0"
MIN_MEMORY_GB=4
MIN_DISK_GB=10

# Function to print banner
print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                     🚀 Allemny Find 🚀                       ║"
    echo "║                   One-Command Deployment                       ║"
    echo "║                                                               ║"
    echo "║               SIDF-MSD Knowledge Management Hub               ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}\n"
}

# Function to log messages
log() {
    local level=$1
    shift
    local message="$@"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

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
        "DEBUG")
            echo -e "${BLUE}[DEBUG]${NC} $message"
            ;;
        "SUCCESS")
            echo -e "${GREEN}[SUCCESS]${NC} $message"
            ;;
    esac

    # Also log to file if available
    if [ -w "$(dirname "$0")" ]; then
        echo "[$timestamp] [$level] $message" >> deployment.log
    fi
}

# Function to check system requirements
check_system_requirements() {
    log "INFO" "Checking system requirements..."

    # Check OS
    if [[ "$OSTYPE" != "linux-gnu"* ]]; then
        log "WARN" "This script is optimized for Linux. Your OS: $OSTYPE"
    fi

    # Check memory
    local total_memory_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    local total_memory_gb=$((total_memory_kb / 1024 / 1024))
    if [ $total_memory_gb -lt $MIN_MEMORY_GB ]; then
        log "WARN" "System has ${total_memory_gb}GB RAM. Recommended: ${MIN_MEMORY_GB}GB+"
    else
        log "SUCCESS" "Memory check passed: ${total_memory_gb}GB available"
    fi

    # Check disk space
    local available_space=$(df -BG . | awk 'NR==2{print $4}' | sed 's/G//')
    if [ $available_space -lt $MIN_DISK_GB ]; then
        log "ERROR" "Insufficient disk space. Available: ${available_space}GB, Required: ${MIN_DISK_GB}GB"
        exit 1
    else
        log "SUCCESS" "Disk space check passed: ${available_space}GB available"
    fi

    # Check internet connectivity
    if ! ping -c 1 google.com &> /dev/null; then
        log "ERROR" "No internet connectivity detected"
        exit 1
    else
        log "SUCCESS" "Internet connectivity verified"
    fi
}

# Function to detect package manager
detect_package_manager() {
    if command -v apt &> /dev/null; then
        PACKAGE_MANAGER="apt"
        UPDATE_CMD="apt update"
        INSTALL_CMD="apt install -y"
    elif command -v yum &> /dev/null; then
        PACKAGE_MANAGER="yum"
        UPDATE_CMD="yum update -y"
        INSTALL_CMD="yum install -y"
    elif command -v dnf &> /dev/null; then
        PACKAGE_MANAGER="dnf"
        UPDATE_CMD="dnf update -y"
        INSTALL_CMD="dnf install -y"
    else
        log "ERROR" "No supported package manager found (apt, yum, dnf)"
        exit 1
    fi

    log "INFO" "Detected package manager: $PACKAGE_MANAGER"
}

# Function to install system dependencies
install_system_dependencies() {
    log "INFO" "Installing system dependencies..."

    # Update package lists
    log "INFO" "Updating package lists..."
    sudo $UPDATE_CMD

    # Install basic dependencies
    log "INFO" "Installing basic dependencies..."
    sudo $INSTALL_CMD curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg lsb-release

    log "SUCCESS" "System dependencies installed"
}

# Function to install Docker
install_docker() {
    if command -v docker &> /dev/null; then
        local docker_version=$(docker --version | awk '{print $3}' | cut -d',' -f1)
        log "INFO" "Docker already installed: $docker_version"
        return 0
    fi

    log "INFO" "Installing Docker..."

    # Install Docker using official script
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm get-docker.sh

    # Add current user to docker group
    sudo usermod -aG docker $USER

    # Start and enable Docker service
    sudo systemctl start docker
    sudo systemctl enable docker

    log "SUCCESS" "Docker installed successfully"
    log "INFO" "Please log out and back in to use Docker without sudo"
}

# Function to install Docker Compose
install_docker_compose() {
    if command -v docker-compose &> /dev/null; then
        local compose_version=$(docker-compose --version | awk '{print $3}' | cut -d',' -f1)
        log "INFO" "Docker Compose already installed: $compose_version"
        return 0
    fi

    log "INFO" "Installing Docker Compose..."

    # Get latest version
    local latest_version=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep -oP '"tag_name": "\K(.*)(?=")')

    # Download and install
    sudo curl -L "https://github.com/docker/compose/releases/download/$latest_version/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose

    # Create symlink if needed
    if [ ! -f /usr/bin/docker-compose ]; then
        sudo ln -s /usr/local/bin/docker-compose /usr/bin/docker-compose
    fi

    log "SUCCESS" "Docker Compose installed successfully"
}

# Function to install Node.js
install_nodejs() {
    if command -v node &> /dev/null; then
        local node_version=$(node --version)
        log "INFO" "Node.js already installed: $node_version"
        return 0
    fi

    log "INFO" "Installing Node.js..."

    # Install NodeJS 18 LTS
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs

    log "SUCCESS" "Node.js installed successfully"
}

# Function to detect and install PostgreSQL
setup_postgresql() {
    log "INFO" "Setting up PostgreSQL..."

    # Check if PostgreSQL is installed
    if ! command -v psql &> /dev/null; then
        log "INFO" "Installing PostgreSQL..."
        case $PACKAGE_MANAGER in
            "apt")
                sudo apt-get update
                sudo apt-get install -y postgresql postgresql-contrib postgresql-server-dev-all
                ;;
            "yum"|"dnf")
                sudo $INSTALL_CMD postgresql postgresql-server postgresql-contrib postgresql-devel
                sudo postgresql-setup initdb || true
                ;;
        esac
    else
        log "SUCCESS" "PostgreSQL is already installed"
    fi

    # Check if PostgreSQL service is running
    if ! sudo systemctl is-active --quiet postgresql; then
        log "INFO" "Starting PostgreSQL service..."
        sudo systemctl start postgresql
        sudo systemctl enable postgresql
        sleep 5
    else
        log "SUCCESS" "PostgreSQL service is running"
    fi

    # Configure PostgreSQL for external connections
    log "INFO" "Configuring PostgreSQL for Docker access..."

    # Find PostgreSQL config directory
    local pg_version=$(sudo -u postgres psql -t -c "SELECT version();" | grep -oE '[0-9]+\.[0-9]+' | head -1)
    local pg_config_dir="/etc/postgresql/$pg_version/main"

    if [ ! -d "$pg_config_dir" ]; then
        pg_config_dir=$(sudo find /etc -name "postgresql.conf" 2>/dev/null | head -1 | xargs dirname)
    fi

    if [ -n "$pg_config_dir" ] && [ -f "$pg_config_dir/postgresql.conf" ]; then
        # Configure listen_addresses
        sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "$pg_config_dir/postgresql.conf"

        # Add Docker network to pg_hba.conf
        if ! sudo grep -q "172.17.0.0/16" "$pg_config_dir/pg_hba.conf"; then
            echo "host    all             all             172.17.0.0/16           md5" | sudo tee -a "$pg_config_dir/pg_hba.conf"
            echo "host    all             all             127.0.0.1/32            md5" | sudo tee -a "$pg_config_dir/pg_hba.conf"
        fi

        # Restart PostgreSQL to apply changes
        sudo systemctl restart postgresql
        sleep 5
    fi

    # Create database and user
    log "INFO" "Creating database and user..."
    sudo -u postgres psql -c "CREATE DATABASE allemny_find_v2;" 2>/dev/null || log "INFO" "Database already exists"
    sudo -u postgres psql -c "CREATE USER allemny_find WITH PASSWORD 'AFbqSrE?h8bPjSCs9#';" 2>/dev/null || log "INFO" "User already exists"
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE allemny_find_v2 TO allemny_find;"
    sudo -u postgres psql -c "ALTER USER allemny_find CREATEDB;"

    # Test PostgreSQL connectivity
    log "INFO" "Testing PostgreSQL connectivity..."
    if PGPASSWORD='AFbqSrE?h8bPjSCs9#' psql -h localhost -p 5432 -U allemny_find -d allemny_find_v2 -c "SELECT 1;" &>/dev/null; then
        log "SUCCESS" "PostgreSQL is working correctly"
    else
        log "ERROR" "PostgreSQL connectivity test failed"
        exit 1
    fi
}

# Function to detect and install Redis
setup_redis() {
    log "INFO" "Setting up Redis..."

    # Check if Redis is installed
    if ! command -v redis-server &> /dev/null; then
        log "INFO" "Installing Redis..."
        case $PACKAGE_MANAGER in
            "apt")
                sudo apt-get update
                sudo apt-get install -y redis-server
                ;;
            "yum"|"dnf")
                sudo $INSTALL_CMD redis
                ;;
        esac
    else
        log "SUCCESS" "Redis is already installed"
    fi

    # Check if Redis service is running
    if ! sudo systemctl is-active --quiet redis-server && ! sudo systemctl is-active --quiet redis; then
        log "INFO" "Starting Redis service..."
        sudo systemctl start redis-server 2>/dev/null || sudo systemctl start redis 2>/dev/null
        sudo systemctl enable redis-server 2>/dev/null || sudo systemctl enable redis 2>/dev/null
        sleep 3
    else
        log "SUCCESS" "Redis service is running"
    fi

    # Test Redis connectivity
    log "INFO" "Testing Redis connectivity..."
    if redis-cli ping &>/dev/null; then
        log "SUCCESS" "Redis is working correctly"
    else
        log "ERROR" "Redis connectivity test failed"
        exit 1
    fi
}

# Function to detect and install Ollama
setup_ollama() {
    log "INFO" "Setting up Ollama..."

    # Check if Ollama is installed
    if ! command -v ollama &> /dev/null; then
        log "INFO" "Installing Ollama..."
        curl -fsSL https://ollama.ai/install.sh | sh
        sleep 5
    else
        log "SUCCESS" "Ollama is already installed"
    fi

    # Check if Ollama service is running
    if ! pgrep -f "ollama serve" &>/dev/null; then
        log "INFO" "Starting Ollama service..."
        nohup ollama serve &>/dev/null &
        sleep 10
    else
        log "SUCCESS" "Ollama service is running"
    fi

    # Pull required model
    log "INFO" "Ensuring nomic-embed-text model is available..."
    if ! ollama list | grep -q "nomic-embed-text"; then
        log "INFO" "Pulling nomic-embed-text model (this may take several minutes)..."
        ollama pull nomic-embed-text
    else
        log "SUCCESS" "nomic-embed-text model is available"
    fi

    # Test Ollama connectivity
    log "INFO" "Testing Ollama connectivity..."
    if curl -s http://localhost:11434/api/tags &>/dev/null; then
        log "SUCCESS" "Ollama is working correctly"
    else
        log "ERROR" "Ollama connectivity test failed"
        exit 1
    fi
}

# Function to check critical frontend ports
check_frontend_ports() {
    log "INFO" "Checking frontend port availability..."

    local frontend_available=false
    for port in 3001 3002 3003; do
        if ! (netstat -tuln 2>/dev/null | grep -q ":$port " || ss -tuln 2>/dev/null | grep -q ":$port "); then
            frontend_available=true
            break
        fi
    done

    if [ "$frontend_available" = false ]; then
        log "ERROR" "All required frontend ports (3001-3003) are in use"
        log "ERROR" "Please stop services using these ports or choose a different server"
        log "INFO" "You can check port usage with: sudo netstat -tuln | grep ':300[1-3] '"
        exit 1
    fi

    log "SUCCESS" "Frontend ports are available"
}

# Function to clone repository
clone_repository() {
    log "INFO" "Cloning Allemny Find repository..."

    # Remove existing directory if it exists
    if [ -d "$INSTALL_DIR" ]; then
        log "WARN" "Existing installation found. Backing up..."
        mv "$INSTALL_DIR" "${INSTALL_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
    fi

    # Clone repository
    if ! git clone "$REPO_URL" "$INSTALL_DIR"; then
        log "ERROR" "Failed to clone repository"
        exit 1
    fi

    cd "$INSTALL_DIR"

    # Checkout specific branch
    git checkout "$BRANCH"

    log "SUCCESS" "Repository cloned successfully"
}

# Function to setup environment
setup_environment() {
    log "INFO" "Setting up environment configuration..."

    cd "$INSTALL_DIR/Pre-Prod"

    # Make scripts executable
    chmod +x *.sh

    # Run port detection
    log "INFO" "Detecting available ports..."
    ./port-manager.sh

    # Copy environment template
    if [ ! -f .env ]; then
        cp .env.template .env
        log "SUCCESS" "Environment configuration created"
    fi

    log "SUCCESS" "Environment setup completed"
}

# Function to build and start services
start_services() {
    log "INFO" "Building and starting Allemny Find services..."

    cd "$INSTALL_DIR/Pre-Prod"

    # Build containers
    log "INFO" "Building Docker containers (this may take several minutes)..."
    docker-compose build --parallel

    # Start services
    log "INFO" "Starting services..."
    docker-compose up -d --remove-orphans

    # Wait for services to be ready
    log "INFO" "Waiting for services to start..."
    sleep 30

    # Check service health
    check_service_health

    log "SUCCESS" "All services started successfully"
}

# Function to perform comprehensive health checks
check_service_health() {
    local max_attempts=15
    local attempt=0

    log "INFO" "Performing comprehensive health checks..."

    # Get ports from environment
    source .env

    while [ $attempt -lt $max_attempts ]; do
        local healthy_services=0
        local total_services=5

        # 1. Check if containers are running
        if docker ps --filter "name=allemny_backend" --filter "status=running" --quiet | grep -q .; then
            log "SUCCESS" "Backend container is running"
            ((healthy_services++))
        else
            log "WARN" "Backend container not running"
        fi

        if docker ps --filter "name=allemny_frontend" --filter "status=running" --quiet | grep -q .; then
            log "SUCCESS" "Frontend container is running"
            ((healthy_services++))
        else
            log "WARN" "Frontend container not running"
        fi

        # 2. Test backend API health endpoint
        if curl -s -f "http://localhost:$BACKEND_PORT/health" &>/dev/null; then
            log "SUCCESS" "Backend API health check passed"
            ((healthy_services++))
        else
            log "WARN" "Backend API health check failed"
        fi

        # 3. Test frontend accessibility
        if curl -s -f "http://localhost:$FRONTEND_PORT" &>/dev/null; then
            log "SUCCESS" "Frontend accessibility check passed"
            ((healthy_services++))
        else
            log "WARN" "Frontend accessibility check failed"
        fi

        # 4. Test backend can connect to database
        if docker exec allemny_backend python -c "
import psycopg2
try:
    conn = psycopg2.connect('postgresql://allemny_find:AFbqSrE%3Fh8bPjSCs9%23@172.17.0.1:5432/allemny_find_v2')
    conn.close()
    print('SUCCESS')
except:
    print('FAILED')
" 2>/dev/null | grep -q "SUCCESS"; then
            log "SUCCESS" "Backend database connectivity verified"
            ((healthy_services++))
        else
            log "WARN" "Backend database connectivity failed"
        fi

        # If all checks pass, deployment is successful
        if [ $healthy_services -eq $total_services ]; then
            log "SUCCESS" "🎉 ALL HEALTH CHECKS PASSED - SYSTEM IS FULLY OPERATIONAL!"
            return 0
        fi

        log "INFO" "Health check progress: $healthy_services/$total_services services healthy (attempt $((attempt + 1))/$max_attempts)"
        sleep 20
        ((attempt++))
    done

    # If we reach here, something failed
    log "ERROR" "❌ DEPLOYMENT FAILED - Not all health checks passed"
    log "ERROR" "Final status: $healthy_services/$total_services services healthy"
    log "INFO" "Check logs with: docker-compose logs"
    log "INFO" "Check individual service status:"
    log "INFO" "  Backend logs: docker logs allemny_backend"
    log "INFO" "  Frontend logs: docker logs allemny_frontend"

    return 1
}

# Function to initialize database
initialize_database() {
    log "INFO" "Initializing database..."

    cd "$INSTALL_DIR/Pre-Prod"

    # Wait for PostgreSQL to be ready
    log "INFO" "Waiting for PostgreSQL to be ready..."
    sleep 10

    # Run database migrations
    log "INFO" "Running database migrations..."
    docker-compose exec -T backend alembic upgrade head

    # Setup initial data if needed
    if [ -f "../backend/scripts/init_data.py" ]; then
        log "INFO" "Setting up initial data..."
        docker-compose exec -T backend python scripts/init_data.py
    fi

    log "SUCCESS" "Database initialized successfully"
}

# Function to setup Ollama models
setup_ollama() {
    log "INFO" "Setting up Ollama AI models..."

    cd "$INSTALL_DIR/Pre-Prod"

    # Pull required models
    log "INFO" "Downloading embedding model (this may take several minutes)..."
    docker-compose exec -T ollama ollama pull nomic-embed-text

    log "SUCCESS" "Ollama models setup completed"
}

# Function to display deployment summary
display_summary() {
    log "SUCCESS" "🎉 Allemny Find V2 deployment completed successfully!"
    echo -e "\n${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║                     🎯 ACCESS INFORMATION 🎯                  ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}\n"

    # Get ports from environment
    source "$INSTALL_DIR/Pre-Prod/.env"

    echo -e "${BLUE}📱 Web Application:${NC}     http://localhost:$FRONTEND_PORT"
    echo -e "${BLUE}🔧 API Documentation:${NC}  http://localhost:$BACKEND_PORT/docs"
    echo -e "${BLUE}📊 API Health Check:${NC}   http://localhost:$BACKEND_PORT/health"
    echo -e "${BLUE}🧠 Ollama AI:${NC}           http://localhost:$OLLAMA_PORT"

    echo -e "\n${GREEN}📋 Management Commands:${NC}"
    echo -e "${YELLOW}Start services:${NC}    cd $INSTALL_DIR/Pre-Prod && docker-compose up -d"
    echo -e "${YELLOW}Stop services:${NC}     cd $INSTALL_DIR/Pre-Prod && docker-compose down"
    echo -e "${YELLOW}View logs:${NC}         cd $INSTALL_DIR/Pre-Prod && docker-compose logs -f"
    echo -e "${YELLOW}Update app:${NC}        cd $INSTALL_DIR && git pull && cd Pre-Prod && docker-compose up -d --build"

    echo -e "\n${GREEN}🔐 Default Admin Credentials:${NC}"
    echo -e "${YELLOW}Username:${NC} p.goodman@sidf.gov.sa"
    echo -e "${YELLOW}Password:${NC} S!DFAllemny1"

    echo -e "\n${GREEN}📁 Installation Directory:${NC} $INSTALL_DIR"
    echo -e "${GREEN}📝 Logs Location:${NC} $INSTALL_DIR/Pre-Prod/deployment.log"

    echo -e "\n${PURPLE}💡 Tips:${NC}"
    echo -e "  • The application runs in Docker containers for easy management"
    echo -e "  • All data is persisted in Docker volumes"
    echo -e "  • Services will auto-restart on system reboot"
    echo -e "  • Check health status anytime with: curl http://localhost:$BACKEND_PORT/health"

    echo -e "\n${GREEN}✅ Deployment completed successfully! Happy searching! 🔍${NC}\n"
}

# Function to handle errors
error_handler() {
    local exit_code=$?
    log "ERROR" "Deployment failed with exit code $exit_code"
    log "ERROR" "Check the logs above for details"

    echo -e "\n${RED}❌ Deployment Failed${NC}"
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo -e "  1. Check system requirements"
    echo -e "  2. Ensure internet connectivity"
    echo -e "  3. Verify Docker installation"
    echo -e "  4. Check available disk space"
    echo -e "  5. Review deployment.log for details"
    echo -e "\n${BLUE}For support, please check the documentation or contact the development team.${NC}\n"

    exit $exit_code
}

# Main deployment function
main() {
    # Set error handler
    trap error_handler ERR

    # Print banner
    print_banner

    # Check if running as root
    if [ "$EUID" -eq 0 ]; then
        log "ERROR" "Please do not run this script as root"
        exit 1
    fi

    # Start deployment process
    log "INFO" "Starting Allemny Find deployment..."

    # Pre-flight checks
    check_system_requirements
    detect_package_manager
    check_frontend_ports

    # Install system dependencies
    install_system_dependencies
    install_docker
    install_docker_compose
    install_nodejs

    # Setup required services (PostgreSQL, Redis, Ollama)
    setup_postgresql
    setup_redis
    setup_ollama

    # Setup application
    clone_repository
    setup_environment

    # Deploy application containers
    start_services

    # Comprehensive health verification
    if check_service_health; then
        log "SUCCESS" "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!"
        display_summary
    else
        log "ERROR" "❌ DEPLOYMENT FAILED - Health checks did not pass"
        log "INFO" "Please check the error messages above and retry"
        exit 1
    fi

    log "SUCCESS" "Deployment completed in $SECONDS seconds"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --repo)
            REPO_URL="$2"
            shift 2
            ;;
        --branch)
            BRANCH="$2"
            shift 2
            ;;
        --install-dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        --help)
            echo "Allemny Find V2 - One-Command Deployment"
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --repo URL          Repository URL (default: $REPO_URL)"
            echo "  --branch BRANCH     Git branch (default: $BRANCH)"
            echo "  --install-dir DIR   Installation directory (default: $INSTALL_DIR)"
            echo "  --help              Show this help message"
            exit 0
            ;;
        *)
            log "ERROR" "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Run main function
main "$@"