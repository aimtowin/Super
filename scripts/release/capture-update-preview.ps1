param([string]$Name = 'completed')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class UpdatePreviewWindow {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
[UpdatePreviewWindow]::SetProcessDPIAware() | Out-Null
$preview = Get-Process -Name 'SuperUpdatePreview.tmp' | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
$window = $preview.MainWindowHandle
if ($window -eq [IntPtr]::Zero) { throw 'Open the isolated updater preview first.' }
[UpdatePreviewWindow]::SetForegroundWindow($window) | Out-Null
Start-Sleep -Milliseconds 500
$rect = New-Object UpdatePreviewWindow+RECT
[UpdatePreviewWindow]::GetWindowRect($window, [ref]$rect) | Out-Null
$image = New-Object System.Drawing.Bitmap(($rect.Right - $rect.Left), ($rect.Bottom - $rect.Top))
$graphics = [System.Drawing.Graphics]::FromImage($image)
try {
  $graphics.CopyFromScreen($rect.Left, $rect.Top, 0, 0, $image.Size)
  $output = Join-Path $PSScriptRoot "../../tmp/update-ui-preview/$Name.png"
  $image.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output ([System.IO.Path]::GetFullPath($output))
} finally {
  $graphics.Dispose()
  $image.Dispose()
}
