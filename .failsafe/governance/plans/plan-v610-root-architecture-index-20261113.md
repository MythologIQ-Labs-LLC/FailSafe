# Prospective architecture authority relocation: FailSafe root ARCHITECTURE_INDEX.md

**Status:** OWNER DIRECTED; PROPOSED L3 migration; **NOT NATIVE /qor-plan REGISTERED, NOT /qor-audit PASSED, NOT OWNER MERGE GO**.
**Date:** 2026-11-13. **Target:** FailSafe v6.1.0 development branch. **Base:** `5ffda312df045837177ba2c47f16e1488b2b010d`. **Branch:** `plan/root-architecture-index-20261113`.
**Owner direction:** Retain the existing design-authority registry as the canonical index, but **move it from `docs/ARCHITECTURE_INDEX.md` to root `ARCHITECTURE_INDEX.md`**. One canonical architecture-navigation owner only.

## Change boundary and authority

The canonical `architecture-navigation` domain remains a single registered row. Move **all registry rows, classifications, cross-domain pointers, governance references, update triggers, normative/legacy scopes and verification guidance**, rebasing every local Markdown link from `docs/` to root. Root index becomes the exact authority for *this FailSafe repository*. `docs/GOVERNANCE_INDEX.md` remains the sole governance artifact authority and registers the moved root index in Tier 1; `docs/ARCHITECTURE_PLAN.md` remains runtime-domain design authority until independently reconciled (currently v5.9-era, stale, a separate problem). No Qor skills, policy rules, ledger history, G4 attestation, release authorization or proof chains are replaced by a path move.

**Critical compatibility separation:** `failsafeRepoProfile().indexPath` switches to `ARCHITECTURE_INDEX.md`; the shared `DEFAULT_INDEX_PATH` and VS Code setting `failsafe.architecture.indexPath` stay `docs/ARCHITECTURE_INDEX.md` **for repos FailSafe governs**. The user-repo profile is configurable and must continue accepting root or custom paths. Existing downstream workspaces are not forcibly migrated.

## Implementation / pre-audit candidate

1. Create root `ARCHITECTURE_INDEX.md` from the existing source with no registry row removal. Rebase all relative Markdown links; ensure root `ARCHITECTURE_INDEX.md` is covered by `architecture-normative` globs while `docs/ARCHITECTURE*.md` continues covering other canonical design files.
2. Retarget the README's early developer off-ramp, application README, Claude/AGENTS architecture instructions, FailSafe-repo validator profile and correct repository-owned architecture links/consumer tests. Update Tier 1 registration path *without editing historical Last Reviewed or release/ledger entries*.
3. Delete the tracked old `docs/ARCHITECTURE_INDEX.md` from the candidate branch, preventing two competing active architecture indices. Old Git history preserves the former content; do not generate a second canonical stub or rewrite sealed evidence.
4. Extend the pure validator golden-row test: root tracked + old docs path untracked, correct root-tail and linkBase, consistent 13-glob / 42-matched-document baseline, and preserve user repo default docs profile and policy semantics.
5. Independently review the full set of live references and tests before any merge. Historical paths cited in old governance plans, historical release docs or G4 records are **historical truths** and should not be rewritten to describe present topology.

## Falsification / acceptance matrix

| ID | Attack or case | Required result |
| --- | --- | --- |
| ARI-01 | `README.md` new-contributor link | Opens exactly root `ARCHITECTURE_INDEX.md`, not stale docs path |
| ARI-02 | All registry rows and local Markdown links | Registry row IDs/statuses/domains unmodified; local links resolve to tracked files from new root; no path escape |
| ARI-03 | Zero or duplicate canonical authority | `architecture-navigation` exactly one canonical root row; validator rejects duplicate `canonical` domain or duplicate path |
| ARI-04 | Architecture file outside registry | `unregistered-normative` with `existing: ARCHITECTURE_INDEX.md#registry` |
| ARI-05 | Governance Index Tier 1 path | Root index registered exactly once; historical governance records unchanged |
| ARI-06 | Golden repo validator after move | `node FailSafe/extension/scripts/check-architecture-index.cjs --repo-root .` PASS at final head |
| ARI-07 | Architecture validator unit tests | All 19 failure-code fixtures, CLI/core consistency and root gold test PASS |
| ARI-08 | User workspace with existing docs default | `failsafe.architecture.indexPath` and `userRepoProfile()` still default to `docs/ARCHITECTURE_INDEX.md`; bootstrap/discovery does not redirect |
| ARI-09 | User workspace with explicit root/custom path | Existing safe path validation, no overwrite or outside-root write |
| ARI-10 | Integration contract row lookup | Registered integration-doc links and citations read from root index; no empty registry/false PASS |
| ARI-11 | README/Claude/AGENTS tests and extension package | References pass; VS Code extension/package compatibility unaffected |
| ARI-12 | Source old doc path retained in history | Deleted on candidate branch; G4/release documents and older checkpoint SHA immutable |
| ARI-13 | Real installed VS Code Architecture Console | Correct root `present` state, route/API index path, rows, on-click links and no duplicate index shown |
| ARI-14 | Checkout with conflicting root + docs indices | Fail closed or explicitly report competing authority; no silent preference for an unverified index |
| ARI-15 | Symlink/ignored root path or malicious links | Existing containment, bounded reads and unsafe-link validation still refuse |
| ARI-16 | Rollback | Revert candidate branch/PR to old docs location with original index/setting behavior, no orphan status or hidden loss |

**Verification already done (source only):** root source copied and relinked, 58 local Markdown links checked against a nontruncated 2,894-file tracked Git tree; original root source blob `63e683cb994c69fbfff95aa51b0c2054d480e5c9`. The 50 registry-table lines counted before moving include heading/separator and are **not** proof of 50 distinct entries; enforce actual row count by validator. Existing historical and installed-host evidence remain to be checked.

**Outstanding hard gates:** trusted native `/qor-plan` registration and independent `/qor-audit PASS` at exact final revision; GH CI and native `test:node`, true `check-architecture-index` and extension-host acceptance; review of historical backlink compatibility; owner protected merge decision. This branch is candidate source work **ahead of native audit** and must be treated as **NOT QUALIFIED** until the governing process accepts it. Do not merge merely because CI is green.

**No changes to released v6.0.13, published marketplace VSIX or cryptographic records.**
