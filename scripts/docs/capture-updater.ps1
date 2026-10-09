#requires -Version 7.0
param([string]$Compiler = "$env:LOCALAPPDATA\SuperTools\inno\tools\ISCC.exe")
$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$version = (Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw | ConvertFrom-Json).version
if ($version -ne '2.3.17') { throw 'Capture must match the documentation release.' }
if (@(Get-Process -Name 'SuperUpdatePreview.tmp' -ErrorAction SilentlyContinue).Count) { throw 'Another preview is running; refusing to use or close it.' }
$temporary = Join-Path $repo ('tmp/docs-native-' + [guid]::NewGuid().ToString('N'))
$output = Join-Path $repo 'docs/assets/ui/live-2.3.17'
New-Item -ItemType Directory -Path $temporary -Force | Out-Null
& $Compiler "/O$temporary" "/DAppVersion=$version" (Join-Path $repo 'scripts/release/preview-update-ui.iss') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Updater preview compilation failed.' }
$executable = Join-Path $temporary 'SuperUpdatePreview.exe'
foreach ($state in @('progress', 'completed')) {
  $owned = $null
  $starter = $null
  try {
    $extra = if ($state -eq 'progress') { '/PREVIEWPROGRESS=1' } else { '/PREVIEWCOMPLETIONHOLD=1' }
    $starter = Start-Process -FilePath $executable -ArgumentList "/SP- /SILENT /SUPERLIB-FOREGROUND-UPDATE $extra" -WindowStyle Hidden -PassThru
    for ($attempt = 0; $attempt -lt 80; $attempt++) {
      Start-Sleep -Milliseconds 100
      $ownedChildren = @(Get-CimInstance Win32_Process -Filter "ParentProcessId = $($starter.Id)" | Where-Object { $_.Name -eq 'SuperUpdatePreview.tmp' })
      $candidates = @($ownedChildren | ForEach-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue } | Where-Object { $_.MainWindowTitle -eq 'Super Lib 更新' })
      if ($candidates.Count -gt 1) { throw 'Ambiguous preview ownership.' }
      if ($candidates.Count -eq 1) { $owned = $candidates[0]; break }
    }
    if (-not $owned) { throw 'Preview window did not open.' }
    & (Join-Path $repo 'scripts/release/capture-update-preview.ps1') -Name "updater-$state" -ProcessId $owned.Id -OutputDirectory $output
  } finally {
    if ($owned -and -not $owned.HasExited) { Stop-Process -Id $owned.Id }
    if ($starter) {
      Get-CimInstance Win32_Process -Filter "ParentProcessId = $($starter.Id)" | Where-Object { $_.Name -eq 'SuperUpdatePreview.tmp' } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
      if (-not $starter.HasExited) { Stop-Process -Id $starter.Id -ErrorAction SilentlyContinue }
    }
  }
}
Write-Output 'Captured current Inno preview states; no installation, registry or real application launch occurred.'
