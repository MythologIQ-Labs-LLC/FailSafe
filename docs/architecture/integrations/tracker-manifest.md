# Tracker manifest generator integration contract

Contract id: `tracker-manifest` (registry row `integration-contract-tracker-manifest`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

No legacy review in `docs/research/integrations/` covers the tracker manifest generator.

**Owned files:**
- `FailSafe/extension/src/extension/tracker-manifest-command.ts`
- `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts`
- `FailSafe/extension/src/roadmap/tracker/manifest-generator.ts`
- `FailSafe/extension/src/roadmap/tracker/manifest-categorize.ts`
- `FailSafe/extension/src/roadmap/tracker/manifest-bicameral.ts`

Two owned modules have other importers that are not part of this integration: the governance sidecar uses `resolveRepoSlug` (local git only) and the tracker config uses the pure `agentsFromPrograms` `FailSafe/extension/src/roadmap/tracker/governance-sidecar.ts:24` (`import { resolveRepoSlug } from './manifest-sources';`).

## Customer job

A developer opening the Development Tracker on a repository with no hand-written plan wants a first draft of programs, phases, verticals and decisions built from the repository's merged pull requests and CHANGELOG, with the categories confirmed by them rather than guessed silently.

## Measurable value

Metric: time from an empty tracker to a reviewed `docs/roadmap/programs.yaml`; the command produces the draft in one run `FailSafe/extension/src/extension/tracker-manifest-command.ts:122-123` (`registerCommand('failsafe.generateTrackerManifest'`).
Baseline: runs and editing time are not measured; unverified.

## Why not simply ask an agent

An agent can summarise PR titles, but this command reads the full merged-PR list through the developer's own `gh` login, applies a deterministic grouping, makes the developer confirm the taxonomy before writing, and refuses to overwrite an existing manifest without a modal confirmation.

## API documentation

none: the command uses the GitHub CLI `gh pr list` rather than an HTTP API `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts:35-37` (`'pr', 'list', '-R', repo, '--state', 'merged', '--limit', '300',`).
`docs/integrations/INTEGRATION_DOCS_INDEX.md` has no row for the GitHub CLI (unverified as to whether one is intended).

## Privileges and scopes

Credential: none read by FailSafe; `gh` runs under the developer's existing GitHub CLI authentication `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts:6-8` (`No token`).
Scope: read-only pull-request metadata (number, title, merge time) `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts:37` (`'--json', 'number,title,mergedAt',`).
The `gh` and `git` executables come from the trusted resolvers, never from the workspace `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts:34-35` (`the child inherits the process cwd, so the resolver excludes it`).
Writing to GitHub would need write scopes and is marked requires separate approval (unverified: nothing writes to GitHub here).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| merged-pr-ingest | shipped-unverified | `fetchMergedPrs` `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts:32` (`export function fetchMergedPrs(repo: string): GeneratorPr[] {`) | `FailSafe/extension/src/extension/tracker-manifest-command.ts:133-135` (`async () => gatherManifestSources(workspaceRoot),`) | none | The only test that calls it checks that a planted `gh` is never run `FailSafe/extension/src/test/shared/exec/trustedExecutable.adversarial.test.cjs:120` (`fetchMergedPrs with the workspace as process cwd never runs the planted gh`); the parse of a real `gh` answer is untested |
| draft-manifest-generation | verified-shipped | `generateTrackerManifest` `FailSafe/extension/src/roadmap/tracker/manifest-generator.ts:162` (`export function generateTrackerManifest(sources: ManifestSources): TrackerManifest {`) | `FailSafe/extension/src/extension/tracker-manifest-command.ts:146` (`const base = generateTrackerManifest(sources);`) | `FailSafe/extension/src/test/roadmap/tracker/manifest-generator.test.ts` (unit) | Command contributed `FailSafe/extension/package.json:125` (`"command": "failsafe.generateTrackerManifest"`) |
| operator-taxonomy-confirmation | verified-shipped | `applyCategoryDecisions` `FailSafe/extension/src/roadmap/tracker/manifest-categorize.ts:36` (`export function applyCategoryDecisions(base: TrackerManifest`) | `FailSafe/extension/src/extension/tracker-manifest-command.ts:159-161` (`const manifest = applyCategoryDecisions(draft, decisions);`) | `FailSafe/extension/src/test/roadmap/tracker/manifest-categorize.test.ts` (unit) | The QuickPick shell `collectCategoryDecisions` has no test (unverified beyond a search of `src/test`) |
| bicameral-enrichment | verified-shipped | `enrichManifestWithBicameral` `FailSafe/extension/src/roadmap/tracker/manifest-bicameral.ts:82` (`export function enrichManifestWithBicameral(`) | `FailSafe/extension/src/extension/tracker-manifest-command.ts:155` (`enrichManifestWithBicameral(base, briefs)`) | `FailSafe/extension/src/test/roadmap/tracker/manifest-bicameral.test.ts` (unit) | Runs only when a Bicameral client is connected `FailSafe/extension/src/extension/main.ts:243-245` (`() => consoleServer?.getBicameralClient() ?? null,`) |

## Inbound fields

From `gh pr list`: number, title and merged time of up to 300 merged PRs `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts:36-42` (`.map((p) => ({ number: p.number, title: p.title, mergedAt: p.mergedAt }));`).
From git: the origin remote URL, reduced to a GitHub owner and repository `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts:21-25` (`github\.com`).
From the workspace: `CHANGELOG.md` `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts:48-50` (`path.join(workspaceRoot, 'CHANGELOG.md')`).
From Bicameral, when connected: feature briefs with decisions, status and code bindings `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts:79-80` (`return await client.history();`).

## Outbound fields and egress

Repository content: no to GitHub; the `gh` call carries only the repository slug and query flags `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts:35-38` (`'pr', 'list', '-R', repo`).
Repository content to the local Bicameral daemon: yes, the workspace path is passed to Bicameral's `ingest` before its history is read, when Bicameral is connected `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts:77-79` (`await client.ingest({ repoPath: workspaceRoot });`).
Metadata: the repository slug, sent to GitHub by `gh` when the developer runs the command `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts:6-7` (`Network egress happens ONLY here, only when the operator runs the command`).
Graph relationships: no (unverified: nothing is written to any graph by this command beyond Bicameral's own ingest).
Governance evidence: no `FailSafe/extension/src/extension/tracker-manifest-command.ts:166-167` (`fs.writeFileSync(target, banner + yaml.dump(manifest, { lineWidth: 120 }), 'utf-8');`).

## Transformations

Programs come from conventional-commit scopes with at least two substantive PRs; the rest fold into Other `FailSafe/extension/src/roadmap/tracker/manifest-generator.ts:53-57` (`A scope is a`).
Substantive PR types are feat, fix, perf and refactor `FailSafe/extension/src/roadmap/tracker/manifest-generator.ts:32` (`const SUBSTANTIVE = new Set(['feat', 'fix', 'perf', 'refactor']);`).
With Bicameral briefs, verticals and decisions are replaced by the decision graph's feature areas `FailSafe/extension/src/roadmap/tracker/manifest-bicameral.ts:1-6` (`its decision graph gives the`).
Dropped programs' phases are reassigned to the fold target or Other `FailSafe/extension/src/roadmap/tracker/manifest-categorize.ts:31-34` (`Dropped programs' phases are reassigned to`).

## Persisted artifacts

One file, `docs/roadmap/programs.yaml`, with a banner that says it is a draft `FailSafe/extension/src/extension/tracker-manifest-command.ts:163-167` (`# Generated by FailSafe`).
Nothing else is written by FailSafe; Bicameral's ingest may update Bicameral's own store (unverified: owned by the bicameral contract).

## Graph links

Implemented: phases carry PR numbers and decisions carry Bicameral decision ids into the manifest `FailSafe/extension/src/roadmap/tracker/manifest-bicameral.ts:55` (`export function decisionsFromBriefs(`).
Proposed: links from tracker phases to intents, commits and receipts, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: not built).

## Customer UI and actions

Command palette: "FailSafe: Generate Tracker Manifest (from PRs + CHANGELOG)" `FailSafe/extension/package.json:125-126` (`Generate Tracker Manifest (from PRs + CHANGELOG)`).
Pickers to keep, drop, fold and rename programs and verticals `FailSafe/extension/src/extension/tracker-manifest-command.ts:53-57` (`Tracker programs — your call. Uncheck any to drop.`).
An Open button on the result message opens the file `FailSafe/extension/src/extension/tracker-manifest-command.ts:175-177` (`if (open === 'Open') {`).

## Governance policy and enforceability limits

Enforced: an existing manifest is overwritten only after a modal Overwrite `FailSafe/extension/src/extension/tracker-manifest-command.ts:124-130` (`if (choice !== 'Overwrite') return;`).
Enforced: cancelling any required picker writes nothing `FailSafe/extension/src/extension/tracker-manifest-command.ts:159-160` (`if (!decisions) return; // operator cancelled — write nothing`).
Advisory: the output is a draft for review; nothing checks it against the tracker taxonomy in `docs/roadmap/tracker-config.yaml` (unverified beyond the owned files).
Observed: the Bicameral ingest runs before the developer confirms anything, as soon as the command gathers sources `FailSafe/extension/src/extension/tracker-manifest-command.ts:150-152` (`gatherBicameralBriefs(getBicameralClient(), workspaceRoot)`).

## Failure, offline, stale and permission semantics

No GitHub origin: a warning and nothing written `FailSafe/extension/src/extension/tracker-manifest-command.ts:137-139` (`No GitHub origin remote found`).
`gh` missing, offline, unauthenticated or failing: the PR list is empty, silently `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts:43-45` (`return [];`).
No PRs and no CHANGELOG: a warning and nothing written `FailSafe/extension/src/extension/tracker-manifest-command.ts:141-143` (`No merged PRs (via gh) or CHANGELOG found`).
Bicameral unavailable or failing: falls back to git and CHANGELOG only `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts:81-82` (`return [];`).
`gh` has a 20 second timeout and a 16 MB output cap `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts:38` (`timeout: 20000, maxBuffer: 16 * 1024 * 1024`).
Stale: the manifest is not refreshed when new PRs merge; it is regenerated only on request (unverified: no watcher exists in the owned files).

## End-to-end scenario and measurable acceptance

Scenario: run the command in a GitHub repository with merged PRs, keep the suggested programs, and open a `programs.yaml` whose phases match the substantive PRs `FailSafe/extension/src/test/roadmap/tracker/manifest-generator.test.ts:38` (`phases: one per substantive PR`).
Metric: one phase per substantive PR and no program with fewer than two PRs (threshold: exact) `FailSafe/extension/src/test/roadmap/tracker/manifest-generator.test.ts:27` (`programs come from scopes with >=2 substantive PRs`).
Existing test: `FailSafe/extension/src/test/roadmap/tracker/manifest-generator.test.ts:59` (`generateTrackerManifest assembles a complete, schema-shaped draft`) (unit).
Installed-extension test: no test runs the command with a real `gh` (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **MAINTAIN**. The pure generator, categorizer and enrichment are tested; the command shell and the `gh` parse are not. Add one recorded-output test for `fetchMergedPrs` and decide whether the Bicameral ingest should wait for the developer's confirmation.

## Open defects

No open B-item is specific to the tracker manifest generator (unverified: searched `docs/BACKLOG.md` for "generateTrackerManifest" and "manifest-sources").
The Bicameral ingest runs before any confirmation (observed, not filed) `FailSafe/extension/src/roadmap/tracker/manifest-sources.ts:79` (`await client.ingest({ repoPath: workspaceRoot });`).
