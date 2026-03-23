# Update GEMINI_API_KEY on EC2 Instance
# Usage: .\update-ec2-api-key.ps1 -EC2Hostname "ec2-xx-xx-xx-xx.eu-north-1.compute.amazonaws.com" -NewAPIKey "your-new-api-key" -EC2User "ec2-user"

param(
    [Parameter(Mandatory=$true)]
    [string]$EC2Hostname,
    
    [Parameter(Mandatory=$true)]
    [string]$NewAPIKey,
    
    [Parameter(Mandatory=$false)]
    [string]$EC2User = "ec2-user",
    
    [Parameter(Mandatory=$false)]
    [string]$ProjectPath = "/home/$EC2User/image-gen-platform"
)

$SSHKey = ".\image-gen-key.pem"

Write-Host "=== Updating GEMINI_API_KEY on EC2 ===" -ForegroundColor Cyan
Write-Host ""

# Check if SSH key exists
if (-not (Test-Path $SSHKey)) {
    Write-Host "Error: SSH key not found at $SSHKey" -ForegroundColor Red
    Write-Host "Please ensure the SSH key file exists in the current directory." -ForegroundColor Yellow
    exit 1
}

# Validate API key format
if (-not $NewAPIKey.StartsWith("AIzaSy")) {
    Write-Host "Warning: API key doesn't start with 'AIzaSy'. Are you sure this is a valid Gemini API key?" -ForegroundColor Yellow
    $confirm = Read-Host "Continue anyway? (y/n)"
    if ($confirm -ne "y" -and $confirm -ne "Y") {
        Write-Host "Update cancelled." -ForegroundColor Yellow
        exit 0
    }
}

Write-Host "EC2 Details:" -ForegroundColor Yellow
Write-Host "  Hostname: $EC2Hostname" -ForegroundColor White
Write-Host "  User: $EC2User" -ForegroundColor White
Write-Host "  Project Path: $ProjectPath" -ForegroundColor White
Write-Host "  New API Key: $($NewAPIKey.Substring(0, [Math]::Min(20, $NewAPIKey.Length)))..." -ForegroundColor White
Write-Host ""

$confirm = Read-Host "Continue with API key update? (y/n)"
if ($confirm -ne "y" -and $confirm -ne "Y") {
    Write-Host "Update cancelled." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Connecting to EC2 and updating API key..." -ForegroundColor Green
Write-Host ""

# Set correct permissions for SSH key
Write-Host "Setting SSH key permissions..." -ForegroundColor Yellow
icacls $SSHKey /inheritance:r | Out-Null
icacls $SSHKey /grant:r "$($env:USERNAME):(R)" | Out-Null

# SSH command to update API key
$updateCommands = @"
cd $ProjectPath
echo '=== Checking current .env file ==='
if [ ! -f .env ]; then
    echo 'Error: .env file not found at $ProjectPath/.env'
    exit 1
fi

echo '=== Backing up current .env file ==='
cp .env .env.backup.\$(date +%Y%m%d_%H%M%S)

echo '=== Updating GEMINI_API_KEY ==='
# Use sed to update the API key (works on Linux)
if grep -q '^GEMINI_API_KEY=' .env; then
    # Update existing key
    sed -i "s|^GEMINI_API_KEY=.*|GEMINI_API_KEY=\"$NewAPIKey\"|" .env
    echo '✅ Updated existing GEMINI_API_KEY'
else
    # Add new key if it doesn't exist
    echo '' >> .env
    echo '# Google Gemini AI' >> .env
    echo "GEMINI_API_KEY=\"$NewAPIKey\"" >> .env
    echo '✅ Added new GEMINI_API_KEY'
fi

echo ''
echo '=== Verifying update ==='
if grep -q "GEMINI_API_KEY=\"$NewAPIKey\"" .env; then
    echo '✅ API key successfully updated in .env file'
else
    echo '❌ Error: API key update verification failed'
    exit 1
fi

echo ''
echo '=== Restarting application ==='
# Try PM2 first, then systemd, then direct
if command -v pm2 &> /dev/null; then
    echo 'Restarting with PM2...'
    pm2 restart image-gen-platform 2>/dev/null || pm2 restart all
    pm2 save 2>/dev/null
    echo '✅ Application restarted with PM2'
elif systemctl is-active --quiet image-gen-platform.service 2>/dev/null; then
    echo 'Restarting with systemd...'
    sudo systemctl restart image-gen-platform
    echo '✅ Application restarted with systemd'
else
    echo '⚠️  Please restart your application manually to apply changes'
    echo '   The API key has been updated in .env, but the app needs to be restarted'
fi

echo ''
echo '=== Update complete! ==='
"@

# Execute update via SSH
Write-Host "Executing update commands..." -ForegroundColor Yellow
$updateCommands | ssh -i $SSHKey -o StrictHostKeyChecking=no "$EC2User@$EC2Hostname" bash

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=== API Key Update Successful! ===" -ForegroundColor Green
    Write-Host ""
    Write-Host "The GEMINI_API_KEY has been updated on your EC2 instance." -ForegroundColor White
    Write-Host "If the application was running, it has been restarted." -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "=== Update Failed! ===" -ForegroundColor Red
    Write-Host "Exit code: $LASTEXITCODE" -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Verify SSH key permissions and path" -ForegroundColor White
    Write-Host "2. Check EC2 hostname and username" -ForegroundColor White
    Write-Host "3. Ensure .env file exists on EC2" -ForegroundColor White
    Write-Host "4. Try manually SSH'ing into EC2 and updating the .env file" -ForegroundColor White
    exit 1
}


