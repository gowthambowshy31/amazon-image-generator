# PostgreSQL Complete Reset Script
# Run this in PowerShell as Administrator

Write-Host "=== PostgreSQL Complete Reset ===" -ForegroundColor Cyan
Write-Host ""

# Stop PostgreSQL service
Write-Host "Stopping PostgreSQL service..." -ForegroundColor Yellow
Stop-Service -Name "postgresql-x64-18" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Find PostgreSQL data directory
$pgDataDir = "C:\Program Files\PostgreSQL\18\data"
if (-not (Test-Path $pgDataDir)) {
    $pgDataDir = "C:\PostgreSQL\18\data"
}

if (-not (Test-Path $pgDataDir)) {
    Write-Host "PostgreSQL data directory not found!" -ForegroundColor Red
    exit 1
}

Write-Host "PostgreSQL data directory: $pgDataDir" -ForegroundColor Green

# Backup pg_hba.conf
$pgHbaPath = Join-Path $pgDataDir "pg_hba.conf"
$backupPath = Join-Path $pgDataDir "pg_hba.conf.backup"

if (Test-Path $pgHbaPath) {
    Copy-Item $pgHbaPath $backupPath -Force
    Write-Host "Backed up pg_hba.conf" -ForegroundColor Green
}

# Configure pg_hba.conf for trust authentication (temporary)
Write-Host "Configuring temporary trust authentication..." -ForegroundColor Yellow
$trustConfig = @"
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     trust
host    all             all             127.0.0.1/32            trust
host    all             all             ::1/128                 trust
"@

Set-Content -Path $pgHbaPath -Value $trustConfig -Force

# Start PostgreSQL service
Write-Host "Starting PostgreSQL service..." -ForegroundColor Yellow
Start-Service -Name "postgresql-x64-18"
Start-Sleep -Seconds 5

# Set new password
$newPassword = "postgres123"
Write-Host "Setting postgres user password to: $newPassword" -ForegroundColor Yellow

$psqlPath = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
if (-not (Test-Path $psqlPath)) {
    $psqlPath = "C:\PostgreSQL\18\bin\psql.exe"
}

$sqlCommand = "ALTER USER postgres WITH PASSWORD '$newPassword';"
& $psqlPath -U postgres -d postgres -c $sqlCommand

# Restore original pg_hba.conf with md5 authentication
Write-Host "Configuring md5 authentication..." -ForegroundColor Yellow
$md5Config = @"
# TYPE  DATABASE        USER            ADDRESS                 METHOD
local   all             all                                     md5
host    all             all             127.0.0.1/32            md5
host    all             all             ::1/128                 md5
"@

Set-Content -Path $pgHbaPath -Value $md5Config -Force

# Restart PostgreSQL
Write-Host "Restarting PostgreSQL service..." -ForegroundColor Yellow
Restart-Service -Name "postgresql-x64-18"
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "=== PostgreSQL Reset Complete! ===" -ForegroundColor Green
Write-Host ""
Write-Host "New credentials:" -ForegroundColor Cyan
Write-Host "  Username: postgres" -ForegroundColor White
Write-Host "  Password: $newPassword" -ForegroundColor White
Write-Host ""
Write-Host "Update your .env file with:" -ForegroundColor Yellow
Write-Host "  DATABASE_URL=`"postgresql://postgres:$newPassword@localhost:5432/image_gen_platform?schema=public`"" -ForegroundColor White
Write-Host ""
