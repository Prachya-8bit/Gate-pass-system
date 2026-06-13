# deploy.ps1 — Run this on the Windows Server to deploy / update the app.
# Usage: .\deploy.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "── SYS Gate Pass Deploy ─────────────────────" -ForegroundColor Cyan

# 1. Pull latest code
Write-Host "`n[1/5] Pulling latest code..." -ForegroundColor Yellow
git pull origin main

# 2. Create data directory if it doesn't exist (SQLite volume bind mount)
Write-Host "`n[2/5] Ensuring data directory exists..." -ForegroundColor Yellow
if (-not (Test-Path ".\data")) {
    New-Item -ItemType Directory -Path ".\data" | Out-Null
    Write-Host "  Created .\data\"
}

# 3. Build new image
Write-Host "`n[3/5] Building Docker image..." -ForegroundColor Yellow
docker compose build

# 4. Run Prisma migrations inside the new image before switching traffic
Write-Host "`n[4/5] Running database migrations..." -ForegroundColor Yellow
docker compose run --rm app npx prisma migrate deploy

# 5. Restart containers (zero-downtime for proxy; app restarts gracefully)
Write-Host "`n[5/5] Restarting containers..." -ForegroundColor Yellow
docker compose up -d --remove-orphans

Write-Host "`n── Deploy complete ───────────────────────────" -ForegroundColor Green
Write-Host "App: https://your-domain.com" -ForegroundColor Cyan
