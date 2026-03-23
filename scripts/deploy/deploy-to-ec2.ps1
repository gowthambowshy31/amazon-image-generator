# EC2 Deployment Script
# Usage: .\deploy-to-ec2.ps1 -EC2Hostname "ec2-xx-xx-xx-xx.eu-north-1.compute.amazonaws.com" -EC2User "ec2-user"

param(
    [Parameter(Mandatory=$true)]
    [string]$EC2Hostname,
    
    [Parameter(Mandatory=$false)]
    [string]$EC2User = "ec2-user",
    
    [Parameter(Mandatory=$false)]
    [string]$ProjectPath = "/home/$EC2User/image-gen-platform"
)

$SSHKey = ".\image-gen-key.pem"

Write-Host "=== Deploying to EC2 ===" -ForegroundColor Cyan
Write-Host ""

# Check if SSH key exists
if (-not (Test-Path $SSHKey)) {
    Write-Host "Error: SSH key not found at $SSHKey" -ForegroundColor Red
    exit 1
}

# Set correct permissions for SSH key (if on WSL/Git Bash)
Write-Host "Setting SSH key permissions..." -ForegroundColor Yellow
icacls $SSHKey /inheritance:r | Out-Null
icacls $SSHKey /grant:r "$($env:USERNAME):(R)" | Out-Null

Write-Host "Connecting to EC2: $EC2User@$EC2Hostname" -ForegroundColor Green
Write-Host "Project path: $ProjectPath" -ForegroundColor Green
Write-Host ""

# SSH command to deploy
$deployCommands = @"
cd $ProjectPath
echo '=== Pulling latest changes ==='
git pull origin main
echo ''
echo '=== Installing dependencies ==='
npm install
echo ''
echo '=== Building application ==='
npm run build
echo ''
echo '=== Restarting application ==='
# Try PM2 first, then systemd, then direct
if command -v pm2 &> /dev/null; then
    pm2 restart image-gen-platform || pm2 restart all
elif systemctl is-active --quiet image-gen-platform.service; then
    sudo systemctl restart image-gen-platform
else
    echo 'Please restart your application manually'
fi
echo ''
echo '=== Deployment complete! ==='
"@

# Execute deployment via SSH
Write-Host "Executing deployment commands..." -ForegroundColor Yellow
$deployCommands | ssh -i $SSHKey -o StrictHostKeyChecking=no "$EC2User@$EC2Hostname" bash

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=== Deployment Successful! ===" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "=== Deployment Failed! ===" -ForegroundColor Red
    Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
    exit 1
}


