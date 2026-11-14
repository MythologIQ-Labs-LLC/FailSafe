# Finds the largest visible titled top-level window whose title matches, optionally moves/sizes it, prints its HWND.
param([string]$TitleLike = '*', [int]$X = -1, [int]$Y = 0, [int]$Width = 1920, [int]$Height = 1080, [string]$ExeLike = '*')
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class WinPos {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr l);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
}
"@
$rows = New-Object System.Collections.ArrayList
$cb = [WinPos+EnumProc]{ param($h, $l)
  if ([WinPos]::IsWindowVisible($h)) {
    $sb = New-Object System.Text.StringBuilder 512; [void][WinPos]::GetWindowText($h, $sb, 512); $t = $sb.ToString()
    $p = 0; [void][WinPos]::GetWindowThreadProcessId($h, [ref]$p)
    if ($t -and $t -like $TitleLike) {
      $exe = (Get-Process -Id $p -ErrorAction SilentlyContinue).ProcessName
      if ($exe -like $ExeLike) {
        $rc = New-Object WinPos+RECT; [void][WinPos]::GetWindowRect($h, [ref]$rc)
        [void]$rows.Add([pscustomobject]@{ Hwnd = [int64]$h; Pid = $p; Exe = $exe; Title = $t; Area = ($rc.R - $rc.L) * ($rc.B - $rc.T); Rect = "$($rc.L),$($rc.T),$($rc.R),$($rc.B)" })
      }
    }
  }
  return $true }
[void][WinPos]::EnumWindows($cb, [IntPtr]::Zero)
$best = $rows | Sort-Object Area -Descending | Select-Object -First 1
if (-not $best) { throw "no window like $TitleLike" }
if ($X -ge 0) { [void][WinPos]::ShowWindow([IntPtr]$best.Hwnd, 9); [void][WinPos]::SetWindowPos([IntPtr]$best.Hwnd, [IntPtr]::Zero, $X, $Y, $Width, $Height, 0x0040)
  $rc = New-Object WinPos+RECT; [void][WinPos]::GetWindowRect([IntPtr]$best.Hwnd, [ref]$rc); $best.Rect = "$($rc.L),$($rc.T),$($rc.R),$($rc.B)" }
"hwnd=$($best.Hwnd) pid=$($best.Pid) exe=$($best.Exe) rect=$($best.Rect) title=$($best.Title)"
