# Plan: B197 residual — qor-logic version-floor surfacing

**change_class**: feature
**doc_tier**: standard
**high_risk_target**: false
**originating_remediation**: B197 (residual after installer-side already shipped)
**target_version**: v5.2.x
**Review boundary**: stage artifacts only; push when sealed (operator-authorized pattern per prior cycles).

**Scope discipline**: B197 installer-side is already implemented — `QorLogicPackageInstaller.install()` pins `qor-logic>=0.31.1` with `--upgrade` (line 82-86); `verifyInstalledVersion()` exists (line 99-108); 20 tests cover the pinning + verification paths. The residual gap is the **surfacing layer**: `verifyInstalledVersion()` is never called by the hub artifact builder, so the operator-visible Settings card has no signal when the installed `qor-logic` is below the floor. This cycle closes that surfacing gap.

## Decision Log

| Decision | Confidence | Evidence |
|---|---|---|
| Surface floor-violation via existing hub payload + Settings card (not a new UI panel) | high | install-skills-card.js already renders `hubData.bootstrapState.qorLogicInstall`; adding a conditional warning block is the minimum-blast-radius path. |
| Call `verifyInstalledVersion()` once per hub rebuild (not on every UI render) | high | The check spawns `pip show`; running it per-UI-render would be expensive. WorkspaceArtifactBuilder runs once per hub.refresh. |
| Out-of-scope: bumping MIN_QOR_LOGIC_VERSION to a newer upstream (e.g. 0.32.x) | high | This cycle surfaces the existing floor; a version bump is a separate decision (B-QL-2 if needed). |

## Infrastructure Citation Inventory (SG-CitationDrift-A)

1. **`MIN_QOR_LOGIC_VERSION = "0.31.1"` at `hostLayouts.ts:70`** — verified via grep.
2. **Installer pin at `QorLogicPackageInstaller.ts:82-86`** — verified.
3. **`verifyInstalledVersion()` returns `{installed, minimum, meetsFloor}` at `QorLogicPackageInstaller.ts:99-108`** — verified.
4. **`compareVersions(a, b)` helper at `QorLogicPackageInstaller.ts:133-144`** — verified (no new semver dep needed).
5. **Hub payload reads `bootstrapState.qorLogicInstall` from `WorkspaceArtifactBuilder.ts:69` via `getQorLogicInstallStatus()` in `qorLogicInstallRecord.ts`** — neither file calls `verifyInstalledVersion`. The gap.
6. **Settings card consumes `hubData.bootstrapState.qorLogicInstall.hosts` + `.anyInstalled` at `install-skills-card.js:26-27`** — currently no version-floor warning surface.

## Phase 1: Wire verifyInstalledVersion into the hub payload

### Architecture corrections (per cycle-1 review)

- `WorkspaceArtifactBuilder` is NOT constructed in bootstrap; it is instantiated INSIDE `HubSnapshotService.buildHubSnapshot()` at `HubSnapshotService.ts:196`. The installer instance lives at `bootstrapServers.ts:108`.
- `verifyInstalledVersion()` is async; `WorkspaceArtifactBuilder.build()` (line 56) is sync. Resolving the version in the builder would require making `build()` async (large blast radius). Lower-blast-radius alternative (adopted): resolve the version status once inside `HubSnapshotService.buildHubSnapshot()` (which is already async) and inject the **resolved** result into the builder via constructor.

### Affected files
- `src/qorlogic/qorLogicInstallRecord.ts` — extend the `QorLogicInstallStatus` type with three optional fields: `installedVersion?: string | null`, `minimumVersion?: string`, `meetsFloor?: boolean`. `getQorLogicInstallStatus()` gains an optional `versionStatus?: { installed: string | null; minimum: string; meetsFloor: boolean }` second argument; when present, merges the three fields into the returned status object. When absent, fields stay undefined (legacy/test back-compat).
- `src/qorlogic/WorkspaceArtifactBuilder.ts` — constructor accepts optional `qorLogicVersionStatus?` (resolved value, not a function); at line 69, pass through to `getQorLogicInstallStatus(this.workspaceRoot, this.qorLogicVersionStatus)`. Default: no version status injected (backwards-compat).
- `src/roadmap/services/HubSnapshotService.ts` — `HubSnapshotServiceDeps` gains optional `getQorLogicVerifier?: () => Promise<QorLogicVersionStatus>`. Inside `buildHubSnapshot()` (already async), resolve the verifier once (with a try/catch so a failed `pip show` doesn't crash hub-build) and pass the resolved result into `new WorkspaceArtifactBuilder(this.workspaceRoot, resolved)`. Catch returns `undefined` so the UI gracefully omits the warning.
- `src/extension/bootstrapServers.ts` — at line ~108 (where installer is already constructed), thread `getQorLogicVerifier: () => qorLogicPackageInstaller.verifyInstalledVersion()` into the `HubSnapshotService` deps. No new construction; this is a one-line dep wire-up.

### Unit tests
- `src/test/qorlogic/qor-logic-install-record.test.ts` (EXTEND): 3 cases (SG-035 invoke + assert):
  1. `getQorLogicInstallStatus()` without verifier dep: returns legacy shape (no installedVersion/minimumVersion/meetsFloor fields).
  2. With verifier dep returning `{installed: '0.30.0', minimum: '0.31.1', meetsFloor: false}`: returned status carries `installedVersion: '0.30.0'`, `minimumVersion: '0.31.1'`, `meetsFloor: false`.
  3. With verifier dep returning `{installed: '0.31.5', minimum: '0.31.1', meetsFloor: true}`: returned status carries `meetsFloor: true`.

## Phase 2: Settings card floor-violation warning

### Affected files
- `src/roadmap/ui/modules/install-skills-card.js` — at render time, when `qorLogicInstall.installedVersion` is present AND `meetsFloor === false`, prepend a warning block ABOVE the host-installation table:
  ```
  ⚠ qor-logic v<installedVersion> is below the required minimum v<minimumVersion>.
    Re-running install will upgrade to the floor or newer.
  ```
  Click target: existing "Install Qor-Logic Skills" button (no new button needed — same affordance triggers the upgrade). XSS-escape the version strings via the existing **`esc()`** local helper at `install-skills-card.js:7-12` (DOM textContent-based; no new import).

### Unit tests
- `src/test/roadmap/install-skills-card.test.ts` (EXTEND): 2 cases (SG-035 invoke + assert; JSDOM):
  1. With `meetsFloor: false` + `installedVersion: '0.30.0'` + `minimumVersion: '0.31.1'`: renders the warning block with both version strings escaped.
  2. With `meetsFloor: true`: warning block absent.
- Operator-controlled `installedVersion` string passed through `escapeHtml` is a fixed code path — testing with `<script>` payload is overkill; one positive + one negative case is sufficient.

## Phase 3: BACKLOG closure + CHANGELOG + FEATURE_INDEX

### Affected files
- `docs/BACKLOG.md`: B197 `[ ]` → `[x]` with description: "**IMPLEMENTED via installer-side already shipped + B197 residual surfacing cycle 2026-05-19.** Installer (`QorLogicPackageInstaller.ts:82-86`) pins `qor-logic>=0.31.1` with `--upgrade`; `verifyInstalledVersion()` already returned `{installed, minimum, meetsFloor}`. Residual cycle wired the verifier into the hub artifact builder so the Settings card now surfaces a floor-violation warning when the installed version is below `MIN_QOR_LOGIC_VERSION`. 5 new tests (FX511). Plan: `docs/plan-qor-logic-version-pinning.md`."
- `docs/FEATURE_INDEX.md`: append FX511 row.
- `CHANGELOG.md` `[Unreleased]`: append B197 paragraph.

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX511 | NEW | `src/test/qorlogic/qor-logic-install-record.test.ts` + `src/test/roadmap/install-skills-card.test.ts` | qor-logic version floor surfaces through hub payload + Settings card renders below-floor warning when `meetsFloor: false` |

## CI Commands
- `npm run lint` — ESLint 0 errors.
- `npm test` — mocha pass (baseline + 5 new functional cases).
- No Playwright trigger (Settings card is JSDOM-tested; live E2E coverage of Settings card already deferred per general harness gap).
