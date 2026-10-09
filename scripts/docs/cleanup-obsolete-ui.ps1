#requires -Version 7.0
param([string]$CandidatesFile = 'tmp/docs-audit/cleanup-candidates.json')
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$allowedSource = [IO.Path]::GetFullPath((Join-Path $repo 'docs/assets/ui')) + [IO.Path]::DirectorySeparatorChar
$candidatePath = [IO.Path]::GetFullPath((Join-Path $repo $CandidatesFile))
if (-not $candidatePath.StartsWith($repo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Candidate list must be inside this repository.' }
$candidates = @(Get-Content -LiteralPath $candidatePath -Raw | ConvertFrom-Json)
if ($candidates.Count -eq 0) { throw 'No candidates; nothing to move.' }
if (@($candidates | Select-Object -Unique).Count -ne $candidates.Count) { throw 'Duplicate candidates are not allowed.' }
& node (Join-Path $repo 'scripts/docs/audit-docs.mjs') --json | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Fresh documentation audit failed; nothing moved.' }
$audit = Get-Content -LiteralPath (Join-Path $repo 'tmp/docs-audit/result.json') -Raw | ConvertFrom-Json
if ($audit.broken.Count -or $audit.coverage.integrity.Count -or $audit.coverage.captureFailures -or $audit.coverage.unreferenced.Count) { throw 'Documentation audit must pass before cleanup.' }
$desktop = [Environment]::GetFolderPath('Desktop')
$backup = [IO.Path]::GetFullPath((Join-Path $desktop ('Super-repository-cleanup-backup-20261009-' + [guid]::NewGuid().ToString('N').Substring(0, 8))))
if (-not $backup.StartsWith([IO.Path]::GetFullPath($desktop) + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) -or (Test-Path -LiteralPath $backup)) { throw 'Invalid or existing backup target.' }
$resolved = foreach ($relative in $candidates) {
  $source = [IO.Path]::GetFullPath((Join-Path $repo $relative))
  if (-not $source.StartsWith($allowedSource, [StringComparison]::OrdinalIgnoreCase) -or $relative -like '*/live-2.3.17/*' -or $relative -like '*/super-Logo.png' -or [IO.Path]::GetExtension($source) -notin @('.png', '.jpg', '.jpeg', '.webp')) { throw "Out-of-scope candidate: $relative" }
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing candidate: $relative" }
  if (@($audit.refs | Where-Object { $_.resolved -eq $relative }).Count) { throw "Document still references: $relative" }
  & git -C $repo ls-files --error-unmatch -- $relative *> $null
  if ($LASTEXITCODE -ne 0) { throw "Not a tracked repository asset: $relative" }
  $dirty = & git -C $repo diff --name-only -- $relative
  $staged = & git -C $repo diff --cached --name-only -- $relative
  if ($dirty -or $staged) { throw "Candidate has user changes: $relative" }
  $codeRefs = & git -C $repo grep -l -F -e $relative -- src scripts assets resources tests package.json
  if ($LASTEXITCODE -eq 0 -or $codeRefs) { throw "Runtime or test still references: $relative" }
  if ($LASTEXITCODE -gt 1) { throw "Cannot inspect code references: $relative" }
  $destination = [IO.Path]::GetFullPath((Join-Path $backup $relative))
  if (-not $destination.StartsWith($backup + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Backup traversal rejected.' }
  [pscustomobject]@{ relative = $relative; source = $source; destination = $destination; bytes = (Get-Item -LiteralPath $source).Length; sha256 = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash }
}
# Validate the complete list before moving a single file. Never recursively delete.
New-Item -ItemType Directory -Path $backup | Out-Null
foreach ($item in $resolved) {
  New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($item.destination)) -Force | Out-Null
  Move-Item -LiteralPath $item.source -Destination $item.destination
  if ((Get-FileHash -LiteralPath $item.destination -Algorithm SHA256).Hash -ne $item.sha256) { throw 'Moved asset hash mismatch; retain backup and stop.' }
}
[pscustomobject]@{ backup = $backup; count = $resolved.Count; bytes = ($resolved | Measure-Object -Property bytes -Sum).Sum; files = $resolved } | ConvertTo-Json -Depth 5
