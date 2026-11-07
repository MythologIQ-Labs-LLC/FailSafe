// RESEARCH PROBE (#475): try to write each path given; print OK or DENIED per path. Not an agent.
using System; using System.IO;
class P { static void Main(string[] a) { foreach (var p in a) { try { File.WriteAllText(p, "probe\n"); Console.WriteLine("OK     " + p); } catch (Exception e) { Console.WriteLine("DENIED " + p + " :: " + e.GetType().Name); } } } }
