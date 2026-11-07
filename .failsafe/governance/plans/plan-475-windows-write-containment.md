# Plan: #475 Windows-enforced write containment for authorized Aider and Continue runs

**Issue:** #475 (P0, containment not implemented).

**Source subject:** v6.0.12 candidate `497c0821` (PR #623). Evidence: `qualification/v6.0.12-rc-497c0821-receipts-no-ci`.

**Plan author:** native qualification session, 2026-11-06.

**Status:** **PROPOSED, NOT AUDITED.** No production code may change before a `/qor-audit` PASS. The audit needs explicit owner authorization.

## Reproduction preserved (the defect)

Files: `qualification/v6.0.12-rc-497c0821/agent-475/` (`aider.cs`, `run-475.cjs`, `result-475.json`).

The test drove the real compiled `runAiderGoverned` with production deps (`{ run: defaultAgentRun, classify, issuedAt }`) and a hostile stand-in `aider.exe` (`aider.cs`; **not Aider**) on Windows 11:

- **Unauthorized** (`writesAllowed: false`): `BLOCKED_PRE_EXECUTION`. Nothing ran and nothing was written.
- **Authorized:**
  - The in-worktree change was quarantined, not applied.
  - The agent **wrote `escaped-direct.txt` outside the worktree**.
  - The outcome was `QUARANTINED_PENDING_APPROVAL`, listing only the in-worktree file.
  - The escaped child's later write did not happen; the process tree was ended.
- **Disclosure:** the Apply dialog's `BOUNDARY_NOTE` discloses that outside writes are not detected. **A disposable git worktree is not a containment boundary.**

## Options evaluated

| Option | Verdict | Why |
|---|---|---|
| Disposable git worktree (current) | **Rejected** as containment | It decides where git places files, not what the process may write; the reproduction above |
| Job object (process tree, kill on close) | **Rejected** as containment, **kept** as a complement | It controls lifetime and resources, not the filesystem. Keep it for the escaped-child stop already observed |
| **Low Integrity Level token + Low-labeled run folder** | **Accepted for Windows (Phase 1)** | OS-enforced "no-write-up"; prototype results below |
| AppContainer / LPAC | **Deferred (Phase 2 candidate)** | Stronger: it also limits reads and network by capability. But it needs explicit ACL grants for the Python/Node runtimes, agent installs, certificates and credentials, plus `internetClient`. High compatibility risk, not prototyped here |
| Windows Sandbox (`.wsb`) | **Rejected as default**, optional later | Genuinely isolating (VM), but needs Pro/Enterprise, an admin-enabled feature and a per-run boot, and the agent, Python and keys must be provisioned inside. Impractical as the shipped default |
| **Fail-closed execution gate** | **Accepted (all platforms)** | When the boundary cannot be established and self-verified, an authorized run is refused. Default on Linux and macOS until an equivalent (bubblewrap/Landlock, `sandbox-exec`) is separately qualified |

## Phase 1 prototype results (research code, not product)

Prototype: `lowil-launch.cs` uses `DuplicateTokenEx`, then sets `TokenIntegrityLevel` to `S-1-16-4096` (Low), then `CreateProcessAsUser`. It needs no privilege, because the token is a lowered copy of the caller's. All folders were disposable, and nothing was written in the real profile.

| Attempt at Low IL | Result |
|---|---|
| Write inside the Low-labeled worktree | OK |
| Write to an outside folder and to a "repository" folder (default Medium label) | **DENIED** (`UnauthorizedAccessException`) |
| Hostile stand-in `aider.exe`: direct outside write | **DENIED** (process aborted; nothing outside) |
| Escaped child via `cmd /c start /b` | **DENIED** outside, OK inside (child inherits Low) |
| Python 3.11 at Low: outside write | **DENIED** (`PermissionError`); in-folder OK |
| `git status` / `add` / `commit` in a Low-labeled `git clone --shared` | OK; the source repository's history is unchanged (1 commit) |
| WMI `Win32_Process.Create` (broker escape) | **DENIED** (`Access denied`) |
| `Shell.Application.ShellExecute` (broker escape) | No outside write |
| Junction planted in the worktree to the outside folder | Could not be created; write through it **DENIED** |
| Hard link to an outside file | Could not be created; outside file hash unchanged |

### Residual risk (to disclose, not to claim away)

- **Reads** are not restricted. A Low process can read the user's files and secrets. **This is a write boundary, not a confidentiality boundary.**
- **Network** is not restricted. The agent needs it for its model API.
- **Low-labeled locations stay writable:** `%LOCALAPPDATA%Low`, `HKCU\Software\AppDataLow`, and any object explicitly labeled Low or Untrusted.
- **Broker escapes** (COM/RPC servers that accept Low callers, clipboard, DLL planting into Low-writable folders a Medium process later loads) were sampled, not exhaustively audited.

## Proposed design (Phase 1, Windows)

1. **Run folder:** replace `git worktree add` with `git clone --shared --no-checkout <repo> <run>` and a checkout. All agent-writable git state then lives inside `<run>`, not in the operator's `.git/worktrees/`, which stays Medium. `--shared` alternates are read-only to the agent.
2. **Labels:** run `icacls <run> /setintegritylevel (OI)(CI)low`, plus Low-labeled `home/`, `appdata/`, `localappdata/` and `tmp/` under `<run>`. The child environment's `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `TEMP` and `TMP` point there. Only the operator-approved credential variables are passed through.
3. **Launcher:** a small native helper `failsafe-lowil.exe`, equivalent to the prototype. It is **signed at release** per the MythologIQ Windows code-signing standard (Azure Artifact Signing, profile `mythologiq-labs-public-release`) and verified by hash at runtime before use. No unsigned helper ships.
4. **Self-test before every authorized run (fail closed):**
   - Create a Medium canary file outside `<run>`, and launch the helper with a probe.
   - Require the canary write to be DENIED, an in-run write to be OK, and the canary hash to be unchanged.
   - Any other outcome means **refuse the run** with `BLOCKED_PRE_EXECUTION: write containment unavailable`.
5. **After the run:**
   - Existing quarantine, diff, receipt and Apply flow, unchanged.
   - Re-verify the canary, and record `containment: low-integrity, verified` in the receipt.
   - Job object kill-on-close for every child.
6. **Platforms without a qualified boundary:** authorized runs refuse (`containment unavailable on <platform>`). Unauthorized behavior is unchanged.
7. **UI and docs:** `BOUNDARY_NOTE` becomes "Writes outside the run folder are blocked by Windows integrity levels. Reads and network are not restricted." It is shown only when the receipt says the run was verified.

## Negative controls (automated, Windows; red on `497c0821`)

| # | Attempt by the agent process (hostile stand-in, not Aider) | Required |
|---|---|---|
| N1 | Write a file in the operator's repository | denied; repository hash unchanged |
| N2 | Write a file outside the run folder (temp, profile-like Medium folder) | denied |
| N3 | Escaped child (`start /b`), then a write 3 s after the parent exits | denied (and the child is killed) |
| N4 | Write into the operator's `.git` (`objects/`, `refs/`, `hooks/`) | denied |
| N5 | Plant a junction or hard link to outside, then write through it | not created / denied |
| N6 | WMI `Win32_Process.Create` / `ShellExecute` / `schtasks /create` | denied, or no outside effect |
| N7 | Self-test canary forced to succeed (helper replaced by a Medium launcher) | run **refused** (fail closed) |
| N8 | Helper missing or hash mismatch | run **refused** |
| N9 | Non-Windows host with `writesAllowed: true` | run **refused** |
| P1 | Positive: write and commit inside the run folder; Apply promotes exactly the diff | allowed |

N1–N3 reproduce today's defect (all green-for-the-attacker on `497c0821`).

## Approvals needed

1. **`/qor-audit` PASS** of this plan (owner-authorized audit).
2. **Owner acceptance of the residual-risk statement:** a write boundary only, not read or network.
3. **Owner approval to ship a signed native helper**, and to use the existing signing profile for it.

## Out of scope

AppContainer, Windows Sandbox, and Linux/macOS sandboxes. They are tracked separately; until then those platforms fail closed.
