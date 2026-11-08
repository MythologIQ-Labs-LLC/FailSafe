# Proposal: #467 forward-only governance recovery when operator-local VETO artifacts are unrecoverable

**Status:** PLANNING ONLY. Not an audit, PASS, remediation closure, seal, owner signature or doctrine revision.

**Subjects:** FailSafe v6.0.12; #467 G4; #463; #475; release-candidate PR #623 at `497c0821aa944ba07388fd14af3d66965a96bd68`.

**Recovery evidence:** `qualification/v6.0.12-governance-lane-20261107-no-ci@a723b366`, specifically `recovery/MANIFEST.md` and `remediation/DETERMINATION.md`. Prior test receipts remain on the earlier evidence branch at `d2707332`.

## Known and unknown, without substitution

- The parked operator-local October audit VETOs #610–#612 and shadow event `7126134e` are **UNKNOWN/UNRESOLVED**, not exonerated, superseded, dismissed, reversed, or established to be non-existent.
- The committed ledger entries #610–#612 represent different v6.0.6 events. Substituting them for the missing VETOs would falsify provenance.
- The sole reviewable `.qor/gates/2026-08-21T2030-233res/remediate.json` is an August plan-233 proposal about `ce7c36d8`; reviewing it could close only that specific event if an independent audit returned PASS. **It cannot close October #467.**
- Native qor-logic 0.176.1 governance health 8/8, post-anchor verification at #382 and unchanged ledger since v6.0.11 do **not** cryptographically cover Verdict/Decision entry prose. The #900 tamper negatives proved that distinction.
- No v6.0.12 change has an authentic pre-implementation plan/audit PASS or an independent release-class seal. A later review must never be described as a review that happened earlier.

## Owner decision requested, not inferred

Request explicit authorization to **propose** a forward-only recovery doctrine for missing operator-local evidence with a separately recorded owner decision, a mandatory independent technical PASS/VETO assessment, and independently witnessed evidence. This is not authorization to change the current native audit skill or waive a VETO. If the canonical native gates cannot support a new recovery workflow without modifying audited governance policy, remain BLOCKED until the correct policy authority independently approves that modification.

The owner must separately select: signing-key custody, independent witness provider, on-seal cadence, expiry/offline rules, rotation/revocation/recovery and reviewer independence. A local timestamp or repository issue comment is not an independent witness.

## Native compatibility and five explicit decisions (2026-11-08 independent review)

The native 0.176.1 support review is preserved at `qualification/v6.0.12-pr629-markdown-627-review-20261108-no-ci@1a3afa37` in `governance-627/REVIEW-627-36ef4d99.md`. The native tool **does not** currently implement a independently reviewed recovery decision (owner authority, not a maintainer quorum), external checkpoint covering entry prose, or a verifier of text edits (steps 3–5 below). Its `reconcile` function is only for genuine duplicate-`previous_hash` residuals. The `governance-state-loss` event applies to a real snapshot restore; none exists for these missing local artifacts. Neither may be repurposed as evidence recovery.

The native repeated-VETO escalator is per-session and advisory; #467's prohibition is an **owner policy**, not an automatic native lock. New sessions must never be used secretly to evade that prohibition. A narrowly scoped owner rule change can prospectively permit unrelated plans, without closing or rerunning the missing October VETOs.

The following are **recommended choices for owner ratification, not adopted rules**:

| ID | Recommended choice | Effect and limitations |
|---|---|---|
| D1 | Add an explicit *unrecoverable evidence* clause, preserving #610–#612 and `7126134e` as permanently `UNKNOWN/UNRESOLVED` unless authentic artifacts surface | Enables an honest gap statement; **never** grants closure, PASS or retroactive remediation |
| D2 | Interpret “no fourth ordinary audit” as barring another attempt to approve the same October VETOed work via a newly numbered session. Permit **new, genuinely distinct prospective** #463, #475, G4 and governance-amendment plan audits with independent review, actual timestamps and their own source/plan identities | Unblocks future plan review only. #467 itself and all release-seal requirements remain P0 |
| D3 | Propose a FailSafe-local owner-authority rule: the **sole maintainer makes one explicit governance decision**, while an independent non-author auditor supplies a separate mandatory technical PASS/VETO assessment. The auditor is not a second voting owner. Require owner-controlled nonexportable signing custody and a genuinely independent external full-ledger-text witness | Specific witness/key mechanisms and falsification tests are unimplemented; missing technical PASS means BLOCKED, not a vote |
| D4 | Record the **sole owner's explicit approval** of the exact amendment, without fictitious committee, ballot, quorum or one-week delay. Qualify the policy correction under a prospective independent L3 plan/audit PASS before changing `GOVERNANCE.md`, `AGENTS.md` or local governance code | The current multi-maintainer voting clause is obsolete for this solo-maintained project and needs an explicit correction; this draft is not active governance policy |
| D5 | Preserve existing draft #623 and earlier unaudited changes as reference/evidence, **rebuild affected implementation prospectively** from the accepted base under audited plans and new commits, with new native qualification and a new seal | Strongest literal reading of “Never implement without a PASS.” Do not call retrospective review a prior PASS or silently merge the old draft |

Important sequencing: the **owner must ratify** D1 and D2 and explicitly approve the solo-maintainer replacement for the obsolete `GOVERNANCE.md` voting language. That policy correction still needs a genuine prospective independent SHIELD audit before adoption; no invented votes or one-week waiting period count as useful release evidence. D2 can enable an honest new-scope audit *without* implying D1 is a completed G4 recovery. The new FailSafe-local G4 verifier would itself be production governance functionality and requires an independent audit before implementation. A witness chosen later cannot reconstruct the historical October files.

## Compensating-controls plan, subject to an independent audit

1. **Freeze immutable evidence.** Bind the current v6.0.11 ledger bytes/hash, last entry #914, G4's historical #341–#382 coverage disclosure, reference commits, installed Qor wheel/RECORD, the exhaustive local recovery manifest, and every authentic surviving event/artifact SHA. Keep the original branch and local files unchanged.
2. **Publish a gap statement.** Label October local VETOs #610–#612 and event `7126134e` with `UNKNOWN/UNRESOLVED`. Do not fabricate the missing event's contents, a synthetic `remediate.json`, a VETO closure, or a replacement audit sequence number.
3. **Independent authority.** Present the gap statement and proposed procedure to a reviewer independent of the original author/session. Record the owner's signed, externally witnessed **governance recovery decision**, explicitly distinguishing authorization for *future* review from claims about historical truth. Require a dated owner decision and an independent evidence-based technical PASS; **no other governance voter or quorum is required for a sole maintainer**. A negative or missing technical verdict is BLOCKED.
4. **New externally witnessed checkpoint.** On owner-selected custody and witness infrastructure, sign the *complete ledger bytes including text*, previous witnessed checkpoint digest, branch/commit identity, known historical boundary, missing-artifact statement, key ID, timestamp and event-sequence cursor. Retrieve a third-party inclusion/timestamp proof. Do not rewrite the existing ledger or label the earlier unverifiable portion repaired.
5. **Falsification.** The recovery verifier MUST refuse changed Decision/Verdict text, reordered/missing entries, tampered signed manifest, missing/expired/revoked key, changed commit, replayed witness, absent external inclusion proof and offline uncertainty. Test every negative on disposable copies; no live ledger mutation.
6. **Governed path for existing unaudited code.** Explicitly classify v6.0.12 code already implemented without required prior audit. A retrospective independent acceptance review may document its safety but **cannot backdate a pre-implementation PASS**. If canonical rules require prior PASS as a non-waivable prerequisite, revert/recreate the affected changes under newly approved, prospective plans rather than relabeling historical work. Nothing is automatically grandfathered.
7. **Future audited remediations.** Only after a valid governance recovery authorization, audit the updated #463 selective-skill installer plan, #475 Windows containment plan and any #505/#476 changes. Then implement PASSed plans, execute adversarial host tests, qualify all platform targets, and seek a fresh, source-bound release seal on the final candidate.
8. **Stop conditions.** If native `/qor-remediate` cannot consume the absent event, or a `reviews-remediate` audit has no truthful subject path, **do not invoke it**. If an independent reviewer refuses the proposed recovery doctrine, keep the release NO-GO and escalate to owner governance authority; no bypass or synthetic history.

## What this proposal must not do

- Do not run an unrelated August `reviews-remediate` merely to count an audit.
- Do not begin a fourth ordinary audit cycle in violation of #467.
- Do not change `docs/META_LEDGER.md`, historical VETO status, G4 witness records or frozen Qor source.
- Do not merge PR #623, treat #627's plan as accepted, claim release GO or publish release notes as final.

**Completion criteria for this plan:** a separate exact-scope owner decision plus independently reviewed and witnessed recovery mechanism, with observed negative-test receipts. Until those exist, #467 remains P0 and the v6.0.12 release is NO-GO.
