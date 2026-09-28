param(
  [Parameter(Mandatory=$true)][long]$WindowHandle,
  [Parameter(Mandatory=$true)][int]$ClientX,
  [Parameter(Mandatory=$true)][int]$ClientY
)

$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SuperNativeHitTest {
  [StructLayout(LayoutKind.Sequential)]
  public struct POINT { public int X; public int Y; }
  [DllImport("user32.dll")]
  public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr value);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool ClientToScreen(IntPtr hwnd, ref POINT point);
  [DllImport("user32.dll", SetLastError = true)]
  public static extern IntPtr SendMessageTimeout(
    IntPtr hwnd, uint msg, UIntPtr wParam, IntPtr lParam,
    uint flags, uint timeout, out UIntPtr result);
}
'@

# Match Electron's physical client coordinates, including non-100% display DPI.
$previousDpi = [SuperNativeHitTest]::SetThreadDpiAwarenessContext([IntPtr](-4))
try {
  $point = New-Object SuperNativeHitTest+POINT
  $point.X = $ClientX
  $point.Y = $ClientY
  if (-not [SuperNativeHitTest]::ClientToScreen([IntPtr]$WindowHandle, [ref]$point)) {
    throw 'ClientToScreen failed for the test window.'
  }
  $packedPoint = ([long]($point.Y -band 65535) -shl 16) -bor ($point.X -band 65535)
  $result = [UIntPtr]::Zero
  # WM_NCHITTEST: HTCLIENT=1 receives content clicks; HTCAPTION=2 drags the window.
  $sent = [SuperNativeHitTest]::SendMessageTimeout(
    [IntPtr]$WindowHandle, 0x0084, [UIntPtr]::Zero, [IntPtr]$packedPoint,
    2, 2000, [ref]$result)
  if ($sent -eq [IntPtr]::Zero) { throw 'WM_NCHITTEST timed out or failed.' }
  $result.ToUInt64()
} finally {
  [void][SuperNativeHitTest]::SetThreadDpiAwarenessContext($previousDpi)
}
