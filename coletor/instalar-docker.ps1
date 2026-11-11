# Instala o que o coletor precisa para o modo completo (fotos do Google Maps): WSL2 + Docker Desktop.
# Rode UMA vez, como ADMINISTRADOR:
#   botão direito no menu Iniciar → "Terminal (Administrador)" e então:
#   powershell -ExecutionPolicy Bypass -File ".\coletor\instalar-docker.ps1"
# Depois reinicie o computador quando pedido.

$ErrorActionPreference = 'Stop'

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  (New-Object Security.Principal.WindowsPrincipal $id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

if (-not (Test-Admin)) {
  Write-Host "Este script precisa ser executado como Administrador." -ForegroundColor Red
  Write-Host "Abra: menu Iniciar (botão direito) > Terminal (Administrador) e rode de novo."
  exit 1
}

$precisaReiniciar = $false

Write-Host "`n[1/3] WSL2 (Subsistema do Windows para Linux)" -ForegroundColor Cyan
$wslOk = $false
try {
  $status = (wsl.exe --status 2>&1 | Out-String) -replace "`0", ''
  $wslOk = $LASTEXITCODE -eq 0 -and $status -notmatch 'não está instalado|not installed'
} catch { $wslOk = $false }
if ($wslOk) {
  Write-Host "WSL já instalado."
} else {
  Write-Host "Instalando WSL2 (pode levar alguns minutos)..."
  wsl.exe --install --no-launch
  $precisaReiniciar = $true
}

Write-Host "`n[2/3] Docker Desktop" -ForegroundColor Cyan
if (Test-Path "C:\Program Files\Docker\Docker\Docker Desktop.exe") {
  Write-Host "Docker Desktop já instalado."
} else {
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "winget não encontrado. Baixe o Docker Desktop em https://www.docker.com/products/docker-desktop/ e instale." -ForegroundColor Yellow
  } else {
    Write-Host "Instalando Docker Desktop via winget..."
    winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
    $precisaReiniciar = $true
  }
}

Write-Host "`n[3/3] Próximos passos" -ForegroundColor Cyan
if ($precisaReiniciar) {
  Write-Host "1. REINICIE o computador." -ForegroundColor Yellow
  Write-Host "2. Abra o Docker Desktop, aceite os termos e espere 'Engine running'."
} else {
  Write-Host "1. Abra o Docker Desktop e espere 'Engine running'."
}
Write-Host "3. Teste as fotos do Maps:  npm run coletor:testar"
Write-Host "4. Use normalmente:         npm run coletor   (detecta o Docker sozinho)"
