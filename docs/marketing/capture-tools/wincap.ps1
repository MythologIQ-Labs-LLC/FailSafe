# Real-window capture for the FailSafe demo. Uses PrintWindow(PW_RENDERFULLCONTENT), so the
# pixels come from the target window itself even when other windows overlap it.
#   wincap.ps1 -Pid N -Size                       # resize/position the window to 1920x1080 client-ish
#   wincap.ps1 -Pid N -Out file.png               # one screenshot
#   wincap.ps1 -Pid N -FramesDir DIR -Fps 10 -StopFile F   # frame sequence until StopFile exists
param([int]$TargetPid, [string]$Out, [string]$FramesDir, [int]$Fps = 10, [string]$StopFile, [switch]$Size, [int]$Width = 1920, [int]$Height = 1080, [string]$TitleLike)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class WinCap {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@
function Find-Window {
  $found = $null
  $cb = [WinCap+EnumProc]{ param($h, $l)
    $p = 0; [void][WinCap]::GetWindowThreadProcessId($h, [ref]$p)
    if ($p -eq $TargetPid -and [WinCap]::IsWindowVisible($h)) {
      $sb = New-Object System.Text.StringBuilder 512; [void][WinCap]::GetWindowText($h, $sb, 512)
      $t = $sb.ToString()
      if ($t -and (-not $TitleLike -or $t -like $TitleLike)) {
        $rc = New-Object WinCap+RECT; [void][WinCap]::GetWindowRect($h, [ref]$rc)
        $area = ($rc.R - $rc.L) * ($rc.B - $rc.T)
        if ($area -gt $script:bestArea) { $script:bestArea = $area; $script:found = $h }
      }
    }
    return $true }
  [void][WinCap]::EnumWindows($cb, [IntPtr]::Zero)
  if (-not $script:found) { throw "no visible titled window for pid $TargetPid" }
  return $script:found
}
function Grab([IntPtr]$h, [string]$path) {
  $r = New-Object WinCap+RECT; [void][WinCap]::GetWindowRect($h, [ref]$r)
  $w = $r.R - $r.L; $hh = $r.B - $r.T
  $bmp = New-Object System.Drawing.Bitmap $w, $hh
  $g = [System.Drawing.Graphics]::FromImage($bmp); $hdc = $g.GetHdc()
  [void][WinCap]::PrintWindow($h, $hdc, 2); $g.ReleaseHdc($hdc); $g.Dispose()
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
  return "$w x $hh"
}
$script:found = $null; $script:bestArea = 0
$hwnd = Find-Window
if ($Size) { [void][WinCap]::ShowWindow($hwnd, 9); [void][WinCap]::SetWindowPos($hwnd, [IntPtr]::Zero, 40, 40, $Width, $Height, 0x0040); "sized $Width x $Height"; }
if ($Out) { "captured " + (Grab $hwnd $Out) + " -> $Out" }
if ($FramesDir) {
  New-Item -ItemType Directory -Force $FramesDir | Out-Null
  $i = 0; $sw = [Diagnostics.Stopwatch]::StartNew(); $interval = 1000 / $Fps
  while (-not (Test-Path $StopFile)) {
    $target = $i * $interval
    $wait = $target - $sw.ElapsedMilliseconds
    if ($wait -gt 0) { Start-Sleep -Milliseconds $wait }
    [void](Grab $hwnd (Join-Path $FramesDir ("f{0:D6}.png" -f $i))); $i++
  }
  "frames=$i seconds=" + [math]::Round($sw.Elapsed.TotalSeconds, 2)
}
