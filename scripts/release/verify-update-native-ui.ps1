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
function Open-Preview([string]$extra = '') {
  Start-Process -FilePath $executable -ArgumentList "/SP- /SILENT /SUPERLIB-FOREGROUND-UPDATE $extra" -WindowStyle Hidden
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 200
    $previewProcess = Get-Process -Name 'SuperUpdatePreview.tmp' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
    if ($previewProcess) { return $previewProcess }
  }
  throw 'Preview window did not open.'
}
function Assert-Closed($previewProcess) {
  if (-not $previewProcess.WaitForExit(5000)) { throw 'Preview did not close after the requested action.' }
  Start-Sleep -Milliseconds 300
}
Get-Process -Name 'SuperUpdatePreview.tmp' -ErrorAction SilentlyContinue | ForEach-Object { $_.CloseMainWindow() | Out-Null; Assert-Closed $_ }

$previewProcess = Open-Preview
$button = [UpdatePreviewInput]::FindCaption($previewProcess.MainWindowHandle, '启动 Super Lib')
if ($button -eq [IntPtr]::Zero -or -not [UpdatePreviewInput]::IsWindowEnabled($button)) { throw 'Completed state must have an enabled launch button.' }
[UpdatePreviewInput]::SendMessage($button, 0x201, [IntPtr]1, [IntPtr]0x00140014) | Out-Null
[UpdatePreviewInput]::SendMessage($button, 0x202, [IntPtr]0, [IntPtr]0x00140014) | Out-Null
Assert-Closed $previewProcess
Write-Output 'PASS: completed preview launch click closes without starting the installed app.'

$previewProcess = Open-Preview
[UpdatePreviewInput]::PostMessage($previewProcess.MainWindowHandle, 0x100, [IntPtr]13, [IntPtr]0) | Out-Null
Assert-Closed $previewProcess
Write-Output 'PASS: Enter launches from completed preview.'

$previewProcess = Open-Preview '/PREVIEWPROGRESS=1'
$button = [UpdatePreviewInput]::FindCaption($previewProcess.MainWindowHandle, '启动 Super Lib')
if ($button -eq [IntPtr]::Zero -or [UpdatePreviewInput]::IsWindowEnabled($button)) { throw 'Installing state must have a disabled launch button.' }
& (Join-Path $PSScriptRoot 'capture-update-preview.ps1') -Name 'progress'
if ([UpdatePreviewInput]::FindCaption($previewProcess.MainWindowHandle, '56%') -eq [IntPtr]::Zero) { throw 'Progress preview must display 56%.' }
$previewProcess.CloseMainWindow() | Out-Null
Assert-Closed $previewProcess
Write-Output 'PASS: 56% progress preview has a disabled launch button.'

$previewProcess = Open-Preview
[UpdatePreviewInput]::PostMessage($previewProcess.MainWindowHandle, 0x100, [IntPtr]27, [IntPtr]0) | Out-Null
Assert-Closed $previewProcess
Write-Output 'PASS: Escape closes the completed preview without launching.'

# Leave the final, isolated preview open for user review.
$previewProcess = Open-Preview
[UpdatePreviewInput]::PostMessage($previewProcess.MainWindowHandle, 0x100, [IntPtr]9, [IntPtr]0) | Out-Null
Start-Sleep -Milliseconds 200
[UpdatePreviewInput]::PostMessage($previewProcess.MainWindowHandle, 0x100, [IntPtr]9, [IntPtr]0) | Out-Null
Start-Sleep -Milliseconds 200
$button = [UpdatePreviewInput]::FindCaption($previewProcess.MainWindowHandle, '启动 Super Lib')
$focusState = [UpdatePreviewInput]::SendMessage($button, 0x129, [IntPtr]0, [IntPtr]0).ToInt64()
if (($focusState -band 1) -ne 1) { throw 'The launch button must suppress its native dotted focus rectangle after Tab navigation.' }
Write-Output 'PASS: Tab navigation retains the custom button focus appearance without native dotted outlines.'
& (Join-Path $PSScriptRoot 'capture-update-preview.ps1') -Name 'completed'
