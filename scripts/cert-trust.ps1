# ============================================================
# Quan ly chung chi tu ky dung cho che do chia se LAN.
#
#   npm run share:cert            -> cap lai chung chi theo IP mang hien tai
#   npm run share:cert -- trust   -> cai vao kho tin cay cua tai khoan Windows
#   npm run share:cert -- untrust -> go khoi kho tin cay
#   npm run share:cert -- status  -> xem chung chi dang khai bao nhung dia chi nao
#
# Vi sao phai cap lai khi doi mang: chung chi ghi cung danh sach IP (SAN). Doi
# sang wifi khac hay phat 4G thi may co IP moi, khong khop voi chung chi nua,
# trinh duyet lai bao loi du da tin cay. `npm run share` tu goi renew khi thay
# IP hien tai chua nam trong chung chi, nen binh thuong khong phai chay tay.
#
# Chi tin cay tren tai khoan Windows nay, khong dung den quyen Administrator.
# May cua nguoi khac van phai bam qua man canh bao mot lan.
# ============================================================
param(
  [string]$Action = 'renew',
  # cmd.exe khong coi '#' la chu thich. Copy lenh kem chu thich tu tai lieu thi
  # phan chu thich se lot vao day thay vi lam hong lenh.
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Ignored
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Action) -or $Action.StartsWith('#')) { $Action = 'renew' }
$validActions = @('renew', 'trust', 'untrust', 'status')
if ($validActions -notcontains $Action) {
  Write-Host "Khong hieu lenh '$Action'." -ForegroundColor Red
  Write-Host "Chon mot trong: $($validActions -join ', ')" -ForegroundColor Yellow
  exit 1
}
$root = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $root 'certs'
$keyPem = Join-Path $certDir 'dev-key.pem'
$certPem = Join-Path $certDir 'dev-cert.pem'
$certCer = Join-Path $certDir 'dev-cert.cer'
$subjectCN = 'EduExam Dev'

function Find-OpenSsl {
  $cmd = Get-Command openssl -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in @(
      'C:\Program Files\Git\mingw64\bin\openssl.exe',
      'C:\Program Files\Git\usr\bin\openssl.exe',
      'C:\Program Files (x86)\Git\mingw64\bin\openssl.exe')) {
    if (Test-Path $p) { return $p }
  }
  return $null
}

function Get-LocalIPv4 {
  $ips = @('127.0.0.1')
  $cfgs = Get-NetIPConfiguration |
    Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' }
  foreach ($c in $cfgs) {
    foreach ($a in $c.IPv4Address) {
      if ($a.IPAddress -and $ips -notcontains $a.IPAddress) { $ips += $a.IPAddress }
    }
  }
  return $ips
}

function Get-CertAddresses {
  if (-not (Test-Path $certCer)) { return @() }
  $c = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $certCer
  $san = $c.Extensions | Where-Object { $_.Oid.Value -eq '2.5.29.17' }
  if (-not $san) { return @() }
  # Format() tra ve cac dong dang "IP Address=192.168.0.11" hoac "DNS Name=localhost"
  $text = $san.Format($true)
  $out = @()
  foreach ($line in ($text -split "`r?`n")) {
    if ($line -match '=\s*(.+?)\s*$') { $out += $Matches[1] }
  }
  return $out
}

function Get-TrustedCerts {
  Get-ChildItem Cert:\CurrentUser\Root -ErrorAction SilentlyContinue |
    Where-Object { $_.Subject -like "*CN=$subjectCN*" }
}

function Invoke-Trust {
  if (-not (Test-Path $certCer)) {
    Write-Host "Chua co $certCer, chay renew truoc." -ForegroundColor Red
    exit 1
  }
  $new = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $certCer
  $store = New-Object System.Security.Cryptography.X509Certificates.X509Store 'Root', 'CurrentUser'
  $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)

  # Don cac ban cu cua chinh minh, tranh de lai mot dong chung chi chet trong kho
  foreach ($old in @(Get-TrustedCerts)) {
    if ($old.Thumbprint -ne $new.Thumbprint) { $store.Remove($old) }
  }
  $store.Add($new)
  $store.Close()
  Write-Host "[OK]   Da tin cay chung chi tren tai khoan Windows nay" -ForegroundColor Green
}

function Invoke-Untrust {
  $found = @(Get-TrustedCerts)
  if ($found.Count -eq 0) {
    Write-Host "[..]   Khong co chung chi nao cua EduExam trong kho tin cay" -ForegroundColor Yellow
    return
  }
  $store = New-Object System.Security.Cryptography.X509Certificates.X509Store 'Root', 'CurrentUser'
  $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadWrite)
  foreach ($c in $found) { $store.Remove($c) }
  $store.Close()
  Write-Host "[OK]   Da go $($found.Count) chung chi khoi kho tin cay" -ForegroundColor Green
}

function Invoke-Renew {
  $openssl = Find-OpenSsl
  if (-not $openssl) {
    Write-Host "Khong tim thay openssl.exe (thuong di kem Git for Windows)." -ForegroundColor Red
    Write-Host "Cai Git for Windows hoac tu tao chung chi vao thu muc certs/." -ForegroundColor Yellow
    exit 1
  }

  $ips = Get-LocalIPv4
  $san = 'subjectAltName=DNS:localhost'
  foreach ($ip in $ips) { $san += ",IP:$ip" }

  if (-not (Test-Path $certDir)) { New-Item -ItemType Directory -Path $certDir | Out-Null }

  # MSYS_NO_PATHCONV: ban openssl di kem Git hay bien "/CN=..." thanh duong dan Windows
  $env:MSYS_NO_PATHCONV = '1'

  # Goi qua Start-Process chu khong goi thang: openssl in tien trinh ra stderr,
  # ma PowerShell 5.1 goi native exe co redirect stderr thi coi moi dong la loi
  # nghiem trong va dung ca script du openssl chay dung.
  function Invoke-OpenSsl([string]$ArgLine, [string]$Step) {
    $errFile = [System.IO.Path]::GetTempFileName()
    $p = Start-Process -FilePath $openssl -ArgumentList $ArgLine `
      -NoNewWindow -Wait -PassThru -RedirectStandardError $errFile
    if ($p.ExitCode -ne 0) {
      Write-Host "openssl bao loi khi $Step (ma $($p.ExitCode)):" -ForegroundColor Red
      Get-Content $errFile | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
      Remove-Item $errFile -ErrorAction SilentlyContinue
      exit 1
    }
    Remove-Item $errFile -ErrorAction SilentlyContinue
  }

  Invoke-OpenSsl (
    'req -x509 -newkey rsa:2048 -nodes ' +
    "-keyout `"$keyPem`" -out `"$certPem`" -days 825 " +
    "-subj `"/C=VN/O=EduExam Pro/CN=$subjectCN`" " +
    "-addext `"$san`" " +
    '-addext "keyUsage=digitalSignature,keyEncipherment" ' +
    '-addext "extendedKeyUsage=serverAuth"'
  ) 'tao chung chi'

  Invoke-OpenSsl "x509 -in `"$certPem`" -outform DER -out `"$certCer`"" 'chuyen sang dang DER'

  Write-Host "[OK]   Da cap chung chi moi cho: $($ips -join ', ')" -ForegroundColor Green
  Invoke-Trust
}

switch ($Action) {
  'renew' { Invoke-Renew }
  'trust' { Invoke-Trust }
  'untrust' { Invoke-Untrust }
  'status' {
    if (-not (Test-Path $certCer)) {
      Write-Host "[..]   Chua co chung chi trong certs/" -ForegroundColor Yellow
    }
    else {
      $c = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $certCer
      Write-Host "Chung chi het han: $($c.NotAfter)"
      Write-Host "Khai bao cho:     $((Get-CertAddresses) -join ', ')"
    }
    if (@(Get-TrustedCerts).Count -gt 0) {
      Write-Host "[OK]   Dang duoc tin cay tren tai khoan Windows nay" -ForegroundColor Green
    }
    else {
      Write-Host "[..]   Chua duoc tin cay, trinh duyet se bao loi chung chi" -ForegroundColor Yellow
    }
    $missing = @(Get-LocalIPv4 | Where-Object { (Get-CertAddresses) -notcontains $_ })
    if ($missing.Count -gt 0) {
      Write-Host "[..]   IP hien tai chua co trong chung chi: $($missing -join ', ')" -ForegroundColor Yellow
      Write-Host "       Chay: npm run share:cert" -ForegroundColor Yellow
    }
  }
}
