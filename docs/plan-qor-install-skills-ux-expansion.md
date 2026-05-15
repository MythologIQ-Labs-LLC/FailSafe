# Plan: Install QorLogic Skills UX Expansion + Ghost-UI Audit Gap Closure

**change_class**: feature

**doc_tier**: system

**terms_introduced**:
- term: HostRegistry
  home: docs/SYSTEM_STATE.md
- term: SkillPicker
  home: docs/SYSTEM_STATE.md
- term: InstallDryRun
  home: docs/SYSTEM_STATE.md
- term: LiveProgressInvariant
  home: qor/references/doctrine-ghost-ui-live-progress.md

**boundaries**:
- limitations:
  - Five phases bundled because Defect-1 (modal silent during 20-60s install) is operator-blocking and the other four phases share the same surface (`install-skills-card.js`, `installSkillsHandler.ts`, `ActionsRoute.ts`, `hostLayouts.ts`). Splitting would require duplicate audit/implement cycles.
  - Per-host skill picker (Phase 3) relies on `qor-logic` exposing a `qorlogic list-skills --host <h>` command (or equivalent). If the upstream CLI lacks an enumeration entrypoint, the picker degrades to all-or-nothing and the plan documents the upstream gap rather than working around it client-side.
  - Dry-run preview (Phase 4) relies on `qor-logic` exposing `qorlogic install --dry-run` (or equivalent). Same degradation rule as Phase 3 if upstream lacks the flag.
  - Phase 5 ships a workspace-local doctrine + a mechanical detection lint helper, NOT a direct edit to `.claude/skills/qor-audit/SKILL.md` (that file is qor-logic-managed; per audit Entry #366 V1, direct edits would be overwritten on next `qorlogic install`). The canonical SKILL.md amendment is tracked upstream as **Qor-logic#58** — a separate qor-logic SDK contribution. Until that lands, FailSafe operators apply the rule via the workspace doctrine + the lint helper at the Step 0.6 pre-audit invocation point.
- non_goals:
  - NOT a re-architecture of the install pipeline. Phases run sequentially; per-host parallelism is out of scope.
  - NOT operator-defined custom skill content. The host registry adds custom HOSTS (where to install); creating new SKILLS is a qor-logic SDK concern.
  - NOT changing the v5.1.0 publish-block-lift surface. Marketplace publish remains gated by the existing PUBLISH_BLOCK conditions; this plan lands behind that block.
  - NOT a CHANGELOG entry as user-facing change (the install surface is operator-only governance plumbing, not a marketed v5.1.0 feature).
- exclusions:
  - VS Code `failsafe.installQorLogicSkillsDefaults` command (the `'defaults'` mode path in `installSkillsHandler.ts:115`) keeps its current behavior unchanged. This plan affects only the `'web'` mode path used by `install-skills-card.js`.
  - Existing `failsafe.bootstrap` command behavior is unchanged.
  - The `tickers.js:43` raw `<button onclick="fetch(...)">` Install ticker is OUT of scope. It bypasses this card entirely; flagged as a separate defect to address in a follow-up plan.
- precondition: organize-ux-hotfix sealed at META_LEDGER #364 + Monitor scaling/Recently-Completed/Organize-toast inline fixes landed at commits `3744ba4`, `0d0fa87`, `3a372db`. PUBLISH_BLOCK still `Active: yes`. `dist/extension/main.js` current as of `3a372db`.

**Audit-framework gap acknowledgement**:

The Install Skills card shipped to operator-visible state (`#363 → #364` cycle of the prior plan; older for the install card itself which predates this plan history) with:
- Fake 0%/100% progress bar with no intermediate state during a 20-60s operation (`install-skills-card.js:303` jumps `progressBar.style.width = '100%'` only at fetch completion).
- WebSocket `skills.install.progress` events emitted by the host (`bootstrapServers.ts:94, 152`) but not subscribed to by the modal.
- Operator-blocking error modal with no retry/dismiss control (`install-skills-card.js:295-301`).

The `qor-audit` Ghost UI Pass language at Step 3 (`Every button has an onClick handler` / `Every form has submission handling` / `Every interactive element connects to actual functionality` / `No 'coming soon' or placeholder UI`) **does not detect** the case where a handler EXISTS, a backing operation runs, but the operator-visible UI does not reflect the operation. Phase 5 closes this audit-framework gap.

## Open Questions

1. **Host-registry merge precedence**: when `.failsafe/governance/host-registry.json` and the built-in `HOST_INSTALL_LAYOUTS` both define the same host (e.g., operator overrides `claude`'s `installMap`), which wins? Default proposed: operator overlay wins (last-write-wins per key, deep merge for the install map). The built-in default is the seed; explicit operator declaration overrides.
2. **Dry-run upstream dependency**: if `qorlogic install --dry-run` is not available in `qor-logic >= 0.31.1` (the pinned floor), do we (a) raise the floor to whatever version adds it, (b) build dry-run client-side by reading the install record schema, or (c) gracefully degrade with a tooltip "Preview unavailable on this qor-logic version"? Default proposed: (c) — degrade gracefully; do not force operator to upgrade qor-logic in this plan.
3. **Phase 5 rule scope**: should the `live-progress` Ghost UI sub-check apply to **all** UI elements with progress semantics (Organize toast, hub.refresh broadcast, etc.) or **only** modal/dialog progress bars? Default proposed: modal/dialog progress bars only — narrower scope avoids audit-cycle explosion on already-shipped UI surfaces. (Carried into upstream Qor-logic#58 with the same default.)

## Scope Baseline

| Defect / gap | Current state | Phase that closes it |
|---|---|---|
| D1: modal silent during install | `progressBar` goes 0→100% at end; `progressMsg` set only on completion | Phase 1 |
| D2: error modal traps user | `if (!res.ok)`: render error text, modal stays open forever | Phase 1 |
| D3: only 4 hardcoded hosts | `QOR_LOGIC_HOSTS = ["claude","codex","kilo-code","gemini"]` | Phase 2 |
| D4: cannot add `.windsurf`/`.cursor`/`.amazonq` | Static TypeScript const | Phase 2 |
| D5: all-or-nothing per host | `installHost(host, scope)` ingests every skill in the variant | Phase 3 |
| D6: no preview of file diff | None | Phase 4 |
| D7: Ghost UI Pass doesn't catch fake progress | qor-audit Ghost UI Pass workspace-local + upstream contribution (Qor-logic#58) | Phase 5 |

## Phase 1: Modal live progress + error retry (smallest surface; lands first)

### Affected Files

- `FailSafe/extension/src/test/roadmap/installSkillsProgressContract.test.ts` — NEW; vscode-test mocha. Pins the contract: `applyProgressUpdate(modalState, invocation)` mutates `modalState.lines` in the right order; `applyCompletion(modalState, report)` transitions to terminal state; `applyError(modalState, err)` enables retry without dismissing.
- `FailSafe/extension/src/roadmap/ui/modules/install-skills-progress.js` — NEW (~70L). Pure DOM-free helpers: `applyProgressUpdate(state, invocation) → state`, `applyCompletion(state, report) → state`, `applyError(state, err) → state`. `state` shape: `{ lines: [{phase, status, label, detail?, error?}], terminal: 'idle' | 'running' | 'done' | 'error' }`.
- `FailSafe/extension/src/roadmap/ui/modules/install-skills-modal.js` — NEW (~155L; V2 Path A split per audit Entry #366). Owns modal lifecycle: `renderInstallModal(hosts, running)` (the HTML), `showInstallModal(container)`, `hideInstallModal(container)`, `bindModalEvents(container, options, setStatus)`, `performWebInstall(container, hosts, scope, options, setStatus)`. Also owns the WebSocket subscription scoped to modal-open/close, the per-phase progress rendering via `renderProgressLines(state)`, and the Retry/Dismiss/Close button bindings.
- `FailSafe/extension/src/roadmap/ui/modules/install-skills-card.js` — MODIFIED. Strip out modal-lifecycle helpers (moved to `install-skills-modal.js`). Card retains `renderInstallSkillsCard`, `renderHostGrid`, `renderInvocations`, `renderInvocationLine`, `invocationIcon|Label|Detail`, `renderReportSummary`, and `bindInstallSkillsCard` (which now imports and wires modal binders). Net change: `−145 lines` (modal extraction) `+ 25 lines` (modal-import wiring + WebSocket-event prop pass-through). File ends at **~201 lines**.
- `FailSafe/extension/src/roadmap/ConsoleServer.ts` — verify the existing `broadcastEvent({type:"skills.install.progress", invocation})` line emits before each phase starts (it does today per `bootstrapServers.ts:152-155`). No source change in ConsoleServer.

### Changes

`install-skills-progress.js` exports three pure reducer functions. The modal's DOM mutations consume `state` via `renderProgressLines(state)` and write innerHTML in `install-skills-modal.js`.

`install-skills-modal.js` (new module, V2 Path A split):
- `bindModalEvents` opens the WebSocket subscription on modal-open and tears it down on modal-close. Subscription targets the existing `skills.install.progress` and `skills.install.complete` events emitted by ConsoleServer (the host already broadcasts these via `bootstrapServers.ts:152-155`).
- `renderProgressLines(state)` produces a structured `<ul>` of `[icon] phase-label [— detail]` rows in place of the static 0%/100% bar.
- Error UI replaces single-line error text with `<div class="cc-modal-error">{message}<button data-action="retry">Retry</button><button data-action="dismiss">Dismiss</button></div>`.
- Auto-close removed; explicit `Close` button rendered when `state.terminal === 'done'`.

`install-skills-card.js` strips the modal-lifecycle code and gains the `import { renderInstallModal, bindModalEvents } from './install-skills-modal.js'` line plus the modal wiring inside `bindInstallSkillsCard`. Card-outer concerns (host grid, status line, invocation history) stay unchanged.

### Unit Tests

- `installSkillsProgressContract.test.ts` invokes `applyProgressUpdate({lines:[],terminal:'idle'}, {phase:'python-probe', status:'running'})` and asserts the returned state has `lines.length === 1`, `lines[0].phase === 'python-probe'`, `lines[0].status === 'running'`, `terminal === 'running'`.
- Invokes `applyProgressUpdate` twice with `{phase:'python-probe', status:'running'}` then `{phase:'python-probe', status:'success', interpreter:'python3'}` and asserts the second call MUTATES the existing line (not appends a new one); `lines[0].status === 'success'`, `lines[0].detail === 'python3'`.
- Invokes `applyCompletion(state, {ok:true, totalInstalled:47, destinations:['.claude/skills/']})` and asserts `terminal === 'done'`, destinations appended.
- Invokes `applyError(state, {error:'pip failed', stderrTail:'...'})` and asserts `terminal === 'error'`, error message captured, lines preserved (operator can see how far the pipeline got).
- Invokes the full sequence (probe→pip→claude-install→provenance→refresh) and asserts the 5-line ordered output ends with `terminal === 'done'`.

## Phase 2: Operator-configurable host registry

### Affected Files

- `FailSafe/extension/src/test/qorlogic/hostRegistryMerge.test.ts` — NEW. Pins the merge semantics: built-in seed + operator overlay → effective registry. Cases: empty overlay, additive overlay (`.windsurf` added), overriding overlay (operator changes `.claude` installMap), invalid overlay (malformed JSON → degraded fallback to built-in).
- `FailSafe/extension/src/qorlogic/hostRegistry.ts` — NEW (~90L). Exports `loadHostRegistry(workspaceRoot): { layouts: Record<QorLogicHost, HostInstallLayout>, hosts: QorLogicHost[], source: 'built-in' | 'overlay-merged' | 'overlay-invalid' }`. Reads `.failsafe/governance/host-registry.json` if present; deep-merges with `HOST_INSTALL_LAYOUTS`; logs invalid overlay to console and returns built-in.
- `FailSafe/extension/src/qorlogic/hostLayouts.ts` — MODIFIED. The static `HOST_INSTALL_LAYOUTS` becomes the seed; `QOR_LOGIC_HOSTS` becomes a function `getQorLogicHosts(workspaceRoot)` that calls `loadHostRegistry` (with module-level caching keyed by workspaceRoot+mtime of the overlay file). Existing exports preserved for back-compat.
- `FailSafe/extension/src/qorlogic/qorLogicInstallRecord.ts` — MODIFIED. `getQorLogicInstallStatus(workspaceRoot)` calls the new `getQorLogicHosts(workspaceRoot)` instead of importing `QOR_LOGIC_HOSTS` directly.
- `.failsafe/governance/host-registry.schema.json` — NEW. JSON Schema for the overlay file; documents the `hosts` map shape with `base`, `recordPath`, `installMap`, `discoveryRoots`.
- `docs/SYSTEM_STATE.md` — MODIFIED. Add `HostRegistry` term + reference to the schema.

### Changes

Overlay file structure (operator-authored):

```json
{
  "$schema": ".failsafe/governance/host-registry.schema.json",
  "hosts": {
    "windsurf": {
      "base": ".windsurf",
      "recordPath": ".windsurf/.qorlogic-installed.json",
      "installMap": { "skills/": ".windsurf/skills/" },
      "discoveryRoots": [".windsurf/skills/"]
    }
  }
}
```

Merge rules (deep-merge): host-keys in overlay are added or replaced (no per-field shallow merge — operators rarely want half-overridden installMaps). Built-in hosts not mentioned in the overlay are preserved. Invalid JSON → entire overlay rejected, `source: 'overlay-invalid'` returned, built-in only.

### Unit Tests

- `hostRegistryMerge.test.ts` invokes `loadHostRegistry(tmpDir)` with:
  - No overlay file → `source === 'built-in'`, `hosts === [4 built-in hosts]`.
  - Empty `{hosts:{}}` overlay → `source === 'overlay-merged'`, same 4 hosts.
  - Additive `{hosts:{windsurf:{...}}}` overlay → `source === 'overlay-merged'`, hosts === 5 entries.
  - Override `{hosts:{claude:{base:'.claude-custom',...}}}` overlay → `source === 'overlay-merged'`, `layouts.claude.base === '.claude-custom'` (operator wins).
  - Malformed JSON → `source === 'overlay-invalid'`, `hosts === [4 built-in]` (graceful degrade); console warning emitted via injectable logger.

## Phase 3: Per-host skill picker

### Affected Files

- `FailSafe/extension/src/test/qorlogic/skillEnumeration.test.ts` — NEW. Tests `enumerateSkillsForHost(ingestor, host)` returns `{ skills: [{name, kind: 'skill'|'agent'|'command', path}], degraded?: boolean }`. Stub ingestor returns canned skill list; asserts shape + ordering. Stub returning `'enumeration-not-supported'` produces `degraded: true` and empty skills.
- `FailSafe/extension/src/qorlogic/skillEnumeration.ts` — NEW (~60L). Wraps a Python invocation: `qorlogic list-skills --host <h> --scope <repo|global> --json`. Returns parsed JSON or `degraded: true` if the CLI subcommand is missing (exit code != 0 with specific stderr pattern).
- `FailSafe/extension/src/extension/installSkillsHandler.ts` — MODIFIED. New `runHostInstallStepWithSkillFilter(ingestor, host, scope, skillFilter, onProgress)` variant that passes `--include <name>` flags to `qorlogic install` when `skillFilter` is non-empty. Existing `runHostInstallStep` preserved for back-compat.
- `FailSafe/extension/src/roadmap/routes/ActionsRoute.ts` — MODIFIED. `POST /api/actions/scaffold-skills` accepts new optional body field `skillFilter: { [host]: string[] }`. When set, passes through to `createScaffoldWithWebOptions(...).withSkillFilter`.
- `FailSafe/extension/src/roadmap/ui/modules/install-skills-picker.js` — NEW (~80L; V2 Path A split per audit Entry #366). Exports `renderPickerSection(hosts, running)` (the collapsible `[+] Per-host skills` HTML block, collapsed by default), `bindPickerEvents(container, options)` (handles expand/collapse, fetches `/api/qorlogic/list-skills?host=<h>` for each checked host, renders checkbox grid per host), and `collectSkillFilter(modalEl) → { [host]: string[] }` (called by `install-skills-modal.js` when constructing the POST body). Degraded mode renders "All skills will be installed (this version of qor-logic doesn't support per-skill selection)".
- `FailSafe/extension/src/roadmap/ui/modules/install-skills-modal.js` — MODIFIED. Imports `renderPickerSection` + `collectSkillFilter`; renders the picker section inside the modal under the host-checkbox grid; passes `collectSkillFilter(modalEl)` to `performWebInstall` so the POST body carries the operator's skill filter.
- `FailSafe/extension/src/roadmap/routes/QorlogicRoute.ts` — NEW (~55L; V3 Path A reroute per audit Entry #367). Exports `registerQorlogicRoutes(app, deps)` registering GET `/api/qorlogic/list-skills` → `deps.enumerateSkillsForHost(host)` and POST `/api/actions/scaffold-skills/preview` → `deps.previewInstall(host, scope, skillFilter)`. Mirrors the existing `setupActionsRoutes` shape.
- `FailSafe/extension/src/roadmap/ConsoleServer.ts` — MODIFIED (+3L per V3 Path A). Add `getExpressApp(): express.Application { return this.app; }` accessor so `bootstrapServers.ts` can register additional routes after server start without modifying the already-at-cap `ConsoleRouteRegistrar.ts`. Final ConsoleServer.ts = 246L → 249L (under cap, 1 line of headroom).
- `FailSafe/extension/src/extension/bootstrapServers.ts` — MODIFIED (+~7L). After `consoleServer.start()`, call `registerQorlogicRoutes(consoleServer.getExpressApp(), { enumerateSkillsForHost: host => enumerateSkillsForHost(skillIngestor, host), previewInstall: (host, scope, filter) => previewInstall(skillIngestor, host, scope, filter) })`. Final bootstrapServers.ts = 221L → 228L (under cap).

> **Soc trade-off note**: this Path A bypasses `ConsoleRouteRegistrar.ts` for the new qorlogic routes, breaking the registrar's "single source of route registration" responsibility. The trade-off is intentional: the registrar is at-cap exactly (250L) and any addition breaches Razor. A follow-up `consoleServerRoutes.ts` extraction (out of this plan's scope) would consolidate qorlogic routes back into the registrar's domain. Until that follow-up lands, the registrar remains the canonical home for the EXISTING routes; new routes register directly via `getExpressApp()`. The same pattern is implicitly used by `consoleServer.setScaffoldCallback` / `setScaffoldWebCallback` which are wired from bootstrapServers.ts after server construction.

### Changes

The picker is collapsed by default to avoid overwhelming the operator. Power-users expand it; default behavior (no selection = install all) preserves the existing UX flow exactly.

### Unit Tests

- `skillEnumeration.test.ts` stubs `runQorlogicCommand({ args: ['list-skills', '--host', 'claude', '--scope', 'repo', '--json'] })` to return a JSON payload; asserts `enumerateSkillsForHost('claude')` returns `skills.length === N` with correct shape.
- Stub returns exit code 2 with stderr `unrecognized arguments: list-skills`; asserts `enumerateSkillsForHost` returns `{ skills: [], degraded: true, reason: 'cli-subcommand-not-supported' }`.
- Stub returns valid JSON but malformed shape (missing `name`); asserts function filters out malformed entries and logs to injectable warning channel.

## Phase 4: Dry-run preview

### Affected Files

- `FailSafe/extension/src/test/qorlogic/installDryRun.test.ts` — NEW. Tests `previewInstall(ingestor, host, scope, skillFilter)` returns `{ wouldWrite: [{path, sha256?}], wouldDelete: [...], degraded?: boolean }`. Stub `qorlogic install --dry-run --json` output; asserts parse + shape. Degraded path same as Phase 3.
- `FailSafe/extension/src/qorlogic/installDryRun.ts` — NEW (~50L). Wraps `qorlogic install --host <h> --scope <s> --dry-run --json`.
<!-- V4 Path A (audit Entry #368): the POST /api/actions/scaffold-skills/preview
     route lives in `routes/QorlogicRoute.ts` (declared in Phase 3 Affected Files
     per V3 Path A reroute), NOT in `ActionsRoute.ts`. The original Phase 4
     wording that put it in ActionsRoute.ts is removed to deduplicate. -->
- The preview endpoint `POST /api/actions/scaffold-skills/preview` lives in `FailSafe/extension/src/roadmap/routes/QorlogicRoute.ts` (already declared NEW in Phase 3 per V3 Path A reroute). No additional `ActionsRoute.ts` modification is required by Phase 4; the existing Phase 3 `ActionsRoute.ts` modification (for `skillFilter` body-field pass-through on the EXISTING `/api/actions/scaffold-skills` endpoint) is the only ActionsRoute change in this plan.
- `FailSafe/extension/src/roadmap/ui/modules/install-skills-preview.js` — NEW (~70L; V2 Path A split per audit Entry #366). Exports `renderPreviewButton(running)` (the `Preview Changes` button HTML next to `Install` in the modal footer), `bindPreviewEvents(container, options, setStatus)` (binds the click handler that POSTs `{hosts, scope, skillFilter}` to `/api/actions/scaffold-skills/preview`, renders the returned diff as a scrollable list `+ N files would be written to .claude/skills/, .claude/agents/` with expandable per-file paths). On `degraded: true` response, the button is rendered with `disabled` attribute and a tooltip "Preview not supported by this qor-logic version".
- `FailSafe/extension/src/roadmap/ui/modules/install-skills-modal.js` — MODIFIED. Imports `renderPreviewButton` + `bindPreviewEvents`; injects the Preview button into the modal footer alongside Install/Cancel; wires the click handler via `bindPreviewEvents`.

### Changes

The preview button does NOT replace Install; it's an inspection step. Operator can preview, then click Install with confidence. If qor-logic upstream lacks `--dry-run`, the preview button is disabled with tooltip — degrades gracefully per the plan's degradation rule.

### Unit Tests

- `installDryRun.test.ts` stubs `runQorlogicCommand({args:['install','--host','claude','--scope','repo','--dry-run','--json']})` returning `{ would_write: [{path:'/.../foo.md', sha256:'abc'}] }`; asserts `previewInstall` returns matching shape with normalized keys.
- Stub returns exit code with stderr `unrecognized arguments: --dry-run`; asserts `degraded: true`.

## Phase 5: Audit-framework `live-progress` Ghost UI rule — workspace-local doctrine + lint helper

**V1 Path A per audit Entry #366**: this phase does NOT modify `.claude/skills/qor-audit/SKILL.md` directly. That file is qor-logic-managed (listed in `.claude/.qorlogic-installed.json`) and any local edit is overwritten on next `qorlogic install`. The canonical SKILL.md amendment is filed upstream as **[Qor-logic#58](https://github.com/MythologIQ-Labs-LLC/Qor-logic/issues/58)** for SDK-level adoption. Until that issue ships, FailSafe operators apply the rule via the workspace doctrine + the mechanical lint helper.

### Affected Files

- `FailSafe/extension/src/test/scripts/ghostUiLiveProgressLint.test.cjs` — NEW (`.test.cjs` under `node --test`). Tests the lint helper `ghost-ui-live-progress-lint.cjs` against four fixture shapes (FAKE_JUMP / OK / STATIC / MALFORMED).
- `FailSafe/extension/scripts/lib/ghost-ui-live-progress-lint.cjs` — NEW (~80L). Pure helper exporting `analyzeProgressElements(htmlSource) → [{element, selector, livenessRule: 'OK' | 'STATIC' | 'FAKE_JUMP'}]`. Detection heuristic: parse for `style.width = '0%'` followed by `style.width = '100%'` with no intermediate writes; flag as `FAKE_JUMP`. Pure stdlib regex / string parsing; no DOM dependency.
- `qor/references/doctrine-ghost-ui-live-progress.md` — NEW (~90L; workspace-local doctrine). Documents the four-bullet rule (same rule body as upstream Qor-logic#58's proposed SKILL.md amendment) with the four-case acceptance table (FAKE_JUMP / OK / STATIC / MALFORMED). Cites the lint helper as the mechanical detection mechanism. Cross-references Qor-logic#58 as the canonical upstream landing point and lists the rule as workspace-active immediately (operator-applied in audit reports until SDK upstream lands).
- `docs/SYSTEM_STATE.md` — MODIFIED (per Phase 5 + the existing terms list). Add `LiveProgressInvariant` term entry citing the new doctrine path.

### Changes

The rule applies to **future** FailSafe audits via two channels:

1. **Operator-applied** (default until upstream lands): the next `/qor-audit` cycle reads `qor/references/doctrine-ghost-ui-live-progress.md` as part of the Ghost UI Pass context (Step 3); the Judge cites the doctrine when flagging violations. This is the same pattern the audit already uses for `doctrine-shadow-genome-countermeasures.md`.
2. **Mechanical (lint helper)**: operator can invoke `node FailSafe/extension/scripts/lib/ghost-ui-live-progress-lint.cjs --html <plan-cited-source>` to scan for the FAKE_JUMP pattern before submitting a plan for audit. Future Qor-logic#58 closure will wire this into the canonical Step 0.6 pre-audit lint sweep at the SDK level.

The doctrine is **forward-only**: prior audits (Entries #355/#356/#361/#362) reviewed without this rule remain valid under the rule text they were authored under. The new rule applies starting with the next `/qor-audit` cycle in this workspace.

**Upstream contribution traceability**: Qor-logic#58 carries the canonical SKILL.md amendment text + the four-case test scaffolding + Phase 0.6 wiring. When that issue ships, FailSafe's workspace-local doctrine is superseded by the SDK-level rule and the doctrine becomes informational only. The lint helper at `FailSafe/extension/scripts/lib/` may eventually be ported to Python (`qor/scripts/plan_live_progress_lint.py`) by the SDK maintainers.

### Unit Tests

- `ghostUiLiveProgressLint.test.cjs` invokes `analyzeProgressElements(htmlSource)` with a fixture HTML containing the Phase 1 BEFORE state (style.width = '0%' / style.width = '100%' with no intermediate); asserts a `FAKE_JUMP` entry is returned.
- Invokes against the Phase 1 AFTER state (subscriber pattern + intermediate re-renders); asserts `OK` entry.
- Invokes against a static element (no width manipulation); asserts `STATIC` (informational, not flagged).
- Invokes against an artificial malformed input (no `style.width` writes at all but element labeled "progress"); asserts `STATIC` (no VETO if there's no manipulation to validate).

## CI Commands

- `cd FailSafe/extension; npm run compile` — TypeScript compilation across all 5 phases.
- `cd FailSafe/extension; npm run bundle` — esbuild bundle so the install-skills card surface lands in `dist/extension/ui/`.
- `cd FailSafe/extension; node --test src/test/scripts/ghostUiLiveProgressLint.test.cjs` — Phase 5 lint helper test in isolation.
- `cd FailSafe/extension; npm test -- --grep "installSkills|hostRegistry|skillEnumeration|installDryRun"` — Phases 1-4 vscode-test mocha surfaces (4 new `.test.ts` files).
- `cd FailSafe/extension; npm test -- --runInBand` — full extension suite; regression for any test that exercises the existing install path.
- `cd FailSafe/extension; npx playwright test --grep "install-skills"` — UI regression coverage that the live-progress modal renders correctly under WS event sequence.
- `node FailSafe/extension/scripts/check-governance-canaries.cjs --repo-root .` — governance markdown canary scan.

## Phase Order Rationale

- Phase 1 first because Defect-1 is operator-blocking and the smallest surface (3 files; modal subscribes to existing WS events).
- Phase 2 second because Phase 3 + Phase 4 both depend on the host-registry surface to enumerate "all hosts" (operator-defined custom hosts must show up in the picker).
- Phase 3 + Phase 4 in either order; the plan presents Phase 3 first because per-host filter is the more common operator need.
- Phase 5 last because it's a doctrine-level amendment that BENEFITS from this plan's implementation (the implementation produces both the BEFORE state — the existing fake-progress modal — and the AFTER state, giving the test fixture concrete inputs).

## Review-Boundary attestation

This plan honors the no-ship rule at every phase:

- `/qor-implement` for Phase 1-5 lands source edits, test files, schema files, and the **workspace-local doctrine** at `qor/references/doctrine-ghost-ui-live-progress.md`. It does **NOT** modify `.claude/skills/qor-audit/SKILL.md` (qor-logic-managed; per V1 Path A from audit Entry #366, the canonical SKILL.md amendment is tracked upstream as Qor-logic#58).
- `/qor-implement` does NOT push, tag, marketplace-publish, or flip PUBLISH_BLOCK.
- Phase 5's workspace doctrine is **forward-only**; existing audit entries are not retroactively re-audited. The new rule applies starting with the next `/qor-audit` cycle in this workspace.
- `/qor-substantiate` for this plan SKIPS Steps 7.5 / 7.6 / 9.5.5 per `change_class: feature` boundary — version bump / CHANGELOG stamp / annotated tag are operator-only post-PUBLISH_BLOCK-lift.
- Upstream Qor-logic#58 is filed and awaits SDK maintainer triage; FailSafe-side work proceeds without blocking on its closure.
- `feedback_no_ship_without_approval.md` HARD RULE applies throughout: no push / PR / merge / tag without explicit per-action operator approval.

## Affected Files Total Estimate (V2 Path A rebalance per audit Entry #366)

Current `install-skills-card.js` LOC: **321** (verified via `wc -l`). The audit's V2 finding identified that "+120 net" → 441L breaches the 250-line Razor cap. The V2 Path A split below extracts modal lifecycle / picker / preview into NEW sibling modules so the card outer chrome lands at ≤250L.

| File | Op | Net Δ | Final LOC | ≤ Razor cap? |
|---|---|---|---|---|
| `install-skills-progress.js` (Phase 1) | NEW | +70 | 70 | ✓ |
| `install-skills-modal.js` (Phase 1 split + Phase 3/4 wiring) | NEW | +155 | 155 | ✓ |
| `install-skills-card.js` (Phase 1 split) | MODIFIED | −145 modal + 25 wiring = **−120 net** | 201 | ✓ |
| `install-skills-picker.js` (Phase 3) | NEW | +80 | 80 | ✓ |
| `install-skills-preview.js` (Phase 4) | NEW | +70 | 70 | ✓ |
| `hostRegistry.ts` (Phase 2) | NEW | +90 | 90 | ✓ |
| `hostLayouts.ts` (Phase 2) | MODIFIED | +30 | ~95 (current 70 + 30 minus dedupe) | ✓ |
| `qorLogicInstallRecord.ts` (Phase 2) | MODIFIED | +10 | ~115 | ✓ |
| `skillEnumeration.ts` (Phase 3) | NEW | +60 | 60 | ✓ |
| `installSkillsHandler.ts` (Phase 3) | MODIFIED | +40 | ~200 | ✓ |
| `installDryRun.ts` (Phase 4) | NEW | +50 | 50 | ✓ |
| `ActionsRoute.ts` (Phase 3/4) | MODIFIED | +30 | ~150 | ✓ |
| `ConsoleServer.ts` (Phase 3; V3 Path A reroute) | MODIFIED | +3 (`getExpressApp()` accessor only) | 249 (current 246 + 3; 1L headroom under cap) | ✓ |
| `routes/QorlogicRoute.ts` (Phase 3 + Phase 4; V3 Path A reroute) | NEW | +55 (two route handlers) | 55 | ✓ |
| `bootstrapServers.ts` (Phase 3; V3 Path A reroute) | MODIFIED | +7 (registerQorlogicRoutes after consoleServer.start()) | 228 (current 221 + 7) | ✓ |
| `ConsoleRouteRegistrar.ts` | **UNCHANGED** | 0 | 250 (at-cap, untouched; honored as canonical home for prior routes only) | ✓ |
| `ghost-ui-live-progress-lint.cjs` (Phase 5) | NEW | +80 | 80 | ✓ |
| `qor/references/doctrine-ghost-ui-live-progress.md` (Phase 5; V1 Path A) | NEW | +90 | 90 | n/a (doctrine markdown, not subject to Razor) |
| `host-registry.schema.json` (Phase 2) | NEW | +50 | 50 | n/a (JSON schema, not subject to Razor) |
| `docs/SYSTEM_STATE.md` | MODIFIED | +15 | n/a | n/a (system doc) |
| Plus 5 new test files (`installSkillsProgressContract.test.ts` / `hostRegistryMerge.test.ts` / `skillEnumeration.test.ts` / `installDryRun.test.ts` / `ghostUiLiveProgressLint.test.cjs`) | NEW | 5 × ~150 = +750 | each ≤200 | ✓ |

**Math validation** for `install-skills-card.js`: current 321 − 145 (modal extracted) + 25 (modal-import wiring) = **201 lines**. Cap-compliant with 49 lines of headroom.

**Total estimate**: ~1810 lines across **18 files** (added `routes/QorlogicRoute.ts` per V3 Path A reroute). **All NEW source/script files ≤250L. All MODIFIED source files end at ≤250L.** No Razor violations. Verified via:

```
$ wc -l FailSafe/extension/src/roadmap/ConsoleServer.ts \
        FailSafe/extension/src/roadmap/services/ConsoleRouteRegistrar.ts \
        FailSafe/extension/src/extension/bootstrapServers.ts
246  ConsoleServer.ts          → 249 post-modification (+3, under cap)
250  ConsoleRouteRegistrar.ts  → unchanged
221  bootstrapServers.ts       → 228 post-modification (+7, under cap)
```

V3 closure note: original plan estimate of `+20L on ConsoleServer.ts` was based on inlining the route registration directly in ConsoleServer. The V3 Path A reroute moves route registration into a NEW dedicated module (`routes/QorlogicRoute.ts`) and invokes it from `bootstrapServers.ts` after `consoleServer.start()`, using a thin `getExpressApp()` accessor on ConsoleServer. This pattern matches the existing `consoleServer.setScaffoldCallback` / `setScaffoldWebCallback` seam already used by bootstrapServers.ts.

## Audit-framework gap closure (Phase 5 binding statement)

Phase 5 closes the audit-framework gap that allowed the Install Skills card to ship with a fake progress bar. The amendment chain is two-step:

1. **Workspace-local doctrine** at `qor/references/doctrine-ghost-ui-live-progress.md` (this plan, Phase 5) + the mechanical detection lint helper at `FailSafe/extension/scripts/lib/ghost-ui-live-progress-lint.cjs`. Applies immediately on next `/qor-audit` cycle in the FailSafe workspace.
2. **Canonical SDK amendment** to `qor-audit/SKILL.md` Step 3 Ghost UI Pass via upstream **[Qor-logic#58](https://github.com/MythologIQ-Labs-LLC/Qor-logic/issues/58)** — filed 2026-05-14. Once that ships, the workspace doctrine is superseded by the SDK rule; the lint helper may be ported to Python by SDK maintainers.

The operator-surfaced complaint ("this never should have made it past our audit/substantiation checks") is addressed: (1) by fixing the present defect (Phase 1's modal live progress), (2) by tightening the rule that should have caught it via workspace doctrine + mechanical lint (this plan's Phase 5), and (3) by filing the canonical upstream contribution (Qor-logic#58) so the rule tightens across every workspace running qor-logic, not just FailSafe.
