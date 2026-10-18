# SHIELD receipts integration contract

Contract id: `shield-receipts` (registry row `integration-contract-shield-receipts`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is a recommendation for the owner, not a decision.

No legacy review in `docs/research/integrations/` covers SHIELD receipts; the GitHub review belongs to the github-checks contract.

**Owned files:**
- `FailSafe/extension/src/integrations/shield-receipts/`

Not owned here: the only consumer, `publishVerifiedShieldCheck` in `FailSafe/extension/src/integrations/github-checks/shield-check-publish.ts` (github-checks), which has no production caller (B216).

## Customer job

A team that merges on a GitHub check wants that check to say SHIELD PASS only when the exact commit is the Seal commit of a Qor-logic session whose audit and substantiate artifacts are present, untampered and current, so a green check is evidence rather than a label.

## Measurable value

Metric: the share of SHIELD PASS checks backed by a receipt that verifies all 18 steps; by design no receipt can verify on main, because the default chain status is UNAVAILABLE `FailSafe/extension/src/integrations/shield-receipts/shield-receipt-verifier.ts:13-14` (`success is unreachable in production by design`).
Baseline: zero verified receipts on main (unverified as a measured count; it follows from the default above).

## Why not simply ask an agent

An agent can say a commit passed review, but it cannot bind that claim to one commit SHA, one repository and one API host, check HMAC tags on the gate artifacts, and prove from git history that the commit is the single-parent commit that introduced the session seal. That binding is the whole value.

## API documentation

`docs/integrations/INTEGRATION_DOCS_INDEX.md:59` (`Checks: https://docs.github.com/en/rest/checks/runs`) lists the GitHub Checks documentation used by the consumer; the receipt itself is a local file format defined in code `FailSafe/extension/src/integrations/shield-receipts/shield-receipt.ts:15` (`export const SHIELD_RECEIPT_SCHEMA = 'failsafe.shield-receipt/v1';`).

## Privileges and scopes

Network: none; the evidence source reads only local git and files, and blocks lazy fetches from partial clones `FailSafe/extension/src/integrations/shield-receipts/workspace-evidence-source.ts:6-7` (`GIT_NO_LAZY_FETCH=1`).
The receipt binds the GitHub API host string (default api.github.com) but this module sends nothing to it `FailSafe/extension/src/integrations/shield-receipts/shield-receipt-verifier.ts:99` (`apiHost = 'api.github.com',`).
Keys: a receipt key of at least 32 bytes from an injected provider; no production provider is wired `FailSafe/extension/src/integrations/shield-receipts/shield-receipt-verifier.ts:63-66` (`the receipt key is shorter than 32 bytes`).
File reads stay under `.qor/gates`, `.qor/session/keys` and `.failsafe/shield-receipts`, with no symlink or junction below the workspace root `FailSafe/extension/src/integrations/shield-receipts/workspace-evidence-source.ts:46-48` (`no path component below the workspace root may be a symlink or junction`).
Publishing a SHIELD check needs `checks:write` and is marked requires separate approval (unverified: no command publishes it).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| verify-receipt | shipped-inert | `verifyShieldReceipt` `FailSafe/extension/src/integrations/shield-receipts/shield-receipt-verifier.ts:94` (`export async function verifyShieldReceipt(`) | none | none | Absent call site: its only caller `publishVerifiedShieldCheck` has no production caller, filed as [B216] `FailSafe/extension/src/integrations/github-checks/shield-check-publish.ts:119` (`const verify = a.verify ?? verifyShieldReceipt;`); unit-tested in `FailSafe/extension/src/test/integrations/shield-receipts/shield-receipt-verifier.test.ts` |
| issue-receipt | shipped-inert | `issueShieldReceipt` `FailSafe/extension/src/integrations/shield-receipts/shield-receipt-verifier.ts:157` (`export async function issueShieldReceipt(`) | none | none | Absent call site: no source file outside the folder imports it (unverified beyond a search of `FailSafe/extension/src`) |
| workspace-evidence-source | shipped-inert | `createWorkspaceEvidenceSource` `FailSafe/extension/src/integrations/shield-receipts/workspace-evidence-source.ts:190` (`export function createWorkspaceEvidenceSource(`) | none | none | Absent call site: no production module constructs it (unverified beyond a search of `FailSafe/extension/src`) |
| native-chain-status | proposed | none | none | none | The default is UNAVAILABLE until a native ledger verifier exists `FailSafe/extension/src/integrations/shield-receipts/shield-receipt-verifier.ts:44` (`export const unavailableChainStatus: NativeChainStatus`) |

## Inbound fields

From git: HEAD, the origin URL, parents, the shallow flag, `docs/META_LEDGER.md` at a commit and its history `FailSafe/extension/src/integrations/shield-receipts/shield-evidence.ts:18-33` (`export interface ShieldEvidenceSource {`).
From files: Qor gate artifacts and their sidecars, the per-session Qor key and the receipt JSON `FailSafe/extension/src/integrations/shield-receipts/workspace-evidence-source.ts:268-279` (`async readQorSessionKey(sessionId) {`).
From the receipt: schema, API host, repository, commit SHA, session id, Qor version, audit and substantiate fields, issue time and signature `FailSafe/extension/src/integrations/shield-receipts/shield-receipt.ts:17-25` (`export interface ShieldReceiptBody {`).

## Outbound fields and egress

Repository content: no `FailSafe/extension/src/integrations/shield-receipts/workspace-evidence-source.ts:4-7` (`Git reads go through createSafeGit`).
Metadata: no network egress from this folder; a verified receipt would be handed to the github-checks publisher, which is unwired `FailSafe/extension/src/integrations/github-checks/shield-check-publish.ts:121-125` (`const res = await postCheckRun(d.payload, target, token, a.post, d.authority);`).
Graph relationships: no (unverified: no graph code exists).
Governance evidence: yes in principle, as the check-run payload built from a verified receipt; no on main, since nothing calls the publisher (B216) `FailSafe/extension/src/integrations/github-checks/shield-check-publish.ts:110` (`export async function publishVerifiedShieldCheck(`).

## Transformations

Gate artifacts are LF-normalized before hashing so CRLF checkouts verify the same `FailSafe/extension/src/integrations/shield-receipts/qor-provenance.ts:3-5` (`Gate artifacts are LF-normalized before hashing and`).
The receipt signature is HMAC-SHA256 over the canonical JSON of every field `FailSafe/extension/src/integrations/shield-receipts/shield-receipt.ts:5-7` (`sig = HMAC-SHA256(key`).
Issuance takes only the session id from the ledger; every other field comes from verified artifacts, git or arguments `FailSafe/extension/src/integrations/shield-receipts/shield-receipt-verifier.ts:139-141` (`The session id is the only value taken from the ledger`).

## Persisted artifacts

`.failsafe/shield-receipts/<commitSha>.json`, outside git, written atomically through a temporary file `FailSafe/extension/src/integrations/shield-receipts/workspace-evidence-source.ts:280-292` (`await renameWithRetry(tmp, target);`).
A receipt is written only when every check passes `FailSafe/extension/src/integrations/shield-receipts/shield-receipt-verifier.ts:155-156` (`Writes nothing unless every check passes.`).

## Graph links

Implemented: the receipt links one commit SHA to one Qor session's audit and substantiate payload digests and ledger entry `FailSafe/extension/src/integrations/shield-receipts/shield-receipt-verifier.ts:28-38` (`readonly ledgerEntry: number;`).
Proposed: receipt to intent, plan and PR edges, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: not built).

## Customer UI and actions

None on main: no command, route or Console view issues or verifies a receipt (unverified beyond a search of `FailSafe/extension/src` for the exported functions).
The marketplace README states that no command publishes a verified SHIELD check yet `FailSafe/extension/README.md:90` (`No command publishes a verified SHIELD check yet.`).

## Governance policy and enforceability limits

Enforced (in code, unreachable on main): a verified receipt can be minted only inside the verifier and is tracked in a private WeakSet, so casts and clones are refused `FailSafe/extension/src/integrations/shield-receipts/shield-receipt-verifier.ts:46-50` (`return typeof x === 'object' && x !== null && MINTED.has(x);`).
Enforced (in code): a merge commit is never a Seal commit `FailSafe/extension/src/integrations/shield-receipts/shield-evidence.ts:205` (`a merge commit is never a Seal commit`).
Enforced (in code): the receipt must match HEAD, the origin repository and the API host `FailSafe/extension/src/integrations/shield-receipts/shield-evidence.ts:142-146` (`receipt apiHost differs from the publish API host`).
Limit: the per-session key lives in the workspace, so a workspace writer can forge tags; this proves tamper evidence against an edit made without the key `FailSafe/extension/src/integrations/shield-receipts/qor-provenance.ts:7-10` (`anyone who can write the workspace can also forge a tag`).
Limit: a workspace writer can rewrite the git object store itself `FailSafe/extension/src/integrations/shield-receipts/workspace-evidence-source.ts:41-43` (`workspace writer can still rewrite history itself`).
Policy defaults: Qor-logic 0.176.1, risk grades L1 to L3, receipts at most 14 days old, 5 minutes of clock skew `FailSafe/extension/src/integrations/shield-receipts/shield-policy.ts:14-19` (`pinnedQorVersion: '0.176.1',`).

## Failure, offline, stale and permission semantics

Absent evidence is Neutral and tampered evidence is Rejected, integrity failures first `FailSafe/extension/src/integrations/shield-receipts/shield-evidence.ts:6-8` (`integrity failures of evidence that is present are Rejected`).
Any thrown read is Neutral evidence-source-error; the functions never throw `FailSafe/extension/src/integrations/shield-receipts/shield-receipt-verifier.ts:102-106` (`return neutral('evidence-source-error', 'an evidence read failed');`).
Stale: a receipt older than the policy maximum is Rejected at step 9 `FailSafe/extension/src/integrations/shield-receipts/shield-evidence.ts:157` (`step 9: receipt is older than the policy maximum`).
Shallow repository: Neutral, parent history unavailable `FailSafe/extension/src/integrations/shield-receipts/shield-evidence.ts:202` (`shallow repository; parent history is not available`).
Git older than 2.44 or a partial clone: every read throws and the result is Neutral `FailSafe/extension/src/integrations/shield-receipts/workspace-evidence-source.ts:18-21` (`Every git read first requires git 2.44 or later`).
Every git read times out after at most 30 seconds `FailSafe/extension/src/integrations/shield-receipts/workspace-evidence-source.ts:30-31` (`Every git read has a timeout`).

## End-to-end scenario and measurable acceptance

Scenario (proposed, not reachable on main): after a seal commit, issue a receipt, push, and publish a SHIELD check that GitHub shows as PASS for that commit only (unverified: the issuing and publishing calls have no caller).
Metric: zero SHIELD PASS checks for any commit that is not the single-parent Seal commit of a verified session (threshold: zero) `FailSafe/extension/src/integrations/shield-receipts/shield-evidence.ts:215` (`HEAD is not the Seal commit`).
Existing test: `FailSafe/extension/src/test/integrations/shield-receipts/shield-receipt-verifier.test.ts` (unit) and `FailSafe/extension/src/test/integrations/shield-receipts/workspace-evidence-source.test.ts` (unit) exist; they exercise the functions directly, not a wired path (unverified beyond reading their imports).
Installed-extension test: none, because no command reaches this code (unverified).

## Recommended disposition

Recommendation for the owner: **COMPLETE**. The verifier, issuer and hardened evidence source are built and unit-tested but unreachable: there is no native chain status, no key provider and no caller. Wiring them is blocked on the damaged ledger (#467) and tracked as B216; until then they are inert code that should not be described as a working check.

## Open defects

[B216] the verified SHIELD check publisher, and so this verifier, has no production caller `FailSafe/extension/src/integrations/github-checks/shield-check-publish.ts:110` (`export async function publishVerifiedShieldCheck(`).
The default chain status is UNAVAILABLE by design until a native ledger verifier exists `FailSafe/extension/src/integrations/shield-receipts/shield-receipt-verifier.ts:13-14` (`The default chain status is UNAVAILABLE`).
