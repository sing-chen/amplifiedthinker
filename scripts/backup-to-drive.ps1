<#
.SYNOPSIS
  Backs up this working copy to Google Drive as a hardware-loss safety net.

.DESCRIPTION
  Deliberately NOT a mirror of the working copy. Mirroring is the wrong shape here for
  three reasons:

    * node_modules/, dist/ and .astro/ are build artifacts. Syncing them is what made
      Google Drive unusable as a working directory in the first place - thousands of
      small file operations, which Drive's virtual filesystem cannot survive. They are
      reproducible from package-lock.json in 7 seconds. Never sync them.
    * .git/ is also many small, frequently-rewritten files. Drive handles it badly, and
      a half-synced .git is worse than no backup at all. Git history is instead captured
      as a SINGLE bundle file, which Drive syncs cleanly.
    * Tracked source is already backed up on GitHub, in realtime, on every push.

  What is actually at risk is the small set of things that exist nowhere else:

    * _originals/ - full-resolution source images, gitignored, so not on GitHub.
    * .claude/settings.local.json - untracked local settings.
    * Any commit made locally and not yet pushed.

  So this script captures exactly those, plus a full-history bundle for good measure.

  NOTE: ASCII only, deliberately. Windows PowerShell 5.1 reads a BOM-less script as ANSI,
  so non-ASCII characters here become mojibake and break the parse.

.PARAMETER Destination
  Drive folder to write into. Created if absent.

.EXAMPLE
  npm run backup
  powershell -ExecutionPolicy Bypass -File scripts\backup-to-drive.ps1

.NOTES
  Restore on new hardware:
    git clone https://github.com/sing-chen/amplifiedthinker.git C:\dev\amplifiedthinker
    # copy _originals/ and .claude/settings.local.json out of the backup folder
    npm ci
  Restore from the bundle instead, if GitHub were ever unavailable:
    git clone amplifiedthinker.bundle C:\dev\amplifiedthinker
#>

[CmdletBinding()]
param(
  [string]$Destination = "G:\My Drive\01. Personal\Personal Projects\websites\amplifiedthinker-backup"
)

# 'Continue', not 'Stop', on purpose. git writes normal progress output to stderr, and
# Windows PowerShell 5.1 wraps a native command's stderr in ErrorRecords - under 'Stop'
# that turns `git bundle verify` reporting "is okay" into a terminating error. Native
# calls below are checked by $LASTEXITCODE instead, which is the only reliable signal.
# For the same reason, never add 2>&1 or 2>$null to a git call here.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function Assert-LastExit([string]$What) {
  if ($LASTEXITCODE -ne 0) { throw "$What failed (exit $LASTEXITCODE)" }
}

if (-not (Test-Path (Join-Path $repo '.git'))) {
  throw "Not a git repository: $repo"
}

if (-not (Test-Path $Destination)) {
  New-Item -ItemType Directory -Force -Path $Destination | Out-Null
  Write-Host "Created $Destination"
}

Write-Host "Repo:        $repo"
Write-Host "Destination: $Destination"
Write-Host ""

# --- 1. Full history as a single file ------------------------------------------
# One file rather than a .git tree, because Drive syncs large single files reliably
# and small-file trees unreliably. --all covers every branch and tag.
$bundle = Join-Path $Destination 'amplifiedthinker.bundle'
$tmpBundle = "$bundle.tmp"
git bundle create $tmpBundle --all
Assert-LastExit 'git bundle create'

# Verify before replacing the previous good copy, so a corrupt run cannot destroy it.
git bundle verify $tmpBundle | Out-Null
if ($LASTEXITCODE -ne 0) {
  Remove-Item $tmpBundle -Force
  throw "bundle failed verification - previous backup left intact"
}
Move-Item -Force $tmpBundle $bundle
$bundleMb = [math]::Round((Get-Item $bundle).Length / 1MB, 1)
Write-Host "  bundle: $bundleMb MB"
Write-Host ""

# --- 2. Warn about work the bundle cannot capture -----------------------------
# A bundle contains COMMITS. Uncommitted edits to tracked files are in neither the
# bundle nor GitHub, so a dirty tree is a genuine gap rather than a style complaint.
$dirty = @(git status --porcelain --untracked-files=no)
if ($dirty.Count -gt 0) {
  Write-Warning "$($dirty.Count) uncommitted change(s) to tracked files - NOT captured by this backup:"
  $dirty | ForEach-Object { Write-Host "    $_" }
  Write-Host "  Commit them if they matter; a bundle only contains committed history."
  Write-Host ""
}

# An unpushed commit is safe (the bundle has it) but usually means someone forgot.
git rev-parse --abbrev-ref '@{u}' | Out-Null
$hasUpstream = ($LASTEXITCODE -eq 0)
$unpushed = if ($hasUpstream) { @(git log --oneline '@{u}..HEAD') } else { @() }
if (-not $hasUpstream) { Write-Warning "Branch has no upstream - cannot check for unpushed commits" }
if ($unpushed.Count -gt 0) {
  Write-Warning "$($unpushed.Count) local commit(s) not pushed to origin (captured in the bundle):"
  $unpushed | ForEach-Object { Write-Host "    $_" }
  Write-Host ""
}

# --- 3. The files that exist nowhere else -------------------------------------
# /MIR so deletions propagate; these are small, stable trees where mirroring is safe.
$originals = Join-Path $repo '_originals'
if (Test-Path $originals) {
  robocopy $originals (Join-Path $Destination '_originals') /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
  # robocopy exit codes under 8 are success (0 = no change, 1 = files copied, etc.)
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed on _originals (exit $LASTEXITCODE)" }
  $n = (Get-ChildItem $originals -Recurse -File).Count
  Write-Host "  _originals: $n files"
} else {
  Write-Warning "_originals/ not found - nothing to back up, but it should exist here"
}

$localSettings = Join-Path $repo '.claude\settings.local.json'
if (Test-Path $localSettings) {
  $claudeDir = Join-Path $Destination '.claude'
  New-Item -ItemType Directory -Force -Path $claudeDir | Out-Null
  Copy-Item -Force $localSettings (Join-Path $claudeDir 'settings.local.json')
  Write-Host "  .claude/settings.local.json"
}

# --- 4. Catch newly ignored files this script does not know about --------------
# The standing risk: anything matching .gitignore is invisible to `git status`, so the
# usual "is it pushed?" check does not apply. This lists ignored paths that are neither
# build output nor already backed up, so a new one cannot go unnoticed.
$known = '^(node_modules|dist|\.astro|\.vercel|_originals|\.claude)([/\\]|$)'
$unbacked = @(git status --ignored --porcelain |
  Where-Object { $_ -like '!!*' } |
  ForEach-Object { $_.Substring(3).Trim('"') } |
  Where-Object { $_ -notmatch $known })
if ($unbacked.Count -gt 0) {
  Write-Host ""
  Write-Warning "Ignored path(s) not covered by this backup - review and add them if they matter:"
  $unbacked | ForEach-Object { Write-Host "    $_" }
}

Write-Host ""
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm'
Write-Host "Backup complete: $stamp"
