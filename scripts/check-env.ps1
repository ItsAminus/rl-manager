# RL Manager Environment & System Diagnostics Script
# Windows PowerShell

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "         RL MANAGER - SYSTEM & ENVIRONMENT CHECK" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$AllGood = $true

# 1. Check Node.js
Write-Host "[1/5] Checking Node.js runtime..." -NoNewline
try {
    $nodeVer = node -v
    Write-Host " [OK] ($nodeVer)" -ForegroundColor Green
} catch {
    Write-Host " [MISSING] Please install Node.js v18+ from https://nodejs.org" -ForegroundColor Red
    $AllGood = $false
}

# 2. Check npm
Write-Host "[2/5] Checking npm package manager..." -NoNewline
try {
    $npmVer = npm -v
    Write-Host " [OK] ($npmVer)" -ForegroundColor Green
} catch {
    Write-Host " [MISSING] npm not found on PATH" -ForegroundColor Red
    $AllGood = $false
}

# 3. Check Python (for RLBot offline matches)
Write-Host "[3/5] Checking Python installation..." -NoNewline
try {
    $pythonVer = python --version
    Write-Host " [OK] ($pythonVer)" -ForegroundColor Green
} catch {
    Write-Host " [NOTICE] Python not detected on PATH. RL Manager can run in Simulated match mode, or install Python 3.10+ from python.org to enable RLBot." -ForegroundColor Yellow
}

# 4. Check Rocket League Installation (Steam & Epic)
Write-Host "[4/5] Checking Rocket League executable..." -NoNewline
$commonRLPaths = @(
    "C:\Program Files (x86)\Steam\steamapps\common\rocketleague\Binaries\Win64\RocketLeague.exe",
    "C:\Program Files\Epic Games\rocketleague\Binaries\Win64\RocketLeague.exe"
)
$rlFound = $false
foreach ($p in $commonRLPaths) {
    if (Test-Path $p) {
        Write-Host " [OK] Found at: $p" -ForegroundColor Green
        $rlFound = $true
        break
    }
}
if (-not $rlFound) {
    Write-Host " [NOT DETECTED AT DEFAULT PATH]" -ForegroundColor Yellow
    Write-Host "      You can manually set your RocketLeague.exe path inside RL Manager Settings > Integration." -ForegroundColor Gray
}

# 5. Check RLBot
Write-Host "[5/5] Checking RLBot..." -NoNewline
try {
    $rlbotVer = rlbot --version
    Write-Host " [OK] ($rlbotVer)" -ForegroundColor Green
} catch {
    Write-Host " [STANDBY]" -ForegroundColor Yellow
    Write-Host "      RLBot command not found globally. RL Manager includes a simulated offline match provider for instant play." -ForegroundColor Gray
    Write-Host "      To install native RLBot v5: run 'pip install rlbot' in terminal." -ForegroundColor Gray
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
if ($AllGood) {
    Write-Host "Environment check completed. You can start RL Manager with:" -ForegroundColor Green
    Write-Host "  npm run dev" -ForegroundColor White
} else {
    Write-Host "Please resolve the above missing prerequisites before running." -ForegroundColor Yellow
}
Write-Host "============================================================" -ForegroundColor Cyan
