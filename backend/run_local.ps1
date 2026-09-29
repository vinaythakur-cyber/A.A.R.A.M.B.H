# run_local.ps1 — start the A.A.R.A.M.B.H backend locally on Windows.
#
# WHY THIS SCRIPT EXISTS (read this before running):
#   Your project folder is inside OneDrive (...\OneDrive\Desktop\Project\...).
#   OneDrive's cloud-sync file locking conflicts with two things Python needs
#   to do here, both confirmed on this project:
#     1. SQLite's own file locking -> "disk I/O error" if a .db file sits
#        inside a OneDrive-synced folder.
#     2. venv creation itself -> "ensurepip ... exit status 101" if .venv is
#        created inside a OneDrive-synced folder (ensurepip writes hundreds
#        of small files very fast; OneDrive's sync hooks choke on that).
#   Fix: keep BOTH the databases and the virtual environment OUTSIDE OneDrive
#   (this script uses %LOCALAPPDATA%\AarambhData and %LOCALAPPDATA%\AarambhVenv).
#   This is a local-machine-only issue — it does NOT affect the actual code,
#   and Docker (docker compose up) is unaffected too, since Docker keeps
#   everything inside its own containers/volumes, not on OneDrive.
#
# USAGE (first time):
#   Right-click this file -> Run with PowerShell
#   (or open PowerShell in the backend/ folder and run:  .\run_local.ps1)
#
# The dashboard will then work if you also run the frontend:
#   cd ..\frontend
#   npm install
#   npm run dev
# and open the printed http://localhost:5173 URL.

$ErrorActionPreference = "Stop"
$dataDir = "$env:LOCALAPPDATA\AarambhData"
$venvDir = "$env:LOCALAPPDATA\AarambhVenv"
New-Item -ItemType Directory -Force -Path $dataDir | Out-Null

if (-not (Test-Path "$venvDir\Scripts\python.exe")) {
    Write-Host "Creating virtual environment outside OneDrive (avoids the ensurepip/OneDrive lock error)..."
    python -m venv $venvDir
}

Write-Host "Installing dependencies (first run only takes a few minutes)..."
& "$venvDir\Scripts\pip.exe" install -r requirements.txt

$env:BH_DATA_DIR = $dataDir
$env:RELOCATION_DATABASE_URL = "sqlite:///$($dataDir -replace '\\','/')/bhoomi_rakshak.db"

Write-Host ""
Write-Host "Starting backend on http://localhost:8000 (Ctrl+C to stop)"
Write-Host "Data directory: $dataDir"
Write-Host "Virtual env:    $venvDir"
Write-Host ""

& "$venvDir\Scripts\python.exe" -m uvicorn app.main:app --host 0.0.0.0 --port 8000
