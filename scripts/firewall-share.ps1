# ============================================================
# Mo / dong cong tuong lua cho viec chia se qua mang LAN.
#
#   npm run share:firewall          -> mo cong 5173
#   npm run share:firewall -- close -> tra lai nhu cu
#
# Chay mot lan la du, khong can lam lai moi ngay.
#
# Vi sao phai tat rule cua Node.js: Windows da tu tao san rule CHAN Node.js o
# profile Public, ma trong tuong lua Windows thi rule CHAN luon thang rule CHO
# PHEP. Con nguyen no thi rule mo cong 5173 ben duoi khong co tac dung.
#
# Can quyen Administrator, script se tu xin (hien hop thoai UAC).
# ============================================================
param(
  [Parameter(Position = 0)]
  [string]$Action = 'open',
  # Co Position ro rang o tren nen $WebPort chi nhan dang -WebPort 1234, khong
  # con an theo vi tri - tranh viec chu thich dan nham roi bi ep sang kieu so.
  [int]$WebPort = 5173,
  # cmd.exe khong coi '#' la chu thich, xem ghi chu trong cert-trust.ps1
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Ignored
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($Action) -or $Action.StartsWith('#')) { $Action = 'open' }
$validActions = @('open', 'close', 'status')
if ($validActions -notcontains $Action) {
  Write-Host "Khong hieu lenh '$Action'." -ForegroundColor Red
  Write-Host "Chon mot trong: $($validActions -join ', ')" -ForegroundColor Yellow
  exit 1
}
$ruleName = "EduExam - chia se LAN ($WebPort)"
$nodeRuleName = 'Node.js JavaScript Runtime'

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  (New-Object Security.Principal.WindowsPrincipal $id).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Show-Status {
  $rule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
  if ($rule -and $rule.Enabled -eq 'True') {
    Write-Host "[OK]   Cong $WebPort dang duoc mo cho mang LAN" -ForegroundColor Green
  }
  else {
    Write-Host "[..]   Cong $WebPort chua duoc mo" -ForegroundColor Yellow
  }

  $blocked = @(Get-NetFirewallRule -DisplayName $nodeRuleName -ErrorAction SilentlyContinue |
    Where-Object { $_.Enabled -eq 'True' -and $_.Action -eq 'Block' })
  if ($blocked.Count -gt 0) {
    Write-Host "[..]   Con $($blocked.Count) rule dang CHAN Node.js, may khac se khong vao duoc" -ForegroundColor Yellow
  }
  else {
    Write-Host "[OK]   Khong con rule nao chan Node.js" -ForegroundColor Green
  }
}

if ($Action -eq 'status') {
  Show-Status
  exit 0
}

# Chua co quyen Administrator thi tu goi lai chinh minh kem quyen do.
if (-not (Test-Admin)) {
  Write-Host ""
  Write-Host "Can quyen Administrator de sua tuong lua." -ForegroundColor Yellow
  Write-Host "Se hien hop thoai UAC, bam Yes de tiep tuc." -ForegroundColor Yellow
  Write-Host ""
  $self = $PSCommandPath
  try {
    Start-Process -FilePath 'powershell' -Verb RunAs -Wait -ArgumentList @(
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', "`"$self`"", '-Action', $Action, '-WebPort', $WebPort
    )
  }
  catch {
    Write-Host "Ban da tu choi hop thoai UAC, khong doi gi ca." -ForegroundColor Red
    exit 1
  }
  Show-Status
  exit 0
}

# ---------- Tu day tro xuong da co quyen Administrator ----------
switch ($Action) {
  'open' {
    $nodeRules = @(Get-NetFirewallRule -DisplayName $nodeRuleName -ErrorAction SilentlyContinue |
      Where-Object { $_.Enabled -eq 'True' })
    if ($nodeRules.Count -gt 0) {
      $nodeRules | Disable-NetFirewallRule
      Write-Host "Da tat $($nodeRules.Count) rule cu cua Node.js (mo lai bang: close)." -ForegroundColor Green
    }

    if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
      Get-NetFirewallRule -DisplayName $ruleName | Enable-NetFirewallRule
      Write-Host "Rule cho cong $WebPort da co san, da bat lai." -ForegroundColor Green
    }
    else {
      New-NetFirewallRule -DisplayName $ruleName `
        -Description 'Web dev server cua do an EduExam Pro, chia se trong mang noi bo' `
        -Direction Inbound -Action Allow -Protocol TCP -LocalPort $WebPort `
        -Profile Any -Enabled True | Out-Null
      Write-Host "Da mo cong $WebPort cho moi loai mang." -ForegroundColor Green
    }
  }

  'close' {
    if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
      Remove-NetFirewallRule -DisplayName $ruleName
      Write-Host "Da dong cong $WebPort." -ForegroundColor Green
    }
    $nodeRules = @(Get-NetFirewallRule -DisplayName $nodeRuleName -ErrorAction SilentlyContinue |
      Where-Object { $_.Enabled -eq 'False' })
    if ($nodeRules.Count -gt 0) {
      $nodeRules | Enable-NetFirewallRule
      Write-Host "Da bat lai $($nodeRules.Count) rule cu cua Node.js." -ForegroundColor Green
    }
  }
}

Write-Host ""
Show-Status
Write-Host ""
