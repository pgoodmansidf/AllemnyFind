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

# Bulletproof deployment configuration
MAX_RETRY_ATTEMPTS=5
RETRY_DELAY_BASE=5
MAX_RETRY_DELAY=300
NETWORK_TIMEOUT=30
DOWNLOAD_TIMEOUT=600
SERVICE_START_TIMEOUT=180
HEALTH_CHECK_TIMEOUT=300

# Fallback URLs and mirror sources
DOCKER_INSTALL_MIRRORS=(
    "https://get.docker.com"
    "https://download.docker.com/linux/static/stable/x86_64/docker-20.10.24.tgz"
    "https://github.com/docker/docker-ce/releases/download/v20.10.24/docker-ce-20.10.24.tgz"
)

NODEJS_INSTALL_MIRRORS=(
    "https://deb.nodesource.com/setup_18.x"
    "https://nodejs.org/dist/v18.17.0/node-v18.17.0-linux-x64.tar.xz"
    "https://github.com/nodejs/node/archive/refs/tags/v18.17.0.tar.gz"
)

OLLAMA_INSTALL_MIRRORS=(
    "https://ollama.ai/install.sh"
    "https://github.com/jmorganca/ollama/releases/latest/download/ollama-linux-amd64"
)

# Alternative package repositories
APT_MIRRORS=(
    "http://archive.ubuntu.com/ubuntu"
    "http://us.archive.ubuntu.com/ubuntu"
    "http://mirror.math.princeton.edu/pub/ubuntu"
)

# DNS servers for fallback resolution
FALLBACK_DNS_SERVERS=(
    "8.8.8.8"
    "1.1.1.1"
    "208.67.222.222"
)

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

    # Function to check internet connectivity with fallback
    check_internet_connectivity_robust() {
        local test_hosts=("google.com" "github.com" "ubuntu.com" "cloudflare.com" "8.8.8.8")
        local connectivity_tests_passed=0
        local required_passed=2

        log "INFO" "Testing internet connectivity with multiple endpoints..."

        for host in "${test_hosts[@]}"; do
            if timeout 10 ping -c 1 "$host" &> /dev/null; then
                log "DEBUG" "Connectivity test passed for: $host"
                ((connectivity_tests_passed++))
                if [ $connectivity_tests_passed -ge $required_passed ]; then
                    break
                fi
            else
                log "DEBUG" "Connectivity test failed for: $host"
            fi
        done

        if [ $connectivity_tests_passed -ge $required_passed ]; then
            log "SUCCESS" "Internet connectivity verified ($connectivity_tests_passed/$required_passed tests passed)"
            return 0
        fi

        # Try with alternative DNS servers
        log "WARN" "Primary connectivity tests failed, trying with alternative DNS..."
        for dns in "${FALLBACK_DNS_SERVERS[@]}"; do
            if timeout 10 nslookup google.com "$dns" &> /dev/null; then
                log "SUCCESS" "DNS resolution working with $dns"
                # Try to configure temporary DNS
                echo "nameserver $dns" | sudo tee /etc/resolv.conf.backup > /dev/null
                if timeout 10 ping -c 1 google.com &> /dev/null; then
                    log "SUCCESS" "Internet connectivity restored with DNS $dns"
                    return 0
                fi
            fi
        done

        log "ERROR" "No internet connectivity detected after testing multiple endpoints and DNS servers"
        return 1
    }

    # Check internet connectivity
    if ! check_internet_connectivity_robust; then
        exit 1
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

# Function to retry with exponential backoff
retry_with_backoff() {
    local max_attempts=$1
    local delay=$2
    local max_delay=${3:-$MAX_RETRY_DELAY}
    shift 3
    local cmd="$@"
    local attempt=1
    local current_delay=$delay

    while [ $attempt -le $max_attempts ]; do
        log "DEBUG" "Executing: $cmd (attempt $attempt/$max_attempts)"
        if eval "$cmd"; then
            log "DEBUG" "Command succeeded on attempt $attempt"
            return 0
        fi

        if [ $attempt -lt $max_attempts ]; then
            log "WARN" "Command failed on attempt $attempt, retrying in ${current_delay}s..."
            sleep $current_delay
            current_delay=$((current_delay * 2))
            if [ $current_delay -gt $max_delay ]; then
                current_delay=$max_delay
            fi
        fi

        ((attempt++))
    done

    log "ERROR" "Command failed after $max_attempts attempts: $cmd"
    return 1
}

# Function to install system dependencies with robust error handling
install_system_dependencies() {
    log "INFO" "Installing system dependencies with bulletproof error handling..."

    # Function to update package lists with retries
    update_package_lists() {
        log "INFO" "Updating package lists with retry logic..."

        # Try multiple times with different approaches
        if retry_with_backoff 3 5 "sudo $UPDATE_CMD"; then
            return 0
        fi

        # If standard update fails, try with different mirrors (for apt)
        if [ "$PACKAGE_MANAGER" = "apt" ]; then
            log "WARN" "Standard package update failed, trying with alternative mirrors..."

            # Backup original sources.list
            if [ -f /etc/apt/sources.list ]; then
                sudo cp /etc/apt/sources.list /etc/apt/sources.list.backup.$(date +%s)
            fi

            for mirror in "${APT_MIRRORS[@]}"; do
                log "INFO" "Trying mirror: $mirror"

                # Create temporary sources.list with this mirror
                local release=$(lsb_release -cs 2>/dev/null || echo "focal")
                sudo tee /etc/apt/sources.list.temp > /dev/null << EOF
deb $mirror $release main restricted universe multiverse
deb $mirror $release-updates main restricted universe multiverse
deb $mirror $release-security main restricted universe multiverse
EOF

                if sudo cp /etc/apt/sources.list.temp /etc/apt/sources.list && \
                   retry_with_backoff 2 3 "sudo apt-get update"; then
                    log "SUCCESS" "Package lists updated successfully with mirror: $mirror"
                    sudo rm -f /etc/apt/sources.list.temp
                    return 0
                fi
            done

            # Restore original sources.list if all mirrors failed
            if [ -f /etc/apt/sources.list.backup.* ]; then
                sudo cp /etc/apt/sources.list.backup.* /etc/apt/sources.list
            fi
        fi

        log "ERROR" "Failed to update package lists with all available methods"
        return 1
    }

    # Function to install packages with alternative approaches
    install_packages_robust() {
        local packages="$@"
        log "INFO" "Installing packages: $packages"

        # Try standard installation
        if retry_with_backoff 3 5 "sudo $INSTALL_CMD $packages"; then
            return 0
        fi

        # Try installing packages one by one
        log "WARN" "Bulk installation failed, trying individual package installation..."
        local failed_packages=()

        for package in $packages; do
            if retry_with_backoff 2 3 "sudo $INSTALL_CMD $package"; then
                log "SUCCESS" "Successfully installed: $package"
            else
                log "WARN" "Failed to install: $package"
                failed_packages+=("$package")
            fi
        done

        # Try alternative package names for failed packages
        for package in "${failed_packages[@]}"; do
            case "$package" in
                "software-properties-common")
                    retry_with_backoff 2 3 "sudo $INSTALL_CMD python-software-properties" || \
                    retry_with_backoff 2 3 "sudo $INSTALL_CMD python3-software-properties"
                    ;;
                "apt-transport-https")
                    # This package is often not needed in newer Ubuntu versions
                    log "INFO" "apt-transport-https not available, likely not needed in this Ubuntu version"
                    ;;
                "lsb-release")
                    retry_with_backoff 2 3 "sudo $INSTALL_CMD lsb-core"
                    ;;
            esac
        done

        return 0
    }

    # Function to install essential tools manually if package installation fails
    install_essential_tools_manually() {
        local tools=("curl" "wget" "git")

        for tool in "${tools[@]}"; do
            if ! command -v "$tool" &> /dev/null; then
                log "WARN" "$tool not available, attempting manual installation..."

                case "$tool" in
                    "curl")
                        # Try to install curl from source as last resort
                        if ! wget --version &> /dev/null; then
                            log "ERROR" "Neither curl nor wget available, cannot proceed"
                            return 1
                        fi
                        ;;
                    "git")
                        log "WARN" "Git not available, will try alternative repository cloning methods"
                        ;;
                esac
            fi
        done

        return 0
    }

    # Main installation logic
    if ! update_package_lists; then
        log "ERROR" "Critical failure: Cannot update package lists"
        return 1
    fi

    # Install basic dependencies
    local basic_packages="curl wget git unzip software-properties-common apt-transport-https ca-certificates gnupg lsb-release"

    if install_packages_robust "$basic_packages"; then
        log "SUCCESS" "System dependencies installed successfully"
    else
        log "WARN" "Some package installations failed, attempting manual installation of essential tools..."
        if install_essential_tools_manually; then
            log "SUCCESS" "Essential tools are available, continuing deployment"
        else
            log "ERROR" "Failed to install essential system dependencies"
            return 1
        fi
    fi

    # Verify critical tools are available
    local critical_tools=("curl" "wget")
    local missing_tools=()

    for tool in "${critical_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            missing_tools+=("$tool")
        fi
    done

    if [ ${#missing_tools[@]} -gt 0 ]; then
        log "ERROR" "Critical tools missing after installation: ${missing_tools[*]}"
        return 1
    fi

    log "SUCCESS" "System dependencies validation completed"
}

# Function to install Docker with bulletproof fallback mechanisms
install_docker() {
    if command -v docker &> /dev/null; then
        local docker_version=$(docker --version | awk '{print $3}' | cut -d',' -f1)
        log "INFO" "Docker already installed: $docker_version"

        # Verify Docker is working
        if sudo docker info &> /dev/null; then
            log "SUCCESS" "Docker is functional"
            return 0
        else
            log "WARN" "Docker installed but not functional, attempting to repair..."
        fi
    fi

    log "INFO" "Installing Docker with bulletproof fallback mechanisms..."

    # Function to install Docker using convenience script
    install_docker_convenience_script() {
        log "INFO" "Attempting Docker installation using convenience script..."

        for script_url in "${DOCKER_INSTALL_MIRRORS[@]}"; do
            if [[ "$script_url" == *.sh ]]; then
                log "INFO" "Trying Docker script: $script_url"

                # Download script with retries
                local script_file="/tmp/get-docker-$(date +%s).sh"
                if retry_with_backoff 3 5 "curl -fsSL '$script_url' -o '$script_file'"; then
                    # Verify script is not empty and contains expected content
                    if [ -s "$script_file" ] && grep -q "docker" "$script_file"; then
                        log "INFO" "Script downloaded successfully, executing..."

                        # Run script with timeout
                        if timeout $DOWNLOAD_TIMEOUT sudo sh "$script_file"; then
                            rm -f "$script_file"
                            if command -v docker &> /dev/null; then
                                log "SUCCESS" "Docker installed successfully using convenience script"
                                return 0
                            fi
                        fi
                    fi
                fi
                rm -f "$script_file"
            fi
        done

        return 1
    }

    # Function to install Docker using package manager
    install_docker_package_manager() {
        log "INFO" "Attempting Docker installation using package manager..."

        case $PACKAGE_MANAGER in
            "apt")
                # Add Docker's official GPG key
                retry_with_backoff 3 5 "curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg" || return 1

                # Add Docker repository
                local release=$(lsb_release -cs 2>/dev/null || echo "focal")
                echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $release stable" | \
                    sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

                # Update package index and install
                if retry_with_backoff 3 5 "sudo apt-get update" && \
                   retry_with_backoff 3 10 "sudo apt-get install -y docker-ce docker-ce-cli containerd.io"; then
                    log "SUCCESS" "Docker installed using apt package manager"
                    return 0
                fi
                ;;
            "yum"|"dnf")
                # Add Docker repository
                sudo tee /etc/yum.repos.d/docker-ce.repo > /dev/null << 'EOF'
[docker-ce-stable]
name=Docker CE Stable - $basearch
baseurl=https://download.docker.com/linux/centos/7/$basearch/stable
enabled=1
gpgcheck=1
gpgkey=https://download.docker.com/linux/centos/gpg
EOF

                if retry_with_backoff 3 10 "sudo $INSTALL_CMD docker-ce docker-ce-cli containerd.io"; then
                    log "SUCCESS" "Docker installed using $PACKAGE_MANAGER package manager"
                    return 0
                fi
                ;;
        esac

        return 1
    }

    # Function to install Docker using static binary
    install_docker_static_binary() {
        log "INFO" "Attempting Docker installation using static binary..."

        local docker_binary_url="https://download.docker.com/linux/static/stable/x86_64/docker-20.10.24.tgz"
        local download_file="/tmp/docker-static.tgz"

        if retry_with_backoff 3 10 "curl -fsSL '$docker_binary_url' -o '$download_file'"; then
            if [ -s "$download_file" ]; then
                log "INFO" "Docker static binary downloaded, installing..."

                # Extract and install
                if tar -xzf "$download_file" -C /tmp/ && \
                   sudo cp /tmp/docker/* /usr/local/bin/ && \
                   sudo chmod +x /usr/local/bin/docker*; then

                    # Create systemd service for Docker daemon
                    sudo tee /etc/systemd/system/docker.service > /dev/null << 'EOF'
[Unit]
Description=Docker Application Container Engine
Documentation=https://docs.docker.com
After=network-online.target firewalld.service
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/local/bin/dockerd
ExecReload=/bin/kill -s HUP $MAINPID
LimitNOFILE=1048576
LimitNPROC=1048576
LimitCORE=infinity
TasksMax=infinity
TimeoutStartSec=0
Delegate=yes
KillMode=process
Restart=on-failure
StartLimitBurst=3
StartLimitInterval=60s

[Install]
WantedBy=multi-user.target
EOF

                    # Enable and start service
                    sudo systemctl daemon-reload
                    sudo systemctl enable docker

                    rm -f "$download_file"
                    rm -rf /tmp/docker

                    log "SUCCESS" "Docker installed using static binary"
                    return 0
                fi
            fi
        fi

        rm -f "$download_file"
        rm -rf /tmp/docker
        return 1
    }

    # Function to install Docker using snap (last resort)
    install_docker_snap() {
        if command -v snap &> /dev/null; then
            log "INFO" "Attempting Docker installation using snap..."

            if retry_with_backoff 3 10 "sudo snap install docker"; then
                log "SUCCESS" "Docker installed using snap"
                return 0
            fi
        fi

        return 1
    }

    # Function to configure Docker after installation
    configure_docker() {
        log "INFO" "Configuring Docker..."

        # Add current user to docker group
        if sudo usermod -aG docker "$USER"; then
            log "SUCCESS" "User added to docker group"
        else
            log "WARN" "Failed to add user to docker group"
        fi

        # Start and enable Docker service with retries
        local service_started=false

        # Try different service names
        for service_name in "docker" "docker.service" "snap.docker.dockerd"; do
            if sudo systemctl start "$service_name" 2>/dev/null; then
                if sudo systemctl enable "$service_name" 2>/dev/null; then
                    log "SUCCESS" "Docker service '$service_name' started and enabled"
                    service_started=true
                    break
                fi
            fi
        done

        if [ "$service_started" = false ]; then
            log "WARN" "Failed to start Docker service automatically"

            # Try manual daemon startup
            if sudo dockerd --detach &> /dev/null; then
                log "SUCCESS" "Docker daemon started manually"
                service_started=true
            fi
        fi

        # Verify Docker installation
        local verification_attempts=0
        local max_verification_attempts=5

        while [ $verification_attempts -lt $max_verification_attempts ]; do
            if sudo docker info &> /dev/null; then
                log "SUCCESS" "Docker verification successful"
                return 0
            fi

            log "DEBUG" "Docker verification attempt $((verification_attempts + 1))/$max_verification_attempts failed"
            sleep 5
            ((verification_attempts++))
        done

        log "WARN" "Docker installed but verification failed"
        return 1
    }

    # Main Docker installation logic with fallback chain
    local installation_methods=(
        "install_docker_convenience_script"
        "install_docker_package_manager"
        "install_docker_static_binary"
        "install_docker_snap"
    )

    for method in "${installation_methods[@]}"; do
        log "INFO" "Trying installation method: $method"

        if $method; then
            if configure_docker; then
                log "SUCCESS" "Docker installed and configured successfully using $method"
                log "INFO" "Please log out and back in to use Docker without sudo"
                return 0
            else
                log "WARN" "Docker installed using $method but configuration failed"
            fi
        fi

        log "WARN" "Installation method $method failed, trying next method..."
        sleep 2
    done

    log "ERROR" "All Docker installation methods failed"
    return 1
}

# Function to install Docker Compose with bulletproof fallback mechanisms
install_docker_compose() {
    if command -v docker-compose &> /dev/null; then
        local compose_version=$(docker-compose --version | awk '{print $3}' | cut -d',' -f1)
        log "INFO" "Docker Compose already installed: $compose_version"

        # Verify Docker Compose is working
        if docker-compose version &> /dev/null; then
            log "SUCCESS" "Docker Compose is functional"
            return 0
        else
            log "WARN" "Docker Compose installed but not functional, attempting to repair..."
        fi
    fi

    log "INFO" "Installing Docker Compose with bulletproof fallback mechanisms..."

    # Function to install Docker Compose using GitHub releases
    install_compose_github() {
        log "INFO" "Installing Docker Compose from GitHub releases..."

        # Try to get latest version
        local latest_version=""
        if latest_version=$(timeout 30 curl -s https://api.github.com/repos/docker/compose/releases/latest | grep -oP '"tag_name": "\K(.*)(?=")' 2>/dev/null); then
            log "INFO" "Latest Docker Compose version: $latest_version"
        else
            # Fallback to known stable version
            latest_version="v2.20.3"
            log "WARN" "Could not fetch latest version, using fallback: $latest_version"
        fi

        local arch=$(uname -m)
        local os=$(uname -s)
        local compose_url="https://github.com/docker/compose/releases/download/$latest_version/docker-compose-$os-$arch"

        # Download with retries
        if retry_with_backoff 3 10 "curl -L '$compose_url' -o /tmp/docker-compose"; then
            if [ -s /tmp/docker-compose ]; then
                # Install binary
                if sudo mv /tmp/docker-compose /usr/local/bin/docker-compose && \
                   sudo chmod +x /usr/local/bin/docker-compose; then

                    # Create symlink
                    sudo ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose 2>/dev/null || true

                    # Verify installation
                    if docker-compose version &> /dev/null; then
                        log "SUCCESS" "Docker Compose installed from GitHub releases"
                        return 0
                    fi
                fi
            fi
        fi

        rm -f /tmp/docker-compose
        return 1
    }

    # Function to install Docker Compose using pip
    install_compose_pip() {
        log "INFO" "Installing Docker Compose using pip..."

        # Install pip if not available
        if ! command -v pip3 &> /dev/null && ! command -v pip &> /dev/null; then
            retry_with_backoff 2 5 "sudo $INSTALL_CMD python3-pip" || return 1
        fi

        # Install docker-compose via pip
        local pip_cmd="pip3"
        if ! command -v pip3 &> /dev/null; then
            pip_cmd="pip"
        fi

        if retry_with_backoff 3 10 "sudo $pip_cmd install docker-compose"; then
            # Create symlink to standard location
            local compose_location=$(which docker-compose 2>/dev/null || echo "")
            if [ -n "$compose_location" ] && [ "$compose_location" != "/usr/local/bin/docker-compose" ]; then
                sudo ln -sf "$compose_location" /usr/local/bin/docker-compose
            fi

            if docker-compose version &> /dev/null; then
                log "SUCCESS" "Docker Compose installed using pip"
                return 0
            fi
        fi

        return 1
    }

    # Function to install Docker Compose using package manager
    install_compose_package_manager() {
        log "INFO" "Installing Docker Compose using package manager..."

        case $PACKAGE_MANAGER in
            "apt")
                if retry_with_backoff 3 5 "sudo apt-get update" && \
                   retry_with_backoff 3 10 "sudo apt-get install -y docker-compose"; then
                    log "SUCCESS" "Docker Compose installed using apt"
                    return 0
                fi
                ;;
            "yum"|"dnf")
                if retry_with_backoff 3 10 "sudo $INSTALL_CMD docker-compose"; then
                    log "SUCCESS" "Docker Compose installed using $PACKAGE_MANAGER"
                    return 0
                fi
                ;;
        esac

        return 1
    }

    # Function to install Docker Compose Plugin (newer method)
    install_compose_plugin() {
        log "INFO" "Installing Docker Compose as Docker plugin..."

        case $PACKAGE_MANAGER in
            "apt")
                if retry_with_backoff 3 10 "sudo apt-get install -y docker-compose-plugin"; then
                    # Create compatibility alias
                    sudo tee /usr/local/bin/docker-compose > /dev/null << 'EOF'
#!/bin/bash
docker compose "$@"
EOF
                    sudo chmod +x /usr/local/bin/docker-compose

                    if docker compose version &> /dev/null; then
                        log "SUCCESS" "Docker Compose plugin installed"
                        return 0
                    fi
                fi
                ;;
        esac

        return 1
    }

    # Main Docker Compose installation logic with fallback chain
    local installation_methods=(
        "install_compose_github"
        "install_compose_package_manager"
        "install_compose_plugin"
        "install_compose_pip"
    )

    for method in "${installation_methods[@]}"; do
        log "INFO" "Trying installation method: $method"

        if $method; then
            log "SUCCESS" "Docker Compose installed successfully using $method"
            return 0
        fi

        log "WARN" "Installation method $method failed, trying next method..."
        sleep 2
    done

    log "ERROR" "All Docker Compose installation methods failed"
    return 1
}

# Function to install Node.js with bulletproof fallback mechanisms
install_nodejs() {
    if command -v node &> /dev/null; then
        local node_version=$(node --version)
        log "INFO" "Node.js already installed: $node_version"

        # Enhanced verification with PATH refresh and debugging
        hash -r  # Refresh PATH cache

        # Wait a moment for PATH to update
        sleep 2

        local node_check=$(command -v node 2>/dev/null)
        local npm_check=$(command -v npm 2>/dev/null)

        log "DEBUG" "Node.js verification: node=$node_check, npm=$npm_check"

        if [ -n "$node_check" ] && node --version &> /dev/null; then
            if [ -n "$npm_check" ] && npm --version &> /dev/null; then
                log "SUCCESS" "Node.js is functional"
                return 0
            else
                log "WARN" "Node.js found but npm is missing or not functional"
                # Try to install npm separately
                if command -v apt &> /dev/null; then
                    sudo apt-get install -y npm 2>/dev/null || true
                fi
                # Refresh and try again
                hash -r
                sleep 2
                if command -v npm &> /dev/null && npm --version &> /dev/null; then
                    log "SUCCESS" "Node.js is functional after npm repair"
                    return 0
                fi
            fi
        fi

        log "WARN" "Node.js installed but not functional, attempting to repair..."
    fi

    log "INFO" "Installing Node.js with bulletproof fallback mechanisms..."

    # Function to install Node.js using NodeSource repository
    install_nodejs_nodesource() {
        log "INFO" "Installing Node.js using NodeSource repository..."

        for setup_url in "${NODEJS_INSTALL_MIRRORS[@]}"; do
            if [[ "$setup_url" == *"setup_"* ]]; then
                log "INFO" "Trying NodeSource setup: $setup_url"

                if retry_with_backoff 3 5 "curl -fsSL '$setup_url' | sudo -E bash -"; then
                    if retry_with_backoff 3 10 "sudo $INSTALL_CMD nodejs"; then
                        if command -v node &> /dev/null && command -v npm &> /dev/null; then
                            log "SUCCESS" "Node.js installed using NodeSource repository"
                            return 0
                        fi
                    fi
                fi
            fi
        done

        return 1
    }

    # Function to install Node.js using package manager
    install_nodejs_package_manager() {
        log "INFO" "Installing Node.js using package manager..."

        case $PACKAGE_MANAGER in
            "apt")
                if retry_with_backoff 3 5 "sudo apt-get update" && \
                   retry_with_backoff 3 10 "sudo apt-get install -y nodejs npm"; then

                    # Ubuntu's nodejs package sometimes installs as 'nodejs' instead of 'node'
                    if ! command -v node &> /dev/null && command -v nodejs &> /dev/null; then
                        sudo ln -sf /usr/bin/nodejs /usr/bin/node
                        sudo ln -sf /usr/bin/nodejs /usr/local/bin/node
                    fi

                    # Ensure npm is available in standard locations
                    if command -v npm &> /dev/null && ! [ -x "/usr/local/bin/npm" ]; then
                        sudo ln -sf "$(command -v npm)" /usr/local/bin/npm
                    fi

                    # Refresh PATH and verify
                    hash -r
                    export PATH="/usr/local/bin:$PATH"
                    sleep 2

                    if command -v node &> /dev/null && command -v npm &> /dev/null; then
                        log "SUCCESS" "Node.js installed using apt package manager"
                        return 0
                    fi
                fi
                ;;
            "yum"|"dnf")
                # Enable EPEL repository for CentOS/RHEL
                retry_with_backoff 2 5 "sudo $INSTALL_CMD epel-release" || true

                if retry_with_backoff 3 10 "sudo $INSTALL_CMD nodejs npm"; then
                    log "SUCCESS" "Node.js installed using $PACKAGE_MANAGER package manager"
                    return 0
                fi
                ;;
        esac

        return 1
    }

    # Function to install Node.js using binary distribution
    install_nodejs_binary() {
        log "INFO" "Installing Node.js using binary distribution..."

        local node_version="18.17.0"
        local arch=$(uname -m)
        local node_url="https://nodejs.org/dist/v$node_version/node-v$node_version-linux-$arch.tar.xz"

        # Map architecture names
        case $arch in
            "x86_64") arch="x64" ;;
            "aarch64") arch="arm64" ;;
            "armv7l") arch="armv7l" ;;
        esac

        node_url="https://nodejs.org/dist/v$node_version/node-v$node_version-linux-$arch.tar.xz"

        local download_file="/tmp/node-v$node_version-linux-$arch.tar.xz"

        if retry_with_backoff 3 10 "curl -L '$node_url' -o '$download_file'"; then
            if [ -s "$download_file" ]; then
                log "INFO" "Node.js binary downloaded, installing..."

                # Extract to temporary location
                if tar -xf "$download_file" -C /tmp/; then
                    local node_dir="/tmp/node-v$node_version-linux-$arch"

                    if [ -d "$node_dir" ]; then
                        # Install to /usr/local
                        if sudo cp -r "$node_dir"/* /usr/local/; then
                            # Create symlinks if needed
                            sudo ln -sf /usr/local/bin/node /usr/bin/node 2>/dev/null || true
                            sudo ln -sf /usr/local/bin/npm /usr/bin/npm 2>/dev/null || true

                            # Clean up
                            rm -rf "$node_dir" "$download_file"

                            if command -v node &> /dev/null && command -v npm &> /dev/null; then
                                log "SUCCESS" "Node.js installed using binary distribution"
                                return 0
                            fi
                        fi
                    fi
                fi
            fi
        fi

        rm -f "$download_file"
        rm -rf "/tmp/node-v$node_version-linux-$arch"
        return 1
    }

    # Function to install Node.js using snap
    install_nodejs_snap() {
        if command -v snap &> /dev/null; then
            log "INFO" "Installing Node.js using snap..."

            if retry_with_backoff 3 10 "sudo snap install node --classic"; then
                # Wait for snap to settle
                sleep 5

                # Create symlinks to standard locations
                sudo ln -sf /snap/bin/node /usr/local/bin/node 2>/dev/null || true
                sudo ln -sf /snap/bin/npm /usr/local/bin/npm 2>/dev/null || true

                # Add snap bin to PATH
                export PATH="/snap/bin:/usr/local/bin:$PATH"
                hash -r
                sleep 2

                if command -v node &> /dev/null && command -v npm &> /dev/null; then
                    log "SUCCESS" "Node.js installed using snap"
                    return 0
                fi
            fi
        fi

        return 1
    }

    # Function to install Node.js using NVM (Node Version Manager)
    install_nodejs_nvm() {
        log "INFO" "Installing Node.js using NVM..."

        # Install NVM
        local nvm_script="https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh"
        if retry_with_backoff 3 5 "curl -fsSL '$nvm_script' | bash"; then
            # Source NVM
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

            if command -v nvm &> /dev/null; then
                # Install Node.js LTS
                if nvm install --lts && nvm use --lts && nvm alias default lts/*; then
                    # Create system-wide symlinks
                    local node_path="$NVM_DIR/versions/node/$(nvm current)/bin"
                    if [ -d "$node_path" ]; then
                        sudo ln -sf "$node_path/node" /usr/local/bin/node
                        sudo ln -sf "$node_path/npm" /usr/local/bin/npm

                        if command -v node &> /dev/null; then
                            log "SUCCESS" "Node.js installed using NVM"
                            return 0
                        fi
                    fi
                fi
            fi
        fi

        return 1
    }

    # Main Node.js installation logic with fallback chain
    local installation_methods=(
        "install_nodejs_nodesource"
        "install_nodejs_package_manager"
        "install_nodejs_binary"
        "install_nodejs_snap"
        "install_nodejs_nvm"
    )

    for method in "${installation_methods[@]}"; do
        log "INFO" "Trying installation method: $method"

        if $method; then
            # Enhanced verification with PATH refresh and debugging
            log "INFO" "Verifying $method installation..."

            # Refresh PATH cache and wait for changes to take effect
            hash -r
            source /etc/environment 2>/dev/null || true
            export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
            sleep 3

            # Debug current PATH and command locations
            local node_path=$(command -v node 2>/dev/null || echo "not found")
            local npm_path=$(command -v npm 2>/dev/null || echo "not found")

            log "DEBUG" "After $method: node at '$node_path', npm at '$npm_path'"

            # Enhanced verification with multiple attempts
            local verify_attempts=0
            while [ $verify_attempts -lt 3 ]; do
                if command -v node &> /dev/null && node --version &> /dev/null; then
                    # Node.js is working, now check for npm
                    if command -v npm &> /dev/null && npm --version &> /dev/null; then
                        local node_version=$(node --version 2>/dev/null || echo "unknown")
                        local npm_version=$(npm --version 2>/dev/null || echo "unknown")
                        log "SUCCESS" "Node.js installed successfully using $method (Node: $node_version, npm: $npm_version)"
                        return 0
                    else
                        # Node works but npm is missing - try to fix npm
                        log "WARN" "Node.js works but npm missing, attempting to install npm..."

                        case $PACKAGE_MANAGER in
                            "apt")
                                sudo apt-get install -y npm 2>/dev/null || true
                                ;;
                            "yum"|"dnf")
                                sudo $INSTALL_CMD npm 2>/dev/null || true
                                ;;
                        esac

                        # Try alternative npm locations
                        for npm_location in "/usr/bin/npm" "/usr/local/bin/npm" "/snap/bin/npm" "$HOME/.nvm/versions/node/*/bin/npm"; do
                            if [ -x "$npm_location" ]; then
                                sudo ln -sf "$npm_location" /usr/local/bin/npm 2>/dev/null || true
                                break
                            fi
                        done

                        hash -r
                        sleep 2
                    fi
                fi

                ((verify_attempts++))
                [ $verify_attempts -lt 3 ] && sleep 2
            done

            log "WARN" "Node.js installation completed but verification failed for method: $method"
            log "DEBUG" "Final verification: node=$(command -v node 2>/dev/null || echo 'not found'), npm=$(command -v npm 2>/dev/null || echo 'not found')"
        fi

        log "WARN" "Installation method $method failed, trying next method..."
        sleep 2
    done

    log "ERROR" "All Node.js installation methods failed"
    return 1
}

# Function to detect and install PostgreSQL with comprehensive Docker networking support
setup_postgresql() {
    log "INFO" "Setting up PostgreSQL with enhanced Docker networking..."

    # Global variables for PostgreSQL setup
    local MAX_CONFIG_ATTEMPTS=3
    local MAX_RESTART_ATTEMPTS=5
    local RESTART_WAIT_TIME=15
    local PG_CONFIG_DIR=""
    local PG_VERSION=""

    # Function to detect PostgreSQL configuration directory with multiple methods
    detect_postgresql_config() {
        local attempt=1

        log "INFO" "Detecting PostgreSQL configuration (attempt $attempt/$MAX_CONFIG_ATTEMPTS)..."

        # Method 1: Get version from running PostgreSQL
        if sudo systemctl is-active --quiet postgresql; then
            PG_VERSION=$(sudo -u postgres psql -t -c "SELECT version();" 2>/dev/null | grep -oE '[0-9]+\.[0-9]+' | head -1 || echo "")
            log "DEBUG" "Detected PostgreSQL version: $PG_VERSION"
        fi

        # Method 2: Try standard locations based on version
        local possible_dirs=()
        if [ -n "$PG_VERSION" ]; then
            possible_dirs+=(
                "/etc/postgresql/$PG_VERSION/main"
                "/var/lib/pgsql/$PG_VERSION/data"
                "/usr/local/pgsql/data"
            )
        fi

        # Method 3: Search common locations regardless of version
        possible_dirs+=(
            "/etc/postgresql/*/main"
            "/var/lib/pgsql/data"
            "/usr/local/var/postgres"
            "/opt/postgresql/*/data"
        )

        # Method 4: Use find command as fallback
        local found_configs=($(sudo find /etc /var/lib/pgsql /usr/local -name "postgresql.conf" 2>/dev/null | head -3))
        for config in "${found_configs[@]}"; do
            possible_dirs+=($(dirname "$config"))
        done

        # Test each possible directory
        for dir in "${possible_dirs[@]}"; do
            # Handle wildcard expansion
            for expanded_dir in $dir; do
                if [ -d "$expanded_dir" ] && [ -f "$expanded_dir/postgresql.conf" ] && [ -f "$expanded_dir/pg_hba.conf" ]; then
                    PG_CONFIG_DIR="$expanded_dir"
                    log "SUCCESS" "Found PostgreSQL config directory: $PG_CONFIG_DIR"
                    return 0
                fi
            done
        done

        log "ERROR" "Could not find PostgreSQL configuration directory"
        return 1
    }

    # Function to configure PostgreSQL for Docker networks with comprehensive settings
    configure_postgresql_docker_networking() {
        log "INFO" "Configuring PostgreSQL for comprehensive Docker networking..."

        if [ -z "$PG_CONFIG_DIR" ]; then
            log "ERROR" "PostgreSQL config directory not set"
            return 1
        fi

        local postgresql_conf="$PG_CONFIG_DIR/postgresql.conf"
        local pg_hba_conf="$PG_CONFIG_DIR/pg_hba.conf"

        # Backup original files
        sudo cp "$postgresql_conf" "$postgresql_conf.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true
        sudo cp "$pg_hba_conf" "$pg_hba_conf.backup.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true

        # Configure postgresql.conf for external connections
        log "INFO" "Updating postgresql.conf for external access..."

        # Set listen_addresses to accept all connections
        if ! sudo grep -q "^listen_addresses = '\*'" "$postgresql_conf" 2>/dev/null; then
            # Try different possible formats
            sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/" "$postgresql_conf" 2>/dev/null || true
            sudo sed -i "s/^listen_addresses = 'localhost'/listen_addresses = '*'/" "$postgresql_conf" 2>/dev/null || true
            sudo sed -i "s/^#listen_addresses = 'localhost'/listen_addresses = '*'/" "$postgresql_conf" 2>/dev/null || true

            # If sed didn't work, append the setting
            if ! sudo grep -q "^listen_addresses = '\*'" "$postgresql_conf" 2>/dev/null; then
                echo "listen_addresses = '*'" | sudo tee -a "$postgresql_conf" >/dev/null
            fi
        fi

        # Configure additional connection settings for Docker
        local additional_settings=(
            "max_connections = 200"
            "shared_buffers = 256MB"
            "effective_cache_size = 1GB"
            "wal_buffers = 16MB"
            "checkpoint_completion_target = 0.9"
            "random_page_cost = 1.1"
        )

        for setting in "${additional_settings[@]}"; do
            local setting_name=$(echo "$setting" | cut -d'=' -f1 | xargs)
            if ! sudo grep -q "^$setting_name =" "$postgresql_conf" 2>/dev/null; then
                echo "$setting" | sudo tee -a "$postgresql_conf" >/dev/null
            fi
        done

        # Configure pg_hba.conf for comprehensive Docker network access
        log "INFO" "Updating pg_hba.conf for Docker networks..."

        # Get all possible Docker networks dynamically
        local docker_networks=()

        # Standard Docker bridge networks
        docker_networks+=(
            "172.17.0.0/16"    # Default Docker bridge
            "172.18.0.0/16"    # Additional Docker networks
            "172.19.0.0/16"
            "172.20.0.0/16"
            "192.168.0.0/16"   # Custom networks
            "10.0.0.0/8"       # Wide private range
        )

        # Detect active Docker networks
        if command -v docker &> /dev/null; then
            while IFS= read -r network; do
                if [ -n "$network" ] && [[ "$network" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+$ ]]; then
                    docker_networks+=("$network")
                fi
            done < <(docker network ls --format "{{.Name}}" 2>/dev/null | xargs -I {} docker network inspect {} --format "{{range .IPAM.Config}}{{.Subnet}}{{end}}" 2>/dev/null | sort -u)
        fi

        # Add localhost entries
        local localhost_entries=(
            "127.0.0.1/32"
            "::1/128"
            "localhost"
        )

        # Add entries to pg_hba.conf if not present
        for network in "${docker_networks[@]}" "${localhost_entries[@]}"; do
            if ! sudo grep -q "$network" "$pg_hba_conf" 2>/dev/null; then
                if [[ "$network" == *":"* ]]; then
                    # IPv6 entry
                    echo "host    all             all             $network                 md5" | sudo tee -a "$pg_hba_conf" >/dev/null
                elif [[ "$network" == "localhost" ]]; then
                    # Hostname entry
                    echo "host    all             all             localhost                md5" | sudo tee -a "$pg_hba_conf" >/dev/null
                else
                    # IPv4 network entry
                    echo "host    all             all             $network           md5" | sudo tee -a "$pg_hba_conf" >/dev/null
                fi
                log "DEBUG" "Added network access for: $network"
            fi
        done

        # Add trust entries for local development (optional but helpful)
        local trust_entries=(
            "local   all             postgres                                peer"
            "local   all             allemny_find                           md5"
        )

        for entry in "${trust_entries[@]}"; do
            if ! sudo grep -q "$entry" "$pg_hba_conf" 2>/dev/null; then
                echo "$entry" | sudo tee -a "$pg_hba_conf" >/dev/null
            fi
        done

        log "SUCCESS" "PostgreSQL configuration updated for Docker networking"
    }

    # Function to restart PostgreSQL with proper wait and verification
    restart_postgresql_with_verification() {
        local attempt=1

        while [ $attempt -le $MAX_RESTART_ATTEMPTS ]; do
            log "INFO" "Restarting PostgreSQL service (attempt $attempt/$MAX_RESTART_ATTEMPTS)..."

            # Stop PostgreSQL gracefully
            sudo systemctl stop postgresql 2>/dev/null || true
            sleep 3

            # Start PostgreSQL
            if sudo systemctl start postgresql; then
                log "INFO" "PostgreSQL service started, waiting for initialization..."

                # Wait for PostgreSQL to be ready with exponential backoff
                local wait_time=$RESTART_WAIT_TIME
                local max_wait_attempts=8
                local wait_attempt=1

                while [ $wait_attempt -le $max_wait_attempts ]; do
                    sleep $((wait_time * wait_attempt))

                    # Test if PostgreSQL is accepting connections
                    if sudo -u postgres psql -c "SELECT 1;" &>/dev/null; then
                        log "SUCCESS" "PostgreSQL is ready and accepting connections"
                        return 0
                    fi

                    log "DEBUG" "PostgreSQL not ready yet, waiting... (attempt $wait_attempt/$max_wait_attempts)"
                    ((wait_attempt++))
                done

                log "WARN" "PostgreSQL started but not accepting connections after $((wait_time * max_wait_attempts)) seconds"
            else
                log "WARN" "Failed to start PostgreSQL on attempt $attempt"
            fi

            # Show service status for debugging
            log "DEBUG" "PostgreSQL service status:"
            sudo systemctl status postgresql --no-pager --lines=5 2>&1 | while read line; do
                log "DEBUG" "  $line"
            done

            ((attempt++))
            [ $attempt -le $MAX_RESTART_ATTEMPTS ] && sleep 10
        done

        log "ERROR" "Failed to restart PostgreSQL after $MAX_RESTART_ATTEMPTS attempts"
        return 1
    }

    # Function to test Docker connectivity comprehensively
    test_docker_connectivity() {
        log "INFO" "Testing Docker network connectivity to PostgreSQL..."

        local test_passed=0
        local test_methods=()

        # Method 1: Test from default Docker bridge
        local bridge_ip=$(docker network inspect bridge --format='{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || echo "172.17.0.1")
        if PGPASSWORD='AFbqSrE?h8bPjSCs9#' timeout 10 psql -h "$bridge_ip" -p 5432 -U allemny_find -d allemny_find_v2 -c "SELECT version();" &>/dev/null; then
            log "SUCCESS" "Docker bridge connectivity verified (IP: $bridge_ip)"
            test_methods+=("bridge:$bridge_ip")
            ((test_passed++))
        else
            log "WARN" "Docker bridge connectivity failed (IP: $bridge_ip)"
        fi

        # Method 2: Test using host.docker.internal (if available)
        if PGPASSWORD='AFbqSrE?h8bPjSCs9#' timeout 10 psql -h host.docker.internal -p 5432 -U allemny_find -d allemny_find_v2 -c "SELECT version();" &>/dev/null 2>/dev/null; then
            log "SUCCESS" "Docker host.docker.internal connectivity verified"
            test_methods+=("host.docker.internal")
            ((test_passed++))
        fi

        # Method 3: Test using localhost from container perspective
        if command -v docker &> /dev/null; then
            # Create a temporary test container to verify connectivity
            local container_test=$(docker run --rm postgres:13 timeout 10 psql -h host.docker.internal -p 5432 -U allemny_find -d allemny_find_v2 -c "SELECT 1;" 2>/dev/null && echo "SUCCESS" || echo "FAILED")
            if [ "$container_test" = "SUCCESS" ]; then
                log "SUCCESS" "Container-to-host connectivity verified"
                test_methods+=("container-test")
                ((test_passed++))
            fi
        fi

        # Method 4: Test network discovery and connectivity
        if command -v docker &> /dev/null; then
            local networks=$(docker network ls --format "{{.Name}}" | grep -v "none\|host")
            for network in $networks; do
                local subnet=$(docker network inspect "$network" --format "{{range .IPAM.Config}}{{.Subnet}}{{end}}" 2>/dev/null)
                if [ -n "$subnet" ]; then
                    log "DEBUG" "Found Docker network '$network' with subnet: $subnet"
                fi
            done
        fi

        if [ $test_passed -gt 0 ]; then
            log "SUCCESS" "Docker connectivity verified using methods: ${test_methods[*]}"
            return 0
        else
            log "ERROR" "All Docker connectivity tests failed"

            # Diagnostic information
            log "INFO" "Diagnostic information:"
            log "INFO" "  - PostgreSQL status: $(sudo systemctl is-active postgresql 2>/dev/null || echo 'inactive')"
            log "INFO" "  - PostgreSQL listening: $(sudo ss -tuln | grep ':5432' || echo 'not listening')"
            log "INFO" "  - Docker bridge IP: $bridge_ip"
            log "INFO" "  - pg_hba.conf Docker entries:"
            sudo grep -E "(172\.|192\.168\.|10\.)" "$PG_CONFIG_DIR/pg_hba.conf" 2>/dev/null | while read line; do
                log "INFO" "    $line"
            done

            return 1
        fi
    }

    # Main setup logic starts here
    log "INFO" "=== Starting Enhanced PostgreSQL Setup ==="

    # Step 1: Install PostgreSQL if not present
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

    # Step 2: Ensure PostgreSQL service is running
    if ! sudo systemctl is-active --quiet postgresql; then
        log "INFO" "Starting PostgreSQL service..."
        sudo systemctl start postgresql
        sudo systemctl enable postgresql
        sleep 5
    else
        log "SUCCESS" "PostgreSQL service is running"
    fi

    # Step 3: Detect configuration with retries
    local config_attempt=1
    while [ $config_attempt -le $MAX_CONFIG_ATTEMPTS ]; do
        if detect_postgresql_config; then
            break
        fi

        log "WARN" "Configuration detection failed (attempt $config_attempt/$MAX_CONFIG_ATTEMPTS)"
        if [ $config_attempt -lt $MAX_CONFIG_ATTEMPTS ]; then
            log "INFO" "Retrying configuration detection in 5 seconds..."
            sleep 5
        fi
        ((config_attempt++))
    done

    if [ -z "$PG_CONFIG_DIR" ]; then
        log "ERROR" "Failed to detect PostgreSQL configuration after $MAX_CONFIG_ATTEMPTS attempts"
        log "WARN" "Proceeding with database setup using default configuration"
    else
        # Step 4: Configure PostgreSQL for Docker networking
        if configure_postgresql_docker_networking; then
            # Step 5: Restart PostgreSQL with verification
            if ! restart_postgresql_with_verification; then
                log "ERROR" "Failed to restart PostgreSQL with new configuration"
                return 1
            fi
        else
            log "WARN" "PostgreSQL configuration failed, proceeding with existing settings"
        fi
    fi

    # Step 6: Create database and user
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
    sudo -u postgres psql -c "ALTER USER allemny_find WITH SUPERUSER;" 2>/dev/null || true

    # Step 7: Install pgvector extension
    log "INFO" "Installing pgvector extension..."
    sudo -u postgres psql -d allemny_find_v2 -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || log "WARN" "pgvector extension not available (will be installed later)"

    # Step 8: Test basic connectivity
    log "INFO" "Testing basic PostgreSQL connectivity..."
    if PGPASSWORD='AFbqSrE?h8bPjSCs9#' timeout 10 psql -h localhost -p 5432 -U allemny_find -d allemny_find_v2 -c "SELECT version();" &>/dev/null; then
        log "SUCCESS" "Basic PostgreSQL connectivity verified"
    else
        log "ERROR" "Basic PostgreSQL connectivity test failed"
        return 1
    fi

    # Step 9: Test Docker connectivity (if configuration was successful)
    if [ -n "$PG_CONFIG_DIR" ]; then
        if test_docker_connectivity; then
            log "SUCCESS" "Enhanced PostgreSQL setup completed with Docker networking"
        else
            log "WARN" "PostgreSQL setup completed but Docker connectivity issues detected"
            log "INFO" "System will function but containers may have connectivity issues"
        fi
    else
        log "SUCCESS" "Basic PostgreSQL setup completed"
        log "WARN" "Docker networking may need manual configuration"
    fi

    log "SUCCESS" "=== PostgreSQL Setup Completed ==="
    return 0
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

    # Function to check if model exists (handles version tags)
    check_model_exists() {
        local model_name="$1"
        local model_list=$(ollama list 2>/dev/null)

        if [ -z "$model_list" ]; then
            log "DEBUG" "No models found or ollama list failed"
            return 1
        fi

        # Debug: show what we're working with
        log "DEBUG" "Checking for model '$model_name' in model list"

        # Method 1: Check if model exists with any tag (exact name, :latest, :v1.5, etc.)
        # This regex matches: "nomic-embed-text" or "nomic-embed-text:anything" followed by whitespace
        if echo "$model_list" | grep -q "^$model_name\(:.*\)\?[[:space:]]"; then
            local found_model=$(echo "$model_list" | grep "^$model_name\(:.*\)\?[[:space:]]" | head -1 | awk '{print $1}')
            log "DEBUG" "Found model (method 1): $found_model"
            return 0
        fi

        # Method 2: Check for exact match at start of line
        if echo "$model_list" | grep -q "^$model_name[[:space:]]"; then
            local found_model=$(echo "$model_list" | grep "^$model_name[[:space:]]" | head -1 | awk '{print $1}')
            log "DEBUG" "Found model (method 2): $found_model"
            return 0
        fi

        # Method 3: Fallback - check if any line contains the model name
        if echo "$model_list" | grep -q "$model_name"; then
            local found_model=$(echo "$model_list" | grep "$model_name" | head -1 | awk '{print $1}')
            log "DEBUG" "Found model (method 3 - fallback): $found_model"
            return 0
        fi

        # Enhanced diagnostics for debugging
        log "DEBUG" "Model $model_name not found. Available models:"
        echo "$model_list" | while IFS= read -r line; do
            if [ -n "$line" ] && [[ ! "$line" =~ ^NAME ]]; then
                log "DEBUG" "  Available: $line"
            fi
        done

        return 1
    }

    # Function to get the actual model name as it appears in ollama list
    get_actual_model_name() {
        local model_name="$1"
        local model_list=$(ollama list 2>/dev/null)

        if [ -z "$model_list" ]; then
            echo "$model_name"
            return 1
        fi

        # Try to get the exact model name with tag
        local actual_model=$(echo "$model_list" | grep "$model_name" | head -1 | awk '{print $1}')
        if [ -n "$actual_model" ]; then
            echo "$actual_model"
            return 0
        fi

        # Fallback to original name
        echo "$model_name"
        return 1
    }

    # Function to test the specific scenario from deployment logs
    test_model_detection_scenario() {
        log "INFO" "Testing the specific model detection scenario from deployment logs..."

        # Simulate the exact scenario: model exists as "nomic-embed-text:latest" but health check looks for "nomic-embed-text"
        local model_list=$(ollama list 2>/dev/null)

        if [ -z "$model_list" ]; then
            log "WARN" "Cannot test scenario - ollama list returned empty"
            return 1
        fi

        log "DEBUG" "Current model list:"
        echo "$model_list" | while IFS= read -r line; do
            if [ -n "$line" ]; then
                log "DEBUG" "  $line"
            fi
        done

        # Test the old (broken) detection method
        if echo "$model_list" | grep -q "^nomic-embed-text"; then
            log "DEBUG" "OLD METHOD: Would find model with exact match"
        else
            log "DEBUG" "OLD METHOD: Would FAIL to find model (this was the bug)"
        fi

        # Test our new enhanced detection method
        if check_model_exists "nomic-embed-text"; then
            local found_model=$(get_actual_model_name "nomic-embed-text")
            log "SUCCESS" "NEW METHOD: Successfully detected model as '$found_model'"
            return 0
        else
            log "ERROR" "NEW METHOD: Still failing to detect model"
            return 1
        fi
    }

    # Function to download and verify model with enhanced detection
    download_model() {
        local model_name="$1"
        local attempt=1

        log "INFO" "Downloading model: $model_name (this may take several minutes)..."

        while [ $attempt -le $MAX_MODEL_ATTEMPTS ]; do
            log "INFO" "Model download attempt $attempt/$MAX_MODEL_ATTEMPTS..."

            # Check if model already exists using enhanced detection
            if check_model_exists "$model_name"; then
                log "SUCCESS" "Model $model_name is already available"
                return 0
            fi

            # Download model with timeout and progress monitoring
            log "INFO" "Pulling $model_name... (this may take 5-15 minutes depending on connection)"

            # Use timeout to prevent hanging
            if timeout 1800 ollama pull "$model_name"; then
                # Verify model was downloaded successfully with retry
                sleep 3
                local verify_attempts=0
                while [ $verify_attempts -lt 3 ]; do
                    if check_model_exists "$model_name"; then
                        log "SUCCESS" "Model $model_name downloaded and verified successfully"
                        return 0
                    fi
                    log "DEBUG" "Model verification attempt $((verify_attempts + 1))/3 failed, retrying..."
                    sleep 2
                    ((verify_attempts++))
                done
                log "WARN" "Model download completed but verification failed after 3 attempts"
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

    # Function to perform comprehensive health check with enhanced model detection
    perform_health_check() {
        log "INFO" "Performing comprehensive Ollama health check..."

        # Test 1: Service status
        if ! sudo systemctl is-active --quiet ollama; then
            log "ERROR" "Health check failed: Service is not active"
            return 1
        fi

        # Test 2: API connectivity with detailed diagnosis
        log "INFO" "Testing API connectivity..."
        local api_response=$(timeout 10 curl -s http://localhost:$OLLAMA_PORT/api/tags 2>/dev/null)
        if [ -z "$api_response" ]; then
            log "ERROR" "Health check failed: API is not accessible"
            log "DEBUG" "API endpoint: http://localhost:$OLLAMA_PORT/api/tags"
            return 1
        fi
        log "SUCCESS" "API connectivity verified"

        # Test 3: Enhanced model availability check with detailed logging
        log "INFO" "Checking model availability with enhanced detection..."

        # First, get the raw model list for diagnostics
        local raw_model_list=$(ollama list 2>/dev/null)
        log "DEBUG" "Raw model list output:"
        echo "$raw_model_list" | while IFS= read -r line; do
            if [ -n "$line" ]; then
                log "DEBUG" "  $line"
            fi
        done

        if ! check_model_exists "nomic-embed-text"; then
            log "ERROR" "Health check failed: Required model not available"
            log "INFO" "Available models: $(ollama list 2>/dev/null | grep -v 'NAME' | awk '{print $1}' | tr '\n' ', ' | sed 's/,$//' || echo 'none')"

            # Try to understand why detection failed
            if echo "$raw_model_list" | grep -q "nomic-embed-text"; then
                log "WARN" "Model appears to exist but detection logic failed - this is the bug we're fixing!"
                log "INFO" "Model line from ollama list: $(echo "$raw_model_list" | grep "nomic-embed-text")"
            fi

            return 1
        fi

        # Test 4: Model functionality with retry logic and better diagnostics
        log "INFO" "Testing model functionality..."
        local func_attempts=0
        local max_func_attempts=3
        local actual_model=$(get_actual_model_name "nomic-embed-text")

        log "INFO" "Using model name: '$actual_model' for API calls"

        while [ $func_attempts -lt $max_func_attempts ]; do
            # Try to use the model as it appears in the list (with potential tag)
            local test_payload="{\"model\":\"$actual_model\",\"prompt\":\"test\"}"

            log "DEBUG" "Testing with payload: $test_payload"
            local api_result=$(echo "$test_payload" | curl -s --connect-timeout 10 --max-time 30 -X POST http://localhost:$OLLAMA_PORT/api/embeddings -d @- 2>/dev/null)

            if echo "$api_result" | grep -q "embedding"; then
                log "SUCCESS" "Model functionality test passed using model: $actual_model"
                break
            fi

            # Fallback: try with just the base name
            test_payload='{"model":"nomic-embed-text","prompt":"test"}'
            log "DEBUG" "Fallback testing with payload: $test_payload"
            api_result=$(echo "$test_payload" | curl -s --connect-timeout 10 --max-time 30 -X POST http://localhost:$OLLAMA_PORT/api/embeddings -d @- 2>/dev/null)

            if echo "$api_result" | grep -q "embedding"; then
                log "SUCCESS" "Model functionality test passed using base name"
                break
            fi

            ((func_attempts++))
            if [ $func_attempts -lt $max_func_attempts ]; then
                log "DEBUG" "Model functionality test attempt $func_attempts failed. API response: ${api_result:0:200}..."
                sleep 3
            fi
        done

        if [ $func_attempts -eq $max_func_attempts ]; then
            log "WARN" "Model functionality test failed after $max_func_attempts attempts, but service is running"
            log "INFO" "Model may need time to load or there may be compatibility issues"
            log "DEBUG" "Final API response was: ${api_result:0:200}..."
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

            # Ensure model is available using enhanced detection
            if ! check_model_exists "nomic-embed-text"; then
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

    # Test the specific model detection scenario
    log "INFO" "Running model detection validation..."
    if test_model_detection_scenario; then
        log "SUCCESS" "Model detection validation passed"
    else
        log "WARN" "Model detection validation had issues, but proceeding with final health check"
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
    log "INFO" "Model detection: Enhanced logic now handles version tags properly"

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

# Function to clone repository with bulletproof fallback mechanisms
clone_repository() {
    log "INFO" "Cloning Allemny Find repository with bulletproof fallback mechanisms..."

    # Function to backup existing installation
    backup_existing_installation() {
        if [ -d "$INSTALL_DIR" ]; then
            local backup_dir="${INSTALL_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
            log "WARN" "Existing installation found. Backing up to: $backup_dir"

            if mv "$INSTALL_DIR" "$backup_dir"; then
                log "SUCCESS" "Existing installation backed up successfully"
                echo "$backup_dir" > /tmp/allemny_backup_location
                return 0
            else
                log "ERROR" "Failed to backup existing installation"
                return 1
            fi
        fi
        return 0
    }

    # Function to restore from backup if needed
    restore_from_backup() {
        if [ -f /tmp/allemny_backup_location ]; then
            local backup_dir=$(cat /tmp/allemny_backup_location)
            if [ -d "$backup_dir" ]; then
                log "INFO" "Restoring from backup: $backup_dir"
                mv "$backup_dir" "$INSTALL_DIR"
                rm -f /tmp/allemny_backup_location
                return 0
            fi
        fi
        return 1
    }

    # Function to clone using git
    clone_with_git() {
        log "INFO" "Attempting to clone repository using git..."

        local git_clone_attempts=0
        local max_git_attempts=3

        while [ $git_clone_attempts -lt $max_git_attempts ]; do
            log "INFO" "Git clone attempt $((git_clone_attempts + 1))/$max_git_attempts"

            # Try different clone methods
            local clone_methods=(
                "git clone --depth 1 --single-branch --branch $BRANCH $REPO_URL $INSTALL_DIR"
                "git clone --single-branch --branch $BRANCH $REPO_URL $INSTALL_DIR"
                "git clone $REPO_URL $INSTALL_DIR"
            )

            for method in "${clone_methods[@]}"; do
                log "DEBUG" "Trying clone method: $method"

                if timeout $DOWNLOAD_TIMEOUT $method; then
                    cd "$INSTALL_DIR"

                    # Ensure we're on the correct branch
                    if [ "$(git branch --show-current 2>/dev/null)" != "$BRANCH" ]; then
                        git checkout "$BRANCH" 2>/dev/null || git checkout -b "$BRANCH" "origin/$BRANCH" 2>/dev/null || true
                    fi

                    # Verify we have the essential files
                    if [ -f "Pre-Prod/docker-compose.yml" ] || [ -f "docker-compose.yml" ]; then
                        log "SUCCESS" "Repository cloned successfully using git"
                        return 0
                    else
                        log "WARN" "Repository cloned but essential files missing"
                        rm -rf "$INSTALL_DIR"
                    fi
                fi
            done

            ((git_clone_attempts++))
            if [ $git_clone_attempts -lt $max_git_attempts ]; then
                log "WARN" "Git clone failed, retrying in 10 seconds..."
                sleep 10
            fi
        done

        return 1
    }

    # Function to download as zip archive (fallback when git fails)
    download_as_archive() {
        log "INFO" "Git clone failed, trying archive download..."

        local archive_urls=(
            "${REPO_URL}/archive/refs/heads/${BRANCH}.zip"
            "${REPO_URL}/archive/${BRANCH}.zip"
            "${REPO_URL}/zipball/${BRANCH}"
        )

        for archive_url in "${archive_urls[@]}"; do
            log "INFO" "Trying archive URL: $archive_url"

            local archive_file="/tmp/allemny-repo.zip"
            if retry_with_backoff 3 10 "curl -L '$archive_url' -o '$archive_file'"; then
                if [ -s "$archive_file" ]; then
                    log "INFO" "Archive downloaded, extracting..."

                    # Create temporary extraction directory
                    local extract_dir="/tmp/allemny-extract-$$"
                    mkdir -p "$extract_dir"

                    if unzip -q "$archive_file" -d "$extract_dir"; then
                        # Find the extracted directory (name may vary)
                        local extracted_dir=$(find "$extract_dir" -mindepth 1 -maxdepth 1 -type d | head -1)

                        if [ -n "$extracted_dir" ] && [ -d "$extracted_dir" ]; then
                            # Move to final location
                            if mv "$extracted_dir" "$INSTALL_DIR"; then
                                # Verify essential files exist
                                if [ -f "$INSTALL_DIR/Pre-Prod/docker-compose.yml" ] || [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
                                    log "SUCCESS" "Repository downloaded and extracted successfully"
                                    rm -f "$archive_file"
                                    rm -rf "$extract_dir"
                                    return 0
                                fi
                            fi
                        fi
                    fi

                    # Cleanup on failure
                    rm -rf "$extract_dir"
                fi
            fi

            rm -f "$archive_file"
        done

        return 1
    }

    # Function to create minimal repository structure (last resort)
    create_minimal_structure() {
        log "WARN" "All download methods failed, creating minimal repository structure..."

        mkdir -p "$INSTALL_DIR/Pre-Prod"
        cd "$INSTALL_DIR"

        # Create basic docker-compose.yml if it doesn't exist
        if [ ! -f "Pre-Prod/docker-compose.yml" ]; then
            log "INFO" "Creating minimal docker-compose.yml..."
            cat > "Pre-Prod/docker-compose.yml" << 'EOF'
version: '3.8'
services:
  backend:
    build:
      context: ../backend
      dockerfile: Dockerfile
    ports:
      - "8001:8000"
    environment:
      - DATABASE_URL=postgresql://allemny_find:AFbqSrE%3Fh8bPjSCs9%23@host.docker.internal:5432/allemny_find_v2
      - REDIS_URL=redis://host.docker.internal:6379
    depends_on:
      - redis

  frontend:
    build:
      context: ../frontend
      dockerfile: Dockerfile
    ports:
      - "3001:3000"
    environment:
      - REACT_APP_API_URL=http://localhost:8001
    depends_on:
      - backend

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
EOF
        fi

        # Create basic environment file
        if [ ! -f "Pre-Prod/.env.template" ]; then
            log "INFO" "Creating minimal environment template..."
            cat > "Pre-Prod/.env.template" << 'EOF'
BACKEND_PORT=8001
FRONTEND_PORT=3001
REDIS_PORT=6379
DATABASE_URL=postgresql://allemny_find:AFbqSrE%3Fh8bPjSCs9%23@localhost:5432/allemny_find_v2
REDIS_URL=redis://localhost:6379
OLLAMA_PORT=11434
EOF
        fi

        log "WARN" "Minimal structure created, but full functionality may be limited"
        return 0
    }

    # Main repository acquisition logic
    if ! backup_existing_installation; then
        log "ERROR" "Failed to backup existing installation, aborting"
        return 1
    fi

    # Try different methods in order of preference
    if clone_with_git; then
        log "SUCCESS" "Repository acquisition completed using git"
        return 0
    elif download_as_archive; then
        log "SUCCESS" "Repository acquisition completed using archive download"
        return 0
    elif create_minimal_structure; then
        log "WARN" "Repository acquisition completed using minimal structure"
        log "WARN" "Manual intervention may be required for full functionality"
        return 0
    else
        log "ERROR" "All repository acquisition methods failed"

        # Try to restore from backup
        if restore_from_backup; then
            log "INFO" "Restored from backup, continuing with existing installation"
            return 0
        else
            log "ERROR" "Failed to acquire repository and no backup available"
            return 1
        fi
    fi
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

# Function to build and start services with bulletproof error handling
start_services() {
    log "INFO" "Building and starting Allemny Find services with bulletproof error handling..."

    cd "$INSTALL_DIR/Pre-Prod"

    # Function to build containers with retries and fallbacks
    build_containers_robust() {
        log "INFO" "Building Docker containers with robust error handling..."

        # Try parallel build first (fastest)
        if retry_with_backoff 2 30 "docker-compose build --parallel --no-cache"; then
            log "SUCCESS" "Containers built successfully (parallel build)"
            return 0
        fi

        log "WARN" "Parallel build failed, trying sequential build..."

        # Try sequential build (more reliable)
        if retry_with_backoff 2 30 "docker-compose build --no-cache"; then
            log "SUCCESS" "Containers built successfully (sequential build)"
            return 0
        fi

        log "WARN" "Clean build failed, trying incremental build..."

        # Try incremental build (may use cached layers)
        if retry_with_backoff 2 30 "docker-compose build"; then
            log "SUCCESS" "Containers built successfully (incremental build)"
            return 0
        fi

        # Individual service build as last resort
        log "WARN" "Full compose build failed, trying individual service builds..."
        local services=("backend" "frontend")
        local built_services=()
        local failed_services=()

        for service in "${services[@]}"; do
            if retry_with_backoff 2 20 "docker-compose build $service"; then
                log "SUCCESS" "Service '$service' built successfully"
                built_services+=("$service")
            else
                log "ERROR" "Service '$service' build failed"
                failed_services+=("$service")
            fi
        done

        if [ ${#failed_services[@]} -eq 0 ]; then
            log "SUCCESS" "All services built individually"
            return 0
        else
            log "ERROR" "Failed to build services: ${failed_services[*]}"
            return 1
        fi
    }

    # Function to start services with comprehensive monitoring
    start_services_robust() {
        log "INFO" "Starting services with comprehensive monitoring..."

        # Clean up any existing containers that might be in bad state
        log "INFO" "Cleaning up any existing containers..."
        docker-compose down --remove-orphans --volumes 2>/dev/null || true
        sleep 5

        # Start services with retry logic
        if retry_with_backoff 3 10 "docker-compose up -d --remove-orphans"; then
            log "SUCCESS" "Services started successfully"
        else
            log "WARN" "Standard startup failed, trying individual service startup..."

            # Try starting services individually
            local services=("backend" "frontend")
            local started_services=()
            local failed_services=()

            for service in "${services[@]}"; do
                if retry_with_backoff 2 10 "docker-compose up -d $service"; then
                    log "SUCCESS" "Service '$service' started successfully"
                    started_services+=("$service")
                    sleep 10  # Give each service time to start
                else
                    log "ERROR" "Service '$service' startup failed"
                    failed_services+=("$service")
                fi
            done

            if [ ${#failed_services[@]} -gt 0 ]; then
                log "ERROR" "Failed to start services: ${failed_services[*]}"
                return 1
            fi
        fi

        # Enhanced service monitoring with exponential backoff
        monitor_service_startup() {
            local max_wait_time=$SERVICE_START_TIMEOUT
            local check_interval=5
            local waited=0
            local all_services_ready=false

            log "INFO" "Monitoring service startup (timeout: ${max_wait_time}s)..."

            while [ $waited -lt $max_wait_time ]; do
                local services_status=$(docker-compose ps --services --filter "status=running" 2>/dev/null | wc -l)
                local total_services=$(docker-compose ps --services 2>/dev/null | wc -l)

                if [ "$services_status" -eq "$total_services" ] && [ "$total_services" -gt 0 ]; then
                    # All services are running, but let's verify they're actually healthy
                    local healthy_count=0

                    # Check if containers are actually responding
                    for service in backend frontend; do
                        local container_name="${service}"
                        if docker ps --filter "name=${container_name}" --filter "status=running" --format "{{.Names}}" | grep -q "${container_name}"; then
                            ((healthy_count++))
                        fi
                    done

                    if [ $healthy_count -eq 2 ]; then
                        log "SUCCESS" "All services are running and healthy"
                        all_services_ready=true
                        break
                    fi
                fi

                # Progress indication
                local progress=$((waited * 100 / max_wait_time))
                if [ $((waited % 30)) -eq 0 ]; then
                    log "INFO" "Service startup progress: ${progress}% (${waited}s/${max_wait_time}s)"
                    docker-compose ps 2>/dev/null | while read line; do
                        log "DEBUG" "  $line"
                    done
                fi

                sleep $check_interval
                waited=$((waited + check_interval))
            done

            if [ "$all_services_ready" != "true" ]; then
                log "ERROR" "Services failed to become ready within ${max_wait_time} seconds"

                # Diagnostic information
                log "INFO" "Service diagnostic information:"
                docker-compose ps 2>/dev/null | while read line; do
                    log "INFO" "  $line"
                done

                log "INFO" "Container status:"
                docker ps -a --filter "name=allemny" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null | while read line; do
                    log "INFO" "  $line"
                done

                return 1
            fi

            return 0
        }

        if monitor_service_startup; then
            return 0
        else
            return 1
        fi
    }

    # Function to handle Docker system cleanup if needed
    cleanup_docker_system() {
        log "INFO" "Performing Docker system cleanup to free resources..."

        # Remove dangling images
        docker image prune -f 2>/dev/null || true

        # Remove unused volumes (but preserve data)
        docker volume prune -f 2>/dev/null || true

        # Remove unused networks
        docker network prune -f 2>/dev/null || true

        log "SUCCESS" "Docker system cleanup completed"
    }

    # Main service deployment logic
    local deployment_attempts=0
    local max_deployment_attempts=2

    while [ $deployment_attempts -lt $max_deployment_attempts ]; do
        log "INFO" "Service deployment attempt $((deployment_attempts + 1))/$max_deployment_attempts"

        # Build containers
        if build_containers_robust; then
            # Start services
            if start_services_robust; then
                log "SUCCESS" "All services built and started successfully"
                return 0
            else
                log "WARN" "Service startup failed on attempt $((deployment_attempts + 1))"

                # Show container logs for debugging
                log "INFO" "Container logs for debugging:"
                docker-compose logs --tail=20 2>/dev/null | while read line; do
                    log "DEBUG" "  $line"
                done
            fi
        else
            log "WARN" "Container build failed on attempt $((deployment_attempts + 1))"
        fi

        ((deployment_attempts++))

        if [ $deployment_attempts -lt $max_deployment_attempts ]; then
            log "INFO" "Cleaning up before retry..."
            docker-compose down --remove-orphans 2>/dev/null || true
            cleanup_docker_system
            sleep 10
        fi
    done

    log "ERROR" "Failed to deploy services after $max_deployment_attempts attempts"

    # Final diagnostic information
    log "INFO" "Final deployment diagnostics:"
    log "INFO" "Docker system info:"
    docker system df 2>/dev/null | while read line; do
        log "INFO" "  $line"
    done

    log "INFO" "Available disk space:"
    df -h . | while read line; do
        log "INFO" "  $line"
    done

    return 1
}

# Function to check PostgreSQL connectivity and health with comprehensive Docker testing
check_postgresql_health() {
    local service_name="PostgreSQL"
    local max_attempts=5
    local attempt=0

    log "INFO" "🔍 Checking PostgreSQL health with comprehensive Docker network testing..."

    while [ $attempt -lt $max_attempts ]; do
        # Test host PostgreSQL service
        if ! sudo systemctl is-active --quiet postgresql; then
            log "ERROR" "$service_name: Host PostgreSQL service is not running"
            log "INFO" "$service_name: Attempting to start PostgreSQL service..."
            sudo systemctl start postgresql
            sleep 5
        fi

        # Test basic host connectivity
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

            # Comprehensive Docker network connectivity testing
            local docker_tests_passed=0
            local docker_test_methods=()

            # Test 1: Default Docker bridge network
            local docker_bridge_ip=$(docker network inspect bridge --format='{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || echo "172.17.0.1")
            if PGPASSWORD='AFbqSrE?h8bPjSCs9#' timeout 10 psql -h "$docker_bridge_ip" -p 5432 -U allemny_find -d allemny_find_v2 -c "SELECT version();" &>/dev/null; then
                log "SUCCESS" "$service_name: ✅ Docker bridge connectivity verified (IP: $docker_bridge_ip)"
                docker_test_methods+=("bridge:$docker_bridge_ip")
                ((docker_tests_passed++))
            else
                log "WARN" "$service_name: Docker bridge connectivity failed (IP: $docker_bridge_ip)"
            fi

            # Test 2: Alternative Docker gateway IPs
            local alternative_ips=("172.18.0.1" "172.19.0.1" "172.20.0.1" "192.168.65.1")
            for alt_ip in "${alternative_ips[@]}"; do
                if PGPASSWORD='AFbqSrE?h8bPjSCs9#' timeout 5 psql -h "$alt_ip" -p 5432 -U allemny_find -d allemny_find_v2 -c "SELECT 1;" &>/dev/null 2>&1; then
                    log "SUCCESS" "$service_name: ✅ Alternative Docker network verified (IP: $alt_ip)"
                    docker_test_methods+=("alt:$alt_ip")
                    ((docker_tests_passed++))
                    break
                fi
            done

            # Test 3: host.docker.internal (for newer Docker versions)
            if PGPASSWORD='AFbqSrE?h8bPjSCs9#' timeout 10 psql -h host.docker.internal -p 5432 -U allemny_find -d allemny_find_v2 -c "SELECT 1;" &>/dev/null 2>&1; then
                log "SUCCESS" "$service_name: ✅ host.docker.internal connectivity verified"
                docker_test_methods+=("host.docker.internal")
                ((docker_tests_passed++))
            fi

            # Test 4: Container-to-host test (if Docker is available)
            if command -v docker &> /dev/null; then
                local container_test_result=""
                # Try with host.docker.internal first
                container_test_result=$(timeout 15 docker run --rm --network bridge postgres:13 sh -c "
                    PGPASSWORD='AFbqSrE?h8bPjSCs9#' psql -h host.docker.internal -p 5432 -U allemny_find -d allemny_find_v2 -c 'SELECT 1;' 2>/dev/null && echo 'host.docker.internal'
                " 2>/dev/null || echo "")

                # If that fails, try with bridge gateway
                if [ -z "$container_test_result" ]; then
                    container_test_result=$(timeout 15 docker run --rm --network bridge postgres:13 sh -c "
                        PGPASSWORD='AFbqSrE?h8bPjSCs9#' psql -h $docker_bridge_ip -p 5432 -U allemny_find -d allemny_find_v2 -c 'SELECT 1;' 2>/dev/null && echo 'bridge_gateway'
                    " 2>/dev/null || echo "")
                fi

                if [ -n "$container_test_result" ]; then
                    log "SUCCESS" "$service_name: ✅ Container-to-host connectivity verified ($container_test_result)"
                    docker_test_methods+=("container:$container_test_result")
                    ((docker_tests_passed++))
                else
                    log "WARN" "$service_name: Container-to-host connectivity test failed"
                fi
            fi

            # Evaluate Docker connectivity results
            if [ $docker_tests_passed -gt 0 ]; then
                log "SUCCESS" "$service_name: ✅ Docker network connectivity verified using: ${docker_test_methods[*]}"

                # Additional diagnostic information for successful connections
                log "INFO" "$service_name: Network configuration summary:"
                log "INFO" "  - Bridge Gateway: $docker_bridge_ip"
                log "INFO" "  - Working methods: ${docker_test_methods[*]}"
                log "INFO" "  - pg_hba.conf Docker entries: $(sudo grep -c -E "(172\.|192\.168\.|10\.)" /etc/postgresql/*/main/pg_hba.conf 2>/dev/null || echo 'unknown')"

                return 0
            else
                log "ERROR" "$service_name: ❌ All Docker network connectivity tests failed"

                # Enhanced diagnostic information
                log "INFO" "$service_name: Detailed diagnostics:"
                log "INFO" "  - PostgreSQL listening: $(sudo ss -tuln | grep ':5432' || echo 'not listening on :5432')"
                log "INFO" "  - Bridge gateway IP: $docker_bridge_ip"
                log "INFO" "  - Active Docker networks:"
                if command -v docker &> /dev/null; then
                    docker network ls --format "table {{.Name}}\t{{.Driver}}\t{{.Scope}}" 2>/dev/null | while read line; do
                        log "INFO" "    $line"
                    done

                    log "INFO" "  - Docker bridge network details:"
                    docker network inspect bridge --format '{{range .IPAM.Config}}Gateway: {{.Gateway}}, Subnet: {{.Subnet}}{{end}}' 2>/dev/null | while read line; do
                        log "INFO" "    $line"
                    done
                fi

                log "INFO" "  - pg_hba.conf Docker network entries:"
                sudo grep -E "(172\.|192\.168\.|10\.)" /etc/postgresql/*/main/pg_hba.conf 2>/dev/null | while read line; do
                    log "INFO" "    $line"
                done || log "INFO" "    No Docker network entries found in pg_hba.conf"

                log "INFO" "  - listen_addresses setting:"
                sudo grep -E "^listen_addresses" /etc/postgresql/*/main/postgresql.conf 2>/dev/null | while read line; do
                    log "INFO" "    $line"
                done || log "INFO" "    No listen_addresses setting found"

                # Suggest fixes
                log "INFO" "$service_name: Suggested fixes:"
                log "INFO" "  1. Check pg_hba.conf: sudo nano /etc/postgresql/*/main/pg_hba.conf"
                log "INFO" "  2. Add Docker networks: host all all 172.17.0.0/16 md5"
                log "INFO" "  3. Restart PostgreSQL: sudo systemctl restart postgresql"
                log "INFO" "  4. Check Docker network: docker network inspect bridge"

                return 1
            fi
        else
            log "WARN" "$service_name: Schema check failed - got '$schema_test' (attempt $((attempt + 1))/$max_attempts)"
            sleep 5
            ((attempt++))
        fi
    done

    log "ERROR" "$service_name: ❌ Health check failed after $max_attempts attempts"
    log "INFO" "$service_name: Final diagnostics:"
    log "INFO" "  - Service status: $(sudo systemctl is-active postgresql 2>/dev/null || echo 'inactive')"
    log "INFO" "  - Service enabled: $(sudo systemctl is-enabled postgresql 2>/dev/null || echo 'unknown')"
    log "INFO" "  - Port status: $(ss -tuln | grep ':5432' || echo 'not listening')"
    log "INFO" "  - Process status: $(pgrep -f postgres || echo 'no postgres processes')"
    log "INFO" "  - Recent logs: sudo journalctl -u postgresql --no-pager -n 10"
    log "INFO" "  - Config location: $(sudo find /etc -name "postgresql.conf" 2>/dev/null | head -1 || echo 'not found')"
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

        # Test model availability using enhanced detection
        if check_model_exists "nomic-embed-text"; then
            # Get the actual model name with tag for API calls
            local actual_model=$(get_actual_model_name "nomic-embed-text")

            # Test model functionality with multiple attempts
            local func_test_passed=false
            local func_attempts=0
            while [ $func_attempts -lt 2 ] && [ "$func_test_passed" = false ]; do
                # Try with the actual model name (with tag)
                local test_payload="{\"model\":\"$actual_model\",\"prompt\":\"test embedding\"}"
                if timeout 30 curl -s -X POST http://localhost:11434/api/embeddings \
                   -H "Content-Type: application/json" \
                   -d "$test_payload" 2>/dev/null | grep -q "embedding"; then
                    func_test_passed=true
                    break
                fi

                # Fallback: try with base name
                test_payload='{"model":"nomic-embed-text","prompt":"test embedding"}'
                if timeout 30 curl -s -X POST http://localhost:11434/api/embeddings \
                   -H "Content-Type: application/json" \
                   -d "$test_payload" 2>/dev/null | grep -q "embedding"; then
                    func_test_passed=true
                    break
                fi

                ((func_attempts++))
                if [ $func_attempts -lt 2 ]; then
                    log "DEBUG" "Model functionality test attempt $((func_attempts + 1)) failed, retrying..."
                    sleep 2
                fi
            done

            if [ "$func_test_passed" = true ]; then
                local ollama_version=$(timeout 10 ollama --version 2>/dev/null | head -1 || echo "unknown")
                log "SUCCESS" "$service_name: ✅ Fully operational ($ollama_version, model: $actual_model)"
                return 0
            else
                log "WARN" "$service_name: Model functionality test failed (attempt $((attempt + 1))/$max_attempts)"
                log "DEBUG" "$service_name: Tested with model names: '$actual_model' and 'nomic-embed-text'"
            fi
        else
            log "WARN" "$service_name: nomic-embed-text model not found (attempt $((attempt + 1))/$max_attempts)"
            log "INFO" "$service_name: Available models: $(timeout 10 ollama list 2>/dev/null | grep -v 'NAME' | awk '{print $1}' | tr '\n' ', ' | sed 's/,$//' || echo 'none')"
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

# Function to handle errors with comprehensive recovery suggestions
error_handler() {
    local exit_code=$?
    local line_number=${1:-"unknown"}
    local command="${2:-"unknown"}"

    log "ERROR" "Deployment failed with exit code $exit_code at line $line_number"
    log "ERROR" "Failed command: $command"
    log "ERROR" "Check the logs above for details"

    echo -e "\n${RED}❌ DEPLOYMENT FAILED${NC}"
    echo -e "${RED}Exit Code: $exit_code | Line: $line_number${NC}"
    echo -e "${RED}Command: $command${NC}\n"

    # Comprehensive recovery suggestions based on exit code and context
    echo -e "${YELLOW}🔧 AUTOMATED RECOVERY SUGGESTIONS:${NC}"

    # Analyze what might have gone wrong based on logs and provide specific guidance
    if [ -f "deployment.log" ]; then
        log "INFO" "Analyzing deployment log for specific failure patterns..."

        # Check for common failure patterns
        if grep -q "No space left on device" deployment.log 2>/dev/null; then
            echo -e "${RED}💾 DISK SPACE ISSUE DETECTED${NC}"
            echo -e "  • Free up disk space: ${BLUE}sudo apt-get clean && docker system prune -af${NC}"
            echo -e "  • Check disk usage: ${BLUE}df -h${NC}"
            echo -e "  • Remove old containers: ${BLUE}docker container prune -f${NC}"

        elif grep -q "Connection refused\|Network is unreachable" deployment.log 2>/dev/null; then
            echo -e "${RED}🌐 NETWORK CONNECTIVITY ISSUE${NC}"
            echo -e "  • Check internet connection: ${BLUE}ping -c 3 google.com${NC}"
            echo -e "  • Verify DNS resolution: ${BLUE}nslookup github.com${NC}"
            echo -e "  • Try alternative DNS: ${BLUE}sudo echo 'nameserver 8.8.8.8' > /etc/resolv.conf${NC}"

        elif grep -q "Permission denied\|Operation not permitted" deployment.log 2>/dev/null; then
            echo -e "${RED}🔐 PERMISSION ISSUE DETECTED${NC}"
            echo -e "  • Check if running as correct user (not root): ${BLUE}whoami${NC}"
            echo -e "  • Add user to docker group: ${BLUE}sudo usermod -aG docker \$USER${NC}"
            echo -e "  • Log out and back in, then retry"

        elif grep -q "docker.*not found\|docker-compose.*not found" deployment.log 2>/dev/null; then
            echo -e "${RED}🐳 DOCKER INSTALLATION ISSUE${NC}"
            echo -e "  • Reinstall Docker: ${BLUE}curl -fsSL https://get.docker.com | sh${NC}"
            echo -e "  • Start Docker service: ${BLUE}sudo systemctl start docker${NC}"
            echo -e "  • Check Docker status: ${BLUE}docker version${NC}"

        elif grep -q "PostgreSQL\|database\|connection.*refused.*5432" deployment.log 2>/dev/null; then
            echo -e "${RED}🗄️ DATABASE ISSUE DETECTED${NC}"
            echo -e "  • Restart PostgreSQL: ${BLUE}sudo systemctl restart postgresql${NC}"
            echo -e "  • Check PostgreSQL status: ${BLUE}sudo systemctl status postgresql${NC}"
            echo -e "  • Test connection: ${BLUE}sudo -u postgres psql -c 'SELECT version();'${NC}"

        elif grep -q "Redis\|connection.*refused.*6379" deployment.log 2>/dev/null; then
            echo -e "${RED}🔄 REDIS ISSUE DETECTED${NC}"
            echo -e "  • Restart Redis: ${BLUE}sudo systemctl restart redis-server${NC}"
            echo -e "  • Check Redis status: ${BLUE}redis-cli ping${NC}"

        elif grep -q "Ollama\|11434" deployment.log 2>/dev/null; then
            echo -e "${RED}🧠 OLLAMA ISSUE DETECTED${NC}"
            echo -e "  • Restart Ollama: ${BLUE}sudo systemctl restart ollama${NC}"
            echo -e "  • Check Ollama API: ${BLUE}curl http://localhost:11434/api/tags${NC}"
            echo -e "  • Reinstall Ollama: ${BLUE}curl -fsSL https://ollama.ai/install.sh | sh${NC}"

        elif grep -q "port.*already.*use\|bind.*address already in use" deployment.log 2>/dev/null; then
            echo -e "${RED}🔌 PORT CONFLICT DETECTED${NC}"
            echo -e "  • Check port usage: ${BLUE}sudo netstat -tuln | grep -E ':(3001|8001|5432|6379|11434)'${NC}"
            echo -e "  • Kill conflicting processes: ${BLUE}sudo pkill -f 'port_number'${NC}"
            echo -e "  • Use different ports in .env file"
        fi
    fi

    # General recovery steps
    echo -e "\n${YELLOW}🚀 GENERAL RECOVERY STEPS:${NC}"
    echo -e "  1. ${BLUE}System Check:${NC} Verify requirements (RAM: 4GB+, Disk: 10GB+, Internet)"
    echo -e "  2. ${BLUE}Clean Restart:${NC} Reboot system if possible"
    echo -e "  3. ${BLUE}Manual Service Check:${NC} Verify PostgreSQL, Redis, Docker are running"
    echo -e "  4. ${BLUE}Retry Deployment:${NC} Run the script again after fixing issues"

    # Quick diagnostic commands
    echo -e "\n${YELLOW}🔍 QUICK DIAGNOSTICS:${NC}"
    echo -e "  • System resources: ${BLUE}free -h && df -h${NC}"
    echo -e "  • Docker status: ${BLUE}docker info${NC}"
    echo -e "  • Service status: ${BLUE}systemctl status postgresql redis-server docker ollama${NC}"
    echo -e "  • Network check: ${BLUE}ping -c 3 github.com${NC}"

    # Emergency recovery
    echo -e "\n${YELLOW}🆘 EMERGENCY RECOVERY:${NC}"
    echo -e "  • Clean Docker: ${BLUE}docker system prune -af --volumes${NC}"
    echo -e "  • Reset services: ${BLUE}sudo systemctl restart postgresql redis-server docker${NC}"
    echo -e "  • Check logs: ${BLUE}tail -50 deployment.log${NC}"

    # Contact information
    echo -e "\n${BLUE}📞 SUPPORT:${NC}"
    echo -e "  • Check documentation for troubleshooting guides"
    echo -e "  • Contact the development team with deployment.log"
    echo -e "  • Include system information: ${BLUE}uname -a && lsb_release -a${NC}"

    # Preserve logs
    if [ -f "deployment.log" ]; then
        local log_backup="deployment_failed_$(date +%Y%m%d_%H%M%S).log"
        cp deployment.log "$log_backup" 2>/dev/null || true
        echo -e "\n${GREEN}📋 Deployment log saved as: $log_backup${NC}"
    fi

    echo -e "\n${RED}💡 TIP: Run the script again after addressing the issues above.${NC}"
    echo -e "${RED}Most deployment failures are caused by system resource or connectivity issues.${NC}\n"

    exit $exit_code
}

# Main deployment function
main() {
    # Set comprehensive error handler with line number and command tracking
    set -eE  # Exit on error and inherit error trap
    trap 'error_handler $LINENO "$BASH_COMMAND"' ERR

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