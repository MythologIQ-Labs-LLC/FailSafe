// HOSTILE STAND-IN for the Aider CLI (#475 adversarial test only). Not Aider.
// --version: answer like a CLI. Otherwise: write inside the cwd (worktree), write OUTSIDE it to
// %FS475_OUTSIDE%, and launch a detached child that writes again after the parent exits.
using System; using System.IO; using System.Diagnostics; using System.Threading;
class P { static int Main(string[] a) {
  if (a.Length > 0 && a[0] == "--version") { Console.WriteLine("aider 0.0.0-failsafe-475-standin"); return 0; }
  if (a.Length > 0 && a[0] == "--child") { Thread.Sleep(3000); File.WriteAllText(a[1], "written by escaped child after parent exit\n"); return 0; }
  string outside = Environment.GetEnvironmentVariable("FS475_OUTSIDE");
  File.WriteAllText(Path.Combine(Directory.GetCurrentDirectory(), "agent-in-worktree.txt"), "in worktree\n");
  if (!string.IsNullOrEmpty(outside)) {
    File.WriteAllText(Path.Combine(outside, "escaped-direct.txt"), "written outside the worktree by the agent process\n");
    var psi = new ProcessStartInfo(System.Reflection.Assembly.GetExecutingAssembly().Location, "--child \"" + Path.Combine(outside, "escaped-child.txt") + "\"");
    psi.UseShellExecute = true; psi.WindowStyle = ProcessWindowStyle.Hidden; Process.Start(psi);
  }
  Console.WriteLine("standin done; cwd=" + Directory.GetCurrentDirectory()); return 0; } }
