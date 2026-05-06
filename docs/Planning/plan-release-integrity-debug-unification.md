# Plan: Release Integrity & Debug Unification (Amended v2)

**Current Version**: v4.9.6
**Target Version**: v4.9.7
**Change Type**: hotfix
**Risk Grade**: L1

## Open Questions

None — all workstreams diagnosed with evidence from debugging sessions.

---

## Workstream A: Release Integrity — Fix Broken Promises

B158-B160 (v4.9.5 seal) and B167-B169 (v4.10.0 seal) were marked complete but their changes were either overwritten by subsequent work or never wired.

### Phase A1: Fix setupConsoleRoutes Dead Code

**Affected Files**

- `FailSafe/extension/src/roadmap/ConsoleServer.ts` — wire `setupConsoleRoutes()` into `setupRoutes()`

**Changes**

Already applied: line 251: `this.setupConsoleRoutes();` added before `registerSpaFallback()`.

### Phase A2: Fix CSS Selectors for Consolidated Tabs

**Affected Files**

- `FailSafe/extension/src/roadmap/ui/command-center.css` — update `#brainstorm` selectors

**Changes**

Already applied:
- `#brainstorm.tab-panel.active` → `.cc-subview-content:has(.cc-canvas)`
- `#brainstorm.active` → `.cc-subview-content:has(.cc-canvas)`
- `#brainstorm .cc-canvas` → `.cc-subview-content .cc-canvas`

### Phase A3: Fix Overflow Logic for Workspace Sub-views

**Affected Files**

- `FailSafe/extension/src/roadmap/ui/command-center.js` — remove tab-level overflow hack

**Changes**

Already applied: always set `overflow-y: auto`, brainstorm overflow handled by CSS `:has(.cc-canvas)`.

### Phase A4: Add Missing Backlog Entries

**Affected Files**

- `docs/BACKLOG.md` — add B158-B160, annotate B167-B169

**Changes**

Already applied.

### Phase A5: Bundle Guard

**Affected Files**

- `FailSafe/extension/scripts/bundle.cjs` — add post-copy verification

**Changes**

After `copyDir(src/roadmap/ui, dist/extension/ui)` at line 135-138, add:

```javascript
const srcHtml = fs.readFileSync(path.join(root, 'src', 'roadmap', 'ui', 'command-center.html'), 'utf8');
const distHtml = fs.readFileSync(path.join(distDir, 'extension', 'ui', 'command-center.html'), 'utf8');
const srcTabs = (srcHtml.match(/class="tab-btn/g) || []).length;
const distTabs = (distHtml.match(/class="tab-btn/g) || []).length;
if (srcTabs !== distTabs) {
  console.error(`BUNDLE ERROR: tab count mismatch (src=${srcTabs}, dist=${distTabs})`);
  process.exit(1);
}
```

---

## Workstream B: Debug Unification — Two-Phase /qor-debug

### Phase B1: Merge Agent Capabilities

**Affected Files**

- `.claude/agents/qor-fixer.md` — add 3 new checks to Layer 1 and Layer 2

**Changes**

Add to Layer 1 (Dijkstra) bullet list after "Structural anti-patterns":

```markdown
- **Build artifact staleness**: Check if dist/out copies match source files (timestamps, content hash)
- **Reachability verification**: Confirm key functions/methods are invoked, not orphaned dead code
```

Add to Layer 2 (Hamming/Shannon) bullet list after "Input validation audit":

```markdown
- **Silent fallback detection**: Check if catch-all handlers (SPA fallbacks, bare catch blocks) mask routing or data failures
```

### Phase B2: Update /qor-debug Skill for Two-Phase Dispatch

**Affected Files**

- `.claude/skills/qor-debug/SKILL.md` — replace single-agent dispatch with two-phase protocol

**Changes**

Replace the `<skill>` XML block with:

```xml
<skill>
  <trigger>/qor-debug</trigger>
  <phase>IMPLEMENT / SUBSTANTIATE / GATE</phase>
  <persona>Fixer</persona>
  <dispatch>
    <phase1>ql-fixer — Rapid root-cause (4-layer analysis on reported symptoms)</phase1>
    <phase2>ql-fixer — Residual sweep (4-layer analysis on fixed state)</phase2>
  </dispatch>
  <output>Two-phase diagnosis: root-cause fix + residual sweep report</output>
</skill>
```

Replace Step 2 content with two-phase protocol describing Phase 1 (root-cause on symptoms) and Phase 2 (residual sweep on fixed state, resumed agent).

### Phase B3: Fix Duplicate Frontmatter

**Affected Files**

- `.claude/skills/qor-debug/SKILL.md` — merge two `---` blocks into one

**Changes**

Replace lines 1-12 (two frontmatter blocks) with single block:

```yaml
---
name: ql-debug
description: >
  Two-phase diagnostic system combining rapid root-cause identification with
  residual sweep verification. Prevents cascading AI debugging damage by
  enforcing four mandatory analysis layers before any code change.
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash
---
```

---

## Workstream C: Audit Remediation (V1-V3)

Address VETO violations from Gate Tribunal Entry #240.

### Phase C1: Extract SreTemplate Section Builders

**Affected Files**

- `FailSafe/extension/src/roadmap/routes/templates/SreTemplate.ts` — decompose `buildSreConnectedHtml`

**Changes**

Extract a shared color helper and 4 section builder functions from `buildSreConnectedHtml` (currently 81 lines → target: main function ≤25 lines, each helper ≤20 lines).

**1. Add `thresholdColor` helper** (fixes V2, V3 — eliminates nested ternaries on lines 89, 111):

```typescript
function thresholdColor(pct: number): string {
  if (pct >= 80) return "#3dd68c";
  if (pct >= 50) return "#f0b840";
  return "#f06868";
}
```

**2. Extract `buildPoliciesHtml(policies)`** (~10 lines):

Takes `s.policies`, returns the policy rows HTML string. Moves lines 76-83 out of the main function.

**3. Extract `buildTrustHtml(trustScores)`** (~12 lines):

Takes `s.trustScores`, returns trust score rows with meter bars. Moves lines 86-96. Uses `thresholdColor()`.

**4. Extract `buildSliHtml(sli)`** (~15 lines):

Takes `s.sli`, returns the SLI card HTML. Moves lines 98-104 data prep + lines 124-136 template.

**5. Extract `buildAsiHtml(asiCoverage)`** (~15 lines):

Takes `s.asiCoverage`, returns ASI coverage card HTML. Moves lines 107-117 data prep + lines 149-152 template. Uses `thresholdColor()`.

**6. Slim `buildSreConnectedHtml`** to assembler (~20 lines):

```typescript
function buildSreConnectedHtml(s: AgtSreSnapshot): string {
  return `<!DOCTYPE html>...<style>${SRE_STYLES}</style>...
<div class="sre-panel">
  ${buildSliHtml(s.sli)}
  ${buildPoliciesHtml(s.policies)}
  ${buildTrustHtml(s.trustScores)}
  ${buildAsiHtml(s.asiCoverage)}
</div>...</html>`;
}
```

**Unit Tests**

- `src/test/roadmap/SreRoute.test.ts` — existing tests cover `buildSreHtml`. Add:
  - `thresholdColor returns green/yellow/red at boundaries` (80, 50, 49)
  - `buildPoliciesHtml returns empty message when no policies`
  - `buildAsiHtml calculates coverage percentage correctly`

---

## Workstream D: Phase Tracker Stability

Fix the SHIELD lifecycle tracker resetting to "Plan" / "None yet" during skill execution.

### Phase D1: Cache Last Known Governance State

**Affected Files**

- `FailSafe/extension/src/roadmap/ConsoleServerHub.ts` — add cache to `buildGovernancePhase`

**Changes**

Add a module-level cache variable and return it on failure instead of IDLE:

```typescript
let lastKnownGovState: GovernanceState | null = null;

export function buildGovernancePhase(workspaceRoot: string): GovernanceState {
  const ledgerPath = path.join(workspaceRoot, "docs", "META_LEDGER.md");
  const idle: GovernanceState = { current: "IDLE", recentCompletions: [], nextSteps: [], activeAlerts: [] };
  if (!fs.existsSync(ledgerPath)) return idle;
  try {
    const content = fs.readFileSync(ledgerPath, "utf-8");
    const state = buildGovernanceState(content);
    lastKnownGovState = state;
    return state;
  } catch (err) {
    console.warn("[GovernancePhase] Failed to read META_LEDGER:", (err as Error).message);
    return lastKnownGovState ?? idle;
  }
}
```

This is the minimal fix: on successful read, cache the result. On failure, serve the cached state. Only fall back to IDLE if no successful read has ever occurred.

### Phase D2: Tail-Read Optimization

**Affected Files**

- `FailSafe/extension/src/roadmap/ConsoleServerHub.ts` — read only the tail of META_LEDGER
- `FailSafe/extension/src/roadmap/services/GovernancePhaseTracker.ts` — `parseMetaLedger` already handles partial content (entries are self-contained blocks)

**Changes**

Replace `fs.readFileSync(ledgerPath, "utf-8")` with a tail-read that gets the last ~4KB:

```typescript
function readLedgerTail(filePath: string, bytes: number = 4096): string {
  const stat = fs.statSync(filePath);
  if (stat.size <= bytes) return fs.readFileSync(filePath, "utf-8");
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(bytes);
  fs.readSync(fd, buf, 0, bytes, stat.size - bytes);
  fs.closeSync(fd);
  return buf.toString("utf-8");
}
```

Update `buildGovernancePhase` to use `readLedgerTail(ledgerPath)` instead of `fs.readFileSync`. The tail content will contain the last ~5-10 entries, which is sufficient for `getCurrentPhase` (needs only the latest) and `recentCompletions` (needs last 5).

### Phase D3: Increase File Watcher Debounce

**Affected Files**

- `FailSafe/extension/src/roadmap/ConsoleServer.ts` — increase META_LEDGER watcher debounce

**Changes**

At line ~590 where `watchMetaLedger` sets the debounce timeout, increase from 500ms to 1500ms:

```typescript
// Was: setTimeout(() => { ... }, 500);
setTimeout(() => { ... }, 1500);
```

**Unit Tests**

- `src/test/roadmap/ConsoleServerHub.test.ts` — add:
  - `buildGovernancePhase returns cached state on read failure`
  - `buildGovernancePhase updates cache on successful read`
  - `readLedgerTail reads full file when under threshold`
  - `readLedgerTail reads only tail bytes when file exceeds threshold`

---

## Summary

| Phase | Scope | Status | Blocker |
|-------|-------|--------|---------|
| A1 | Wire setupConsoleRoutes | Applied | B170 |
| A2 | Fix CSS selectors | Applied | B171 |
| A3 | Fix overflow logic | Applied | B172 |
| A4 | Add missing backlog entries | Applied | — |
| A5 | Bundle guard | Pending | B173 |
| B1 | Merge agent capabilities | Pending | B174 |
| B2 | Update /qor-debug skill | Pending | B174 |
| B3 | Fix duplicate frontmatter | Pending | B174 |
| C1 | Extract SreTemplate section builders | Pending | D28-D29 |
| D1 | Cache last known governance state | Pending | B175 |
| D2 | Tail-read optimization | Pending | B176 |
| D3 | Increase file watcher debounce | Pending | B177 |
