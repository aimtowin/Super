$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class UpdatePreviewInput {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr param);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr hwnd, EnumProc callback, IntPtr param);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hwnd, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  public static IntPtr FindCaption(IntPtr root, string caption) {
    IntPtr result = IntPtr.Zero;
    EnumChildWindows(root, (hwnd, param) => {
      var text = new StringBuilder(512); GetWindowText(hwnd, text, 512);
      if (text.ToString() == caption) result = hwnd;
      return true;
    }, IntPtr.Zero);
    return result;
  }
}
'@
$executable = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../tmp/update-ui-preview/SuperUpdatePreview.exe'))
$script:ownedPreviews = [Collections.Generic.List[System.Diagnostics.Process]]::new()
function Open-Preview([string]$name, [string]$extra = '', [string]$target = $executable) {
  $processName = [IO.Path]::GetFileNameWithoutExtension($target) + '.tmp'
  $existing = @(Get-Process -Name $processName -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
  $script:previewLog = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "../../tmp/update-ui-preview/$name.log"))
  Start-Process -FilePath $target -ArgumentList "/SP- /SILENT /SUPERLIB-FOREGROUND-UPDATE /LOG=`"$script:previewLog`" $extra" -WindowStyle Hidden
  for ($attempt = 0; $attempt -lt 100; $attempt++) {
    Start-Sleep -Milliseconds 50
    $previewProcess = Get-Process -Name $processName -ErrorAction SilentlyContinue | Where-Object { $_.Id -notin $existing -and $_.MainWindowTitle -eq 'Super Lib 更新' } | Select-Object -First 1
    if ($previewProcess) {
      $script:ownedPreviews.Add($previewProcess)
      return $previewProcess
    }
  }
  throw 'Preview window did not open.'
}
function Assert-Closed($previewProcess) {
  if (-not $previewProcess.WaitForExit(5000)) { throw 'Preview did not close automatically or after retry.' }
}
function Assert-LaunchCount([int]$expected) {
  $count = @(Select-String -LiteralPath $script:previewLog -Pattern 'Update window: preview launch attempt').Count
  if ($count -ne $expected) { throw "Expected $expected launch attempts, found $count." }
}
function Wait-ForRetry($previewProcess) {
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    $button = [UpdatePreviewInput]::FindCaption($previewProcess.MainWindowHandle, '重试打开')
    if ($button -ne [IntPtr]::Zero -and [UpdatePreviewInput]::IsWindowVisible($button) -and [UpdatePreviewInput]::IsWindowEnabled($button)) { return $button }
    Start-Sleep -Milliseconds 50
  }
  throw 'Failed launch must retain a visible, enabled retry button.'
}
function Assert-Caption($previewProcess, [string]$caption) {
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    if ([UpdatePreviewInput]::FindCaption($previewProcess.MainWindowHandle, $caption) -ne [IntPtr]::Zero) { return }
    Start-Sleep -Milliseconds 50
  }
  throw "Expected preview caption: $caption"
}
try {
  $previewProcess = Open-Preview 'auto-open'
  Assert-Closed $previewProcess
  Assert-LaunchCount 1
  Write-Output 'PASS: completion automatically launches exactly once and closes without any input.'

  $previewProcess = Open-Preview 'automatic-input'
  [UpdatePreviewInput]::PostMessage($previewProcess.MainWindowHandle, 0x100, [IntPtr]27, [IntPtr]0) | Out-Null
  [UpdatePreviewInput]::PostMessage($previewProcess.MainWindowHandle, 0x100, [IntPtr]13, [IntPtr]0) | Out-Null
  $previewProcess.CloseMainWindow() | Out-Null
  Assert-Closed $previewProcess
  Assert-LaunchCount 1
  Write-Output 'PASS: Escape, Enter and close during automatic opening cannot cancel or duplicate launch.'

  $previewProcess = Open-Preview 'progress' '/PREVIEWPROGRESS=1'
  Assert-Caption $previewProcess '56%'
  $button = [UpdatePreviewInput]::FindCaption($previewProcess.MainWindowHandle, '重试打开')
  if ($button -ne [IntPtr]::Zero -and [UpdatePreviewInput]::IsWindowVisible($button)) { throw 'Installing state must hide the retry button.' }
  [UpdatePreviewInput]::PostMessage($previewProcess.MainWindowHandle, 0x100, [IntPtr]27, [IntPtr]0) | Out-Null
  [UpdatePreviewInput]::PostMessage($previewProcess.MainWindowHandle, 0x100, [IntPtr]13, [IntPtr]0) | Out-Null
  & (Join-Path $PSScriptRoot 'capture-update-preview.ps1') -Name 'progress' -ProcessId $previewProcess.Id
  if ([UpdatePreviewInput]::FindCaption($previewProcess.MainWindowHandle, '56%') -eq [IntPtr]::Zero) { throw 'Progress preview must retain 56% after keyboard input.' }
  $previewProcess.CloseMainWindow() | Out-Null
  Assert-Closed $previewProcess
  Assert-LaunchCount 0
  Write-Output 'PASS: installation keeps progress visible, hides retry and never launches prematurely.'

  $previewProcess = Open-Preview 'completed' '/PREVIEWCOMPLETIONHOLD=1'
  Assert-Caption $previewProcess '100%'
  & (Join-Path $PSScriptRoot 'capture-update-preview.ps1') -Name 'completed' -ProcessId $previewProcess.Id
  $previewProcess.CloseMainWindow() | Out-Null
  Assert-Closed $previewProcess
  Assert-LaunchCount 0
  Write-Output 'PASS: screenshot-only hold cannot start an installed application.'

  $previewProcess = Open-Preview 'retry-click' '/PREVIEWLAUNCHFAIL=1'
  $button = Wait-ForRetry $previewProcess
  & (Join-Path $PSScriptRoot 'capture-update-preview.ps1') -Name 'launch-failed' -ProcessId $previewProcess.Id
  Start-Sleep -Milliseconds 1300
  Assert-LaunchCount 1
  [UpdatePreviewInput]::SendMessage($button, 0x201, [IntPtr]1, [IntPtr]0x00140014) | Out-Null
  [UpdatePreviewInput]::SendMessage($button, 0x202, [IntPtr]0, [IntPtr]0x00140014) | Out-Null
  Assert-Closed $previewProcess
  Assert-LaunchCount 2
  Write-Output 'PASS: failure stays open without an automatic retry loop; clicking retry succeeds and closes.'

  $previewProcess = Open-Preview 'retry-enter' '/PREVIEWLAUNCHFAIL=1'
  $button = Wait-ForRetry $previewProcess
  [UpdatePreviewInput]::PostMessage($previewProcess.MainWindowHandle, 0x100, [IntPtr]9, [IntPtr]0) | Out-Null
  Start-Sleep -Milliseconds 200
  [UpdatePreviewInput]::PostMessage($previewProcess.MainWindowHandle, 0x100, [IntPtr]9, [IntPtr]0) | Out-Null
  Start-Sleep -Milliseconds 200
  $focusState = [UpdatePreviewInput]::SendMessage($button, 0x129, [IntPtr]0, [IntPtr]0).ToInt64()
  if (($focusState -band 1) -ne 1) { throw 'Retry must retain its custom keyboard focus appearance.' }
  [UpdatePreviewInput]::PostMessage($previewProcess.MainWindowHandle, 0x100, [IntPtr]13, [IntPtr]0) | Out-Null
  Assert-Closed $previewProcess
  Assert-LaunchCount 2
  Write-Output 'PASS: keyboard retry opens exactly once and closes.'

  $previewProcess = Open-Preview 'failure-close' '/PREVIEWLAUNCHFAIL=1'
  $null = Wait-ForRetry $previewProcess
  [UpdatePreviewInput]::PostMessage($previewProcess.MainWindowHandle, 0x100, [IntPtr]27, [IntPtr]0) | Out-Null
  Assert-Closed $previewProcess
  Assert-LaunchCount 1
  Write-Output 'PASS: failed launch can be dismissed without retrying.'

  # Compile a small Windows executable only inside this isolated test root.
  # The production Inno branch launches this probe, not the installed Super.
  $compileOnly = Join-Path (Split-Path $executable) 'SuperUpdateCompileOnly.exe'
  $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
  $fixture = Join-Path (Split-Path $executable) ('launch-probe-' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $fixture | Out-Null
  & $compiler /nologo /target:winexe "/out:$fixture/Super.exe" (Join-Path $PSScriptRoot '../../tests/fixtures/native-update/Super.cs')
  if ($LASTEXITCODE -ne 0) { throw 'Failed to compile isolated launch probe.' }
  $previewProcess = Open-Preview 'original-user-launch' "/DIR=`"$fixture`"" $compileOnly
  Assert-Closed $previewProcess
  $marker = Join-Path $fixture 'launch-marker.txt'
  for ($attempt = 0; $attempt -lt 40 -and -not (Test-Path -LiteralPath $marker); $attempt++) { Start-Sleep -Milliseconds 50 }
  $lines = @(Get-Content -LiteralPath $marker)
  if ($lines.Count -ne 2 -or $lines[0] -ne '--updated' -or $lines[1] -ne $fixture) { throw 'Original-user launch must run once with --updated in the selected application directory.' }
  if (-not (Select-String -LiteralPath $script:previewLog -SimpleMatch 'Update window: launch succeeded.')) { throw 'Expected successful production launch.' }
  Write-Output 'PASS: production ExecAsOriginalUser launches the isolated executable once, preserves --updated/working directory and auto-closes.'

  $missingApp = Join-Path $fixture 'missing-app'
  $previewProcess = Open-Preview 'missing-app-launch' "/DIR=`"$missingApp`"" $compileOnly
  $null = Wait-ForRetry $previewProcess
  if (-not (Select-String -LiteralPath $script:previewLog -SimpleMatch 'Update window: launch failed')) { throw 'Missing executable must produce real launch-failure feedback.' }
  $previewProcess.CloseMainWindow() | Out-Null
  Assert-Closed $previewProcess
  Write-Output 'PASS: real missing executable leaves retry/close available instead of reporting a successful launch.'
} finally {
  # Cleanup only processes created by this harness; never close the user's app.
  foreach ($owned in $script:ownedPreviews) {
    if (-not $owned.HasExited) {
      $owned.CloseMainWindow() | Out-Null
      if (-not $owned.WaitForExit(2000)) { $owned.Kill(); $owned.WaitForExit() }
    }
  }
}
