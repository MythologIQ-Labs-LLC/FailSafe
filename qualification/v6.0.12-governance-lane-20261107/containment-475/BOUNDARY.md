# #475 Low Integrity boundary: what it protects (research, 2026-11-07)

**Status:**
- Research code only, kept separate from release code.
- **No production change.** The plan (`plan-475-windows-write-containment.md`, evidence branch `d2707332`) has no audit PASS.
- Synthetic data, disposable folders and a synthetic profile only.
- Hostile behaviour comes from `aider.cs` and probes; this is **not** Aider.

**Run:** `gate475.cjs`, result `gate475-result.json`. **20/20 rows behaved as predicted.**
- **Helper:** `lowil-launch.exe` (from `lowil-launch.cs`). It lowers a copy of the caller's token to Low (S-1-16-4096) and needs no privilege.
- **Labels:** the run folder (with a `git clone --shared` of a synthetic source repository) is labeled Low.
- **Medium objects:** an outside folder with a synthetic secret, a synthetic profile with `credentials.json`, and the source repository.

## Gate (fail closed)

| Row | Case | Result |
|---|---|---|
| G1 | Genuine helper: child identity is `Low Mandatory Level`, the Medium canary write is DENIED, the in-run write is OK, and the canary hash is unchanged | verified |
| G2 | Substituted helper (different bytes, pinned sha256 mismatch) | **refused** |
| G3 | Helper missing | **refused** |
| G4 | A launcher that does not lower integrity | **refused**: identity reads Medium **and** the canary write succeeds; either check alone refuses |

## Threat matrix (all through the genuine helper)

| Row | Attempt from the agent side | Result | Meaning |
|---|---|---|---|
| T1 | Write a Medium file outside | DENIED | write-up blocked |
| T2 | Write a **Low-labeled** file outside the run folder | **OK** | **gap:** any Low-labeled object stays writable (also `%LOCALAPPDATA%Low`, `HKCU\Software\AppDataLow`) |
| T3 | Overwrite a synthetic Medium credential file | DENIED | |
| T4 | Read a synthetic Medium secret | **READABLE** | **not a confidentiality boundary** |
| T5 | POST that secret to a controlled local HTTP endpoint | **SENT** | **network is not restricted; exfiltration is possible** |
| T6 | Write into the source repository's object store (the clone's alternate) | DENIED | |
| T7 | Rewrite the clone's own `objects/info/alternates` | allowed, contained | the source repository is unchanged |
| T8 | `git commit` inside the Low clone | OK | the agent's own git work functions |
| T9 | Grandchild (launcher → `cmd` → PowerShell → System32 `whoami`) | `Low Mandatory Level` | descendants inherit Low |
| T10 | Create a scheduled task (broker) | Low **DENIED**; the identical batch at Medium **created** (deleted immediately) | a real denial, not a harness error |
| T11 | WMI `Win32_Process.Create` (broker) | DENIED, no outside write | |
| T12 | Junction from the run folder to outside, then write through it | not created; nothing outside | |
| T13 | Hard link to an outside file | not created | |
| P1–P3 | Source repository, synthetic profile/credentials, secret file | unchanged | |

**Harness notes:**
- T9 and T10 first failed because of command-line quoting (the nested command never ran) and an MSYS `whoami` on `PATH`. They were rerun through batch files with absolute System32 paths, and the gate script was corrected.
- No scheduled task remains (`schtasks /query`: 0 matches).

## Conclusion

The proposed boundary provides **write-up protection only**. A Low-integrity agent cannot write to Medium-labeled files, its descendants inherit that restriction, and two sampled brokers deny it.

It does **not** provide:
- confidentiality (reads succeed);
- network isolation (exfiltration succeeded);
- protection of Low-labeled locations.

It was not exhaustively audited against broker escapes. **It is not complete containment.** A stronger requirement (no secret reads, no network) needs AppContainer/LPAC or a VM boundary; neither is prototyped here. Accepting a write-only boundary is the owner's decision.
