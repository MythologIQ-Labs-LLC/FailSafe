// RESEARCH PROTOTYPE (#475): run a command under a Low Integrity Level copy of the caller's token.
// Windows mandatory integrity control then denies writes ("no-write-up") to every Medium-labeled object:
// the user profile, the repository and any folder not explicitly labeled Low. Usage:
//   lowil-launch.exe <workdir> <exe> [args...]      (exit code = child's exit code)
using System; using System.ComponentModel; using System.Runtime.InteropServices; using System.Text;
static class L {
  const uint TOKEN_ALL = 0xF01FF; const int SecurityImpersonation = 2, TokenPrimary = 1, TokenIntegrityLevel = 25;
  const uint SE_GROUP_INTEGRITY = 0x20; const uint INFINITE = 0xFFFFFFFF;
  [StructLayout(LayoutKind.Sequential)] struct SID_AND_ATTRIBUTES { public IntPtr Sid; public uint Attributes; }
  [StructLayout(LayoutKind.Sequential)] struct TOKEN_MANDATORY_LABEL { public SID_AND_ATTRIBUTES Label; }
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)] struct STARTUPINFO { public int cb; public string r, d, t; public int x, y, xs, ys, xc, yc, fa, fl; public short sw, cr; public IntPtr r2, i, o, e; }
  [StructLayout(LayoutKind.Sequential)] struct PROCESS_INFORMATION { public IntPtr hProcess, hThread; public int pid, tid; }
  [DllImport("advapi32", SetLastError = true)] static extern bool OpenProcessToken(IntPtr p, uint a, out IntPtr t);
  [DllImport("advapi32", SetLastError = true)] static extern bool DuplicateTokenEx(IntPtr t, uint a, IntPtr s, int l, int ty, out IntPtr n);
  [DllImport("advapi32", SetLastError = true)] static extern bool ConvertStringSidToSid(string s, out IntPtr sid);
  [DllImport("advapi32", SetLastError = true)] static extern bool SetTokenInformation(IntPtr t, int c, ref TOKEN_MANDATORY_LABEL i, int l);
  [DllImport("advapi32", SetLastError = true)] static extern int GetLengthSid(IntPtr sid);
  [DllImport("advapi32", SetLastError = true, CharSet = CharSet.Unicode)] static extern bool CreateProcessAsUser(IntPtr t, string app, StringBuilder cmd, IntPtr pa, IntPtr ta, bool inh, uint f, IntPtr env, string dir, ref STARTUPINFO si, out PROCESS_INFORMATION pi);
  [DllImport("kernel32")] static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32")] static extern uint WaitForSingleObject(IntPtr h, uint ms);
  [DllImport("kernel32")] static extern bool GetExitCodeProcess(IntPtr h, out uint c);
  static string Q(string a) { return a.IndexOfAny(new[] { ' ', '"' }) < 0 ? a : "\"" + a.Replace("\"", "\\\"") + "\""; }
  static int Main(string[] a) {
    if (a.Length < 2) { Console.Error.WriteLine("usage: lowil-launch <workdir> <exe> [args]"); return 64; }
    IntPtr tok, low, sid;
    if (!OpenProcessToken(GetCurrentProcess(), TOKEN_ALL, out tok)) throw new Win32Exception();
    if (!DuplicateTokenEx(tok, TOKEN_ALL, IntPtr.Zero, SecurityImpersonation, TokenPrimary, out low)) throw new Win32Exception();
    if (!ConvertStringSidToSid("S-1-16-4096", out sid)) throw new Win32Exception(); // Low Mandatory Level
    var tml = new TOKEN_MANDATORY_LABEL { Label = new SID_AND_ATTRIBUTES { Sid = sid, Attributes = SE_GROUP_INTEGRITY } };
    if (!SetTokenInformation(low, TokenIntegrityLevel, ref tml, Marshal.SizeOf(tml) + GetLengthSid(sid))) throw new Win32Exception();
    var cmd = new StringBuilder(); for (int i = 1; i < a.Length; i++) { if (i > 1) cmd.Append(' '); cmd.Append(Q(a[i])); }
    var si = new STARTUPINFO(); si.cb = Marshal.SizeOf(si); PROCESS_INFORMATION pi;
    if (!CreateProcessAsUser(low, null, cmd, IntPtr.Zero, IntPtr.Zero, false, 0, IntPtr.Zero, a[0], ref si, out pi)) throw new Win32Exception();
    WaitForSingleObject(pi.hProcess, INFINITE); uint code; GetExitCodeProcess(pi.hProcess, out code); return (int)code;
  }
}
