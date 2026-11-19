# Carries what git leaves out to another machine: the secrets and signing keys, the dev database, and Claude's
# global instructions and notes for this project. The zip holds them unencrypted, so move it privately and delete it
# once restored. Stop ./dev.sh first, so the database is closed.
#   ./private-files.ps1 save [zip]       from this checkout, to ~/niche-notes-private.zip by default
#   ./private-files.ps1 restore [zip]    from a fresh clone; it overwrites what is there
param(
    [Parameter(Mandatory)][ValidateSet('save', 'restore')][string]$Action,
    [string]$Zip = (Join-Path $HOME 'niche-notes-private.zip')
)
$ErrorActionPreference = 'Stop'

$places = [ordered]@{}
foreach ($file in @(
        '.env', '.guest-cookie', 'tauri/updater.key',
        'tauri/gen/android/release.keystore', 'tauri/gen/android/keystore.properties',
        'tauri/gen/android/app/google-services.json',
        'server/data/dev.db', 'server/data/dev.db-wal', 'server/data/dev.db-shm'
    )) {
    $places["repo/$file"] = Join-Path $PSScriptRoot $file
}
$places['claude/CLAUDE.md'] = Join-Path $HOME '.claude' 'CLAUDE.md'
# Claude names a project's folder after the checkout's path, so on another machine it has another name.
$places['claude/memory'] = Join-Path $HOME '.claude' 'projects' ($PSScriptRoot -replace '[^a-zA-Z0-9]', '-') 'memory'

function Copy-Place($from, $to) {
    if (Test-Path $from -PathType Container) {
        New-Item -ItemType Directory -Force $to | Out-Null
        Copy-Item -Recurse -Force (Join-Path $from '*') $to
    } else {
        New-Item -ItemType Directory -Force (Split-Path $to) | Out-Null
        Copy-Item -Force $from $to
    }
}

$staging = Join-Path ([IO.Path]::GetTempPath()) "niche-notes-private-$PID"
try {
    if ($Action -eq 'save') {
        foreach ($entry in $places.Keys) {
            if (-not (Test-Path $places[$entry])) { Write-Host "not here, skipped: $($places[$entry])"; continue }
            Copy-Place $places[$entry] (Join-Path $staging $entry)
            Write-Host "saved $($places[$entry])"
        }
        Remove-Item -Force -ErrorAction SilentlyContinue $Zip
        [IO.Compression.ZipFile]::CreateFromDirectory($staging, $Zip)
        Write-Host "wrote $Zip"
    } else {
        [IO.Compression.ZipFile]::ExtractToDirectory($Zip, $staging)
        foreach ($entry in $places.Keys) {
            if (-not (Test-Path (Join-Path $staging $entry))) { continue }
            Copy-Place (Join-Path $staging $entry) $places[$entry]
            Write-Host "restored $($places[$entry])"
        }
    }
} finally {
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $staging
}
