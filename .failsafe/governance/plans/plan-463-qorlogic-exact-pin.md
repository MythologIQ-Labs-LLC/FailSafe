# Plan: #463 exact qor-logic 0.176.1 installation, divergent-version handling, supported CLI preview

**Issue:** #463 (P0). Supersedes the planning intent of closed PR #466 (`plan/463-qorlogic-frozen-v01761`, `9caf0dbf`).

**Source subject:** v6.0.12 combined candidate `497c0821` (PR #623). Native evidence: `qualification/v6.0.12-rc-497c0821-receipts-no-ci` @ `976848ca`.

**Plan author:** native qualification session, 2026-11-06.

**Status:** **PROPOSED, NOT AUDITED.** Implementation is forbidden until a `/qor-audit` PASS on this plan exists. That audit needs explicit owner authorization; see `plan-v6012-governance-continuation.md`.

## Evidence the plan rests on (all reproduced 2026-11-06)

- **Wheel:** the frozen 0.176.1 wheel sha256 `dd6eec66ce54b3f13f19b6af2cd802b02dde1787142b2f81a27a7ba8ee5c0e31` equals PyPI's. An installed copy matches the wheel `RECORD` (813/813 entries).
- **Unbounded install:** `QorLogicPackageInstaller.install()` runs `pip install --upgrade "qor-logic>=0.31.1"`. That resolves to whatever is newest on the index, and `--upgrade` changes an operator's existing install without asking.
- **Unknown treated as absent:** `bootstrapWorkspace.stepQorLogicPackage` calls `isInstalled().catch(() => false)`, so a failed probe looks like "not installed" and reaches the install above.
- **Below-floor upgrade:** `QorLogicSkillIngestor.ensurePackageInstalled` calls `install()` (the same upgrade) when the installed version is below the 0.31.1 floor.
- **Preview flags:** `installDryRun.previewInstall` runs `install --host H --scope S --dry-run --json [--include NAME]...`.
  - **Neither 0.169.0 nor 0.176.1 accepts `--json` or `--include`.** The whole-package search over both wheels found neither flag on `install`. 0.176.1 exits 2: "unrecognized arguments: --json".
  - 0.176.1's real output is text: `  [dry-run] <source> -> <destination>` per file, then `[dry-run] Would install N files to <host>` (78 files for claude). Captured in `qor-0.176.1-install-dry-run-claude.txt`.
- **Preview never wired:** `bootstrapServers` calls `previewInstall(skillIngestor, host, scope, filter)` **without deps**, so production always gets `defaultDeps()` (exit 127, degraded). The preview has never worked against real qor-logic.
- **Version constant:** `TESTED_AGAINST_QOR_LOGIC_VERSION = "0.169.0"` is a recorded probe result. FX942 against 0.176.1 is `version_boundary UNTESTED`, so the constant **must not change** in this plan.

## Open Questions (owner)

1. **Divergent installed version.** When an operator already has a qor-logic version other than 0.176.1, the plan's default is to change nothing and report "installed X, FailSafe is pinned to 0.176.1". The alternative is a separate, explicitly confirmed "Replace with 0.176.1" action. Is that action wanted in 6.0.12, or deferred?
2. **Global vs user site.** `pip install` targets the resolved interpreter's environment. Should FailSafe refuse to install into a system Python (outside a virtual environment) and require a venv or `--user`? Default: report the target environment in the confirmation and require consent. No silent system install.
3. **Offline / pinned wheel.** Should an operator be able to point FailSafe at a local verified wheel, with its sha256 checked against the pinned digest above? Default: not in 6.0.12; record as follow-up.

## Affected Surfaces

```text
MOD src/qorlogic/hostLayouts.ts                    # + FROZEN_QOR_LOGIC_VERSION = "0.176.1" (TESTED_AGAINST stays "0.169.0")
MOD src/qorlogic/QorLogicPackageInstaller.ts       # probe() absent|exact|divergent|unknown; install() exact-only, never --upgrade
MOD src/qorlogic/QorLogicSkillIngestor.ts          # ensurePackageInstalled: no upgrade path; divergent/unknown are refusals
MOD src/extension/bootstrapWorkspace.ts            # stepQorLogicPackage: unknown != absent; consent text names exact version + target env
MOD src/qorlogic/installDryRun.ts                  # text dry-run parser; no --json/--include; client-side skill filter
MOD src/extension/bootstrapServers.ts              # pass { runQorlogicCommand: runCli, warn } into previewInstall
NEW src/test/qorlogic/QorLogicPackageInstaller.exactPin.test.ts
NEW src/test/qorlogic/installDryRun.text.test.ts
MOD src/test/qorlogic/QorLogicPackageInstaller.test.ts (expectations that encode >= and --upgrade)
```

Every touched file must stay within Section 4 (≤250 lines/file, ≤40 lines/function). `QorLogicPackageInstaller.ts` is already near the cap (PR #466 noted 250/251), so the probe classifier moves to a new `qorLogicVersionProbe.ts` if needed.

## Phase 1: classify, then install only the exact version (tests first)

### Unit tests (write first; each must fail on `497c0821`)

1. **Absent:** `pip show` exits 1 with `WARNING: Package(s) not found: qor-logic`. Expect `install()` to run `<py> -P -m pip install --no-input qor-logic==0.176.1`, with **no `--upgrade` and no `>=`**.
2. **Exact:** `pip show` reports `Version: 0.176.1`. Expect `install()` to be a no-op returning `{ ok: true, state: 'exact' }`, with zero pip install calls.
3. **Divergent:** run for each of 0.169.0, 0.176.0, 0.176.2, 0.200.0 and a garbage `Version: x`. Expect `install()` to return `{ ok: false, error: 'version-divergent', installed, expected: '0.176.1' }` with **zero pip install calls**.
4. **Unknown:** `pip show` times out, fails to spawn, or exits with something other than not-found. Expect `{ ok: false, error: 'version-unknown' }` with zero install calls. `bootstrapWorkspace` reports `failed: version-unknown`, not `deferred`/`performed`.
5. **Pinned-install postcondition:** after a successful exact install, re-probe. If the post-install version is not 0.176.1, return `{ ok: false, error: 'install-postcondition' }`.
6. **`ensurePackageInstalled`:** below-floor, divergent and unknown all return refusals without calling `install()`.
7. **Unchanged constants:** `TESTED_AGAINST_QOR_LOGIC_VERSION === '0.169.0'` and `MIN_QOR_LOGIC_VERSION === '0.31.1'`. This is a guard against a hand-bump.

### Implementation sketch (not applied)

```ts
// hostLayouts.ts
/** The frozen qor-logic release this FailSafe installs (#463). Installation target,
 *  not a test result: TESTED_AGAINST_QOR_LOGIC_VERSION records what FX942 passed on. */
export const FROZEN_QOR_LOGIC_VERSION = "0.176.1";

// QorLogicPackageInstaller.ts
export type QorProbe =
  | { state: 'absent' } | { state: 'exact'; installed: string }
  | { state: 'divergent'; installed: string } | { state: 'unknown'; reason: string };
async probe(): Promise<QorProbe>  // pip show → classify; "not found" text is the ONLY absent signal
async install(): Promise<QorLogicInstallResult> {
  const p = await this.probe();
  if (p.state === 'exact') return { ok: true, command: '', state: 'exact', version: p.installed };
  if (p.state === 'divergent') return { ok: false, command: '', error: 'version-divergent', version: p.installed };
  if (p.state === 'unknown') return { ok: false, command: '', error: 'version-unknown' };
  const spec = `${PACKAGE}==${FROZEN_QOR_LOGIC_VERSION}`;
  const args = [...py.args, '-P', '-m', 'pip', 'install', '--no-input', spec];   // no --upgrade
  … run; then re-probe; postcondition must be { state: 'exact' }
}
```

`InstallError` gains `'version-divergent' | 'version-unknown' | 'install-postcondition'`. UI copy for divergent: *"qor-logic X is installed. FailSafe is pinned to 0.176.1 and did not change your installation."*

## Phase 2: supported CLI preview (tests first)

### Unit tests

1. **Arguments:** `buildArgs` produces exactly `['install','--host',h,'--scope',s,'--dry-run']`, never `--json` or `--include`.
2. **Text parser:**
   - On the captured 0.176.1 output (fixture copied verbatim, 78 files plus summary), it returns 78 `wouldWrite` entries with destination paths relative to the target root, and `degraded: false`.
   - When the summary count disagrees with the parsed line count, it returns `degraded: true, reason: 'dry-run-count-mismatch'`.
3. **Skill filter:** applied client-side on the destination's skill directory segment. An unknown skill name yields zero entries, not the unfiltered list.
4. **Non-zero exit:** returns `degraded: true` with `exit-code-N`, and `dry-run-flag-not-supported` when stderr says so.
5. **Wiring:** a test that `bootstrapServers`' `previewInstall` closure passes a runner. Asserted via an exported factory, not by reading source text.
6. **No-write guarantee:** the preview runs only `--dry-run`. A fixture runner records argv, and any argv without `--dry-run` fails the test.

## Negative controls (each must be red before the change, green after)

| Control | Red on `497c0821` because |
|---|---|
| absent → install argv contains `==0.176.1` and not `--upgrade` | argv is `--upgrade qor-logic>=0.31.1` |
| divergent 0.200.0 → `ensurePackageInstalled` refuses (`version-divergent`) | it returns `ok: true` ("already meets floor 0.31.1"), accepting an untested version |
| below-floor 0.30.0 → `ensurePackageInstalled` refuses, zero pip install calls | it calls `install()`, i.e. `pip install --upgrade qor-logic>=0.31.1` (newest on the index) |
| unknown (spawn error) → no install | `.catch(() => false)` → install runs |
| preview argv lacks `--json` | argv contains `--json` |
| production preview gets a runner | `defaultDeps()` exit 127 |
| `TESTED_AGAINST` still 0.169.0 | (guard; green before and after) |

## Native acceptance after implementation (not now)

Run in disposable virtual environments with real pip against the verified wheel or the index:
- absent → exact 0.176.1;
- 0.169.0 present → untouched + divergent message;
- 0.200.0 (local dummy wheel) → untouched;
- offline with no wheel → clean failure, nothing changed;
- the preview lists 78 claude files and writes nothing (directory hash before/after).

Then rerun FX942 (with PR #624) and decide **separately** whether `TESTED_AGAINST` can advance. It cannot while any control is UNTESTED or INCONCLUSIVE.

## Out of scope

- Changing frozen qor-logic.
- Advancing `TESTED_AGAINST`.
- Cursor and Cline host mirroring (declared unmirrored).
- Signing or verifying wheels at install time (Open Question 3).
