# #475 falsifier: from a Low-IL process, ask WMI (a Medium/System broker) to start the writer.
$cmd = '"C:\dev\mythologiq\FailSafe-6012-qual\agent-standin\bin\probe-write.exe" "C:\Users\<user>\AppData\Local\Temp\fs475lowil-XBEL\outside\wmi.txt"'
try {
  $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd } -ErrorAction Stop
  "wmi-create ReturnValue=$($r.ReturnValue) pid=$($r.ProcessId)"
} catch { "wmi-create DENIED: $($_.Exception.GetType().Name) $($_.Exception.Message)" }
try {
  $s = New-Object -ComObject Shell.Application
  $s.ShellExecute('C:\dev\mythologiq\FailSafe-6012-qual\agent-standin\bin\probe-write.exe', 'C:\Users\<user>\AppData\Local\Temp\fs475lowil-XBEL\outside\shell.txt', '', 'open', 0)
  'shell-execute returned'
} catch { "shell-execute DENIED: $($_.Exception.Message)" }
