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

    # Find PostgreSQL version and config directory more reliably
    local pg_version=""
    local pg_config_dir=""

    # Try to get version from postgres user
    pg_version=$(sudo -u postgres psql -t -c "SELECT version();" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1 || echo "")

    # Try standard PostgreSQL config locations
    if [ -n "$pg_version" ]; then
        # Ubuntu/Debian style
        if [ -d "/etc/postgresql/$pg_version/main" ]; then
            pg_config_dir="/etc/postgresql/$pg_version/main"
        # RHEL/CentOS style
        elif [ -d "/var/lib/pgsql/$pg_version/data" ]; then
            pg_config_dir="/var/lib/pgsql/$pg_version/data"
        fi
    fi

    # Fallback: search for config file if standard locations don't work
    if [ -z "$pg_config_dir" ] || [ ! -f "$pg_config_dir/postgresql.conf" ]; then
        local config_file=$(sudo find /etc /var/lib/pgsql -name "postgresql.conf" 2>/dev/null | head -1)
        if [ -n "$config_file" ]; then
            pg_config_dir=$(dirname "$config_file")
        fi
    fi

    if [ -n "$pg_config_dir" ] && [ -f "$pg_config_dir/postgresql.conf" ]; then
        log "INFO" "Found PostgreSQL config directory: $pg_config_dir"

        # Configure listen_addresses if not already set
        if ! sudo grep -q "^listen_addresses = '\*'" "$pg_config_dir/postgresql.conf" 2>/dev/null; then
            sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "$pg_config_dir/postgresql.conf" 2>/dev/null || true
            sudo sed -i "s/^listen_addresses = 'localhost'/listen_addresses = '*'/" "$pg_config_dir/postgresql.conf" 2>/dev/null || true
        fi

        # Add Docker network to pg_hba.conf if not already present
        if ! sudo grep -q "172.17.0.0/16" "$pg_config_dir/pg_hba.conf" 2>/dev/null; then
            echo "host    all             all             172.17.0.0/16           md5" | sudo tee -a "$pg_config_dir/pg_hba.conf" >/dev/null
        fi
        if ! sudo grep -q "127.0.0.1/32" "$pg_config_dir/pg_hba.conf" 2>/dev/null; then
            echo "host    all             all             127.0.0.1/32            md5" | sudo tee -a "$pg_config_dir/pg_hba.conf" >/dev/null
        fi

        # Restart PostgreSQL to apply changes
        log "INFO" "Restarting PostgreSQL to apply configuration changes..."
        sudo systemctl restart postgresql
        sleep 8
    else
        log "WARN" "Could not find PostgreSQL configuration directory. Using default settings."
    fi

    # Create database and user
    log "INFO" "Creating database and user..."

    # Execute PostgreSQL commands with improved error handling
    local db_exists=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='allemny_find_v2';" 2>/dev/null || echo "")
    local user_exists=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='allemny_find';" 2>/dev/null || echo "")

    if [ -z "$db_exists" ]; then
        sudo -u postgres createdb allemny_find_v2
        log "SUCCESS" "Database 'allemny_find_v2' created"
    else
        log "INFO" "Database 'allemny_find_v2' already exists"
    fi

    if [ -z "$user_exists" ]; then
        sudo -u postgres psql -c "CREATE USER allemny_find WITH PASSWORD 'AFbqSrE?h8bPjSCs9#';"
        log "SUCCESS" "User 'allemny_find' created"
    else
        log "INFO" "User 'allemny_find' already exists"
    fi

    # Grant privileges (safe to run multiple times)
    sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE allemny_find_v2 TO allemny_find;"
    sudo -u postgres psql -c "ALTER USER allemny_find CREATEDB;"

    # Install pgvector extension if not present
    log "INFO" "Installing pgvector extension..."
    sudo -u postgres psql -d allemny_find_v2 -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || log "WARN" "pgvector extension not available (will be installed later)"

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

# Function to detect and install Ollama with comprehensive error handling
setup_ollama() {
    log "INFO" "Setting up Ollama with production-grade reliability..."

    # Global variables for Ollama setup
    local OLLAMA_USER="ollama"
    local OLLAMA_HOME="/usr/share/ollama"
    local OLLAMA_MODELS="$OLLAMA_HOME/.ollama"
    local OLLAMA_BINARY_PATH=""
    local OLLAMA_PORT="11434"
    local MAX_INSTALL_ATTEMPTS=3
    local MAX_SERVICE_ATTEMPTS=30
    local MAX_MODEL_ATTEMPTS=5

    # Function to create ollama user if it doesn't exist
    create_ollama_user() {
        if ! id "$OLLAMA_USER" &>/dev/null; then
            log "INFO" "Creating dedicated ollama user..."
            sudo useradd --system --user-group --home-dir "$OLLAMA_HOME" --shell /bin/false "$OLLAMA_USER"
            sudo mkdir -p "$OLLAMA_HOME" "$OLLAMA_MODELS"
            sudo chown -R "$OLLAMA_USER:$OLLAMA_USER" "$OLLAMA_HOME"
        else
            log "SUCCESS" "Ollama user already exists"
        fi
    }

    # Function to find Ollama binary location
    find_ollama_binary() {
        local possible_paths=(
            "/usr/local/bin/ollama"
            "/usr/bin/ollama"
            "/opt/ollama/bin/ollama"
            "$(which ollama 2>/dev/null)"
        )

        for path in "${possible_paths[@]}"; do
            if [ -n "$path" ] && [ -x "$path" ]; then
                OLLAMA_BINARY_PATH="$path"
                log "SUCCESS" "Found Ollama binary at: $OLLAMA_BINARY_PATH"
                return 0
            fi
        done

        log "ERROR" "Could not find Ollama binary in expected locations"
        return 1
    }

    # Function to install Ollama with retry logic
    install_ollama_with_retry() {
        local attempt=1

        while [ $attempt -le $MAX_INSTALL_ATTEMPTS ]; do
            log "INFO" "Installing Ollama (attempt $attempt/$MAX_INSTALL_ATTEMPTS)..."

            # Clean up any partial installation
            sudo rm -f /tmp/ollama-install.sh

            # Download and verify installer
            if curl -fsSL https://ollama.ai/install.sh -o /tmp/ollama-install.sh; then
                # Verify the script is not empty and contains expected content
                if [ -s /tmp/ollama-install.sh ] && grep -q "ollama" /tmp/ollama-install.sh; then
                    log "INFO" "Installer downloaded successfully, executing..."

                    # Run installer with timeout
                    if timeout 300 sh /tmp/ollama-install.sh; then
                        sleep 3

                        # Verify installation was successful
                        if find_ollama_binary; then
                            log "SUCCESS" "Ollama installed successfully on attempt $attempt"
                            rm -f /tmp/ollama-install.sh
                            return 0
                        else
                            log "WARN" "Ollama installation completed but binary not found"
                        fi
                    else
                        log "WARN" "Ollama installation script failed or timed out"
                    fi
                else
                    log "WARN" "Downloaded installer appears to be invalid"
                fi
            else
                log "WARN" "Failed to download Ollama installer"
            fi

            rm -f /tmp/ollama-install.sh
            log "WARN" "Installation attempt $attempt failed, retrying in 10 seconds..."
            sleep 10
            ((attempt++))
        done

        log "ERROR" "Failed to install Ollama after $MAX_INSTALL_ATTEMPTS attempts"
        return 1
    }

    # Function to create robust systemd service
    create_ollama_service() {
        log "INFO" "Creating robust Ollama systemd service..."

        sudo tee /etc/systemd/system/ollama.service > /dev/null << EOF
[Unit]
Description=Ollama Service - Local AI Models Server
Documentation=https://ollama.ai/
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$OLLAMA_BINARY_PATH serve
ExecReload=/bin/kill -HUP \$MAINPID
User=$OLLAMA_USER
Group=$OLLAMA_USER
WorkingDirectory=$OLLAMA_HOME
Environment="HOME=$OLLAMA_HOME"
Environment="OLLAMA_MODELS=$OLLAMA_MODELS"
Environment="OLLAMA_HOST=0.0.0.0:$OLLAMA_PORT"
Environment="PATH=/usr/local/bin:/usr/bin:/bin"

# Restart configuration
Restart=always
RestartSec=5
StartLimitInterval=60
StartLimitBurst=3

# Security hardening
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$OLLAMA_HOME
ProtectHome=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ollama

[Install]
WantedBy=multi-user.target
EOF

        # Reload systemd and enable service
        sudo systemctl daemon-reload
        sudo systemctl enable ollama

        log "SUCCESS" "Ollama systemd service created and enabled"
    }

    # Function to start service with comprehensive monitoring
    start_ollama_service() {
        log "INFO" "Starting Ollama service with monitoring..."

        # Stop any existing service
        sudo systemctl stop ollama 2>/dev/null || true
        sleep 2

        # Start the service
        if ! sudo systemctl start ollama; then
            log "ERROR" "Failed to start Ollama service"
            sudo systemctl status ollama --no-pager --lines=20
            return 1
        fi

        # Monitor service startup with detailed logging
        local attempt=1
        local service_ready=false

        while [ $attempt -le $MAX_SERVICE_ATTEMPTS ]; do
            # Check if service is active
            if sudo systemctl is-active --quiet ollama; then
                log "DEBUG" "Service is active, checking API accessibility..."

                # Check if API is responding
                if curl -s --connect-timeout 5 --max-time 10 http://localhost:$OLLAMA_PORT/api/tags >/dev/null 2>&1; then
                    log "SUCCESS" "Ollama service is running and API is accessible"
                    service_ready=true
                    break
                else
                    log "DEBUG" "Service active but API not yet accessible (attempt $attempt/$MAX_SERVICE_ATTEMPTS)"
                fi
            else
                log "DEBUG" "Service not yet active (attempt $attempt/$MAX_SERVICE_ATTEMPTS)"

                # Check if service failed
                if sudo systemctl is-failed --quiet ollama; then
                    log "ERROR" "Ollama service failed to start"
                    log "ERROR" "Service status:"
                    sudo systemctl status ollama --no-pager --lines=10
                    log "ERROR" "Recent logs:"
                    sudo journalctl -u ollama --no-pager --lines=20
                    return 1
                fi
            fi

            # Progress indicator
            if [ $((attempt % 5)) -eq 0 ]; then
                log "INFO" "Waiting for Ollama service to be ready... ($attempt/$MAX_SERVICE_ATTEMPTS)"
            fi

            sleep 2
            ((attempt++))
        done

        if [ "$service_ready" != "true" ]; then
            log "ERROR" "Ollama service failed to become ready within $((MAX_SERVICE_ATTEMPTS * 2)) seconds"
            log "ERROR" "Final service status:"
            sudo systemctl status ollama --no-pager --lines=20
            log "ERROR" "Recent logs:"
            sudo journalctl -u ollama --no-pager --lines=30
            return 1
        fi

        return 0
    }

    # Function to download and verify model
    download_model() {
        local model_name="$1"
        local attempt=1

        log "INFO" "Downloading model: $model_name (this may take several minutes)..."

        while [ $attempt -le $MAX_MODEL_ATTEMPTS ]; do
            log "INFO" "Model download attempt $attempt/$MAX_MODEL_ATTEMPTS..."

            # Check if model already exists
            if ollama list 2>/dev/null | grep -q "^$model_name"; then
                log "SUCCESS" "Model $model_name is already available"
                return 0
            fi

            # Download model with timeout and progress monitoring
            log "INFO" "Pulling $model_name... (this may take 5-15 minutes depending on connection)"

            # Use timeout to prevent hanging
            if timeout 1800 ollama pull "$model_name"; then
                # Verify model was downloaded successfully
                sleep 3
                if ollama list 2>/dev/null | grep -q "^$model_name"; then
                    log "SUCCESS" "Model $model_name downloaded and verified successfully"
                    return 0
                else
                    log "WARN" "Model download completed but verification failed"
                fi
            else
                local exit_code=$?
                if [ $exit_code -eq 124 ]; then
                    log "WARN" "Model download timed out after 30 minutes"
                else
                    log "WARN" "Model download failed with exit code $exit_code"
                fi
            fi

            log "WARN" "Model download attempt $attempt failed, retrying in 30 seconds..."
            sleep 30
            ((attempt++))
        done

        log "ERROR" "Failed to download model $model_name after $MAX_MODEL_ATTEMPTS attempts"
        return 1
    }

    # Function to perform comprehensive health check
    perform_health_check() {
        log "INFO" "Performing comprehensive Ollama health check..."

        # Test 1: Service status
        if ! sudo systemctl is-active --quiet ollama; then
            log "ERROR" "Health check failed: Service is not active"
            return 1
        fi

        # Test 2: API connectivity
        if ! curl -s --connect-timeout 5 --max-time 10 http://localhost:$OLLAMA_PORT/api/tags >/dev/null; then
            log "ERROR" "Health check failed: API is not accessible"
            return 1
        fi

        # Test 3: Model availability
        if ! ollama list 2>/dev/null | grep -q "nomic-embed-text"; then
            log "ERROR" "Health check failed: Required model not available"
            return 1
        fi

        # Test 4: Model functionality (basic test)
        log "INFO" "Testing model functionality..."
        if echo '{"model":"nomic-embed-text","prompt":"test"}' | curl -s --connect-timeout 10 --max-time 30 -X POST http://localhost:$OLLAMA_PORT/api/embeddings -d @- >/dev/null; then
            log "SUCCESS" "Model functionality test passed"
        else
            log "WARN" "Model functionality test failed, but service is running"
        fi

        log "SUCCESS" "All health checks passed"
        return 0
    }

    # Main setup logic starts here
    log "INFO" "=== Starting Ollama Production Setup ==="

    # Step 1: Check if Ollama is already installed and working
    if command -v ollama &> /dev/null && find_ollama_binary; then
        log "SUCCESS" "Ollama binary found, checking service status..."

        # If service exists and is running, do minimal setup
        if sudo systemctl is-active --quiet ollama 2>/dev/null && curl -s http://localhost:$OLLAMA_PORT/api/tags >/dev/null 2>&1; then
            log "INFO" "Ollama service already running, verifying setup..."

            # Ensure model is available
            if ! ollama list 2>/dev/null | grep -q "nomic-embed-text"; then
                if download_model "nomic-embed-text"; then
                    log "SUCCESS" "Ollama setup verification completed"
                    return 0
                else
                    log "WARN" "Model download failed, proceeding with full setup..."
                fi
            else
                log "SUCCESS" "Ollama is already properly configured"
                return 0
            fi
        fi
    fi

    # Step 2: Full installation process
    log "INFO" "Proceeding with full Ollama installation..."

    # Create dedicated user
    create_ollama_user

    # Install Ollama if not present or not working
    if ! command -v ollama &> /dev/null || ! find_ollama_binary; then
        if ! install_ollama_with_retry; then
            log "ERROR" "Failed to install Ollama"
            return 1
        fi
    fi

    # Create and configure systemd service
    create_ollama_service

    # Start service with monitoring
    if ! start_ollama_service; then
        log "ERROR" "Failed to start Ollama service"
        return 1
    fi

    # Download required model
    if ! download_model "nomic-embed-text"; then
        log "ERROR" "Failed to download required model"
        return 1
    fi

    # Final health check
    if ! perform_health_check; then
        log "ERROR" "Final health check failed"
        return 1
    fi

    log "SUCCESS" "=== Ollama Production Setup Completed Successfully ==="
    log "INFO" "Ollama API available at: http://localhost:$OLLAMA_PORT"
    log "INFO" "Service status: sudo systemctl status ollama"
    log "INFO" "Service logs: sudo journalctl -u ollama -f"

    return 0
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

# Function to check PostgreSQL connectivity and health
check_postgresql_health() {
    local service_name="PostgreSQL"
    local max_attempts=5
    local attempt=0

    log "INFO" "🔍 Checking PostgreSQL health..."

    while [ $attempt -lt $max_attempts ]; do
        # Test host PostgreSQL service
        if ! sudo systemctl is-active --quiet postgresql; then
            log "ERROR" "$service_name: Host PostgreSQL service is not running"
            log "INFO" "$service_name: Attempting to start PostgreSQL service..."
            sudo systemctl start postgresql
            sleep 3
        fi

        # Test basic connectivity
        if ! PGPASSWORD='AFbqSrE?h8bPjSCs9#' timeout 10 psql -h localhost -p 5432 -U allemny_find -d allemny_find_v2 -c "SELECT 1;" &>/dev/null; then
            log "WARN" "$service_name: Host connectivity failed (attempt $((attempt + 1))/$max_attempts)"
            sleep 5
            ((attempt++))
            continue
        fi

        # Test database schema and permissions
        local schema_test=$(PGPASSWORD='AFbqSrE?h8bPjSCs9#' psql -h localhost -p 5432 -U allemny_find -d allemny_find_v2 -t -c "
            SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';
        " 2>/dev/null | xargs)

        if [[ "$schema_test" =~ ^[0-9]+$ ]] && [ "$schema_test" -ge 0 ]; then
            log "SUCCESS" "$service_name: ✅ Host connectivity verified (found $schema_test tables)"

            # Test from Docker network perspective
            local docker_bridge_ip=$(docker network inspect bridge --format='{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || echo "172.17.0.1")

            if PGPASSWORD='AFbqSrE?h8bPjSCs9#' timeout 10 psql -h "$docker_bridge_ip" -p 5432 -U allemny_find -d allemny_find_v2 -c "SELECT version();" &>/dev/null; then
                log "SUCCESS" "$service_name: ✅ Docker network connectivity verified"
                return 0
            else
                log "ERROR" "$service_name: Docker network connectivity failed (IP: $docker_bridge_ip)"
                log "INFO" "$service_name: Checking pg_hba.conf configuration..."
                sudo grep -E "(172\.17\.|127\.0\.0\.1)" /etc/postgresql/*/main/pg_hba.conf 2>/dev/null || true
                return 1
            fi
        else
            log "WARN" "$service_name: Schema check failed (attempt $((attempt + 1))/$max_attempts)"
            sleep 5
            ((attempt++))
        fi
    done

    log "ERROR" "$service_name: ❌ Health check failed after $max_attempts attempts"
    log "INFO" "$service_name: Diagnostics:"
    log "INFO" "  - Service status: $(sudo systemctl is-active postgresql 2>/dev/null || echo 'inactive')"
    log "INFO" "  - Port status: $(ss -tuln | grep ':5432' || echo 'not listening')"
    log "INFO" "  - PostgreSQL logs: sudo journalctl -u postgresql --no-pager -n 10"
    return 1
}

# Function to check Redis connectivity and health
check_redis_health() {
    local service_name="Redis"
    local max_attempts=3
    local attempt=0

    log "INFO" "🔍 Checking Redis health..."

    while [ $attempt -lt $max_attempts ]; do
        # Check if Redis service is running
        if ! (sudo systemctl is-active --quiet redis-server || sudo systemctl is-active --quiet redis); then
            log "WARN" "$service_name: Service not running, attempting to start..."
            sudo systemctl start redis-server 2>/dev/null || sudo systemctl start redis 2>/dev/null
            sleep 3
        fi

        # Test basic connectivity and operations
        if ! timeout 10 redis-cli ping &>/dev/null; then
            log "WARN" "$service_name: Basic connectivity failed (attempt $((attempt + 1))/$max_attempts)"
            sleep 3
            ((attempt++))
            continue
        fi

        # Test Redis operations
        local test_key="health_check_$$"
        local test_value="test_$(date +%s)"

        if timeout 10 redis-cli set "$test_key" "$test_value" &>/dev/null && \
           [ "$(timeout 10 redis-cli get "$test_key" 2>/dev/null)" = "$test_value" ]; then
            timeout 10 redis-cli del "$test_key" &>/dev/null

            # Get Redis info
            local redis_version=$(timeout 10 redis-cli info server 2>/dev/null | grep "redis_version" | cut -d: -f2 | tr -d '\r')
            local used_memory=$(timeout 10 redis-cli info memory 2>/dev/null | grep "used_memory_human" | cut -d: -f2 | tr -d '\r')

            log "SUCCESS" "$service_name: ✅ Fully operational (v$redis_version, Memory: $used_memory)"
            return 0
        else
            log "WARN" "$service_name: Operation test failed (attempt $((attempt + 1))/$max_attempts)"
            sleep 3
            ((attempt++))
        fi
    done

    log "ERROR" "$service_name: ❌ Health check failed after $max_attempts attempts"
    log "INFO" "$service_name: Diagnostics:"
    log "INFO" "  - Service status: $(sudo systemctl is-active redis-server redis 2>/dev/null | head -1)"
    log "INFO" "  - Port status: $(ss -tuln | grep ':6379' || echo 'not listening')"
    log "INFO" "  - Redis logs: sudo journalctl -u redis-server --no-pager -n 5"
    return 1
}

# Function to check Ollama service and model availability
check_ollama_health() {
    local service_name="Ollama"
    local max_attempts=3
    local attempt=0

    log "INFO" "🔍 Checking Ollama health..."

    while [ $attempt -lt $max_attempts ]; do
        # Check if Ollama service is running
        if ! sudo systemctl is-active --quiet ollama; then
            log "WARN" "$service_name: Service not running, attempting to start..."
            sudo systemctl start ollama
            sleep 5
        fi

        # Test API availability
        if ! timeout 15 curl -s http://localhost:11434/api/tags &>/dev/null; then
            log "WARN" "$service_name: API not responding (attempt $((attempt + 1))/$max_attempts)"
            sleep 10
            ((attempt++))
            continue
        fi

        # Test model availability
        local model_check=$(timeout 15 curl -s http://localhost:11434/api/tags 2>/dev/null | grep -o '"nomic-embed-text"' | wc -l)

        if [ "$model_check" -gt 0 ]; then
            # Test model functionality
            local test_payload='{"model":"nomic-embed-text","prompt":"test embedding"}'
            if timeout 30 curl -s -X POST http://localhost:11434/api/embeddings \
               -H "Content-Type: application/json" \
               -d "$test_payload" | grep -q "embedding"; then

                local ollama_version=$(timeout 10 ollama --version 2>/dev/null | head -1 || echo "unknown")
                log "SUCCESS" "$service_name: ✅ Fully operational ($ollama_version, nomic-embed-text model ready)"
                return 0
            else
                log "WARN" "$service_name: Model functionality test failed (attempt $((attempt + 1))/$max_attempts)"
            fi
        else
            log "WARN" "$service_name: nomic-embed-text model not found (attempt $((attempt + 1))/$max_attempts)"
            log "INFO" "$service_name: Available models: $(timeout 10 ollama list 2>/dev/null | grep -v 'NAME' | awk '{print $1}' | tr '\n' ', ' | sed 's/,$//')"
        fi

        sleep 10
        ((attempt++))
    done

    log "ERROR" "$service_name: ❌ Health check failed after $max_attempts attempts"
    log "INFO" "$service_name: Diagnostics:"
    log "INFO" "  - Service status: $(sudo systemctl is-active ollama 2>/dev/null || echo 'inactive')"
    log "INFO" "  - Port status: $(ss -tuln | grep ':11434' || echo 'not listening')"
    log "INFO" "  - Process status: $(pgrep -f ollama || echo 'no process found')"
    log "INFO" "  - Service logs: sudo journalctl -u ollama --no-pager -n 5"
    return 1
}

# Function to check Docker container health
check_container_health() {
    local container_name=$1
    local service_name=$2
    local max_wait=60
    local waited=0

    log "INFO" "🔍 Checking $service_name container health..."

    # Wait for container to be in running state
    while [ $waited -lt $max_wait ]; do
        local container_status=$(docker inspect "$container_name" --format='{{.State.Status}}' 2>/dev/null || echo "not_found")

        case "$container_status" in
            "running")
                log "SUCCESS" "$service_name: ✅ Container is running"
                break
                ;;
            "exited"|"dead")
                local exit_code=$(docker inspect "$container_name" --format='{{.State.ExitCode}}' 2>/dev/null || echo "unknown")
                log "ERROR" "$service_name: ❌ Container exited with code $exit_code"
                log "INFO" "$service_name: Last 10 log lines:"
                docker logs --tail 10 "$container_name" 2>&1 | while read line; do
                    log "INFO" "  $line"
                done
                return 1
                ;;
            "restarting")
                log "INFO" "$service_name: Container is restarting... (${waited}s elapsed)"
                ;;
            "not_found")
                log "ERROR" "$service_name: ❌ Container not found"
                return 1
                ;;
            *)
                log "INFO" "$service_name: Container status: $container_status (${waited}s elapsed)"
                ;;
        esac

        sleep 5
        waited=$((waited + 5))
    done

    if [ $waited -ge $max_wait ]; then
        log "ERROR" "$service_name: ❌ Container failed to reach running state within ${max_wait}s"
        return 1
    fi

    # Check container health if health check is defined
    local health_status=$(docker inspect "$container_name" --format='{{.State.Health.Status}}' 2>/dev/null || echo "none")
    if [ "$health_status" != "none" ] && [ "$health_status" != "healthy" ]; then
        log "WARN" "$service_name: Container health status: $health_status"
        if [ "$health_status" = "unhealthy" ]; then
            return 1
        fi
    fi

    return 0
}

# Function to check backend API health and functionality
check_backend_health() {
    local service_name="Backend API"
    local max_attempts=10
    local attempt=0

    log "INFO" "🔍 Checking Backend API health..."

    # First ensure container is healthy
    if ! check_container_health "allemny_backend" "Backend"; then
        return 1
    fi

    # Get backend port
    source .env

    while [ $attempt -lt $max_attempts ]; do
        # Test basic health endpoint
        local health_response=$(timeout 15 curl -s "http://localhost:$BACKEND_PORT/health" 2>/dev/null || echo "")

        if [ -n "$health_response" ]; then
            # Test if it's valid JSON and contains expected fields
            if echo "$health_response" | grep -q '"status"' && echo "$health_response" | grep -q '"database"'; then
                log "SUCCESS" "$service_name: ✅ Health endpoint responding with valid data"

                # Test database connectivity from backend
                local db_status=$(echo "$health_response" | grep -o '"database":[^,}]*' | cut -d'"' -f4 2>/dev/null || echo "unknown")
                if [ "$db_status" = "connected" ] || echo "$health_response" | grep -q '"database".*true'; then
                    log "SUCCESS" "$service_name: ✅ Database connectivity verified from backend"
                else
                    log "ERROR" "$service_name: ❌ Database connectivity failed from backend (status: $db_status)"
                    return 1
                fi

                # Test API docs endpoint
                if timeout 10 curl -s -o /dev/null -w "%{http_code}" "http://localhost:$BACKEND_PORT/docs" | grep -q "200"; then
                    log "SUCCESS" "$service_name: ✅ API documentation accessible"
                else
                    log "WARN" "$service_name: API documentation endpoint not responding"
                fi

                return 0
            else
                log "WARN" "$service_name: Health endpoint returned invalid response (attempt $((attempt + 1))/$max_attempts)"
            fi
        else
            log "WARN" "$service_name: Health endpoint not responding (attempt $((attempt + 1))/$max_attempts)"
        fi

        sleep 10
        ((attempt++))
    done

    log "ERROR" "$service_name: ❌ Health check failed after $max_attempts attempts"
    log "INFO" "$service_name: Diagnostics:"
    log "INFO" "  - Container status: $(docker inspect allemny_backend --format='{{.State.Status}}' 2>/dev/null || echo 'not found')"
    log "INFO" "  - Port binding: $(docker port allemny_backend 2>/dev/null || echo 'no ports exposed')"
    log "INFO" "  - Last 10 log lines:"
    docker logs --tail 10 allemny_backend 2>&1 | while read line; do
        log "INFO" "    $line"
    done
    return 1
}

# Function to check frontend health and accessibility
check_frontend_health() {
    local service_name="Frontend"
    local max_attempts=8
    local attempt=0

    log "INFO" "🔍 Checking Frontend health..."

    # First ensure container is healthy
    if ! check_container_health "allemny_frontend" "Frontend"; then
        return 1
    fi

    # Get frontend port
    source .env

    while [ $attempt -lt $max_attempts ]; do
        # Test if frontend is serving content
        local http_code=$(timeout 15 curl -s -o /dev/null -w "%{http_code}" "http://localhost:$FRONTEND_PORT" 2>/dev/null || echo "000")

        if [ "$http_code" = "200" ]; then
            # Test if it's actually serving React app (look for typical React indicators)
            local content=$(timeout 15 curl -s "http://localhost:$FRONTEND_PORT" 2>/dev/null || echo "")

            if echo "$content" | grep -q -i "react\|app\|root\|<!DOCTYPE html>" && [ ${#content} -gt 100 ]; then
                log "SUCCESS" "$service_name: ✅ Serving application content (${#content} bytes)"

                # Test static assets
                if timeout 10 curl -s -o /dev/null -w "%{http_code}" "http://localhost:$FRONTEND_PORT/static/" | grep -q "200\|404"; then
                    log "SUCCESS" "$service_name: ✅ Static asset routing working"
                fi

                return 0
            else
                log "WARN" "$service_name: Serving content but appears incomplete (attempt $((attempt + 1))/$max_attempts)"
            fi
        elif [ "$http_code" = "404" ]; then
            log "WARN" "$service_name: Server responding but route not found (attempt $((attempt + 1))/$max_attempts)"
        else
            log "WARN" "$service_name: HTTP error $http_code (attempt $((attempt + 1))/$max_attempts)"
        fi

        sleep 8
        ((attempt++))
    done

    log "ERROR" "$service_name: ❌ Health check failed after $max_attempts attempts"
    log "INFO" "$service_name: Diagnostics:"
    log "INFO" "  - Container status: $(docker inspect allemny_frontend --format='{{.State.Status}}' 2>/dev/null || echo 'not found')"
    log "INFO" "  - Port binding: $(docker port allemny_frontend 2>/dev/null || echo 'no ports exposed')"
    log "INFO" "  - Last 10 log lines:"
    docker logs --tail 10 allemny_frontend 2>&1 | while read line; do
        log "INFO" "    $line"
    done
    return 1
}

# Function to check database schema and migrations
check_database_schema() {
    local service_name="Database Schema"

    log "INFO" "🔍 Checking database schema and migrations..."

    # Check if backend container can run alembic commands
    if docker exec allemny_backend alembic current &>/dev/null; then
        local current_revision=$(docker exec allemny_backend alembic current 2>/dev/null | grep -o '[a-f0-9]\{12\}' | head -1)
        local head_revision=$(docker exec allemny_backend alembic heads 2>/dev/null | grep -o '[a-f0-9]\{12\}' | head -1)

        if [ -n "$current_revision" ] && [ -n "$head_revision" ]; then
            if [ "$current_revision" = "$head_revision" ]; then
                log "SUCCESS" "$service_name: ✅ Database is up to date (revision: $current_revision)"
            else
                log "WARN" "$service_name: Database schema mismatch (current: $current_revision, head: $head_revision)"
                log "INFO" "$service_name: Consider running: docker exec allemny_backend alembic upgrade head"
            fi
        else
            log "WARN" "$service_name: Could not determine migration status"
        fi
    else
        log "ERROR" "$service_name: ❌ Cannot access Alembic from backend container"
        return 1
    fi

    # Test table existence and basic functionality
    local table_count=$(docker exec allemny_backend python -c "
import os, sys
sys.path.append('/app')
try:
    from app.database import get_db
    from sqlalchemy import text
    db = next(get_db())
    result = db.execute(text('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = \\'public\\';')).scalar()
    print(f'TABLES:{result}')
    db.close()
except Exception as e:
    print(f'ERROR:{e}')
" 2>/dev/null)

    if echo "$table_count" | grep -q "TABLES:"; then
        local count=$(echo "$table_count" | cut -d: -f2)
        log "SUCCESS" "$service_name: ✅ Schema accessible ($count tables found)"
        return 0
    else
        log "ERROR" "$service_name: ❌ Schema validation failed: $table_count"
        return 1
    fi
}

# Master health check function with comprehensive validation
check_service_health() {
    local start_time=$(date +%s)
    local failed_services=()
    local passed_services=()

    log "INFO" "🚀 Starting comprehensive health validation..."
    log "INFO" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    # Get environment variables
    source .env

    # Fast-fail checks for critical infrastructure
    log "INFO" "Phase 1: Infrastructure Services (fast-fail for critical issues)"

    if check_postgresql_health; then
        passed_services+=("PostgreSQL")
    else
        failed_services+=("PostgreSQL")
        log "ERROR" "💥 Critical failure: PostgreSQL is required for all other services"
    fi

    if check_redis_health; then
        passed_services+=("Redis")
    else
        failed_services+=("Redis")
        log "ERROR" "💥 Critical failure: Redis is required for caching and sessions"
    fi

    if check_ollama_health; then
        passed_services+=("Ollama")
    else
        failed_services+=("Ollama")
        log "WARN" "⚠️  Warning: Ollama failure affects AI features but system can partially function"
    fi

    # If critical infrastructure failed, don't proceed with application checks
    if [[ " ${failed_services[@]} " =~ " PostgreSQL " ]] || [[ " ${failed_services[@]} " =~ " Redis " ]]; then
        log "ERROR" "❌ CRITICAL INFRASTRUCTURE FAILURE - Cannot proceed with application health checks"
        log "ERROR" "Failed services: ${failed_services[*]}"
        log "INFO" "Please fix infrastructure issues before retrying deployment"
        return 1
    fi

    log "INFO" "Phase 2: Application Services"

    if check_backend_health; then
        passed_services+=("Backend API")
    else
        failed_services+=("Backend API")
    fi

    if check_frontend_health; then
        passed_services+=("Frontend")
    else
        failed_services+=("Frontend")
    fi

    log "INFO" "Phase 3: Database Schema Validation"

    if check_database_schema; then
        passed_services+=("Database Schema")
    else
        failed_services+=("Database Schema")
    fi

    # Final health report
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))

    log "INFO" "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    log "INFO" "🏁 Health Check Completed in ${duration}s"

    if [ ${#passed_services[@]} -gt 0 ]; then
        log "SUCCESS" "✅ Healthy Services (${#passed_services[@]}): ${passed_services[*]}"
    fi

    if [ ${#failed_services[@]} -gt 0 ]; then
        log "ERROR" "❌ Failed Services (${#failed_services[@]}): ${failed_services[*]}"

        # Provide specific troubleshooting guidance
        log "INFO" "🔧 Troubleshooting Guide:"
        for service in "${failed_services[@]}"; do
            case "$service" in
                "PostgreSQL")
                    log "INFO" "  📊 PostgreSQL Issues:"
                    log "INFO" "    - Check service: sudo systemctl status postgresql"
                    log "INFO" "    - Check logs: sudo journalctl -u postgresql -n 20"
                    log "INFO" "    - Test connection: psql -h localhost -U allemny_find allemny_find_v2"
                    ;;
                "Redis")
                    log "INFO" "  🔄 Redis Issues:"
                    log "INFO" "    - Check service: sudo systemctl status redis-server"
                    log "INFO" "    - Test connection: redis-cli ping"
                    log "INFO" "    - Check config: redis-cli config get '*'"
                    ;;
                "Ollama")
                    log "INFO" "  🧠 Ollama Issues:"
                    log "INFO" "    - Check service: sudo systemctl status ollama"
                    log "INFO" "    - Test API: curl http://localhost:11434/api/tags"
                    log "INFO" "    - Check models: ollama list"
                    ;;
                "Backend API"|"Frontend"|"Database Schema")
                    log "INFO" "  🐳 Container Issues:"
                    log "INFO" "    - Check containers: docker ps -a"
                    log "INFO" "    - Check logs: docker-compose logs"
                    log "INFO" "    - Restart services: docker-compose restart"
                    ;;
            esac
        done

        # Determine if failure is critical
        local critical_failures=("PostgreSQL" "Redis" "Backend API")
        local has_critical_failure=false

        for service in "${failed_services[@]}"; do
            if [[ " ${critical_failures[@]} " =~ " ${service} " ]]; then
                has_critical_failure=true
                break
            fi
        done

        if [ "$has_critical_failure" = true ]; then
            log "ERROR" "💥 CRITICAL SYSTEM FAILURE - Deployment cannot proceed"
            return 1
        else
            log "WARN" "⚠️  NON-CRITICAL FAILURES - System partially operational"
            log "INFO" "You may proceed but some features will be limited"
        fi
    fi

    # Calculate success rate
    local total_services=$((${#passed_services[@]} + ${#failed_services[@]}))
    local success_rate=$((${#passed_services[@]} * 100 / total_services))

    if [ ${#failed_services[@]} -eq 0 ]; then
        log "SUCCESS" "🎉 PERFECT DEPLOYMENT - ALL SYSTEMS OPERATIONAL (100% success rate)"
        log "INFO" "🌐 Access your application:"
        log "INFO" "  📱 Frontend: http://localhost:$FRONTEND_PORT"
        log "INFO" "  🔧 API Docs: http://localhost:$BACKEND_PORT/docs"
        log "INFO" "  📊 Health: http://localhost:$BACKEND_PORT/health"
        return 0
    elif [ $success_rate -ge 80 ]; then
        log "WARN" "⚠️  PARTIAL DEPLOYMENT SUCCESS ($success_rate% success rate)"
        log "INFO" "Core system is operational but some features may be limited"
        return 0
    else
        log "ERROR" "❌ DEPLOYMENT FAILURE ($success_rate% success rate)"
        log "ERROR" "Too many critical services failed - please address issues and retry"
        return 1
    fi
}

# Function to initialize database
initialize_database() {
    log "INFO" "Initializing database..."

    cd "$INSTALL_DIR/Pre-Prod"

    # Wait for backend container to be ready
    log "INFO" "Waiting for backend container to be ready..."
    local max_attempts=30
    local attempt=0

    while [ $attempt -lt $max_attempts ]; do
        if docker-compose exec -T backend python -c "import sys; sys.exit(0)" 2>/dev/null; then
            log "SUCCESS" "Backend container is ready"
            break
        fi
        sleep 5
        ((attempt++))
        if [ $attempt -eq $max_attempts ]; then
            log "ERROR" "Backend container did not become ready in time"
            return 1
        fi
    done

    # Install pgvector extension in database from backend container
    log "INFO" "Installing pgvector extension..."
    docker-compose exec -T backend python -c "
import psycopg2
import os
try:
    conn = psycopg2.connect(os.getenv('DATABASE_URL'))
    cur = conn.cursor()
    cur.execute('CREATE EXTENSION IF NOT EXISTS vector;')
    conn.commit()
    print('pgvector extension installed successfully')
except Exception as e:
    print(f'pgvector installation failed: {e}')
finally:
    if 'conn' in locals():
        conn.close()
" 2>/dev/null || log "WARN" "pgvector extension installation failed"

    # Run database migrations
    log "INFO" "Running database migrations..."
    if ! docker-compose exec -T backend alembic upgrade head; then
        log "ERROR" "Database migration failed"
        return 1
    fi

    # Setup initial data if needed
    if [ -f "../backend/scripts/init_data.py" ]; then
        log "INFO" "Setting up initial data..."
        docker-compose exec -T backend python scripts/init_data.py
    fi

    log "SUCCESS" "Database initialized successfully"
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

    # Initialize database with migrations
    initialize_database

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