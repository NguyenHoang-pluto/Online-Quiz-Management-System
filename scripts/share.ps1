# ============================================================
# Chay ca he thong va chia se cho may khac trong cung mang LAN.
#
#   npm run share
#
# Khac voi `npm run dev`: web dev server bind ra moi card mang va chay HTTPS.
# Bat buoc HTTPS vi trinh duyet chi cho dung camera tren origin an toan, ma ca
# thi TU XA thi bat buoc co camera. Chung chi la loai tu ky nen lan dau vao se
# co man canh bao, bam "Advanced" roi "Proceed" la xong.
#
# Mo cong tuong lua truoc do mot lan:  npm run share:firewall
# ============================================================
param(
  [int]$WebPort = 5173,
  [int]$ApiPort = 3000
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $root 'apps/api'
$webDir = Join-Path $root 'apps/web'
$certDir = Join-Path $root 'certs'

function Test-Port([int]$Port) {
  [bool](Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue)
}

function Get-PortOwner([int]$Port) {
  (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -First 1).OwningProcess
}

Write-Host ""
Write-Host "=== EduExam Pro - chia se qua mang LAN ===" -ForegroundColor Cyan
Write-Host ""

# ---------- 1. Ha tang: MySQL va Redis ----------
if (Test-Port 3306) {
  Write-Host "[OK]   MySQL dang chay tren 3306" -ForegroundColor Green
}
else {
  Write-Host "[LOI]  MySQL chua chay. Chay truoc: npm run mysql:start" -ForegroundColor Red
  exit 1
}

if (Test-Port 6379) {
  Write-Host "[OK]   Redis dang chay tren 6379" -ForegroundColor Green
}
else {
  Write-Host "[LOI]  Redis chua chay tren 6379." -ForegroundColor Red
  Write-Host "       Khong co Redis thi khoa phien thi va heartbeat giam sat se hong." -ForegroundColor Yellow
  exit 1
}

# ---------- 2. Chung chi HTTPS ----------
# Chung chi ghi cung danh sach IP. Doi wifi hoac phat 4G thi may co IP moi,
# khong khop nua va trinh duyet lai bao loi chung chi - nen cap lai cho khop.
$keyPath = Join-Path $certDir 'dev-key.pem'
$certPath = Join-Path $certDir 'dev-cert.pem'
$cerPath = Join-Path $certDir 'dev-cert.cer'
$certScript = Join-Path $PSScriptRoot 'cert-trust.ps1'

$currentIps = @()
foreach ($c in (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' })) {
  foreach ($a in $c.IPv4Address) { if ($a.IPAddress) { $currentIps += $a.IPAddress } }
}

$needRenew = $false
if (-not (Test-Path $keyPath) -or -not (Test-Path $certPath) -or -not (Test-Path $cerPath)) {
  Write-Host "[..]   Chua co chung chi, dang tao..." -ForegroundColor Yellow
  $needRenew = $true
}
else {
  $x = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $cerPath
  $san = $x.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.17' }
  $sanText = if ($san) { $san.Format($true) } else { '' }
  $missing = @($currentIps | Where-Object { $sanText -notmatch [regex]::Escape($_) })
  if ($missing.Count -gt 0) {
    Write-Host "[..]   Doi mang roi ($($missing -join ', ')), dang cap lai chung chi..." -ForegroundColor Yellow
    $needRenew = $true
  }
}

if ($needRenew) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $certScript renew
  if (-not (Test-Path $certPath)) {
    Write-Host "[LOI]  Khong tao duoc chung chi." -ForegroundColor Red
    exit 1
  }
}
else {
  Write-Host "[OK]   Chung chi HTTPS con khop voi mang hien tai" -ForegroundColor Green
}

# ---------- 3. API ----------
if (Test-Port $ApiPort) {
  Write-Host "[OK]   API da chay san tren $ApiPort (PID $(Get-PortOwner $ApiPort))" -ForegroundColor Green
}
else {
  $mainJs = Join-Path $apiDir 'dist/main.js'
  if (-not (Test-Path $mainJs)) {
    Write-Host "[LOI]  Chua co ban build cua API. Chay: npm run build" -ForegroundColor Red
    exit 1
  }
  $api = Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' `
    -WorkingDirectory $apiDir -WindowStyle Hidden -PassThru
  foreach ($i in 1..30) {
    Start-Sleep -Seconds 1
    if (Test-Port $ApiPort) { break }
  }
  if (Test-Port $ApiPort) {
    Write-Host "[OK]   Da khoi dong API tren $ApiPort (PID $($api.Id))" -ForegroundColor Green
  }
  else {
    Write-Host "[LOI]  API khong len duoc sau 30 giay." -ForegroundColor Red
    exit 1
  }
}

# ---------- 4. Web dev server ----------
# Neu dang chay thi dung lai, vi rat co the no dang bind localhost va chay HTTP.
if (Test-Port $WebPort) {
  $old = Get-PortOwner $WebPort
  Write-Host "[..]   Cong $WebPort dang ban (PID $old), dung lai de mo ra LAN" -ForegroundColor Yellow
  Stop-Process -Id $old -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
}

$env:EDUEXAM_SHARE = '1'
$viteJs = Join-Path $root 'node_modules/vite/bin/vite.js'
$web = Start-Process -FilePath 'node' `
  -ArgumentList "`"$viteJs`" --host 0.0.0.0 --port $WebPort" `
  -WorkingDirectory $webDir -WindowStyle Hidden -PassThru
foreach ($i in 1..30) {
  Start-Sleep -Seconds 1
  if (Test-Port $WebPort) { break }
}
if (-not (Test-Port $WebPort)) {
  Write-Host "[LOI]  Web dev server khong len duoc sau 30 giay." -ForegroundColor Red
  exit 1
}
Write-Host "[OK]   Web dev server chay HTTPS tren $WebPort (PID $($web.Id))" -ForegroundColor Green

# ---------- 5. Dia chi de gui cho nguoi khac ----------
# Lay card mang dang thuc su co duong ra ngoai, bo qua card ao cua VMware.
$configs = Get-NetIPConfiguration |
  Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' }

Write-Host ""
if (-not $configs) {
  Write-Host "Khong tim thay card mang nao dang ket noi." -ForegroundColor Red
  Write-Host "Bat wifi hoac phat 4G tu dien thoai roi chay lai script nay." -ForegroundColor Yellow
  exit 1
}

Write-Host "=== Gui duong dan nay cho ban cua ban ===" -ForegroundColor Cyan
foreach ($c in $configs) {
  $ip = ($c.IPv4Address | Select-Object -First 1).IPAddress
  Write-Host ""
  Write-Host "   https://${ip}:$WebPort" -ForegroundColor Green
  Write-Host "   (qua $($c.InterfaceAlias))" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "May cua ban thi vao: " -NoNewline
Write-Host "https://localhost:$WebPort" -ForegroundColor Green
Write-Host ""
Write-Host "Luu y khi ban kia vao lan dau:" -ForegroundColor Yellow
Write-Host "  - Trinh duyet bao 'Ket noi khong rieng tu' vi chung chi tu ky."
Write-Host "    Bam Nang cao (Advanced) roi Tiep tuc (Proceed) la vao duoc."
Write-Host "  - Vao thi tu xa se hoi quyen camera, phai bam Cho phep (Allow)."
Write-Host "  - Neu khong vao duoc: wifi truong/quan hay chan may noi chuyen voi"
Write-Host "    nhau. Phat 4G tu dien thoai roi ca hai cung noi vao do thi chac an."
Write-Host ""
Write-Host "Tai khoan mau (mat khau chung: EduExam@123):" -ForegroundColor Yellow
Write-Host "  admin        - Quan tri vien"
Write-Host "  GV001        - Giang vien"
Write-Host "  3122410127   - Sinh vien (Nguyen Huy Hoang)"
Write-Host "  3123410013   - Sinh vien (Ma Ly Hoang An)"
Write-Host "  3123410048   - Sinh vien (Hua The Dan)"
Write-Host "  3123410038   - Sinh vien (La Vi Cuong)"
Write-Host "  3121410030   - Sinh vien (Truong Gia Huy)"
Write-Host ""
Write-Host "Dung lai khi xong:  npm run share:stop" -ForegroundColor DarkGray
Write-Host ""
