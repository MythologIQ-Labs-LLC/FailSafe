# Plan: v5.0.0 Round 3a — Hub Data Flow Contract

**Issues closed:** #51 (Latest Audit), #52 (Recent Releases), #53 (Risks Backlog Fallback), #54 (QorLogic Skills Discovery)
**Tracker:** #63
**Plan author:** /qor-plan, 2026-04-27
**Status:** implementation-ready

## Open Questions

1. **Field-name precedent** — issue comments warn against drift across `releases` / `recentReleases` / `releaseHistory` etc. Pre-implementation: grep every UI module that reads hub data; produce a single canonical-name table; apply across all 4 surfaces in this plan.
2. **Compatibility adapter at hub boundary** — if some UI modules already read different field names, do we add a one-line adapter (`hub.releases ?? hub.recentReleases`) at the snapshot boundary, or hard-rename UI consumers? Default: hard-rename (no compat layer; clean code).
3. **Debug-trace flag name** — what setting toggles the hub-debug logging? Default: `failsafe.debug.hubData` (boolean, default false). Confirm before adding to package.json schema.
4. **Backlog fallback source field** — issue #53 wants `source: 'docs/BACKLOG.md'` and `sourceType: 'backlog-fallback'` on each fallback risk. The existing `BacklogReader` returns `source: 'backlog'`. Reconcile naming.

## Affected Surfaces

```text
NEW src/test/roadmap/hub-snapshot-contract.test.ts                # hub-field naming integration test
NEW src/test/roadmap/risks-source-precedence.test.ts              # 4 fixture states for #53
NEW src/test/roadmap/qorlogic-discovery-verification.test.ts      # post-install discovery contract for #54
NEW src/extension/commands/verifyQorLogicSkills.ts                # `FailSafe: Verify QorLogic Skill Install`

MOD src/roadmap/services/AuditReportReader.ts                     # tolerant heading match; debug log
MOD src/roadmap/services/ChangelogReader.ts                       # tolerant heading match; debug log
MOD src/roadmap/services/RiskRegisterManager.ts                   # 4-state source precedence; sourceType label
MOD src/roadmap/services/BacklogReader.ts                         # adjust fallback metadata to plan-shape
MOD src/roadmap/services/SkillDiscovery.ts                        # discovery-roots map shared with installer
MOD src/qorlogic/QorLogicSkillIngestor.ts                         # canonical HOST_SKILL_DIRS export
MOD src/roadmap/ConsoleServer.ts                                  # canonical hub field names; debug log gate; post-install verify
MOD src/roadmap/ui/modules/overview.js                            # read `hubData.latestAudit`, `hubData.recentReleases` (canonical)
MOD src/roadmap/ui/modules/risks.js                               # read `hubData.risks` (canonical)
MOD src/roadmap/ui/modules/operations.js                          # read `hubData.recentReleases` if it surfaces; ledger summary already canonical
MOD src/extension/commands.ts                                     # register verifyQorLogicSkills command
MOD package.json                                                  # debug-flag setting + verify command
MOD FailSafe/extension/CHANGELOG.md / CHANGELOG.md
```

---

## Phase 1 — Hub-field naming + tolerant readers (#51, #52, #53)

**Goal:** every hub field has one canonical name. Every UI module reads exactly that name. Every reader uses tolerant input matching but emits a strict output shape. The four "no X" empty-state symptoms collapse to one root-cause fix and one snapshot contract.

### Unit Tests (write first)

- `src/test/roadmap/hub-snapshot-contract.test.ts` (new)
  - For each canonical field, the test asserts:
    - The field exists on `buildHubSnapshot()` output.
    - The field's type matches its TypeScript interface.
    - No legacy alias coexists (`releases`, `audit`, `auditReport`, `riskList`).
  - Canonical fields:
    - `latestAudit: AuditSnapshot | null`
    - `recentReleases: ReleaseEntry[]`
    - `risks: RiskRecord[]`
    - `transparencyEvents: TransparencyEvent[]`
    - `bootstrapState: { skillsInstalled, governanceInitialized, workspaceName, systemState }`
    - `ledgerSummary: LedgerSummary`
- `src/test/roadmap/audit-report-reader.test.ts` (extend)
  - Heading tolerance: parses `Verdict: PASS`, `**Verdict:** PASS`, `Gate Verdict: PASS`. All normalize to `verdict: 'PASS'`.
  - Path candidates: reader tries `<ws>/.failsafe/governance/AUDIT_REPORT.md` (canonical) and `<ws>/AUDIT_REPORT.md` (compat fallback).
- `src/test/roadmap/changelog-reader.test.ts` (extend)
  - Heading tolerance: parses `## [5.0.0] - 2026-04-27`, `## 5.0.0 - 2026-04-27`, `## v5.0.0 - 2026-04-27`. All normalize to `version: '5.0.0'`.
  - Reader uses `<workspaceRoot>/CHANGELOG.md` only (NOT extension CHANGELOG).
- `src/test/roadmap/risks-source-precedence.test.ts` (new)
  - Fixture A: no `risks.json` + 20 BACKLOG open items → returns 20 fallback risks (sourceType `backlog-fallback`).
  - Fixture B: `risks.json` = `{ "risks": [] }` + 20 BACKLOG open items → returns 20 fallback risks.
  - Fixture C: `risks.json` has 2 stored risks + 20 BACKLOG open items → returns 2 stored risks (no fallback).
  - Fixture D: no `risks.json` + no BACKLOG → returns `[]`.
  - Stored risks always carry `sourceType: 'persisted'`.

### Changes

`src/roadmap/ConsoleServer.ts` — add a `hubDataDebug()` helper gated on `failsafe.debug.hubData`. Every reader call site logs path, exists, count when the flag is on.

`src/roadmap/services/AuditReportReader.ts` — broaden the heading regex to match the three forms; try both path candidates; log resolution under the debug flag.

`src/roadmap/services/ChangelogReader.ts` — broaden the version-heading regex to match `[5.0.0]` / `5.0.0` / `v5.0.0`; assert `workspaceRoot` joined `CHANGELOG.md` (no extension fallback).

`src/roadmap/services/RiskRegisterManager.ts`:

```ts
async getRisks(): Promise<RiskRecord[]> {
  const stored = await this.readStoredRisks().catch(() => []);
  if (stored.length > 0) return stored.map(addPersistedSourceType);
  const backlog = await this.readBacklogFallback().catch(() => []);
  return backlog.map(addBacklogFallbackSourceType);
}
```

`src/roadmap/services/BacklogReader.ts` — fallback risk records carry `source: 'docs/BACKLOG.md'` and `sourceType: 'backlog-fallback'`.

`overview.js`, `risks.js`, `operations.js` — only read canonical names. Remove any reads of legacy aliases.

`package.json`:

```json
"failsafe.debug.hubData": {
  "type": "boolean",
  "default": false,
  "description": "Log hub-snapshot reader resolution to the FailSafe output channel."
}
```

### CI / validation

```bash
cd FailSafe/extension
npm test
```

Manual on FailSafe repo workspace: Latest Audit card shows PASS verdict; Recent Releases shows 5.0.0 down to 4.9.5; Risks tab shows backlog fallback when no stored risks.

Manual on a fresh workspace: All three show honest empty states.

---

## Phase 2 — QorLogic skills discovery contract (#54)

**Goal:** install + discovery share one canonical host→directory map. After install, a verification pass confirms the discovery layer sees the freshly-written skills. A diagnostic command reports per-root counts. If install completes but discovery sees zero `qor-*` skills, the install reports failure (no false success).

### Unit Tests (write first)

- `src/test/roadmap/qorlogic-discovery-verification.test.ts` (new)
  - `HOST_SKILL_DIRS` is exported from a single canonical location (likely `src/qorlogic/hostPaths.ts`); both `QorLogicSkillIngestor` and `SkillDiscovery` import it.
  - Mock-install writes 3 SKILL.md files under `<ws>/.claude/skills/qor-foo/` etc.; discovery returns 3 `qor-*` skills with `source: qor-logic` provenance.
  - When install reports success but no `qor-*` skill exists under any expected root, the verification step throws with a message including the searched roots.
- `src/test/qorlogic/QorLogicSkillIngestor.test.ts` (extend)
  - Ingestor calls `verifyDiscovery(report)` after writing files; report fails if discovery returns zero `qor-*` skills.

### Changes

`src/qorlogic/hostPaths.ts` (new):

```ts
export const HOST_SKILL_DIRS: Record<QorLogicHost, string> = {
  claude: '.claude/skills',
  codex: '.codex/skills',
  'kilo-code': '.kilocode/skills',
  gemini: '.gemini/skills',
};
```

`src/qorlogic/QorLogicSkillIngestor.ts` — import `HOST_SKILL_DIRS`; remove any local copy of host→path mapping.

`src/roadmap/services/SkillDiscovery.ts` — when scanning host directories, use `HOST_SKILL_DIRS` so discovery and install agree.

`src/qorlogic/QorLogicSkillIngestor.ts` — after each per-host install, verify by scanning `HOST_SKILL_DIRS[host]` and counting `qor-*` skills:

```ts
const verified = await verifyDiscovery(workspaceRoot, host);
if (verified.skillCount === 0) {
  return { ok: false, host, error: 'install completed but discovery found 0 qor-* skills' };
}
```

`src/extension/commands/verifyQorLogicSkills.ts` (new) — `FailSafe: Verify QorLogic Skill Install`:

```ts
async function verifyQorLogicSkills(ws: string): Promise<void> {
  const report = await diagnose(ws);
  outputChannel.appendLine('--- QorLogic Discovery Diagnostic ---');
  outputChannel.appendLine(`workspaceRoot: ${ws}`);
  for (const host of HOSTS) {
    const root = path.join(ws, HOST_SKILL_DIRS[host]);
    const exists = fs.existsSync(root);
    const qorCount = exists ? countQorSkills(root) : 0;
    const missingProvenance = exists ? countMissingSourceYml(root) : 0;
    outputChannel.appendLine(`  ${host}: root=${root} exists=${exists} qor=${qorCount} missingSOURCE.yml=${missingProvenance}`);
  }
  outputChannel.appendLine(`qor-logic version: ${report.packageVersion ?? 'not detected'}`);
  outputChannel.show(true);
}
```

`src/extension/commands.ts` — register the diagnostic command.

`package.json` — contributes the command:

```json
{ "command": "failsafe.verifyQorLogicSkills", "title": "FailSafe: Verify QorLogic Skill Install" }
```

After successful install, ingestor broadcasts `{ type: 'hub.refresh', reason: 'qorlogic-skills-installed' }` (already done in Plan A Phase 3 — verify the broadcast triggers Skills tab re-render).

### CI / validation

Manual: install from a fresh workspace → run `FailSafe: Verify QorLogic Skill Install` → output channel lists exact roots and counts. Skill cards on the Skills tab show `source: qor-logic` and the synthesized provenance.

---

## Aggregate verification

```bash
cd FailSafe/extension
npm run lint
npm run compile
npx vscode-test --extensionDevelopmentPath . --extensionTestsPath ./out/test/suite/index
```

Per-phase additions: +12, +5 = **+17 new tests** (target: 785 → 802 after Plans A+B+C).

Manual smoke (FailSafe repo + fresh workspace):
- Latest Audit, Recent Releases, Risks all populated correctly per workspace.
- After `Install QorLogic Skills`, Skills tab lists `qor-*` cards with provenance.
- `FailSafe: Verify QorLogic Skill Install` output matches reality.

CHANGELOG.md (root + extension) under v5.0.0 "Fixed":
- Latest Audit / Recent Releases / Risks now populate from workspace artifacts (was empty even when present).
- QorLogic skills become visible in Skill Discovery after install (verified via post-install discovery pass).
- New diagnostic: `FailSafe: Verify QorLogic Skill Install`.
