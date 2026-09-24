# ============================================================
# Bat / tat MySQL 8 ban portable (khong can Docker, khong can quyen Admin).
#
#   npm run mysql:start
#   npm run mysql:stop
#   npm run mysql:status
#
# Duong dan lay tu bien MYSQL_HOME trong file .env o goc workspace.
# ============================================================
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root '.env'

if (-not (Test-Path $envFile)) {
  Write-Host "Khong tim thay $envFile. Hay chay: cp .env.example .env" -ForegroundColor Red
  exit 1
}

# Doc MYSQL_HOME va MYSQL_INI tu .env
$mysqlHome = $null
$mysqlIni = $null
foreach ($line in Get-Content $envFile) {
  if ($line -match '^\s*MYSQL_HOME\s*=\s*(.+?)\s*$') { $mysqlHome = $Matches[1].Trim('"').Trim("'") }
  if ($line -match '^\s*MYSQL_INI\s*=\s*(.+?)\s*$') { $mysqlIni = $Matches[1].Trim('"').Trim("'") }
}

if (-not $mysqlHome) {
  Write-Host "Thieu MYSQL_HOME trong .env" -ForegroundColor Red
  Write-Host "Vi du: MYSQL_HOME=E:/mysql8/mysql-8.0.43-winx64" -ForegroundColor Yellow
  exit 1
}

$mysqld = Join-Path $mysqlHome 'bin/mysqld.exe'
if (-not (Test-Path $mysqld)) {
  Write-Host "Khong tim thay $mysqld" -ForegroundColor Red
  exit 1
}

function Get-MysqlProcess {
  Get-Process mysqld -ErrorAction SilentlyContinue
}

switch ($Action) {
  'start' {
    if (Get-MysqlProcess) { Write-Host "MySQL da chay san." -ForegroundColor Green; exit 0 }

    $args = @()
    if ($mysqlIni) { $args += "--defaults-file=$mysqlIni" }
    Start-Process -FilePath $mysqld -ArgumentList $args -WindowStyle Hidden

    foreach ($i in 1..30) {
      Start-Sleep -Seconds 1
      if (Get-NetTCPConnection -State Listen -LocalPort 3306 -ErrorAction SilentlyContinue) {
        Write-Host "MySQL da san sang tren cong 3306 (sau $i giay)." -ForegroundColor Green
        exit 0
      }
    }
    Write-Host "Qua 30 giay chua thay cong 3306. Xem log loi trong MYSQL_INI." -ForegroundColor Red
    exit 1
  }

  'stop' {
    $p = Get-MysqlProcess
    if (-not $p) { Write-Host "MySQL khong chay." -ForegroundColor Yellow; exit 0 }
    $p | Stop-Process -Force
    Write-Host "Da dung MySQL." -ForegroundColor Green
  }

  'status' {
    $p = Get-MysqlProcess
    $listening = Get-NetTCPConnection -State Listen -LocalPort 3306 -ErrorAction SilentlyContinue
    if ($p -and $listening) { Write-Host "MySQL DANG CHAY (PID $($p.Id)), cong 3306 mo." -ForegroundColor Green }
    elseif ($p) { Write-Host "Tien trinh mysqld co, nhung cong 3306 chua mo." -ForegroundColor Yellow }
    else { Write-Host "MySQL KHONG CHAY." -ForegroundColor Red }

    $redis = Get-NetTCPConnection -State Listen -LocalPort 6379 -ErrorAction SilentlyContinue
    if ($redis) { Write-Host "Redis DANG CHAY tren cong 6379." -ForegroundColor Green }
    else { Write-Host "Redis KHONG CHAY tren cong 6379." -ForegroundColor Red }
  }
}
