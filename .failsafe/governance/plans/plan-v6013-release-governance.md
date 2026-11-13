# Plan: v6.0.13 release governance: Statewright website handoff and the first G4-witnessed release

**Status:** iteration 1, PROPOSED for independent audit. This document records no PASS, no seal and no release authority.
**Change class:** governance and release. Risk grade L3 (supply chain and governance integrity).
**PR target:** `main`, through release PR #663 (`release/v6.0.13-rc1`), merge-commit method only.
**Delta:** `v6.0.12..<candidate>`. The exact candidate SHA is given in the audit request and the submitting commit.
**Tracker:** #637 (owner scope decision of 2026-11-10: Statewright Option A, plus G4).

## Scope and acceptance (the auditor verifies each claim against the code)

**Shipped product changes since v6.0.12** (`git diff --name-only v6.0.12 <candidate> -- FailSafe/extension/src ':!FailSafe/extension/src/test'`):

| Change | Files | Issue and evidence |
|---|---|---|
| Statewright AI card that opens `https://statewright.ai/runs` in the browser on an explicit user action; nothing is sent, no status is shown, no history is read | `src/roadmap/ui/modules/statewright-handoff.js`, `integration-catalog-renderer.js` | #652, PR #653, PASS #946 |
| Continue and Aider catalog hints and a comment no longer name a release | `src/integrations/catalog/integration-catalog-data.ts`, `src/integrations/agent-cli/agent-containment.ts` | #475; text only, behaviour unchanged |

**Release documentation:**
- version `6.0.13` (`package.json`, `package-lock.json`);
- a `[6.0.13] - 2026-11-13` section in both CHANGELOGs, identical in each;
- `## What's New in v6.0.13` and `**Current Release**: v6.0.13 (2026-11-13)` in the marketplace README; Current Release in the root README;
- the marketplace README's Continue and Aider rows corrected. They described working governed wrappers, but both commands refuse (#475); the wording was verified in the #659 review;
- SYSTEM_STATE, BACKLOG, COMPONENT_HELP and PROCESS_GUIDE markers;
- two README line citations re-anchored.

**Release tooling, not packaged** (`scripts/` and `tools/` are excluded by `.vscodeignore`). The G4 ledger witness (#638), through these PRs:

| PRs | Independent PASS |
|---|---|
| #644, #646 | #931/#932, #934/#935 |
| #650 | #937 |
| #654 | #948/#949 |
| #647, #657 | #958 |
| #658 | #963 |
| #666 (TPM scripts, merged `7f8e0ba6`) | #965 |
| #667 (owner certificate, merged `23e254d9`) | #966 |

Also merged since v6.0.12, test-only: #651/#656 (#954) and the CI runner pins (#640, #643).

**Not in scope:**
- #659 (README media). The review requires changes: the media links point to a private repository, and the linked provenance says publication is not approved.
- Embedded Statewright data (#603 to #606, #608).
- Every other open issue.

## G4 at this seal (`docs/releases/RELEASE_INTEGRATION_PATH.md`, `G4_WITNESS_OPERATIONS.md`)

**Pre-seal inputs, all on `main` (`23e254d9`) before S, and merged into the release branch:**
- the owner certificate `tools/g4/keys/a50c00715e7275a86fad338c80ceacd161da02bdf2b75c60b1082eb518265d8b.cer`;
- the FreeTSA root and the single-root policy;
- the CRL `tools/g4/tsa-crls/freetsa-root-ca-2026-09-18.crl`, current until 2027-09-18;
- `revocations.json` version 1, empty.
- The TPM scripts as fixed by #666: `enroll-tpm-key.ps1` and `sign-checkpoint.ps1`. Genesis signing needs the #666 signer, which accepts the enrolled key. The pre-#666 signer refused it before signing.

**Owner trust inputs, never taken from the repository:**
- the certificate fingerprint, from the owner's offline record. The owner confirmed on 2026-11-12 that it is recorded; the owner re-confirms possession before it is used for release verification;
- the checkpoint head, from the same offline record.

**Sequence:**

| Step | Who | What |
|---|---|---|
| **S** | | The sealed commit on the release branch |
| **R** | | The first commit after S whose `docs/META_LEDGER.md` holds the v6.0.13 `SESSION SEAL` entry |
| genesis | owner authorization, separate | `g4-create-checkpoint.cjs --cert tools/g4/keys/<fp>.cer --tsa-url https://freetsa.org/tsr --commit R`, with the TPM key |
| head record | owner | `g4-000001:<sha256 of manifest.json>` retained offline before the checkpoint is committed |
| **K** | | One commit adding exactly the five checkpoint files |
| **H** | | The final PR head |
| **M** | owner merge | The merge commit |

**Checks on H and on M:**
- release verification on a fresh full clone: `g4-verify-checkpoint.cjs --release --repository MythologIQ-Labs-LLC/FailSafe --commit <H or M> --trust-fingerprint <owner offline> --trusted-head <owner offline>`;
- the result must show `mode: release`, `ok g4-000001 commit <R>` and `PASS OK` with no limitation;
- post-seal checks 1 to 7 on H; parent and tree checks on M;
- the rule suite for the push to `main` must report `result=pass`.

**Genesis does not write a transition or notice record**, so #660 (non-atomic record writes) does not affect it. `createCheckpoint` stages into a temporary directory and renames only when complete.

## Gates before tag and publication

1. Required CI on H.
2. Release verification on H and on M, as above.
3. Merge-commit method, with parent and tree checks.
4. Rule suite `result=pass`.
5. The tag workflow builds the eight-target VSIX matrix, the branded `FailSafe-v6.0.13-Release-Notes.pdf` and `SHA256SUMS.txt` from M. These are verified before publication.
6. **A separate, explicit owner release GO before the annotated tag `v6.0.13` on M.** Nothing in this plan authorizes the tag or publication.

## Disclosures and known limitations

As in CHANGELOG `[6.0.13]` Known Limitations:
- G4's trust in one owner key and in FreeTSA;
- the CRL history-rewrite limit;
- #660, #505, #476, #475 and #463;
- Statewright data not embedded.

Local test artefact, not a product defect: the two `bundleDeps` tests fail in junction-linked worktrees.

## CI commands (local, exact candidate)

From `FailSafe/extension`:
- `npx tsc -p ./`
- `npx eslint src --ext ts`
- `npm run bundle`
- `npm run test:node`
- `npm run test:ui`
- `node --test src/test/docs/*.test.cjs`
- `node scripts/release-gate.cjs --preflight`
- `npm run package`, then `node scripts/validate-vsix.cjs <vsix>`

From the repository root:
- `tools/reliability/validate-docs-coherence.ps1 -RepoRoot <root>`

## Audit questions

1. Is every shipped change since v6.0.12 listed, and accurately described in the CHANGELOG and READMEs?
2. Do the release markers and gates agree with each other?
3. Is the G4 sequence exactly the one `RELEASE_INTEGRATION_PATH.md` requires, with every owner step marked as needing separate authorization?
4. Is anything overstated or missing from the known limitations?
