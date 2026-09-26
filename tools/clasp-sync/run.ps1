<#
.SYNOPSIS
    Drives the clasp CLI side of a full push across the in-scope KOS
    Apps Script projects (the two studio-steps projects are out: custom
    Studio steps are blocked by the org-wide GCP restriction).

.DESCRIPTION
    This script automates PROCESS, not JUDGMENT. Two decisions are made by
    a human, once, and recorded in the registry directory; the script only
    ever READS them and never falls back to `clasp create`:

      1. Which real Apps Script project a name maps to
         -> <Registry>\...\<name>\.clasp.json   (from `clasp clone <scriptId>`)
      2. For a web app, which deployments stay live
         -> <Registry>\...\<name>\deployments.txt  (one deployment ID per line,
            # comments allowed)

    A project missing either file is skipped with a warning, not invented.

    Web apps are PROMOTED, never redeployed: push, cut one version, then
    `clasp update-deployment` each registered deployment to it. Deployment
    IDs -- and so every /exec URL, bookmark, Script Property and leader-hub
    setting that holds one -- never change, and no deployments accumulate.
    Rolling back is `clasp update-deployment <id> --versionNumber <previous>`.

.PARAMETER Zip
    Optional. A fresh GitHub "Download ZIP" of main. When given, RepoRoot is
    deleted and replaced with the zip's contents before anything else runs,
    so a stale checkout can never be pushed and a file deleted upstream can
    never linger locally and get pushed back.

.PARAMETER RepoRoot
    The extracted KOS checkout. Reused on purpose; replaced wholesale by -Zip.

.PARAMETER Registry
    Durable folder holding each project's real .clasp.json (and, for web
    apps, deployments.txt). Lives OUTSIDE RepoRoot so -Zip can't wipe it:
        <Registry>\kos-personal\.clasp.json
        <Registry>\kos-personal\deployments.txt
        <Registry>\leader-hub\.clasp.json
        <Registry>\leader-hub\deployments.txt
        <Registry>\cas-ccps\teacher-dashboard\.clasp.json
        <Registry>\cas-ccps\teacher-dashboard\deployments.txt
        <Registry>\cas-ccps\unified-manual\.clasp.json
        ...

.PARAMETER Only
    Optional. Run only the named project(s). This is also the only way to run
    a project marked OnHold in the manifest.

.EXAMPLE
    .\run.ps1 -Zip $HOME\Downloads\KOS-main.zip
    Replaces the checkout from the zip, then runs every project not on hold.

.EXAMPLE
    .\run.ps1 -Only teacher-dashboard
    Just that one, against the checkout already on disk.
#>

param(
    [string]$Zip,
    [string]$RepoRoot = "KOS-main",
    [string]$Registry = "clasp-registry",
    [string[]]$Only = @()
)

$ErrorActionPreference = "Stop"

# clasp writes UTF-8 (its push file list draws tree lines), but Windows
# PowerShell 5.1 decodes a native program's output with the console's OEM
# code page, which turned each tree line into mojibake. Best effort: a host
# with no real console (the ISE, some remoting) throws on this.
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false } catch { }

# `powershell -File run.ps1 -Only a,b` hands over one string "a,b" rather
# than an array; split so both spellings work.
$Only = @($Only | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })

# Resolve once, up front: several steps Push-Location elsewhere, and a
# relative path would silently start meaning something different.
$RepoRoot = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $RepoRoot))
$Registry = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $Registry))

if (-not (Test-Path $Registry)) {
    throw "Registry folder not found: $Registry"
}
$sep = [System.IO.Path]::DirectorySeparatorChar
if (($Registry + $sep).StartsWith($RepoRoot.TrimEnd($sep) + $sep, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Registry ($Registry) is inside RepoRoot ($RepoRoot) -- -Zip would delete it. Move it out."
}

# Node's JSON.parse rejects a byte-order mark, and Windows PowerShell 5.1's
# Set-Content -Encoding utf8 writes one. sync.js JSON.parses the .clasp.json
# this script writes, so write BOM-less UTF-8 explicitly.
function Write-Utf8NoBom {
    param([string]$Path, [string]$Text)
    [System.IO.File]::WriteAllText($Path, $Text, (New-Object System.Text.UTF8Encoding $false))
}

# ---------------------------------------------------------------------------
# -Zip: replace RepoRoot wholesale.
# ---------------------------------------------------------------------------
function Update-Checkout {
    param([Parameter(Mandatory)] [string]$ZipPath)

    $ZipPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $ZipPath))
    if (-not (Test-Path $ZipPath)) { throw "Zip not found: $ZipPath" }

    if (Test-Path $RepoRoot) {
        # Windows won't delete a folder a shell is standing in, and a copy
        # of this script inside the checkout would be deleted with it.
        $here = (Get-Location).Path + $sep
        if ($here.StartsWith($RepoRoot.TrimEnd($sep) + $sep, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "Run this from outside $RepoRoot (e.g. its parent folder) when using -Zip."
        }
        # Refuse to delete anything that doesn't look like a KOS checkout.
        if (-not (Test-Path (Join-Path $RepoRoot "tools\clasp-sync\sync.js"))) {
            throw "$RepoRoot exists but doesn't look like a KOS checkout (no tools\clasp-sync\sync.js). Not deleting it."
        }
        # Real configs are gitignored, so the zip never brings them back.
        # Any with no registry copy would be lost for good.
        $orphans = @()
        $localDir = Join-Path $RepoRoot "cas-ccps\clasp\local"
        if (Test-Path $localDir) {
            $orphans += @(Get-ChildItem $localDir -Filter *.clasp.json | Where-Object {
                $name = $_.Name -replace '\.clasp\.json$', ''
                -not (Test-Path (Join-Path $Registry "cas-ccps\$name\.clasp.json"))
            } | ForEach-Object { "$($_.FullName) -> $Registry\cas-ccps\$($_.Name -replace '\.clasp\.json$', '')\.clasp.json" })
        }
        foreach ($flat in @($Manifest | Where-Object { $_.Type -eq "flat" })) {
            $inRepo = Join-Path $RepoRoot "$($flat.Name)\.clasp.json"
            $inReg  = Join-Path $Registry "$($flat.Name)\.clasp.json"
            if ((Test-Path $inRepo) -and -not (Test-Path $inReg)) { $orphans += "$inRepo -> $inReg" }
        }
        if ($orphans.Count -gt 0) {
            throw ("These real configs exist only inside RepoRoot and would be deleted. Copy each first:`n  " +
                ($orphans -join "`n  "))
        }
    }

    $staging = Join-Path ([System.IO.Path]::GetTempPath()) ("kos-zip-" + [guid]::NewGuid().ToString("N"))
    Expand-Archive -Path $ZipPath -DestinationPath $staging
    try {
        # A GitHub zip holds exactly one top-level folder (KOS-main).
        $top = @(Get-ChildItem $staging)
        if ($top.Count -ne 1 -or -not $top[0].PSIsContainer) {
            throw "Expected one top-level folder in $ZipPath, found: $($top.Name -join ', ')"
        }
        if (-not (Test-Path (Join-Path $top[0].FullName "tools\clasp-sync\sync.js"))) {
            throw "$ZipPath doesn't look like a KOS zip (no tools\clasp-sync\sync.js)."
        }
        if (Test-Path $RepoRoot) { Remove-Item $RepoRoot -Recurse -Force }
        Move-Item $top[0].FullName $RepoRoot
    }
    finally {
        if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
    }
    Write-Host "Checkout replaced from $ZipPath"
}

# ---------------------------------------------------------------------------
# Copy a project's real .clasp.json from the registry, or refuse.
# rootDir is forced to "." -- `clasp clone` can record an absolute rootDir
# pointing at the registry folder, and a push from the build folder would
# then upload the registry's stale cloned files instead of the build.
# ---------------------------------------------------------------------------
function Get-BoundConfig {
    param(
        [Parameter(Mandatory)] [string]$RegistryConfigPath,
        [Parameter(Mandatory)] [string]$TargetConfigPath
    )

    if (-not (Test-Path $RegistryConfigPath)) {
        Write-Warning "  no established scriptId at $RegistryConfigPath -- skipping. Bind it by hand first: clasp clone <realScriptId> into that folder."
        return $false
    }

    $config = Get-Content $RegistryConfigPath -Raw | ConvertFrom-Json
    if (-not $config.scriptId -or $config.scriptId -eq 'REPLACE_WITH_REAL_SCRIPT_ID') {
        Write-Warning "  $RegistryConfigPath has no real scriptId -- skipping."
        return $false
    }
    if ($config.PSObject.Properties.Name -contains 'rootDir') {
        $config.rootDir = "."
    }
    else {
        $config | Add-Member -NotePropertyName rootDir -NotePropertyValue "."
    }

    $targetDir = Split-Path $TargetConfigPath -Parent
    if (-not (Test-Path $targetDir)) {
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    }
    Write-Utf8NoBom -Path $TargetConfigPath -Text ($config | ConvertTo-Json -Depth 10)
    return $true
}

# The SHA this build will report from reportDeployVersion. The zip has no
# .git, so the correct value can't be computed here -- but printing it is
# what would have caught today's stale-folder push before it happened.
function Get-Marker {
    param([Parameter(Mandatory)] [string]$Dir)
    $hit = Get-ChildItem $Dir -File | Where-Object { $_.Name -like '*DeployVersionMarker*' } |
        Select-String -Pattern "DEPLOY_VERSION_SHA = '([0-9a-f]{7})" | Select-Object -First 1
    if ($hit) { return $hit.Matches[0].Groups[1].Value }
    return "(none)"
}

# Deployment IDs from `clasp list-deployments`, HEAD excluded. Lines look
# like:  - AKfycb...xyz @9 - description
function Get-LiveDeployments {
    clasp list-deployments |
        Where-Object { $_ -match '@' -and $_ -notmatch '@HEAD' } |
        ForEach-Object { ($_.Trim() -split '\s+')[1] } |
        Where-Object { $_ }
}

# `clasp push`, echoing its output. Returns "failed", "unchanged" or "pushed".
# --force answers clasp's "overwrite the remote manifest?" prompt: with
# stdout captured that prompt would be invisible and the run would hang.
# The repo's appsscript.json is the source of truth, so yes is the answer.
# No 2>&1: under Windows PowerShell 5.1 with ErrorActionPreference=Stop,
# the first line clasp writes to stderr would become a terminating error.
function Invoke-ClaspPush {
    $out = clasp push --force
    $code = $LASTEXITCODE
    $out | ForEach-Object { Write-Host "    $_" }
    if ($code -ne 0) { return "failed" }
    if ($out -match 'already up to date') { return "unchanged" }
    return "pushed"
}

# ---------------------------------------------------------------------------
# Push-only projects: no deployment concept, HEAD is the whole job.
# ---------------------------------------------------------------------------
function Invoke-PushOnly {
    param([Parameter(Mandatory)] [string]$WorkingDir)

    Push-Location $WorkingDir
    try {
        switch (Invoke-ClaspPush) {
            "failed"    { Write-Warning "  clasp push failed (exit $LASTEXITCODE)"; return "FAILED: push" }
            "unchanged" { return "unchanged (already up to date)" }
            default     { return "pushed" }
        }
    }
    finally { Pop-Location }
}

# ---------------------------------------------------------------------------
# Web apps: push, cut one version, point every registered deployment at it.
# ---------------------------------------------------------------------------
function Invoke-PushAndPromote {
    param(
        [Parameter(Mandatory)] [string]$WorkingDir,
        [Parameter(Mandatory)] [string]$DeploymentsFile,
        [Parameter(Mandatory)] [string]$Marker
    )

    Push-Location $WorkingDir
    try {
        if (-not (Test-Path $DeploymentsFile)) {
            Write-Warning "  no $DeploymentsFile -- skipping. Put the deployment IDs to keep live in it, one per line. Currently live on this project:"
            clasp list-deployments | ForEach-Object { Write-Host "    $_" }
            return "SKIPPED: no deployments.txt"
        }
        $keep = @(Get-Content $DeploymentsFile | ForEach-Object { $_.Trim() } |
            Where-Object { $_ -and -not $_.StartsWith('#') })
        if ($keep.Count -eq 0) {
            Write-Warning "  $DeploymentsFile lists no deployment IDs -- skipping."
            return "SKIPPED: empty deployments.txt"
        }

        switch (Invoke-ClaspPush) {
            "failed" {
                Write-Warning "  clasp push failed (exit $LASTEXITCODE) -- stopping before versioning."
                return "FAILED: push"
            }
            "unchanged" {
                # Apps Script caps versions per project, so don't burn one
                # on identical code. If you expected changes, the checkout
                # is stale -- check the marker above.
                Write-Warning "  nothing new pushed -- no version cut, deployments left where they are."
                return "unchanged (already up to date)"
            }
        }

        $verOut = (clasp version "$Marker $(Get-Date -Format s)") -join "`n"
        $m = [regex]::Match($verOut, 'Created version (\d+)')
        if (-not $m.Success) {
            Write-Warning "  couldn't read a version number from: $verOut -- deployments left where they are."
            return "FAILED: version (code IS pushed to HEAD)"
        }
        $n = $m.Groups[1].Value
        Write-Host "    created version $n"

        $live = @(Get-LiveDeployments)
        $promoted = 0
        $problems = @()
        foreach ($id in $keep) {
            if ($id -notin $live) {
                Write-Warning "  $id is in deployments.txt but not live on this project -- skipped"
                $problems += "not live: $id"
                continue
            }
            clasp update-deployment $id --versionNumber $n --description "$Marker v$n" | ForEach-Object { Write-Host "    $_" }
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "  update-deployment failed for $id"
                $problems += "update failed: $id"
            }
            else { $promoted++ }
        }
        $unlisted = @($live | Where-Object { $_ -notin $keep })
        if ($unlisted.Count -gt 0) {
            Write-Warning "  live but not in deployments.txt, left as-is: $($unlisted -join ', ')"
        }
        clasp list-deployments | ForEach-Object { Write-Host "    $_" }

        $result = "v$n -> $promoted/$($keep.Count) deployment(s)"
        if ($problems.Count -gt 0) { return "FAILED: $result; $($problems -join '; ')" }
        return $result
    }
    finally { Pop-Location }
}

# ---------------------------------------------------------------------------
# Project types. "flat" = one folder, .clasp.json at its root. "cas-ccps" =
# shared-source project that tools/clasp-sync/sync.js builds into
# cas-ccps\.clasp-build\<name>\ (it wipes and rebuilds that folder each run,
# and copies cas-ccps\clasp\local\<name>.clasp.json into it).
# ---------------------------------------------------------------------------
function Invoke-Project {
    param([Parameter(Mandatory)] [hashtable]$P)

    Write-Host ""
    Write-Host "== $($P.Name) ($($P.Type), $($P.Mode)) =="

    if ($P.Type -eq "flat") {
        $regDir     = Join-Path $Registry $P.Name
        $workingDir = Join-Path $RepoRoot $P.Name
        $bound = Get-BoundConfig -RegistryConfigPath (Join-Path $regDir ".clasp.json") `
                                 -TargetConfigPath   (Join-Path $workingDir ".clasp.json")
        if (-not $bound) { return "SKIPPED: not in registry" }
    }
    else {
        $regDir = Join-Path $Registry "cas-ccps\$($P.Name)"
        $bound = Get-BoundConfig -RegistryConfigPath (Join-Path $regDir ".clasp.json") `
                                 -TargetConfigPath   (Join-Path $RepoRoot "cas-ccps\clasp\local\$($P.Name).clasp.json")
        if (-not $bound) { return "SKIPPED: not in registry" }

        Push-Location $RepoRoot
        try {
            node tools\clasp-sync\sync.js $P.Name | ForEach-Object { Write-Host "    $_" }
            if ($LASTEXITCODE -ne 0) {
                Write-Warning "  sync.js failed (exit $LASTEXITCODE)"
                return "FAILED: sync.js"
            }
        }
        finally { Pop-Location }
        $workingDir = Join-Path $RepoRoot "cas-ccps\.clasp-build\$($P.Name)"
    }

    $marker = Get-Marker -Dir $workingDir
    Write-Host "  marker in this build: $marker  (reportDeployVersion should say the same after the push)"
    $script:Markers[$P.Name] = $marker

    if ($P.Mode -eq "push") {
        return Invoke-PushOnly -WorkingDir $workingDir
    }
    return Invoke-PushAndPromote -WorkingDir $workingDir `
        -DeploymentsFile (Join-Path $regDir "deployments.txt") -Marker $marker
}

# ---------------------------------------------------------------------------
# Manifest: structure only. No scriptIds or deployment IDs here -- those live
# only in the registry. Push-only projects run first.
#
#   push     no web app: HEAD is what runs (triggers, bound menus, library
#            HEAD for developmentMode consumers)
#   promote  web app: /exec serves a pinned version, so it must be moved
#
# OnHold projects run only when named in -Only.
# ---------------------------------------------------------------------------
$Manifest = @(
    # central-ledger is also a library: unified-manual pins it at version 3
    # (developmentMode false), so pushing HEAD here does not change what
    # unified-manual runs until a new library version is cut and that pin
    # bumped in cas-ccps\clasp\manifests\unified-manual.appsscript.json.
    @{ Name = "central-ledger";          Type = "cas-ccps"; Mode = "push"; OnHold = $true }
    @{ Name = "unified-manual";          Type = "cas-ccps"; Mode = "push" }
    # makeCopy templates: new copies get this code, existing copies don't.
    @{ Name = "master-student-template"; Type = "cas-ccps"; Mode = "push" }
    @{ Name = "rubric-response-sheet";   Type = "cas-ccps"; Mode = "push" }
    @{ Name = "teacher-matrix-sheet";    Type = "cas-ccps"; Mode = "push" }

    @{ Name = "kos-personal";            Type = "flat";     Mode = "promote" }
    @{ Name = "leader-hub";              Type = "flat";     Mode = "promote" }
    @{ Name = "teacher-dashboard";       Type = "cas-ccps"; Mode = "promote" }
    @{ Name = "student-dashboard";       Type = "cas-ccps"; Mode = "promote" }
)
# kos-personal:studio-steps and cas-ccps:studio-steps are deliberately absent --
# out of scope while the org-wide GCP block on custom Studio steps holds.

# Plain ForEach-Object rather than $Manifest.Name: member enumeration over
# hashtables isn't something to lean on under Windows PowerShell 5.1.
$manifestNames = @($Manifest | ForEach-Object { $_.Name })
$unknown = @($Only | Where-Object { $_ -notin $manifestNames })
if ($unknown.Count -gt 0) { throw "Not in the manifest: $($unknown -join ', ')" }

$targets = if ($Only.Count -gt 0) {
    $Manifest | Where-Object { $_.Name -in $Only }
}
else {
    $held = @($Manifest | Where-Object { $_.OnHold })
    if ($held.Count -gt 0) { Write-Host "On hold, not run (name them in -Only to run): $(($held | ForEach-Object { $_.Name }) -join ', ')" }
    $Manifest | Where-Object { -not $_.OnHold }
}

if ($Zip) { Update-Checkout -ZipPath $Zip }
if (-not (Test-Path (Join-Path $RepoRoot "tools\clasp-sync\sync.js"))) {
    throw "$RepoRoot doesn't look like a KOS checkout. Pass -Zip or -RepoRoot."
}

$script:Markers = @{}
$results = [ordered]@{}
foreach ($p in $targets) {
    # One project failing doesn't stop the rest; the summary says which.
    try { $results[$p.Name] = Invoke-Project -P $p }
    catch {
        Write-Warning "  $($p.Name): $($_.Exception.Message)"
        $results[$p.Name] = "FAILED: $($_.Exception.Message)"
    }
}

Write-Host ""
Write-Host "================ Summary ================"
foreach ($name in $results.Keys) {
    $marker = if ($script:Markers.ContainsKey($name)) { $script:Markers[$name] } else { "-" }
    Write-Host ("  {0,-24} {1,-9} {2}" -f $name, $marker, $results[$name])
}
Write-Host ""
Write-Host "Next, by hand: reload each pushed project's editor tab and run reportDeployVersion."
Write-Host "It should report the marker above. (clasp run can't do this -- it needs a GCP project.)"
Write-Host "Deployment IDs are unchanged, so no URLs need re-pasting anywhere."

if (@($results.Values | Where-Object { $_ -like 'FAILED*' }).Count -gt 0) { exit 1 }
