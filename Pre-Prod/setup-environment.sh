#!/bin/bash

# Allemny Find V2 - Environment Setup Script
# This script sets up the Linux environment for running Allemny Find

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REQUIRED_DOCKER_VERSION="20.10"
REQUIRED_COMPOSE_VERSION="2.0"
PYTHON_VERSION="3.11"

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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to compare versions
version_ge() {
    test "$(printf '%s\n' "$@" | sort -V | head -n 1)" != "$1"
}

# Function to detect OS
detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$NAME
        VERSION=$VERSION_ID
    elif type lsb_release >/dev/null 2>&1; then
        OS=$(lsb_release -si)
        VERSION=$(lsb_release -sr)
    elif [ -f /etc/redhat-release ]; then
        OS="Red Hat Enterprise Linux"
        VERSION=$(cat /etc/redhat-release | sed 's/.*release \([0-9.]*\).*/\1/')
    else
        OS=$(uname -s)
        VERSION=$(uname -r)
    fi

    log "INFO" "Detected OS: $OS $VERSION"
}

# Function to install Docker on Ubuntu/Debian
install_docker_ubuntu() {
    log "INFO" "Installing Docker on Ubuntu/Debian..."

    # Remove old versions
    sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

    # Update package index
    sudo apt-get update

    # Install prerequisites
    sudo apt-get install -y \
        apt-transport-https \
        ca-certificates \
        curl \
        gnupg \
        lsb-release

    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

    # Add Docker repository
    echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

    log "SUCCESS" "Docker installed successfully"
}

# Function to install Docker on CentOS/RHEL
install_docker_centos() {
    log "INFO" "Installing Docker on CentOS/RHEL..."

    # Remove old versions
    sudo yum remove -y docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate docker-logrotate docker-engine 2>/dev/null || true

    # Install prerequisites
    sudo yum install -y yum-utils

    # Add Docker repository
    sudo yum-config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo

    # Install Docker
    sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

    log "SUCCESS" "Docker installed successfully"
}

# Function to setup Docker
setup_docker() {
    if command_exists docker; then
        local docker_version=$(docker --version | awk '{print $3}' | cut -d',' -f1)
        if version_ge "$docker_version" "$REQUIRED_DOCKER_VERSION"; then
            log "SUCCESS" "Docker $docker_version is already installed and meets requirements"
            return 0
        else
            log "WARN" "Docker $docker_version is installed but outdated (required: $REQUIRED_DOCKER_VERSION+)"
        fi
    fi

    log "INFO" "Installing Docker..."

    case $OS in
        *"Ubuntu"*|*"Debian"*)
            install_docker_ubuntu
            ;;
        *"CentOS"*|*"Red Hat"*|*"RHEL"*)
            install_docker_centos
            ;;
        *)
            log "ERROR" "Unsupported OS for automatic Docker installation: $OS"
            log "INFO" "Please install Docker manually from https://docs.docker.com/engine/install/"
            exit 1
            ;;
    esac

    # Start and enable Docker
    sudo systemctl start docker
    sudo systemctl enable docker

    # Add user to docker group
    sudo usermod -aG docker $USER

    log "SUCCESS" "Docker setup completed"
    log "WARN" "Please log out and back in to use Docker without sudo"
}

# Function to install Docker Compose
install_docker_compose() {
    if command_exists docker-compose; then
        local compose_version=$(docker-compose --version | awk '{print $3}' | cut -d',' -f1)
        if version_ge "$compose_version" "$REQUIRED_COMPOSE_VERSION"; then
            log "SUCCESS" "Docker Compose $compose_version is already installed"
            return 0
        fi
    fi

    log "INFO" "Installing Docker Compose..."

    # Get latest version
    local latest_version=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep -oP '"tag_name": "\K(.*)(?=")')

    # Download and install
    sudo curl -L "https://github.com/docker/compose/releases/download/$latest_version/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose

    # Create symlink
    sudo ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose

    log "SUCCESS" "Docker Compose $latest_version installed"
}

# Function to install Python and dependencies
setup_python() {
    log "INFO" "Setting up Python environment..."

    case $OS in
        *"Ubuntu"*|*"Debian"*)
            sudo apt-get update
            sudo apt-get install -y python3 python3-pip python3-venv python3-dev
            ;;
        *"CentOS"*|*"Red Hat"*|*"RHEL"*)
            sudo yum install -y python3 python3-pip python3-devel
            ;;
        *)
            log "WARN" "Unknown OS, assuming Python is available"
            ;;
    esac

    # Create symlinks if needed
    if ! command_exists python; then
        sudo ln -sf /usr/bin/python3 /usr/bin/python
    fi

    if ! command_exists pip; then
        sudo ln -sf /usr/bin/pip3 /usr/bin/pip
    fi

    log "SUCCESS" "Python environment setup completed"
}

# Function to install Node.js
setup_nodejs() {
    if command_exists node; then
        local node_version=$(node --version | cut -d'v' -f2)
        log "SUCCESS" "Node.js $node_version is already installed"
        return 0
    fi

    log "INFO" "Installing Node.js..."

    # Install Node.js 18 LTS
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -

    case $OS in
        *"Ubuntu"*|*"Debian"*)
            sudo apt-get install -y nodejs
            ;;
        *"CentOS"*|*"Red Hat"*|*"RHEL"*)
            sudo yum install -y nodejs npm
            ;;
        *)
            log "ERROR" "Cannot install Node.js automatically on $OS"
            exit 1
            ;;
    esac

    log "SUCCESS" "Node.js installed successfully"
}

# Function to install system utilities
install_system_utilities() {
    log "INFO" "Installing system utilities..."

    case $OS in
        *"Ubuntu"*|*"Debian"*)
            sudo apt-get update
            sudo apt-get install -y \
                curl wget git unzip \
                build-essential \
                software-properties-common \
                apt-transport-https \
                ca-certificates \
                gnupg \
                lsb-release \
                net-tools \
                htop \
                vim \
                tree
            ;;
        *"CentOS"*|*"Red Hat"*|*"RHEL"*)
            sudo yum groupinstall -y "Development Tools"
            sudo yum install -y \
                curl wget git unzip \
                epel-release \
                net-tools \
                htop \
                vim \
                tree
            ;;
        *)
            log "WARN" "Unknown OS, skipping system utilities installation"
            ;;
    esac

    log "SUCCESS" "System utilities installed"
}

# Function to setup firewall
setup_firewall() {
    log "INFO" "Configuring firewall..."

    if command_exists ufw; then
        # Ubuntu/Debian firewall
        sudo ufw allow 3001/tcp comment 'Allemny Find Frontend'
        sudo ufw allow 8002/tcp comment 'Allemny Find Backend'
        sudo ufw allow 22/tcp comment 'SSH'
        sudo ufw --force enable
        log "SUCCESS" "UFW firewall configured"
    elif command_exists firewall-cmd; then
        # CentOS/RHEL firewall
        sudo firewall-cmd --permanent --add-port=3001/tcp
        sudo firewall-cmd --permanent --add-port=8002/tcp
        sudo firewall-cmd --reload
        log "SUCCESS" "Firewalld configured"
    else
        log "WARN" "No firewall management tool found"
    fi
}

# Function to create systemd service
create_systemd_service() {
    log "INFO" "Creating systemd service for auto-startup..."

    cat << EOF | sudo tee /etc/systemd/system/allemny-find.service > /dev/null
[Unit]
Description=Allemny Find V2 Application
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$PWD
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0
User=$USER
Group=docker

[Install]
WantedBy=multi-user.target
EOF

    sudo systemctl daemon-reload
    sudo systemctl enable allemny-find.service

    log "SUCCESS" "Systemd service created and enabled"
}

# Function to optimize system settings
optimize_system() {
    log "INFO" "Optimizing system settings..."

    # Increase file limits
    echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
    echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf

    # Optimize Docker settings
    sudo mkdir -p /etc/docker
    cat << EOF | sudo tee /etc/docker/daemon.json > /dev/null
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "storage-driver": "overlay2"
}
EOF

    # Restart Docker with new settings
    sudo systemctl restart docker

    log "SUCCESS" "System optimization completed"
}

# Function to verify installation
verify_installation() {
    log "INFO" "Verifying installation..."

    local errors=0

    # Check Docker
    if ! command_exists docker; then
        log "ERROR" "Docker not found"
        ((errors++))
    else
        if ! docker --version | grep -q "Docker version"; then
            log "ERROR" "Docker not working properly"
            ((errors++))
        else
            log "SUCCESS" "Docker verified"
        fi
    fi

    # Check Docker Compose
    if ! command_exists docker-compose; then
        log "ERROR" "Docker Compose not found"
        ((errors++))
    else
        if ! docker-compose --version | grep -q "docker-compose version"; then
            log "ERROR" "Docker Compose not working properly"
            ((errors++))
        else
            log "SUCCESS" "Docker Compose verified"
        fi
    fi

    # Check Python
    if ! command_exists python; then
        log "ERROR" "Python not found"
        ((errors++))
    else
        log "SUCCESS" "Python verified: $(python --version)"
    fi

    # Check Node.js
    if ! command_exists node; then
        log "ERROR" "Node.js not found"
        ((errors++))
    else
        log "SUCCESS" "Node.js verified: $(node --version)"
    fi

    if [ $errors -eq 0 ]; then
        log "SUCCESS" "All components verified successfully"
        return 0
    else
        log "ERROR" "$errors component(s) failed verification"
        return 1
    fi
}

# Main function
main() {
    echo -e "${BLUE}🔧 Allemny Find V2 - Environment Setup${NC}"
    echo -e "${BLUE}=====================================${NC}\n"

    # Detect OS
    detect_os

    # Install components
    install_system_utilities
    setup_docker
    install_docker_compose
    setup_python
    setup_nodejs

    # Configure system
    setup_firewall
    create_systemd_service
    optimize_system

    # Verify installation
    if verify_installation; then
        echo -e "\n${GREEN}✅ Environment setup completed successfully!${NC}"
        echo -e "${YELLOW}Please log out and back in to use Docker without sudo.${NC}\n"
    else
        echo -e "\n${RED}❌ Environment setup completed with errors.${NC}"
        echo -e "${YELLOW}Please check the error messages above and resolve them.${NC}\n"
        exit 1
    fi
}

# Run main function
main "$@"