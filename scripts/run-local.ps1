# Runs TamiLearn from a local folder, so the 20,000+ helper files (node_modules)
# never go on Google Drive. The Drive folder stays the one place where the app
# is edited; this script copies it to the run folder, then starts the app.
#
#   .\scripts\run-local.ps1           # start the app at http://localhost:3000
#   .\scripts\run-local.ps1 test      # run the tests
#   .\scripts\run-local.ps1 build     # production build check
param([string]$Mode = "dev")

$ErrorActionPreference = "Stop"
$src = Split-Path -Parent $PSScriptRoot
$run = Join-Path $env:USERPROFILE "Dev\tamilearn-run"

# One-way mirror Drive -> run folder. node_modules, build output and git
# history stay where they are. /MIR deletes files removed on the Drive side.
robocopy $src $run /MIR /XD node_modules .next .git /XF tsconfig.tsbuildinfo .env.local /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "Copy to $run failed (robocopy code $LASTEXITCODE)" }

Set-Location $run
$stamp = Join-Path $run "node_modules\.lock-copy"
$lock = Join-Path $run "package-lock.json"
if (-not (Test-Path $stamp) -or ((Get-FileHash $lock).Hash -ne (Get-Content $stamp -ErrorAction SilentlyContinue))) {
  npm install
  (Get-FileHash $lock).Hash | Set-Content $stamp
}

switch ($Mode) {
  "dev"   { npm run dev }
  "test"  { npx vitest run }
  "build" { npm run build }
  default { throw "Unknown mode '$Mode' (use dev, test or build)" }
}
