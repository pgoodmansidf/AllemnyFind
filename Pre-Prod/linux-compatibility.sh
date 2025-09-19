#!/bin/bash

# Allemny Find V2 - Linux Compatibility Configuration Script
# This script ensures the application works correctly on different Linux distributions

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

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

# Function to detect Linux distribution
detect_linux_distro() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        DISTRO=$ID
        VERSION=$VERSION_ID
        DISTRO_NAME=$NAME
    elif [ -f /etc/redhat-release ]; then
        DISTRO="rhel"
        VERSION=$(cat /etc/redhat-release | sed 's/.*release \([0-9.]*\).*/\1/')
        DISTRO_NAME="Red Hat Enterprise Linux"
    elif [ -f /etc/debian_version ]; then
        DISTRO="debian"
        VERSION=$(cat /etc/debian_version)
        DISTRO_NAME="Debian"
    else
        DISTRO="unknown"
        VERSION="unknown"
        DISTRO_NAME="Unknown Linux"
    fi

    log "INFO" "Detected Linux distribution: $DISTRO_NAME $VERSION"
}

# Function to fix file permissions
fix_file_permissions() {
    log "INFO" "Fixing file permissions for Linux compatibility..."

    # Make all shell scripts executable
    find "$PROJECT_ROOT" -name "*.sh" -type f -exec chmod +x {} \;

    # Set proper permissions for Python files
    find "$PROJECT_ROOT" -name "*.py" -type f -exec chmod 644 {} \;

    # Set permissions for configuration files
    find "$PROJECT_ROOT" -name "*.yml" -o -name "*.yaml" -o -name "*.json" -o -name "*.ini" -type f -exec chmod 644 {} \;

    # Set permissions for Docker files
    find "$PROJECT_ROOT" -name "Dockerfile*" -o -name "docker-compose*" -type f -exec chmod 644 {} \;

    # Set directory permissions
    find "$PROJECT_ROOT" -type d -exec chmod 755 {} \;

    # Make deployment scripts executable
    chmod +x "$SCRIPT_DIR"/*.sh

    # Set ownership to current user
    chown -R $USER:$USER "$PROJECT_ROOT" 2>/dev/null || true

    log "SUCCESS" "File permissions updated"
}

# Function to convert Windows line endings to Unix
convert_line_endings() {
    log "INFO" "Converting line endings to Unix format..."

    # Install dos2unix if not available
    if ! command -v dos2unix &> /dev/null; then
        case $DISTRO in
            "ubuntu"|"debian")
                sudo apt-get update && sudo apt-get install -y dos2unix
                ;;
            "centos"|"rhel"|"rocky"|"almalinux")
                sudo yum install -y dos2unix || sudo dnf install -y dos2unix
                ;;
            "fedora")
                sudo dnf install -y dos2unix
                ;;
            *)
                log "WARN" "dos2unix not available, skipping line ending conversion"
                return
                ;;
        esac
    fi

    # Convert shell scripts
    find "$PROJECT_ROOT" -name "*.sh" -type f -exec dos2unix {} \; 2>/dev/null || true

    # Convert configuration files
    find "$PROJECT_ROOT" \( -name "*.yml" -o -name "*.yaml" -o -name "*.env*" -o -name "*.ini" \) -type f -exec dos2unix {} \; 2>/dev/null || true

    # Convert Python files
    find "$PROJECT_ROOT" -name "*.py" -type f -exec dos2unix {} \; 2>/dev/null || true

    log "SUCCESS" "Line endings converted to Unix format"
}

# Function to fix Python shebangs
fix_python_shebangs() {
    log "INFO" "Fixing Python shebangs for Linux compatibility..."

    # Find Python files with Windows-style shebangs and fix them
    find "$PROJECT_ROOT" -name "*.py" -type f -exec sed -i '1s|^#!.*python.*|#!/usr/bin/env python3|' {} \;

    log "SUCCESS" "Python shebangs updated"
}

# Function to fix shell script shebangs
fix_shell_shebangs() {
    log "INFO" "Fixing shell script shebangs..."

    # Fix bash shebangs
    find "$PROJECT_ROOT" -name "*.sh" -type f -exec sed -i '1s|^#!.*|#!/bin/bash|' {} \;

    log "SUCCESS" "Shell script shebangs updated"
}

# Function to create systemd service file
create_systemd_service() {
    log "INFO" "Creating systemd service for auto-startup..."

    local service_file="/etc/systemd/system/allemny-find.service"

    sudo tee "$service_file" > /dev/null << EOF
[Unit]
Description=Allemny Find V2 - AI-Powered Document Search System
Documentation=https://github.com/p.goodman@sidf.gov.sa/AllemnyFind
After=docker.service
Wants=docker.service

[Service]
Type=forking
RemainAfterExit=yes
WorkingDirectory=$SCRIPT_DIR
ExecStart=/usr/bin/docker-compose up -d
ExecStop=/usr/bin/docker-compose down
ExecReload=/usr/bin/docker-compose restart
TimeoutStartSec=300
TimeoutStopSec=30
User=$USER
Group=docker
Environment=COMPOSE_PROJECT_NAME=allemny-find

# Restart policy
Restart=on-failure
RestartSec=10s

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ReadWritePaths=$SCRIPT_DIR

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable allemny-find.service

    log "SUCCESS" "Systemd service created and enabled"
}

# Function to setup log rotation
setup_log_rotation() {
    log "INFO" "Setting up log rotation..."

    sudo tee "/etc/logrotate.d/allemny-find" > /dev/null << EOF
$SCRIPT_DIR/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
    su $USER $USER
}

$PROJECT_ROOT/backend/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    copytruncate
    su $USER $USER
}
EOF

    log "SUCCESS" "Log rotation configured"
}

# Function to optimize file system settings
optimize_filesystem() {
    log "INFO" "Optimizing file system settings..."

    # Create optimized fstab entry for document storage (if on separate partition)
    if mountpoint -q "$PROJECT_ROOT/document_storage" 2>/dev/null; then
        log "INFO" "Document storage is on separate partition, optimizing mount options"
        # Add noatime option to reduce disk I/O
        sudo sed -i 's|\(/.*document_storage.*defaults\)|\1,noatime|' /etc/fstab 2>/dev/null || true
    fi

    # Set up directory structure with optimal permissions
    mkdir -p "$PROJECT_ROOT/document_storage"
    mkdir -p "$PROJECT_ROOT/backend/logs"
    mkdir -p "$SCRIPT_DIR/backups"

    # Set optimal directory permissions
    chmod 755 "$PROJECT_ROOT/document_storage"
    chmod 755 "$PROJECT_ROOT/backend/logs"
    chmod 755 "$SCRIPT_DIR/backups"

    log "SUCCESS" "File system optimizations applied"
}

# Function to setup network configuration
setup_network_config() {
    log "INFO" "Configuring network settings..."

    # Increase network buffer sizes for better performance
    sudo tee "/etc/sysctl.d/90-allemny-find.conf" > /dev/null << EOF
# Allemny Find V2 - Network optimizations
net.core.rmem_max = 16777216
net.core.wmem_max = 16777216
net.ipv4.tcp_rmem = 4096 65536 16777216
net.ipv4.tcp_wmem = 4096 65536 16777216

# Increase connection tracking limits
net.netfilter.nf_conntrack_max = 131072

# Optimize TCP settings
net.ipv4.tcp_congestion_control = bbr
net.ipv4.tcp_slow_start_after_idle = 0
EOF

    # Apply sysctl settings
    sudo sysctl -p /etc/sysctl.d/90-allemny-find.conf 2>/dev/null || true

    log "SUCCESS" "Network configuration optimized"
}

# Function to setup firewall rules
setup_firewall() {
    log "INFO" "Configuring firewall rules..."

    # Source environment variables to get ports
    if [ -f "$SCRIPT_DIR/.env" ]; then
        source "$SCRIPT_DIR/.env"
    fi

    FRONTEND_PORT=${FRONTEND_PORT:-3001}
    BACKEND_PORT=${BACKEND_PORT:-8002}

    # Configure UFW (Ubuntu/Debian)
    if command -v ufw &> /dev/null; then
        sudo ufw allow $FRONTEND_PORT/tcp comment 'Allemny Find Frontend'
        sudo ufw allow $BACKEND_PORT/tcp comment 'Allemny Find Backend'
        sudo ufw allow ssh comment 'SSH access'

        # Enable UFW if not already enabled
        sudo ufw --force enable

        log "SUCCESS" "UFW firewall configured"

    # Configure firewalld (CentOS/RHEL/Fedora)
    elif command -v firewall-cmd &> /dev/null; then
        sudo firewall-cmd --permanent --add-port=$FRONTEND_PORT/tcp
        sudo firewall-cmd --permanent --add-port=$BACKEND_PORT/tcp
        sudo firewall-cmd --permanent --add-service=ssh
        sudo firewall-cmd --reload

        log "SUCCESS" "Firewalld configured"

    # Configure iptables (fallback)
    elif command -v iptables &> /dev/null; then
        sudo iptables -A INPUT -p tcp --dport $FRONTEND_PORT -j ACCEPT
        sudo iptables -A INPUT -p tcp --dport $BACKEND_PORT -j ACCEPT
        sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT

        # Save iptables rules
        case $DISTRO in
            "ubuntu"|"debian")
                sudo iptables-save | sudo tee /etc/iptables/rules.v4 > /dev/null
                ;;
            "centos"|"rhel"|"rocky"|"almalinux"|"fedora")
                sudo service iptables save 2>/dev/null || sudo iptables-save | sudo tee /etc/sysconfig/iptables > /dev/null
                ;;
        esac

        log "SUCCESS" "Iptables firewall configured"
    else
        log "WARN" "No firewall management tool found"
    fi
}

# Function to fix Docker configuration for Linux
fix_docker_config() {
    log "INFO" "Optimizing Docker configuration for Linux..."

    # Create Docker daemon configuration
    sudo mkdir -p /etc/docker

    sudo tee "/etc/docker/daemon.json" > /dev/null << EOF
{
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "storage-driver": "overlay2",
    "storage-opts": [
        "overlay2.override_kernel_check=true"
    ],
    "live-restore": true,
    "userland-proxy": false,
    "experimental": false,
    "metrics-addr": "127.0.0.1:9323",
    "default-ulimits": {
        "nofile": {
            "Hard": 64000,
            "Name": "nofile",
            "Soft": 64000
        }
    }
}
EOF

    # Restart Docker with new configuration
    sudo systemctl restart docker

    log "SUCCESS" "Docker configuration optimized"
}

# Function to setup monitoring
setup_monitoring() {
    log "INFO" "Setting up system monitoring..."

    # Create monitoring script
    tee "$SCRIPT_DIR/monitor.sh" > /dev/null << 'EOF'
#!/bin/bash
# Simple monitoring script for Allemny Find

LOG_FILE="/var/log/allemny-find-monitor.log"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if services are running
cd "$SCRIPT_DIR"
if ! ./health-check.sh check > /dev/null 2>&1; then
    echo "[$(date)] Health check failed, attempting restart..." >> "$LOG_FILE"
    ./health-check.sh restart >> "$LOG_FILE" 2>&1
fi
EOF

    chmod +x "$SCRIPT_DIR/monitor.sh"

    # Add cron job for monitoring
    (crontab -l 2>/dev/null; echo "*/5 * * * * $SCRIPT_DIR/monitor.sh") | crontab -

    log "SUCCESS" "System monitoring configured"
}

# Function to create backup script
create_backup_script() {
    log "INFO" "Creating backup script..."

    tee "$SCRIPT_DIR/backup.sh" > /dev/null << EOF
#!/bin/bash

# Allemny Find V2 - Backup Script
set -e

SCRIPT_DIR="\$(cd "\$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="\$SCRIPT_DIR/backups"
TIMESTAMP=\$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "\$BACKUP_DIR"

# Backup database
docker-compose exec -T postgres pg_dump -U allemny_find allemny_find_v2 | gzip > "\$BACKUP_DIR/database_\$TIMESTAMP.sql.gz"

# Backup configuration
tar -czf "\$BACKUP_DIR/config_\$TIMESTAMP.tar.gz" .env docker-compose.yml

# Backup document storage
tar -czf "\$BACKUP_DIR/documents_\$TIMESTAMP.tar.gz" -C .. document_storage/

# Cleanup old backups (keep last 7 days)
find "\$BACKUP_DIR" -name "*.gz" -mtime +7 -delete

echo "Backup completed: \$TIMESTAMP"
EOF

    chmod +x "$SCRIPT_DIR/backup.sh"

    # Add daily backup cron job
    (crontab -l 2>/dev/null; echo "0 2 * * * $SCRIPT_DIR/backup.sh") | crontab -

    log "SUCCESS" "Backup script created and scheduled"
}

# Function to verify Linux compatibility
verify_compatibility() {
    log "INFO" "Verifying Linux compatibility..."

    local errors=0

    # Check file permissions
    if [ ! -x "$SCRIPT_DIR/deploy.sh" ]; then
        log "ERROR" "deploy.sh is not executable"
        ((errors++))
    fi

    # Check line endings
    if command -v file &> /dev/null; then
        local crlf_files=$(find "$PROJECT_ROOT" -name "*.sh" -type f -exec file {} \; | grep -c "CRLF" || true)
        if [ $crlf_files -gt 0 ]; then
            log "WARN" "Found $crlf_files files with Windows line endings"
        fi
    fi

    # Check systemd service
    if ! systemctl is-enabled allemny-find.service &> /dev/null; then
        log "ERROR" "Systemd service not enabled"
        ((errors++))
    fi

    # Check Docker daemon
    if ! sudo systemctl is-active docker &> /dev/null; then
        log "ERROR" "Docker service not running"
        ((errors++))
    fi

    if [ $errors -eq 0 ]; then
        log "SUCCESS" "Linux compatibility verification passed"
        return 0
    else
        log "ERROR" "Linux compatibility verification failed with $errors errors"
        return 1
    fi
}

# Main function
main() {
    echo -e "${BLUE}🐧 Allemny Find V2 - Linux Compatibility Setup${NC}"
    echo -e "${BLUE}===============================================${NC}\n"

    # Detect Linux distribution
    detect_linux_distro

    # Fix compatibility issues
    fix_file_permissions
    convert_line_endings
    fix_python_shebangs
    fix_shell_shebangs

    # Setup system services
    create_systemd_service
    setup_log_rotation

    # Optimize system
    optimize_filesystem
    setup_network_config
    setup_firewall
    fix_docker_config

    # Setup monitoring and backups
    setup_monitoring
    create_backup_script

    # Verify everything is working
    if verify_compatibility; then
        echo -e "\n${GREEN}✅ Linux compatibility setup completed successfully!${NC}"
        echo -e "${BLUE}The application is now optimized for Linux deployment.${NC}\n"

        echo -e "${YELLOW}Next steps:${NC}"
        echo -e "1. Run: ./deploy.sh"
        echo -e "2. Check status: systemctl status allemny-find"
        echo -e "3. Monitor logs: journalctl -u allemny-find -f"
        echo -e "4. Test application: ./health-check.sh check"
    else
        echo -e "\n${RED}❌ Linux compatibility setup completed with errors.${NC}"
        echo -e "${YELLOW}Please review the error messages above and resolve them.${NC}\n"
        exit 1
    fi
}

# Run main function
main "$@"
EOF