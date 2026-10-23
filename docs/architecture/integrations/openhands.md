# OpenHands integration contract

Contract id: `openhands` (registry row `integration-contract-openhands`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

Legacy review (historical input, never edited): `docs/research/integrations/INTEGRATION_OPENHANDS_CONTRACT_REVIEW.md`. It proposed an event observer plus a start-of-run policy gate (confirmation policy and security analyzer); the shipped code imports an exported run after the fact and has no start-of-run gate. It honours the review's rule against mid-run policy mutation by never touching a run.

**Owned files:**
- `FailSafe/extension/src/integrations/agent-observe/openhands-observer.ts`
- `FailSafe/extension/src/integrations/agent-observe/openhands-import.ts`
- `FailSafe/extension/src/integrations/agent-observe/openhands-signing.ts`
- `FailSafe/extension/src/integrations/agent-observe/openhands-evidence.ts`
- `FailSafe/extension/src/extension/openhands-import-command.ts`

Shared modules it uses (reconciled in the portfolio, not owned here): `FailSafe/extension/src/integrations/agent-observe/` (the health mapping), `FailSafe/extension/src/extension/agent-observe-command.ts` (command registration), `FailSafe/extension/src/extension/integrationEvidenceWiring.ts`, `FailSafe/extension/src/integrations/catalog/`.

## Customer job

A team that ran an OpenHands agent wants the run's actions in the same timeline as the rest of its governance evidence, so a reviewer can see what the agent did, without FailSafe running or steering OpenHands.

## Measurable value

Metric: the share of imported events that are signed for this install and folder and deduplicated on re-import; on main every saved line is signed and keyed `FailSafe/extension/src/integrations/agent-observe/openhands-import.ts:304-309` (`record.sig = signRecord(key, folder, record);`).
Baseline: no usage data is collected, so import counts and review time saved are unverified.

## Why not simply ask an agent

An agent can summarise a pasted export, but the summary is neither deduplicated across re-exports, nor signed against later edits of the workspace file, nor shown beside the FailSafe timeline. This import does those things and keeps only closed-set fields, so export text cannot carry a credential into the record.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:71` (`SDK — https://docs.openhands.dev/sdk/api-reference/openhands.sdk.agent`) lists the OpenHands Cloud API and SDK references; the row is still under "Planned (backlog)", which is stale (unverified as to when it was last refreshed beyond its header date).
The event mapping follows the SDK event schema and says the inner action layout was not fully confirmed from the rendered docs `FailSafe/extension/src/integrations/agent-observe/openhands-observer.ts:14-18` (`field layout (where per-tool args live)`).

## Privileges and scopes

Credential: none for OpenHands; FailSafe reads a file the operator picks `FailSafe/extension/src/extension/openhands-import-command.ts:158-160` (`showOpenDialog({ canSelectMany: false`).
Secret Storage: FailSafe creates and keeps a 32-byte signing key for the evidence file `FailSafe/extension/src/integrations/agent-observe/openhands-signing.ts:131-134` (`randomBytes(32).toString('hex')`).
The signature binds records to this install and folder; it is not tamper-proofing against the person who can read the key `FailSafe/extension/src/integrations/agent-observe/openhands-signing.ts:10-12` (`it is not tamper-proofing`).
No OpenHands API scope is used; a live connection to an OpenHands server would need one and is marked requires separate approval (unverified: none is implemented).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| timeline-evidence | verified-shipped | `runOpenHandsImport` `FailSafe/extension/src/extension/openhands-import-command.ts:62` (`export async function runOpenHandsImport(`) | `FailSafe/extension/src/extension/agent-observe-command.ts:100` (`registerCommand('failsafe.openhands.observe'`) | `FailSafe/extension/src/test/integrations/agent-observe/openhands-import.extensionHost.test.ts` (installed-vscode) | Scripted file picker and confirmation; real timeline service and panel `FailSafe/extension/src/test/integrations/agent-observe/openhands-import.extensionHost.test.ts:1-4` (`the real AgentTimelineService fed by the evidence reader`) |
| timeline-display | verified-shipped | `OpenHandsEvidenceReader` `FailSafe/extension/src/integrations/agent-observe/openhands-evidence.ts:108` (`export class OpenHandsEvidenceReader {`) | `FailSafe/extension/src/extension/integrationEvidenceWiring.ts:99` (`const reader = new OpenHandsEvidenceReader(keys`) | `FailSafe/extension/src/test/integrations/agent-observe/openhands-import.extensionHost.test.ts` (installed-vscode) | Only lines that verify are shown `FailSafe/extension/src/integrations/agent-observe/openhands-evidence.ts:5-7` (`a line is shown only when its signature verifies`) |
| version-gate | verified-shipped | `observeOpenHandsRun` `FailSafe/extension/src/integrations/agent-observe/openhands-observer.ts:161` (`export function observeOpenHandsRun(`) | `FailSafe/extension/src/extension/agent-observe-command.ts:100` (`openHandsImportFromVscode(workspaceRoot)`) | `FailSafe/extension/src/test/integrations/agent-observe/agent-observe.test.ts` (unit) | Supported majors 0 and 1 `FailSafe/extension/src/integrations/agent-observe/openhands-observer.ts:29` (`OPENHANDS_SUPPORTED_MAJORS = ['0', '1']`) |
| start-of-run-policy-gate | proposed | none | none | none | The legacy review's v1 gate; nothing connects to a live OpenHands run `FailSafe/extension/src/extension/openhands-import-command.ts:5-6` (`no live run is intercepted`) |
| live-interception | proposed | none | none | none | Observe-only by design `FailSafe/extension/src/integrations/agent-observe/openhands-observer.ts:5-8` (`Never mutates an active`) |

## Inbound fields

From the export: a bare events array or a `{ version, events }` envelope `FailSafe/extension/src/extension/openhands-import-command.ts:112-116` (`A bare events array or a { version, events } envelope.`).
Per event, only kind, verb (from `tool_name`), tool, a risk hint and a parsable time are kept `FailSafe/extension/src/integrations/agent-observe/openhands-observer.ts:136-147` (`riskHint: riskHintFor(riskBasis),`).
Run identity: a conversation or session id when it is a UUID or a long token `FailSafe/extension/src/integrations/agent-observe/openhands-import.ts:102-112` (`export function runIdentityOf(envelope: unknown)`).
From settings: an optional version used only when the export declares none `FailSafe/extension/package.json:578-581` (`used for the supported-version gate when the run export does not declare one`).

## Outbound fields and egress

Repository content: no `FailSafe/extension/src/integrations/agent-observe/openhands-observer.ts:20` (`Pure (no fs/network)`).
Metadata: no network call is made by the import command or the persistence module (unverified beyond reading `openhands-import-command.ts` and `openhands-import.ts`, neither of which imports a network module).
Graph relationships: no `FailSafe/extension/src/extension/openhands-import-command.ts:5-6` (`This is a`).
Governance evidence: no; the evidence file and the transparency summary stay in the workspace `FailSafe/extension/src/integrations/agent-observe/openhands-import.ts:5-8` (`whose only writer is this`).

## Transformations

Export text that is not a short token (for example a flattened command line) is replaced by `unrecognized` `FailSafe/extension/src/integrations/agent-observe/openhands-observer.ts:56-59` (`anything else (a`).
An id that is not a short token is hashed; integer ids are keyed by position `FailSafe/extension/src/integrations/agent-observe/openhands-observer.ts:130-134` (`An id that is not a short token is replaced by its hash`).
The risk hint is high for run, execute, shell and browse verbs and warn for edits `FailSafe/extension/src/integrations/agent-observe/openhands-observer.ts:75-76` (`const HIGH_VERBS = ['run', 'execute', 'cmd'`).
The deduplication key hashes run id and event id, or the file hash and position `FailSafe/extension/src/integrations/agent-observe/openhands-import.ts:116-120` (`export function importKeyFor(`).
Each record is signed with HMAC-SHA256 over the folder's real path and the record's canonical JSON `FailSafe/extension/src/integrations/agent-observe/openhands-signing.ts:7-9` (`Every record line therefore carries an HMAC-SHA256`).

## Persisted artifacts

`.failsafe/logs/openhands-imports.jsonl` in the workspace, one signed record per event, written only after the operator confirms `FailSafe/extension/src/integrations/agent-observe/openhands-import.ts:87-88` (`return path.join(workspaceRoot, '.failsafe', 'logs', EVIDENCE_FILE);`).
Each write is fsynced before the import is reported as saved `FailSafe/extension/src/integrations/agent-observe/openhands-import.ts:228-230` (`fs.fsyncSync(fd);`).
One summary line per import in `.failsafe/logs/transparency.jsonl` `FailSafe/extension/src/integrations/agent-observe/openhands-import.ts:319-324` (`type: 'agent.import.summary'`).
A shared lock directory `openhands-imports.jsonl.lock` while an import runs `FailSafe/extension/src/integrations/agent-observe/openhands-import.ts:269` (`const lockPath = `).
The signing key in VS Code Secret Storage under `failsafe.openhandsEvidenceKey.v1` `FailSafe/extension/src/integrations/agent-observe/openhands-signing.ts:27` (`export const EVIDENCE_KEY_ID = 'failsafe.openhandsEvidenceKey.v1';`).
Health evidence of the last import in VS Code workspace state `FailSafe/extension/src/integrations/catalog/integration-health.ts:51` (`export const HEALTH_STATE_KEY = 'failsafe.integrationHealth.v1';`).

## Graph links

Implemented: each record carries the export's sha256 and, when known, the run id and source event id `FailSafe/extension/src/integrations/agent-observe/openhands-import.ts:304-306` (`importKey, sourceSha256`).
Proposed (not built): run-to-evidence-to-governance edges in the relationship graph of `docs/architecture/INTEGRATION_SCENARIOS.md` scenario 3 (unverified: no code exists).

## Customer UI and actions

Command palette: "FailSafe: Import OpenHands Run (observe)" `FailSafe/extension/package.json:206-207` (`"title": "FailSafe: Import OpenHands Run (observe)"`).
A file picker filtered to JSON `FailSafe/extension/src/extension/openhands-import-command.ts:159` (`'OpenHands run (JSON)': ['json']`).
A modal naming the event count, the high-risk count, what is kept and where it is saved, with one Import button `FailSafe/extension/src/extension/openhands-import-command.ts:129-133` (`as historical evidence?`).
Imported entries appear in the VS Code Agent Timeline panel and the Console Timeline `FailSafe/extension/src/integrations/agent-observe/openhands-evidence.ts:2-3` (`for both the VS Code Agent Timeline panel and the Console Timeline`).
Status: the Console Integrations catalog card `FailSafe/extension/src/roadmap/ui/modules/integration-catalog-renderer.js:196` (`fetch('/api/v1/integrations/catalog')`).

## Governance policy and enforceability limits

Enforced: nothing is written without the modal confirmation `FailSafe/extension/src/extension/openhands-import-command.ts:134` (`if (!ok) return finish({ kind: 'dismissed' }`).
Enforced: an export over 20 MB or 10000 events is refused `FailSafe/extension/src/extension/openhands-import-command.ts:18-19` (`export const MAX_EXPORT_EVENTS = 10_000;`).
Enforced: an unsupported version maps nothing `FailSafe/extension/src/integrations/agent-observe/openhands-observer.ts:162-163` (`observing disabled.`).
Enforced: links under `.failsafe` and hard-linked targets are refused, so the import cannot append to a file outside the workspace `FailSafe/extension/src/integrations/agent-observe/openhands-import.ts:135-136` (`refusing a hard-linked`).
Observed: the record is of a past run; it is not enforcement `FailSafe/extension/src/extension/openhands-import-command.ts:131` (`it is not live enforcement`).
Advisory: whoever can read the Secret Storage entry can sign forged records `FailSafe/extension/src/integrations/agent-observe/openhands-signing.ts:11-12` (`whoever can read the Secret Storage entry can`).

## Failure, offline, stale and permission semantics

Disabled: the command warns and returns `FailSafe/extension/src/extension/openhands-import-command.ts:64-66` (`OpenHands observer is disabled.`).
Unreadable file or invalid JSON records failing / contract on the card `FailSafe/extension/src/integrations/agent-observe/agent-observe-health.ts:27` (`case 'unreadable': return ['failing', 'contract'];`).
An unsupported version records failing / unsupported_version `FailSafe/extension/src/integrations/agent-observe/agent-observe-health.ts:26` (`case 'unsupported-version': return ['failing', 'unsupported_version'];`).
No evidence key installed: the import is refused and nothing is written `FailSafe/extension/src/extension/openhands-import-command.ts:135-137` (`OpenHands import NOT saved`).
An active lock refuses concurrent import; stale modern lock directories use the shared lease recovery. A legacy regular-file lock always blocks until the operator confirms older writers have exited and removes it manually; its age cannot prove abandonment. Mixed-version concurrent imports are not allowed `FailSafe/extension/src/integrations/agent-observe/openhands-import.ts:44-45` (`const LOCK_TIMEOUT_MS`).
Only an export that declares its own version can make the card contract-verified `FailSafe/extension/src/integrations/agent-observe/agent-observe-health.ts:22-25` (`Only a version declared in the export file itself counts toward contract-verified.`).
Offline: the import never needs the network (unverified beyond the module imports named above).
Stale: lines that no longer verify (edited by hand, or written by another install) are ignored and counted `FailSafe/extension/src/extension/openhands-import-command.ts:148` (`could not be verified and were ignored`).

## End-to-end scenario and measurable acceptance

Scenario: enable the integration, import an exported run, confirm, see the events in the Agent Timeline, import the same file again and see zero new events `FailSafe/extension/src/extension/openhands-import-command.ts:151` (`skipped ${result.duplicates} duplicate(s)`).
Metric: a repeat import adds zero lines, and a re-export with one new event adds exactly one (threshold: exact counts) `FailSafe/extension/src/test/integrations/agent-observe/openhands-import.test.ts:154` (`a repeat import adds nothing; a re-export with one new event adds only it`).
Existing test: `FailSafe/extension/src/test/integrations/agent-observe/openhands-import.extensionHost.test.ts:1-4` (`the OpenHands import command logic end to end`) (installed-vscode).
No real OpenHands export has been checked against the mapper; that is open as B230 `docs/BACKLOG.md:586` (`the OpenHands export layout and its run-identity fields are unconfirmed`).
Installed-extension test: no test installs the packaged VSIX and runs this command (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **MAINTAIN**. The historical import is built, signed, deduplicated and tested in the extension host with honest "not live enforcement" wording. The value it can add is capped by the unconfirmed export layout (B230); the start-of-run policy gate the legacy review proposed is a separate, larger investment that should come only with a real OpenHands surface to test against.

## Open defects

`[B230]` validate the OpenHands mapping against real exports `docs/BACKLOG.md:586` (`Validate Jira, Linear, Sentry and OpenHands against live disposable accounts`).
`[B231]` the import's own `wx` lock blocks imports after a crash or when a clone ships the lock file `docs/BACKLOG.md:587` (`imports are refused until the file is deleted by hand`).
The documentation index row is stale (still "Planned") `docs/integrations/INTEGRATION_DOCS_INDEX.md:71` (`#105 (Group C)`).
