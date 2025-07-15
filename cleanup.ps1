# GPT AI Agent - Electron Cleanup Script
Write-Host "🧹 Cleaning up Electron processes..." -ForegroundColor Cyan

# Kill all Electron processes
try {
    $electronProcesses = Get-Process -Name "electron" -ErrorAction SilentlyContinue
    if ($electronProcesses) {
        Write-Host "⚡ Found $($electronProcesses.Count) Electron processes, terminating..." -ForegroundColor Yellow
        Stop-Process -Name "electron" -Force
        Write-Host "✅ All Electron processes terminated" -ForegroundColor Green
    } else {
        Write-Host "✅ No Electron processes found" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️ Error stopping Electron processes: $($_.Exception.Message)" -ForegroundColor Red
}

# Clear Electron cache if it exists
$cacheDir = "$env:APPDATA\gpt-ai-agent"
if (Test-Path $cacheDir) {
    try {
        Write-Host "🗑️ Clearing Electron cache..." -ForegroundColor Yellow
        Remove-Item -Recurse -Force $cacheDir
        Write-Host "✅ Cache cleared successfully" -ForegroundColor Green
    } catch {
        Write-Host "⚠️ Error clearing cache: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "✅ No cache directory found" -ForegroundColor Green
}

Write-Host "🎯 Cleanup complete! Ready to start fresh." -ForegroundColor Cyan
