# ============================================================
# Dung web dev server va API da bat bang `npm run share`.
#
#   npm run share:stop
#
# Khong dung MySQL va Redis, vi hai thu do con dung cho viec khac.
# Cong tuong lua cung giu nguyen; muon dong han thi chay:
#   npm run share:firewall -- close
# ============================================================
param(
  [int]$WebPort = 5173,
  [int]$ApiPort = 3000
)

$ErrorActionPreference = 'Stop'

function Stop-Port([int]$Port, [string]$Label) {
  $conn = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if (-not $conn) {
    Write-Host "[..]   $Label khong chay (cong $Port trong)" -ForegroundColor Yellow
    return
  }
  Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
  Write-Host "[OK]   Da dung $Label (PID $($conn.OwningProcess))" -ForegroundColor Green
}

Write-Host ""
Stop-Port $WebPort 'web dev server'
Stop-Port $ApiPort 'API'
Write-Host ""
