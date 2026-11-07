# #475 Low Integrity Level write-containment prototype: results

**Recorded:** 2026-11-06, Windows 11 Pro 10.0.26300.

**What this is:**
- Research code compiled with the .NET Framework `csc`, not product code and not shipped.
- Every target is a disposable folder under `%TEMP%\fs475lowil-*`.
- No attempt wrote to the real user profile.
- Paths in the scripts have the username replaced with `<user>`.

**Tools:**
- `lowil-launch.exe`: duplicates the caller's token, sets `TokenIntegrityLevel` to Low (`S-1-16-4096`), then calls `CreateProcessAsUser`. It needs no special privilege.
- `probe-write.exe`: tries each path and prints OK or DENIED.
- `aider.exe`: the hostile stand-in from `../aider.cs`. It is not Aider.

**Folders:**
- `worktree`: labeled `icacls /setintegritylevel (OI)(CI)low`.
- `outside` and `repo`: default Medium label.
- `clone2`: a `git clone --shared` of a one-commit `srcrepo`, labeled Low.

| Attempt (from a Low-IL process) | Result |
|---|---|
| Baseline at Medium: write to `worktree`, `outside`, `repo` | OK, OK, OK |
| Write to `worktree` | OK |
| Write to `outside`, `repo` | **DENIED** (`UnauthorizedAccessException`) |
| Hostile `aider.exe` (cwd `worktree`, `FS475_OUTSIDE=outside`) | outside write **DENIED** (process aborted; exit 127); `outside` stays empty after 6 s |
| `cmd /c spawnchild2.cmd` (child via `start /b`) | child: outside **DENIED**, worktree OK |
| `python -I -c` (3.11.9): write in folder / write outside | OK / **DENIED** (`PermissionError`) |
| `git status` in `clone2` | exit 0 |
| `commit2.cmd`: edit, `git add`, `git commit` in `clone2` | `git-commit-exit=0`; `clone2` has 2 commits, `srcrepo` still has 1 |
| `wmi-escape.ps1`: `Win32_Process.Create` of the writer | **Access denied** |
| `wmi-escape.ps1`: `Shell.Application.ShellExecute` of the writer | returned; no file in `outside` |
| `link-escape.cmd`: write `outside\victim.txt` | **DENIED** |
| `link-escape.cmd`: `mklink /J` to `outside`, then write through it | junction not created; write **DENIED** |
| `link-escape.cmd`: `fsutil hardlink create` to `outside\seed.txt`, then append | link not created. The append wrote a new local `hl.txt`; `outside\seed.txt` sha256 is unchanged (`799c840e…`) |

**Not covered by this boundary:**
- reads;
- network;
- `%LOCALAPPDATA%Low` and `HKCU\Software\AppDataLow`;
- objects explicitly labeled Low;
- broker escapes beyond the two sampled.

See `.failsafe/governance/plans/plan-475-windows-write-containment.md`.
