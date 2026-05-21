# Plan — QoR Batch 2: Bicameral install-detector validator hardening (B-BIC-6 / B-BIC-7)

## Metadata
- **Plan slug**: plan-qor-batch2-bbic-validator-hardening
- **Backlog items**: B-BIC-6 (MEDIUM), B-BIC-7 (MEDIUM)
- **change_class**: security-hardening (tightens accept-set via realpath; widens accept-set only for default Windows package-manager roots + explicit config)
- **doc_tier**: Tier 2 (security-adjacent code change, single module + 2 spawn-site call updates, no public API break)
- **Risk Grade**: L2 — security-adjacent. The module is the spawn-boundary input validator that closes OWASP A03 for `bicameral-mcp`. A regression here is a command-injection / path-escape vector.
- **Worktree**: isolated, branched from `14e30e5`. One impl commit, no push, no merge.
- **FX block**: FX565–FX569 (reserved).
- **Audit history**: Plan v1 VETOed (architect-reviewer audit #1) — 2 blocking findings. This is plan v2 with both cleared.

## Problem statement

`FailSafe/extension/src/integrations/bicameral/install-detector.ts` exposes `isSafeBicameralCommand(value)`, the validator used at every `spawn()` boundary for the Bicameral MCP integration.

### B-BIC-6 — Symlink bypass (MEDIUM)
`install-detector.ts:30-37` validates the **lexical** string path: `path.normalize` + `..`-segment check + `path.relative(home, …)` containment. It never resolves symlinks. An attacker (or a careless setup) can place a symlink **inside** the home tree that points **outside** it (e.g. `~/.local/bin/bicameral-mcp -> /tmp/evil`). The lexical check passes; the spawned binary is attacker-controlled.

There are **three genuine spawn boundaries**, all currently gated only by the lexical validator:
1. `probeInstallState` → `runVersionProbe` → `spawn(command, ...)` — `install-detector.ts:85`.
2. `bootstrapBicameral.ts:71-78` — after `isSafeBicameralCommand(command)` passes, constructs `new BicameralMcpClient({ command, ... })`, which spawns the stdio subprocess. Also reached by `maybeAutoConnectBicameral`.
3. `install-handler.ts:65` → `runStep` → `spawn(req.bin, ...)` — installs/runs `bicameral-mcp` directly.

The fix must re-check containment against the **resolved real path at every one of these three boundaries**, not just the probe.

### B-BIC-7 — Windows path-allowlist gap (MEDIUM)
`install-detector.ts:11,20-38`: the only anchored-absolute-path root accepted is `os.homedir()`. On Windows, legitimate package managers install CLI shims **outside** the user profile:
- Chocolatey: `C:\ProgramData\chocolatey\bin\…`
- Scoop (global): `C:\ProgramData\scoop\shims\…`
A user who installed `bicameral-mcp` via these tools and set an absolute path in `failsafe.integrations.bicameral.command` is wrongly rejected and silently downgraded to `not-installed`. The fix must accept these roots **out-of-the-box** (no caller change) AND expose a configurable seam.

## Design

### B-BIC-6 fix — realpath re-check at EVERY spawn boundary
1. Keep the existing **lexical** checks (cheap, synchronous, reject obvious traversal before any fs touch — defense in depth).
2. Add an exported **async** `isSafeBicameralCommandResolved(value, options?)` that:
   - Runs the synchronous `isSafeBicameralCommand(value, options)` first; returns `false` immediately if it fails.
   - If the value is a bare name (`SAFE_NAME_RE`, not absolute), there is no filesystem path to resolve — return `true`. (A bare name is PATH-resolved by the OS; resolving it as a filesystem path would be wrong. Verified-correct per audit Finding 4.)
   - For absolute paths: call `fs.promises.realpath(value)`. On `ENOENT` / any error → return `false` (fail-closed — a path that does not resolve is not a safe spawn target).
   - Re-run the **containment check** (`isUnderAnyRoot`) against the **resolved real path**, using the same root set (home + default extra roots + caller `extraRoots`).
3. **Apply the resolved validator at all three spawn boundaries:**
   - `probeInstallState` switches from the sync validator to `isSafeBicameralCommandResolved`.
   - `bootstrapBicameral.ts` `wireFromConfig`: before constructing `BicameralMcpClient`, gate with `await isSafeBicameralCommandResolved(command)`. `wireFromConfig` becomes async; its config-change listener + initial call use `void wireFromConfig()` (fire-and-forget is already the established pattern there for `prior?.disconnect()`). On rejection, the existing fallback (`setBicameralCommand("bicameral-mcp")`, `setBicameralClient(null)`) runs. `maybeAutoConnectBicameral` already routes through `probeInstallState` before constructing the client, so it inherits the resolved check; the direct `BicameralMcpClient` construction there is downstream of a `configured-not-running` probe result and therefore already gated.
   - `install-handler.ts` `runBicameralInstall`: replace the sync `isSafeBicameralCommand(pip) || isSafeBicameralCommand(bicameral)` guard with `await isSafeBicameralCommandResolved(...)` for both. The function is already `async`.
4. Symlink resolution can only ever **reject** a path the lexical check accepted (never widen the accept-set) — safe under fail-closed posture.
5. **Residual TOCTOU risk (explicit):** `realpath` resolves at validation time; `spawn` happens later. A symlink validated as benign could be repointed before spawn. This is an inherent TOCTOU window that realpath cannot close. It is accepted as residual risk under the local-operator threat model (the operator who can repoint a symlink in their own home tree can already run arbitrary code). The realpath check closes the *static misconfiguration / committed-symlink* vector, which is the B-BIC-6 scope. Documented here and in a code comment so reviewers do not mistake realpath for a full fix.

### B-BIC-7 fix — default + configurable extra anchored roots
1. Introduce an `options` parameter (optional, back-compatible) on both validators: `{ extraRoots?: string[] }`.
2. Export `defaultExtraRoots()`: returns `[]` on non-Windows; on `win32` returns `%ProgramData%`-anchored chocolatey + scoop shim roots (`process.env.ProgramData` || `C:\\ProgramData`, joined with `chocolatey\\bin` and `scoop\\shims`). Exported constant `DEFAULT_WINDOWS_EXTRA_ROOTS` holds the relative sub-paths for testability.
3. **Apply-by-default (audit Finding 2 fix):** the validators compute their effective root set as `[home, ...defaultExtraRoots(), ...(options?.extraRoots ?? [])]`. So a Windows chocolatey/scoop shim path is accepted **with zero caller changes** — the user-visible B-BIC-7 symptom is fixed out-of-the-box. `extraRoots` is additive on top.
4. `extraRoots` (and `defaultExtraRoots()` entries) must be **absolute**; non-absolute entries are filtered out (a relative "root" cannot anchor containment).
5. Containment helper `isUnderAnyRoot(candidate, roots)` checks, for each root, that `path.relative(root, candidate)` is non-`..` and non-absolute.
   **Windows path-casing note (audit Finding 5):** `fs.realpath` on Windows may return drive-letter / segment casing that differs from a computed root (e.g. `C:\Users` vs `c:\users`). `path.relative` is case-sensitive. To prevent a *false rejection* of a legitimately-contained path on Windows, `isUnderAnyRoot` lower-cases both `candidate` and each `root` before the `path.relative` comparison **only when `process.platform === 'win32'`** (Windows filesystems are case-insensitive). On POSIX the comparison stays case-sensitive. This is a correctness fix, not an accept-set widening — it only avoids rejecting paths that *are* contained.
6. The validator does **not** read VS Code config directly (keeps the module pure / `vscode`-free / testable). A `failsafe.integrations.bicameral.extraCommandRoots` setting is added to `package.json` (array of strings) and `bootstrapBicameral.ts` reads it and passes it as `extraRoots` — so the "configurable" requirement is genuinely delivered, while default Windows roots already work without it.

### Section 4 Razor compliance
- `install-detector.ts` currently 104 lines; estimated +75–85 lines → ~190, under 250.
- New functions each < 40 lines; nesting ≤ 3; no nested ternaries; no `console.log`.
- `realpath` resolution + containment isolated in small helpers.
- `bootstrapBicameral.ts` change: `wireFromConfig` made async — small, no line-budget concern.

## Affected files
- `FailSafe/extension/src/integrations/bicameral/install-detector.ts` — MODIFY (add `options` param, `isUnderAnyRoot`, `defaultExtraRoots`, `DEFAULT_WINDOWS_EXTRA_ROOTS`, `isSafeBicameralCommandResolved`; `probeInstallState` uses resolved check).
- `FailSafe/extension/src/integrations/bicameral/index.ts` — MODIFY (export new symbols).
- `FailSafe/extension/src/integrations/bicameral/install-handler.ts` — MODIFY (`runBicameralInstall` gates pip + bicameral through `isSafeBicameralCommandResolved`).
- `FailSafe/extension/src/extension/bootstrapBicameral.ts` — MODIFY (`wireFromConfig` async, gates `BicameralMcpClient` construction through `isSafeBicameralCommandResolved`; reads `extraCommandRoots` setting).
- `FailSafe/extension/package.json` — MODIFY (add `failsafe.integrations.bicameral.extraCommandRoots` setting).
- `FailSafe/extension/src/test/integrations/bicameral/install-detector.test.ts` — MODIFY (add FX565–FX569 suites; tests written red-first).
- `docs/BACKLOG.md` — MODIFY (mark B-BIC-6 / B-BIC-7 `[x]`).
- `docs/FEATURE_INDEX.md` — MODIFY (add FX565–FX569 rows).
- `.failsafe/governance/plans/plan-qor-batch2-bbic-validator-hardening.md` — mirror of this plan.

## Phases
1. **P1 — Tests (red)**: add FX565–FX569 suites to `install-detector.test.ts`. Tests fail / compile fails (new symbols absent).
2. **P2 — Implement (green)**: add `isUnderAnyRoot`, `defaultExtraRoots`, `DEFAULT_WINDOWS_EXTRA_ROOTS`, `options.extraRoots` (apply-by-default) on `isSafeBicameralCommand`; async `isSafeBicameralCommandResolved`; switch `probeInstallState` to resolved validator; gate `bootstrapBicameral.ts` + `install-handler.ts` spawn sites; add `extraCommandRoots` setting; export from `index.ts`.
3. **P3 — Verify**: `compile` clean, mocha FX565–569 + existing install-detector suites green, `lint` clean.
4. **P4 — Governance docs**: BACKLOG `[x]`, FEATURE_INDEX rows.
5. **P5 — Commit**: one impl commit in worktree.

## Feature-level test descriptors (FX565–FX569)

- **FX565** — `isSafeBicameralCommand` with `extraRoots`: an absolute path under a supplied extra root is accepted; the same path with no `extraRoots` (and not under a default root) is rejected; a path under neither home nor any extra/default root is rejected. Non-absolute `extraRoots` entries are ignored (do not widen accept-set).
- **FX566** — `defaultExtraRoots()` returns `[]` on non-Windows; `DEFAULT_WINDOWS_EXTRA_ROOTS` contains the chocolatey `bin` + scoop `shims` sub-paths. The validator applies default roots **by default**: a path under a default root is accepted on `win32` with no `extraRoots` passed (platform-gated assertion — exercised structurally off-Windows via an injected root proving the apply-by-default merge).
- **FX567** — `isSafeBicameralCommandResolved` accepts a bare name (no realpath needed) and a real (non-symlink) absolute path under home; rejects shell metacharacters and traversal exactly as the sync validator does.
- **FX568** — `isSafeBicameralCommandResolved` rejects a symlink that lives **inside** the home tree but resolves to a target **outside** it (the B-BIC-6 bypass); accepts a symlink inside home that resolves to another location inside home. Uses a real temp symlink; skips gracefully if the OS denies symlink creation.
- **FX569** — `isSafeBicameralCommandResolved` is fail-closed: a non-existent absolute path under home returns `false` (realpath `ENOENT`); a symlink resolving into a supplied `extraRoot` is accepted.

## Acceptance criteria
- `npm --prefix FailSafe/extension run compile` clean.
- All FX565–FX569 cases pass under plain mocha; all pre-existing install-detector cases still pass.
- `npm --prefix FailSafe/extension run lint` clean on new/modified `.ts`.
- No widening of the accept-set on macOS/Linux for callers that pass no `options` (default extra roots are empty off-Windows).
- All three spawn boundaries (`probeInstallState`, `bootstrapBicameral.ts` client construction, `install-handler.ts` install) gate through `isSafeBicameralCommandResolved`.
- BACKLOG B-BIC-6 / B-BIC-7 marked complete; FEATURE_INDEX has FX565–FX569 verified rows.

## Residual risk register
- **TOCTOU**: realpath validated at check time; spawn occurs later. A symlink swapped in the interval is not caught. Accepted under local-operator threat model; documented in code.
- **Windows casing**: `isUnderAnyRoot` lower-cases on `win32` to avoid false rejection; this is correct for case-insensitive NTFS and does not affect POSIX.
