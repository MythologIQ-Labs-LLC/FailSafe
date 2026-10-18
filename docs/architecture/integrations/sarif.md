# SARIF import integration contract

Contract id: `sarif` (registry row `integration-contract-sarif`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

Legacy review (historical input, never edited): `docs/research/integrations/INTEGRATION_SEMGREP_SARIF_CONTRACT_REVIEW.md`. It scoped an offline SARIF 2.1.0 parser with strict schema validation, stable dedup keys and provenance, with a local Semgrep runner and GitHub upload later; the shipped code is the offline parser with dedup keys and provenance, accepts any version string starting with 2.1, and has no runner or upload.

**Owned files:**
- `FailSafe/extension/src/integrations/sarif/`
- `FailSafe/extension/src/extension/sarif-command.ts`

Shared modules it uses (reconciled in the portfolio, not owned here): `FailSafe/extension/src/integrations/catalog/`, and the risk register writers `FailSafe/extension/src/roadmap/services/riskImportBatch.ts` and `FailSafe/extension/src/roadmap/services/RiskRegisterManager.ts`.

## Customer job

A developer has a static-analysis report (Semgrep, CodeQL or any SARIF 2.1.0 producer) and wants its findings in the FailSafe risk register, triaged once and not duplicated by the next scan, without uploading code or the report anywhere.

## Measurable value

Metric: findings from one SARIF file present as `sarif:` risks, with a re-import of the same scan upserting rather than duplicating `FailSafe/extension/src/integrations/sarif/sarif-to-risk.ts:2-4` (`the SARIF`).
Baseline: no usage data is collected, so how many findings are triaged through FailSafe is unverified.

## Why not simply ask an agent

An agent can read a SARIF file, but it does not produce stable, deterministic risk ids that survive a re-scan, keep the operator's triage status, or count what failed to write. This path is offline and deterministic.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:28` (`SARIF v2.1.0 spec`) links the OASIS SARIF 2.1.0 specification.
No network API is called: the file text is parsed in process `FailSafe/extension/src/integrations/sarif/sarif-parser.ts:5-7` (`no Semgrep account, no network. Pure (no fs)`).

## Privileges and scopes

Credential: none; the setting describes the import as fully offline `FailSafe/extension/package.json:468-471` (`fully offline — no network`).
File access: the operator picks one `.sarif` or `.json` file in a VS Code open dialog `FailSafe/extension/src/extension/sarif-command.ts:27-31` (`filters: { 'SARIF / JSON': ['sarif', 'json'] },`).
A local Semgrep runner or GitHub SARIF upload would need process or repository write access and is marked requires separate approval (unverified: neither is implemented).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| risk-ingest | verified-shipped | `importSarifText` `FailSafe/extension/src/integrations/sarif/sarif-to-risk.ts:46` (`export function importSarifText(`) | `FailSafe/extension/src/extension/main.ts:238` (`registerSarifImportCommand(context, core.workspaceRoot)`) | `FailSafe/extension/src/test/integrations/sarif/sarif-parser.test.ts` (unit) | Command `FailSafe/extension/package.json:146` (`"command": "failsafe.sarif.import"`) |
| local-semgrep-run | proposed | none | none | none | Not implemented; the parser takes text only `FailSafe/extension/src/integrations/sarif/sarif-parser.ts:6-7` (`callers pass the file text`) |
| github-sarif-upload | proposed | none | none | none | Not implemented (unverified beyond the absence of any network call in the owned files) |

## Inbound fields

From each SARIF run: tool driver name, version, and rule default levels `FailSafe/extension/src/integrations/sarif/sarif-parser.ts:88-97` (`const tool = driver?.name ?? 'unknown';`).
From each result: ruleId, level, message text, and the first location's URI, start line and start column `FailSafe/extension/src/integrations/sarif/sarif-parser.ts:101-109` (`const file = phys?.artifactLocation?.uri ?? null;`).
Locations after the first one of a result are ignored `FailSafe/extension/src/integrations/sarif/sarif-parser.ts:106` (`const phys = res.locations?.[0]?.physicalLocation;`).
A document whose version does not start with 2.1 is refused `FailSafe/extension/src/integrations/sarif/sarif-parser.ts:75-76` (`unsupported SARIF version`).
A result without a ruleId is skipped with a parse warning `FailSafe/extension/src/integrations/sarif/sarif-parser.ts:102` (`result missing ruleId — skipped`).

## Outbound fields and egress

Repository content: no; nothing leaves the machine `FailSafe/extension/src/integrations/sarif/sarif-parser.ts:5-6` (`no network`).
Metadata: no `FailSafe/extension/src/integrations/catalog/integration-catalog.ts:192` (`Fully offline.`).
Graph relationships: no (unverified beyond the absence of any network call in the owned files).
Governance evidence: no; findings are only written to the local register `FailSafe/extension/src/extension/sarif-command.ts:44-47` (`const sink = new RiskRegisterManager(workspaceRoot).importSink();`).

## Transformations

SARIF level maps to severity: error to high, warning to warn, note and none to info, unknown to warn `FailSafe/extension/src/integrations/sarif/sarif-parser.ts:34-39` (`error: 'high',`).
A result without a level takes its rule's default level, then warning `FailSafe/extension/src/integrations/sarif/sarif-parser.ts:103` (`const level = res.level ?? ruleLevels.get(ruleId) ?? 'warning';`).
The dedup key is tool, ruleId, file, line and column `FailSafe/extension/src/integrations/sarif/sarif-parser.ts:110` (`const dedupKey = `).
The risk id is `sarif:` plus the dedup key, and duplicates within one file keep the first occurrence `FailSafe/extension/src/integrations/sarif/sarif-to-risk.ts:25-37` (`first occurrence of each id wins`).
The title is the ruleId and the first 140 characters of the message `FailSafe/extension/src/integrations/sarif/sarif-to-risk.ts:15` (`f.message.slice(0, 140)`).
The file URI is stored as reported; it is not normalised against the workspace (unverified beyond the absence of path handling in `sarifFindingToRisk`).

## Persisted artifacts

Risk records in the workspace risk register `.failsafe/risks/risks.json` `FailSafe/extension/src/shared/risk-store/RiskStore.ts:97` (`this.risksPath = path.resolve(workspaceRoot, ".failsafe", "risks", "risks.json");`).
Each record carries provenance: SARIF version, tool, tool version and ruleId `FailSafe/extension/src/integrations/sarif/sarif-to-risk.ts:19` (`provenance: { sarifVersion: '2.1.0', tool: f.tool, toolVersion: f.toolVersion, ruleId: f.ruleId },`).
Writes go in one register update per 500 findings `FailSafe/extension/src/extension/sarif-command.ts:46-47` (`one register update per 500 findings`).
The SARIF file itself is not copied `FailSafe/extension/src/extension/sarif-command.ts:37` (`text = fs.readFileSync(file, 'utf-8');`).
Health evidence of the last import is kept in VS Code workspace state `FailSafe/extension/src/integrations/catalog/integration-health.ts:51` (`export const HEALTH_STATE_KEY = 'failsafe.integrationHealth.v1';`).

## Graph links

Implemented: each risk records the finding's file, line and column `FailSafe/extension/src/integrations/sarif/sarif-to-risk.ts:21` (`if (f.file) risk.location = { file: f.file, line: f.startLine, column: f.startColumn };`).
Proposed (not built): finding-to-fix and fix-to-receipt edges (unverified: no code exists).

## Customer UI and actions

Command palette: "FailSafe: Import SARIF Findings" `FailSafe/extension/package.json:146-147` (`"title": "FailSafe: Import SARIF Findings"`).
The command is refused with a warning while the setting is off `FailSafe/extension/src/extension/sarif-command.ts:21-25` (`SARIF import is disabled.`).
A summary names the findings, the risks upserted and any parse warnings `FailSafe/extension/src/extension/sarif-command.ts:60-63` (`finding(s) → `).
Status: a Console Integrations catalog card `FailSafe/extension/src/roadmap/ui/modules/integration-catalog-renderer.js:196` (`fetch('/api/v1/integrations/catalog')`).

## Governance policy and enforceability limits

Advisory: an imported finding is a risk record for the operator to triage; it blocks nothing `FailSafe/extension/src/integrations/sarif/sarif-to-risk.ts:5-6` (`WARN-only governance signal`).
Enforced: a re-import never resets the status the operator triaged `FailSafe/extension/src/extension/sarif-command.ts:45-47` (`keepStored: ['status']`).
Enforced: the command does nothing until the setting is on `FailSafe/extension/src/extension/sarif-command.ts:21` (`if (!cfg.get<boolean>('integrations.sarif.enabled', false)) {`).
Not enforced: SARIF schema validation beyond the version prefix and array shapes (unverified beyond the checks in `parseSarif`).

## Failure, offline, stale and permission semantics

Unreadable file: an error message and a contract health failure `FailSafe/extension/src/extension/sarif-command.ts:38-41` (`healthFromSarifImport({ unreadable: true })`).
Malformed JSON, a wrong version or no runs array: a warning and nothing written `FailSafe/extension/src/integrations/sarif/sarif-parser.ts:69-80` (`malformed JSON: `).
A failing register write is counted and the remaining findings continue `FailSafe/extension/src/integrations/sarif/sarif-to-risk.ts:53-55` (`a failing register write must not abort the`).
Failed writes are reported with a reason `FailSafe/extension/src/extension/sarif-command.ts:54-58` (`could not be written to the Risk Register`).
Offline: the import never needs the network `FailSafe/extension/src/integrations/sarif/sarif-parser.ts:5-6` (`no network`).
Stale: findings fixed since the last scan are not closed by a new import (unverified beyond the absence of any delete or close in `importSarifText`).

## End-to-end scenario and measurable acceptance

Scenario: enable the setting, run the command, pick a Semgrep SARIF file, and find one `sarif:` risk per unique finding; import the same file again and find the same ids with the triaged status kept `FailSafe/extension/src/extension/sarif-command.ts:45-47` (`a re-import never resets the status the operator triaged`).
Metric: a re-run produces the same ids and a throwing sink is counted failed (threshold: exact) `FailSafe/extension/src/test/integrations/conformance/contracts.ts:67-71` (`a re-run produced different ids (not idempotent)`).
Existing test: `FailSafe/extension/src/test/integrations/sarif/sarif-parser.test.ts` drives `importSarifText` with fixtures (unit) `FailSafe/extension/src/test/integrations/sarif/sarif-parser.test.ts:3` (`import { sarifFindingsToRisks, importSarifText }`).
Installed-extension test: none runs the command with a picked file in VS Code (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **MAINTAIN**. The offline import is small, deterministic, keeps triage and is tested; it sends nothing anywhere. Closing findings that disappear from a later scan and a local Semgrep run are possible later additions, not repairs.

## Open defects

No open B-item is specific to SARIF import on main (unverified: searched `docs/BACKLOG.md` for "SARIF" at c36b9ee2).
