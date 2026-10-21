# Agent config injection integration contract

Contract id: `agent-config-injection` (registry row `integration-contract-agent-config-injection`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

No legacy review in `docs/research/integrations/` covers agent config injection.

**Owned files:**
- `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts`

Not owned here: the callers `FailSafe/extension/src/governance/GovernanceCeremony.ts` (the "Set Up Agent Governance" picker) and `FailSafe/extension/src/qorelogic/FrameworkSync.ts` (the "Sync Framework" propagation), which also do other work.

## Customer job

A developer using several AI coding agents in one repository wants each agent's instruction file to carry the same short FailSafe governance notice, written once by FailSafe and removable as a block, instead of editing seven instruction files by hand.

## Measurable value

Metric: the number of detected, ungoverned agents whose instruction file gains the governance block after one run of "Set Up Agent Governance"; the picker lists exactly the detected agents without governance `FailSafe/extension/src/governance/GovernanceCeremony.ts:75-81` (`if (detection.detected && !this.registry.hasGovernance(system)) {`).
Baseline: runs are not counted; unverified.

## Why not simply ask an agent

An agent can edit its own instruction file, but it does not know the other six agents' file locations, and its edit is not idempotent or removable as a marked block. This writes one marked block per agent, replaces it in place on a re-run, and keeps the rest of the file.

## API documentation

none: the targets are local instruction files; their paths are listed in the source `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:15-25` (`export const AGENT_CONFIG_MAP: Record<string, InjectionConfig> = {`).
`docs/integrations/INTEGRATION_DOCS_INDEX.md:62` (`Devin Desktop (formerly Windsurf)`) has a Devin Desktop row; no row documents the other six agents' instruction-file locations (unverified as to whether the Devin row names the rules folder).

## Privileges and scopes

No credential, no network, no process: only reads and writes of files under the workspace root `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:47-49` (`const fullPath = path.join(this.workspaceRoot, config.configPath);`).
Writing outside the workspace would need a new privilege and is marked requires separate approval (unverified: nothing does).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| inject-governance-block | verified-shipped | `AgentConfigInjector` `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:42-49` (`async inject(system: QorLogicSystem): Promise<void> {`) | `FailSafe/extension/src/extension/bootstrapAdvancedCommands.ts:219` (`vscode.commands.registerCommand("failsafe.onboardAgent", () =>`) | `FailSafe/extension/src/test/qorelogic/AgentConfigInjector.test.ts` (unit) | Also reached through `failsafe.syncFramework` `FailSafe/extension/src/extension/commands.ts:669` (`registerCommand("failsafe.syncFramework"`) |
| remove-governance-block | shipped-inert | `AgentConfigInjector` `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:52-58` (`async remove(system: QorLogicSystem): Promise<void> {`) | none | none | Absent call site: its only caller `removeGovernance` is never called `FailSafe/extension/src/governance/GovernanceCeremony.ts:43` (`async removeGovernance(): Promise<void> {`); the unit test calls `remove` directly |
| inject-all-registered-systems | shipped-inert | `AgentConfigInjector` `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:35-40` (`async injectAll(): Promise<void> {`) | none | none | Absent call site: its only caller `syncAll` has no caller `FailSafe/extension/src/qorelogic/FrameworkSync.ts:53-67` (`await injector.injectAll();`) |

## Inbound fields

The agent system's id and display name from the system registry `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:43-48` (`this.buildGovernanceBlock(manifest.name, config.format)`).
The existing content of the target file, if it exists `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:88-90` (`content = await fs.promises.readFile(filePath, 'utf-8');`).

## Outbound fields and egress

Repository content: no network egress; the block is written into workspace files `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:92-93` (`await fs.promises.writeFile(filePath, merged, 'utf-8');`).
Metadata: no network egress (unverified beyond the absence of any network import in the owned file).
Graph relationships: no `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:1-5` (`import * as fs from 'fs';`).
Governance evidence: no; the text is a notice to the agent, not evidence `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:62-64` (`Use /qor-status to check current governance state.`).

## Transformations

The block is two lines between start and end markers, with a heading naming the agent `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:79` (`return [GOVERNANCE_MARKER_START, `).
For Cursor the block is wrapped in `.mdc` front matter that applies to all files `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:67-72` (`'globs: **/*',`).
An existing block is stripped before the new one is appended, so a re-run replaces it `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:103-109` (`private stripExistingBlock(content: string): string {`).

## Persisted artifacts

One block in each selected agent's file: `.claude/CLAUDE.md`, `.github/copilot-instructions.md`, `.cursor/rules/failsafe.mdc`, `codex.md`, `.windsurfrules`, `.devin/rules/failsafe.md` or `GEMINI.md` `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:16-24` (`gemini: { configPath: 'GEMINI.md', format: 'markdown' },`).
Missing parent folders are created `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:83-86` (`await fs.promises.mkdir(dir, { recursive: true });`).

## Graph links

Implemented: none (unverified: no record links an injected block to an agent run or intent).
Proposed: agent to instruction file to governance evidence, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: not built).

## Customer UI and actions

Command palette: "FailSafe: Set Up Agent Governance" `FailSafe/extension/package.json:317-318` (`"title": "FailSafe: Set Up Agent Governance"`).
A multi-select picker of detected, ungoverned agents, then a count message `FailSafe/extension/src/governance/GovernanceCeremony.ts:26-40` (`Governance applied to ${selected.length} system(s).`).
`failsafe.syncFramework` is registered but has no command-palette contribution in `package.json` (unverified beyond a search of `package.json` for that id) `FailSafe/extension/src/extension/commands.ts:669` (`registerCommand("failsafe.syncFramework"`).

## Governance policy and enforceability limits

Advisory: the block tells every agent "All writes are subject to EnforcementEngine (FailSafe Extension)", which overstates what FailSafe enforces; filed as [B256] `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:63` (`All writes are subject to EnforcementEngine (FailSafe Extension).`).
Advisory: an agent may ignore its instruction file; nothing checks that the agent read the block (unverified beyond the owned file).
Observed: the write follows any existing file at the target path without a symlink check (unverified as a risk; the owned file uses plain `fs.promises.writeFile`) `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:93` (`await fs.promises.writeFile(filePath, merged, 'utf-8');`).

## Failure, offline, stale and permission semantics

Unknown agent id: skipped without writing `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:44-45` (`if (!config) return;`).
Only a start marker without an end marker: the block is not stripped and a second block is appended (unverified by a test; follows from the code) `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:106` (`endIdx === -1) return content;`).
A failed write rejects the promise to the caller; the ceremony has no error message for it (unverified beyond the owned callers).
Offline has no effect; nothing is fetched (unverified beyond the owned file).

## End-to-end scenario and measurable acceptance

Scenario: run "Set Up Agent Governance", pick Claude Code, and find one marked block in `.claude/CLAUDE.md` that a second run leaves unchanged `FailSafe/extension/src/test/qorelogic/AgentConfigInjector.test.ts:57` (`inject() is idempotent (inject twice produces same result)`).
Metric: exactly one governance block per selected agent file after any number of runs (threshold: one) `FailSafe/extension/src/test/qorelogic/AgentConfigInjector.test.ts:41` (`inject() creates governance block in config file`).
Existing test: `FailSafe/extension/src/test/qorelogic/AgentConfigInjector.test.ts:28` (`fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-injector-test-'))`) (unit), which writes into a temporary folder, not a VS Code workspace.
Installed-extension test: no test runs the command in VS Code (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **COMPLETE**. The injector is small and tested, but its text overclaims enforcement (B256), its removal path has no command, and the bulk path is unreachable. Correct the text, wire or delete removal and the bulk path, then maintain.

## Open defects

[B256] the injected text overstates enforcement `FailSafe/extension/src/qorelogic/AgentConfigInjector.ts:63` (`All writes are subject to EnforcementEngine`).
Removal has no reachable command (observed, not filed) `FailSafe/extension/src/governance/GovernanceCeremony.ts:43` (`async removeGovernance(): Promise<void> {`).
