# AUDIT REPORT — v5.0.0 Release-Blocker Plans (Consolidated)

**Tribunal Date**: 2026-04-27T00:00:00Z
**Target**: 6 plans closing 17 release-blocker issues (#46–#62, tracker #63)
**Plans**:
- `plan-v5-round1-code-bugs.md` (Plan A)
- `plan-v5-round2-install-ux.md` (Plan B)
- `plan-v5-round3a-hub-data-flow.md` (Plan C)
- `plan-v5-round3b-activity-recorders.md` (Plan D)
- `plan-v5-round3c-analysis-services.md` (Plan E)
- `plan-v5-round4-integration-probes.md` (Plan F)

**Auditor**: The QoreLogic Judge (solo audit; adversarial mode)

---

## OVERALL VERDICT: PASS (all 6 plans)

| Plan | Verdict | Risk Grade | Observations |
|------|---------|------------|--------------|
| A — Code bugs | **PASS** | L1 | 1 |
| B — Install UX | **PASS** | L2 | 1 |
| C — Hub data flow | **PASS** | L2 | 2 |
| D — Activity recorders | **PASS** | L2 | 2 |
| E — Analysis & services | **PASS** | L2 | 1 |
| F — Integration probes | **PASS** | L2 | 2 |

**Total non-blocking observations: 9.** None rise to VETO threshold. Each plan is implementation-ready; observations are reconciled during `/qor-implement`.

---

## Plan A — R1 Code Bugs (#46, #47, #48)

### Verdict: PASS

### Audit results

- **Security**: PASS. URL semantic rename, math helper, install handler progress — no auth changes, no new subprocess, no credentials. Drift guards on the URL constants prevent regression.
- **OWASP**:
  - A03 (Injection): URL constants are static; drift guards verify exact strings. PASS.
  - A04 (Insecure Design): Install button progressive states + post-success refresh broadcast eliminate the silent-failure mode that triggered #48.
  - A05–A08: not applicable.
- **Ghost UI**: PASS. "Show Output" message handler is concretely specified (Plan B Phase 1 wires it). Every progressive step maps to a real subprocess invocation. No "coming soon" placeholders.
- **Razor**: PASS. New `phase-progress.js` ~10 LOC. New `about-pro-command.test.ts` ~30 LOC. Plan A's edits push `installSkillsHandler.ts` from 30 → ~60 LOC (under 250). `settings.js` already at ~200 LOC; Plan A Phase 3 adds ~50 lines of progress rendering, pushing toward 250 — see Observation #1.
- **Dependency**: PASS. No new packages.
- **Macro architecture**: PASS. `phase-progress.js` is correctly placed under `ui/modules/` as a pure helper. No cyclic imports.
- **Orphan detection**: PASS. All 3 new test files discovered by Mocha glob; new constants/helpers imported by existing code.

### Observations

1. **`settings.js` Razor approach** — Plan A Phase 3 adds inline progress rendering that may push the file toward 250 L. Implementer should extract the QorLogic install card into a dedicated module (`src/roadmap/ui/modules/install-skills-card.js`) if the file crosses 220 L during implementation. Mandate: track in a follow-up `/qor-refactor` if not addressed inline.

---

## Plan B — R2 Install UX (#49, #50)

### Verdict: PASS

### Audit results

- **Security**: PASS. QuickPick is VS Code native; user selections flow through list-form spawn (existing). `workspaceState` persistence is sandboxed per workspace.
- **OWASP**: A03 (injection): user-selected host enum is validated to a closed set (`'claude' | 'codex' | 'kilo-code' | 'gemini'`); scope to `'repo' | 'global'`. No string concatenation into shell. PASS.
- **Ghost UI**: PASS. Both prompt and defaults command registered with concrete handlers. Cancel paths explicitly do nothing (no half-states).
- **Razor**: PASS. `installSkillsOptions.ts` ~60 L. `installSkillsReport.ts` ~80 L. Both well under 250.
- **Dependency**: PASS. No new packages.
- **Macro architecture**: PASS. Helpers live next to the handler in `src/extension/`. Clear single-responsibility.
- **Orphan detection**: PASS.

### Observations

2. **`installSkillsHandler.ts` orchestration size** — after Plan A Phase 3 + Plan B Phase 1 layering, the handler closure could exceed 40 L. Implementer should extract `runInstall(ingestor, options, callbacks)` as a top-level async function. Plan B already names this in the handler signature; this observation is a reminder to keep it as a separate fn, not nested.

---

## Plan C — R3a Hub Data Flow (#51, #52, #53, #54)

### Verdict: PASS

### Audit results

- **Security**: PASS. All readers are pure functions over local markdown/JSON files. No new network calls. No write paths.
- **OWASP**:
  - A03: tolerant heading regexes broaden input matching but emit strict typed output; no injection vector.
  - A04: post-install discovery verification eliminates the false-success mode that triggered #54. Failed verification surfaces inline (per Plan B Phase 1).
  - A08: `risks.json` is parsed via `JSON.parse` with try/catch. Already in place; no new deserialization risk.
- **Ghost UI**: PASS. `failsafe.verifyQorLogicSkills` registered with concrete output-channel handler. Empty states distinguish "source missing" from "source empty".
- **Razor**:
  - `verifyQorLogicSkills.ts` ~50 L. `hostPaths.ts` ~10 L. `RiskRegisterManager.ts` becomes ~80 L (was ~30 L). All under 250.
  - **Pre-existing debt warning (Observation #3)**: `ConsoleServer.ts` is already ~1255 L (post-Fix #1 + de-theater pass). Plan C adds canonical-field updates + debug logging at ~20 lines. Net change is small but file remains 5x over Razor 250 L limit. **This worsens an accepted-debt situation, same as v5 plan audit.** Not a VETO because (a) the file pre-dates this plan, (b) the additions are sequential calls (no nesting), (c) further decomposition is the existing v4.10.0 / v5 follow-on scope.
- **Dependency**: PASS. No new packages.
- **Macro architecture**: PASS. Single canonical `HOST_SKILL_DIRS` map shared by installer and discovery — *eliminates* the dual-source-of-truth that caused #54. Strong architectural correctness.
- **Orphan detection**: PASS.

### Observations

3. **`ConsoleServer.ts` Razor debt accumulation** — pre-existing condition. Plan C adds ~20 L to a 1255 L file. Mandate: schedule `/qor-refactor` for buildHubSnapshot before v5.1.0. Out of scope for v5.0.0 release-blocker work.
4. **Risk record `sourceType` field naming** — Plan C requires `sourceType: 'persisted' | 'backlog-fallback'` on every risk. The existing `BacklogReader.parseOpenItems()` returns records without this field. Implementer must add the field as part of Phase 1 — do not let UI guess. (Already flagged as Plan C OQ #4.)

---

## Plan D — R3b Activity Recorders (#55, #56, #58)

### Verdict: PASS

### Audit results

- **Security**:
  - **A01 / Privacy concern (Observation #5)**: `TimelineRecorder` and `AgentRunLifecycle` persist to `.failsafe/logs/timeline.jsonl` and `.failsafe/runs/{active,completed}/`. Plan must NOT log file contents — only paths and event metadata. Otherwise these JSONL/JSON files become a privacy-leaking shadow log of the user's source code. Implementer must verify event payloads exclude `document.getText()` or equivalent.
- **OWASP**:
  - A04 (Insecure Design): per-event persistence + idle-window close + canonical hub fields fix the silent-failure mode underlying all 3 issues. Honest empty states distinguish "monitoring disabled" from "no events captured".
  - A08: JSONL parsing in TimelineRecorder.getRecent must use try/catch per line (don't fail the whole read on one malformed entry). Plan implies this; implementer must enforce.
- **Ghost UI**: PASS. Each recorder has a concrete persistence target + canonical hub field + UI consumer. All 3 empty states are explicit.
- **Razor**:
  - `TimelineRecorder.ts` ~60 L, `AuditLogAggregator.ts` ~80 L: both fine.
  - **`AgentRunLifecycle.ts` ~120 L estimated (Observation #6)** — borderline if persistence (writeFile + readDir + JSON parse + idle-tick) lands in one file. Implementer should extract `RunPersistence` helper if the lifecycle file approaches 200 L during implementation.
- **Dependency**: PASS. No new packages.
- **Macro architecture**: PASS. Recorders correctly placed (`src/sentinel/`, `src/governance/`). One-way data flow: EventBus → Recorder → Persistence → Hub → UI. No cycles.
- **Orphan detection**: PASS.

### Observations

5. **No document content in persisted JSONL** — implementer must assert in tests that timeline entries persist `path` only (not file contents) and run-lifecycle records persist `filesTouched` (paths only). Add a regression test that writes a file with secrets and verifies the JSONL has no leaked content.
6. **`AgentRunLifecycle.ts` Razor headroom** — keep under 200 L; extract `RunPersistence` helper if approaching. Three concerns interleave (active-run state, idle-window timer, disk persistence) — natural extraction boundary.

---

## Plan E — R3c Analysis & Service Refactors (#57, #59, #60)

### Verdict: PASS

### Audit results

- **Security**: PASS. ShadowGenome and ComplianceSnapshot are read-only over existing event/ledger data. Brainstorm transcripts persist to gitignored `.failsafe/brainstorm/` (existing pattern).
- **OWASP**:
  - A04: Compliance metrics with explicit `unavailable | empty | available` states eliminate the "false confidence" pattern that triggered #59. Genome debounced analysis runs on real captured signals (not on schedule), avoiding empty-data assumptions.
- **Ghost UI**: PASS. `failsafe.analyzeShadowGenomeNow` registered with handler. Compliance UI renders three distinct visual states.
- **Razor**:
  - `GenomeEventClassifier.ts` ~30 L. `ComplianceSnapshotBuilder.ts` ~120 L. Both fine.
  - `ShadowGenomeManager.ts` modifications are additive (~30 L). Existing file size unchanged.
- **Dependency**: PASS.
- **Macro architecture**: PASS. Classifier separated from manager (Simple Made Easy: data classification ≠ pattern analysis ≠ persistence). Compliance builder centralizes provenance. Brainstorm service becomes the single source of truth for the Mindmap.
- **Orphan detection**: PASS.

### Observations

7. **`ProvenancedMetric<T>` shape consistency** — Plan E introduces this type for Compliance. Plan D introduces `AuditLogEntry` with overlapping `source` field. Implementer must ensure both interfaces use the same `source` enum values (or document the divergence). Cross-plan type drift is the path to #51-style gaps.

---

## Plan F — R4 Integration Probes (#61, #62)

### Verdict: PASS

### Audit results

- **Security**:
  - **A03 Injection (Observation #8)**: `OllamaProbe.detectOllama(endpoint)` builds `${endpoint.replace(/\/$/, '')}/api/version`. The `endpoint` comes from a user-configurable setting (`failsafe.ai.ollamaEndpoint`). Implementer must validate that the endpoint URL parses via `new URL(endpoint)` and uses `http:` or `https:` scheme only. Reject other schemes (`file:`, `javascript:`, etc.) before constructing the fetch URL.
  - **Privacy / SSRF (low)**: probe sends GET only and reads only the `version` field. If a malicious endpoint were configured, the leak surface is which workspace probed it (low). Acceptable risk; the validation in Observation #8 mitigates the obvious cases.
  - Voice: `getUserMedia({ audio: true })` is the standard browser permission flow. Mic permission separation from Whisper readiness is a UX correctness fix, not a security change.
- **OWASP**:
  - A04 (Insecure Design): "Never default to connected" eliminates the false-positive that triggered #61. Voice state machine eliminates the silent-failure modes that triggered #62.
- **Ghost UI**: PASS. Manual refresh button registered. All 5 voice states explicit. No dead click targets.
- **Razor**:
  - `OllamaProbe.ts` ~70 L. `OllamaStatusCache` ~30 L. Voice modifications are surgical edits to existing files.
  - **`prep-bay.js` headroom (Observation #9)** — guards inside `_drawModalVisualizer()` add ~10 L; existing file size already significant. Verify under 250 L during implementation.
- **Dependency**: PASS. Native `fetch` (Node 18+). No new npm packages.
- **Macro architecture**: PASS. `src/sentinel/integrations/` is a new sub-directory establishing a clean layer for external probes. Future probes (LM Studio, llama.cpp) drop in here without touching `LLMClient`.
- **Orphan detection**: PASS.

### Observations

8. **Endpoint scheme validation in `detectOllama`** — wrap the input URL through `new URL()` and reject non-http(s) schemes before constructing the fetch URL. Add a unit test for `javascript:`, `file:`, and `data:` URLs.
9. **`prep-bay.js` size** — verify under 250 L during implementation; if approaching, extract `ModalVisualizer` controller into its own module.

---

## Cross-Plan Audit Observations

These cut across multiple plans:

A. **Hub field naming canonicalization (Plans C, D, E)** — Plans C, D, E each add new hub snapshot fields. They MUST agree on names and shapes:
- `latestAudit`, `recentReleases`, `risks`, `transparencyEvents` (C)
- `timelineEntries`, `auditLogEntries`, `activeRuns`, `completedRuns` (D)
- `genomePatterns`, `unresolvedGenomePatterns`, `complianceSnapshot`, `brainstorm` (E)

The `auditLogEntries` field overlaps between Plan D Phase 2 (#56) and Plan E Phase 2 (#59). Implementer must implement once (in Plan D Phase 2 timeline) and consume in Plan E Phase 2 (Compliance reads the same field). **This is structurally correct; just naming-discipline matters.**

B. **Test counts and target — projected 759 → ~851 passing** across all 6 plans. Verify aggregate per-plan count after each plan completes; do not let test debt accumulate.

C. **CHANGELOG entries** — every plan asks for "Fixed" bullets in v5.0.0 entry. Implementer must consolidate all bullets into one v5.0.0 section, not 6 separate sub-entries.

D. **Pre-existing `ConsoleServer.ts` Razor debt** — observations #3 (Plan C) cites this. All plans add to this file. Schedule `/qor-refactor` decomposition for v5.1.0.

---

## Mandated Next Action

**`/qor-implement` per plan, in dependency order:**

```
Plan A → Plan B (depends on A)
       → Plan C (independent)
              → Plan D (extends C's canonical fields)
              → Plan E (shares D's AuditLogEntry shape)
Plan F (independent of all)
```

A and F can run in parallel branches if multi-track. Otherwise serial: A → B → C → D → E → F.

Each plan's `/qor-implement` reconciles the observations listed under its verdict; cross-plan observations (A–D) are reconciled at the boundaries.

---

## Chain Integrity

Per project memory, `docs/META_LEDGER.md` is Merkle-chained. This audit does not edit the ledger directly. The `/qor-substantiate` phase appends gate-tribunal entries via `calculate-session-seal.py` after each plan's implementation completes — six entries total before v5.0.0 tag.
