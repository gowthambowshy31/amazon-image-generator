# Simple EC2 Deployment Script
# This script will prompt you for EC2 details

Write-Host "=== EC2 Deployment Script ===" -ForegroundColor Cyan
Write-Host ""

# Get EC2 hostname/IP
$EC2Hostname = Read-Host "Enter EC2 Public IP or Hostname (e.g., ec2-xx-xx-xx-xx.eu-north-1.compute.amazonaws.com)"

if ([string]::IsNullOrWhiteSpace($EC2Hostname)) {
    Write-Host "Error: EC2 hostname is required" -ForegroundColor Red
    exit 1
}

# Get EC2 username (default: ec2-user)
$EC2User = Read-Host "Enter EC2 Username (default: ec2-user)"
if ([string]::IsNullOrWhiteSpace($EC2User)) {
    $EC2User = "ec2-user"
}

# Get project path
$ProjectPath = Read-Host "Enter project path on EC2 (default: /home/$EC2User/image-gen-platform)"
if ([string]::IsNullOrWhiteSpace($ProjectPath)) {
    $ProjectPath = "/home/$EC2User/image-gen-platform"
}

$SSHKey = ".\image-gen-key.pem"

Write-Host ""
Write-Host "Deployment Details:" -ForegroundColor Yellow
Write-Host "  EC2 Hostname: $EC2Hostname" -ForegroundColor White
Write-Host "  EC2 User: $EC2User" -ForegroundColor White
Write-Host "  Project Path: $ProjectPath" -ForegroundColor White
Write-Host "  SSH Key: $SSHKey" -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Continue with deployment? (y/n)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "Deployment cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Connecting to EC2 and deploying..." -ForegroundColor Green
Write-Host ""

# Deploy commands
$deployScript = @"
cd $ProjectPath
echo '=== Pulling latest changes from GitHub ==='
git pull origin main
echo ''
echo '=== Installing/updating dependencies ==='
npm install
echo ''
echo '=== Building application ==='
npm run build
echo ''
echo '=== Checking for running processes ==='
if command -v pm2 &> /dev/null; then
    echo 'Restarting with PM2...'
    pm2 restart image-gen-platform 2>/dev/null || pm2 restart all
elif systemctl is-active --quiet image-gen-platform.service 2>/dev/null; then
    echo 'Restarting with systemd...'
    sudo systemctl restart image-gen-platform
else
    echo 'No PM2 or systemd service found. Please restart manually:'
    echo '  - PM2: pm2 restart image-gen-platform'
    echo '  - systemd: sudo systemctl restart image-gen-platform'
    echo '  - Direct: pkill -f next && npm start'
fi
echo ''
echo '=== Deployment complete! ==='
"@

# Execute via SSH
$deployScript | ssh -i $SSHKey -o StrictHostKeyChecking=no "$EC2User@$EC2Hostname" bash

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=== Deployment Successful! ===" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "=== Deployment completed with warnings ===" -ForegroundColor Yellow
    Write-Host "Please check the output above for any errors." -ForegroundColor Yellow
}


