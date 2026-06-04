# SARIF import integration

> One-line: FailSafe ingests an offline SARIF 2.1.0 scan file and turns each finding into a WARN-only, idempotent risk record the operator can triage.

- **Pattern:** ingest
- **Direction:** read-only (local file → FailSafe risk register)
- **Status:** shipped v5.4.x (#99)
- **Official docs:** SARIF v2.1.0 spec — https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
- **Backlog:** #99 (B-INT-9)

## What it does
Parses a SARIF 2.1.0 result file produced by Semgrep CE or any 2.1.0 producer — fully offline, no account, no network — and normalizes each result into a `SarifFinding`. Findings are mapped onto FailSafe risk records and upserted into the risk register keyed by a stable dedup key, so re-importing the same scan updates rather than duplicates. All imported risks land as `status: 'open'` (WARN-only) — the import is a governance signal for operator triage, never an automated gate or write to code.

## Configuration
This integration has no settings. It runs only when the operator explicitly invokes the import command and picks a file; nothing reads, watches, or networks otherwise.

## Security
No auth and no secrets — the source is a local file the operator selects, read once via `fs.readFileSync` in the command layer. The pure logic (`sarif-parser.ts`, `sarif-to-risk.ts`) performs no fs, network, or process work, so it is deterministically fixture-tested. Malformed JSON, a non-2.1.0 version, or a missing `runs[]` array returns structured `errors` rather than throwing; individual malformed results are skipped, not fatal. Imported risks are read-only WARN records (`status: 'open'`); FailSafe writes nothing back to the scanned code.

## Command / wiring
`FailSafe: Import SARIF Findings` (`failsafe.sarif.import`) — opens a file picker (`.sarif` / `.json`), parses the file offline, and upserts each finding as a risk via `RiskRegisterManager.upsertRisk`, reporting `N finding(s) → M risk(s) upserted` plus any parse-warning count. Registered by `registerSarifImportCommand` in `src/extension/sarif-command.ts`.

## Files
- `sarif-parser.ts` — pure logic: `parseSarif(text)` → normalized `SarifFinding[]` + `errors[]`
- `sarif-to-risk.ts` — pure logic: `sarifFindingToRisk`, `sarifFindingsToRisks`, and the `importSarifText(text, upsert)` orchestrator (injectable upsert sink)
- command wiring: `src/extension/sarif-command.ts`
- test: `src/test/integrations/sarif/sarif-parser.test.ts`

## Verified surface
External names depend on the SARIF v2.1.0 spec (link above):

- `version` — document-level field; must start with `2.1` (§3.13.2)
- `runs[]` — top-level array of runs (§3.13.4)
- `runs[].tool.driver.name` / `.version` — producing tool identity (§3.19.8)
- `runs[].tool.driver.rules[].id` + `.defaultConfiguration.level` — rule-default severity (§3.49)
- `runs[].results[].ruleId` (or `.rule.id`), `.level`, `.message.text` (§3.27)
- `runs[].results[].locations[].physicalLocation.artifactLocation.uri` + `.region.startLine` / `.startColumn` (§3.28 / §3.30)
- `level` → severity mapping: `error`→high, `warning`→warn, `note`/`none`→info (§3.27.10)
