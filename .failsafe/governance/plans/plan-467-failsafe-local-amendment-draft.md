# Proposed FailSafe-local governance amendment: #467 unverified legacy evidence and G4

**Status: PROPOSAL ONLY. Not adopted, audited, implemented, or a release authority.**

## Applicable existing authority

- `GOVERNANCE.md` contains a **generic multi-maintainer voting rule** (simple majority and one week) despite FailSafe being **owner-maintained by a single developer**. The owner has explicitly rejected applying that committee rule to a solo-maintainer project. This draft proposes correcting the published governance text through the proper plan/audit pathway, rather than pretending that text was never there.
- `AGENTS.md` requires a pre-implementation `/qor-audit` PASS and a pre-release `/qor-substantiate` session seal.
- Frozen qor-logic 0.176.1 supports native plan/audit on **new distinct future work** but does **not** implement independent recovery approvals, external full-ledger-text checkpoints, or G4 verification. Do not patch frozen Qor-logic or invent native gate output.
- The missing October #610–#612 local VETO artifacts and event `7126134e` remain **UNKNOWN/UNRESOLVED** after exhaustive documented search at `qualification/v6.0.12-governance-lane-20261107-no-ci@a723b366`.

This plan proposes **text** to review, not edits to `GOVERNANCE.md` or `AGENTS.md`.

## Proposed owner decisions and independently verified technical gates

1. **D1, historical evidence:** maintain the actual prior VETO status as permanently unresolved unless hash-verifiable originals reappear. A documented recovery statement can describe uncertainty and permit a prospective path only after new independent authority; it may never be called a VETO closure, amendment of historical ledger, or audit PASS.
2. **D2, scope of no-fourth-audit restriction:** do not retry the original October VETOed plans under renamed/new sessions. New, genuinely distinct scoped plans (#463, #475, #467 amendment/G4, and #505/#476) may enter honest **prospective** /qor-plan -> independent /qor-audit with real dates. Every new audit must disclose the unresolved old VETOs and verify it does not cover the same underlying scope; disagreement means BLOCKED. This is owner-policy clarification, not the native per-session repeat-VETO escalator bypass.
3. **D3, future recovery authority:** the **sole project owner is the only governance decision-maker**. An independent non-author reviewer provides an adversarial, evidence-based **PASS/VETO assessment** of the proposed recovery mechanism, not a second governance vote or owner-level approval. A VETO/missing assessment blocks the technical gate, but the reviewer has no delegated right to change scope, waive controls, hold signing keys or approve release. Record the owner's decision and the independent assessment separately; externally witness the resulting proof when G4 is implemented.
4. **D4, procedure:** use a **single explicit, dated owner decision**, recorded in the issue/plan and bound to its exact text and source SHA. **No voting period, quorum, poll, or one-week wait applies to a sole maintainer.** Because the published `GOVERNANCE.md` currently says otherwise, the correction itself must be reviewed and implemented prospectively via a scoped L3 plan and authentic independent `/qor-audit` PASS; do not silently treat the old wording as already amended. For a future organization with multiple maintainers, define a separate process before delegating decision authority.
5. **D5, existing ungoverned drafts:** classify #623 and related changes as **reference implementation not eligible for direct release merge**. After genuine new-scope plan PASS, reproduce approved changes in fresh commits on a new clean baseline, with tests and a source-bound release seal. This does not assert the original unaudited implementation was compliant.

## Proposed exact replacement for the obsolete multi-maintainer rule

**Target (not edited):** root `GOVERNANCE.md` as found on `main@e5b0aee9195d9e045b0c1f47fde239e9c8a49e0e`, Git blob `f2f353646fd92e50fcf0c996e246ddb448a9ebff`. A changed target must be re-reviewed. This is not permission to edit active policy before a valid independent, source-bound L3 `/qor-audit` PASS and dated owner acceptance.

After those gates, **replace only** the current `## Decision Making` section (up to `## Contributions`), the `- Maintainers approve releases` line under `## Releases`, and `## Amendments` (up to the horizontal rule), with the following exact proposed text:

```markdown
## Decision Making

### Single accountable owner

While FailSafe has one designated project owner, that owner alone makes product, governance, security-scope, risk-acceptance and release decisions. Community discussion and contributor feedback may inform decisions but do not create a vote, quorum, consensus requirement or waiting period.

Record consequential decisions with their date, owner identity, exact plan and source identifiers, rationale, residual risks and supporting evidence. A decision does not count as a technical audit PASS or release seal.

### Independent technical assurance

Security-critical (L3) changes require an independently evidenced, plan- and source-bound SHIELD audit PASS before implementation. A VETO, unavailable audit, missing negative control or unverified receipt blocks the applicable technical gate. The auditor assesses evidence; the auditor is not an additional governance voter and cannot independently approve or waive a release.

### Future governance delegation

If the owner later delegates decision authority to multiple maintainers, adopt and review a specific multi-maintainer protocol before it takes effect. Write access or contribution alone does not confer a governance vote.
```

Proposed `## Releases` line replacement:

```markdown
- The project owner authorizes a release only after applicable tests, independent technical assurance, and the required source-bound /qor-substantiate session seal pass.
```

Proposed `## Amendments` replacement:

```markdown
## Amendments

The project owner may accept a precisely scoped governance amendment through an explicit, dated, traceable decision. L3 governance amendments require a prospective independent /qor-audit PASS before implementation. No one-person ballot or minimum voting period is required. Neither an owner's approval nor a reviewer recommendation can replace a missing technical PASS, overturn a VETO or rewrite historical evidence.
```

**Boundary:** This is proposed policy text in a planning branch only, not an edit to root `GOVERNANCE.md` or `AGENTS.md`. Do not mark the existing rule amended until a separate authorized PR actually changes the protected branch after the required audit.

## Proposed G4 trust contract (not implemented)

- **Key custody:** owner-controlled non-exportable signing key, preferably hardware-backed; the source repository, CI job environment, ChatGPT/Claude tools, test artifacts and all public issue comments must never contain exportable private signing material. Select a real provider and verify it before implementation.
- **Witness:** a genuinely independent append-only transparency log or trusted timestamp service, separate from normal repository maintainers and CI release permissions. Receipt must prove inclusion, not merely a request or a GitHub comment.
- **Checkpoint contents:** cryptographically bind the exact SHA-256 and size of complete ledger bytes (including Verdict/Decision prose), prior witnessed digest, ordered event count, last entry, repository and full commit SHA, unresolved historical boundary and gap statement hash, signing key ID and UTC instant. A static hash list with no witness is insufficient.
- **Cadence:** externally witness each accepted governance seal and every release-candidate promotion. Missing/offline/expired witnesses are BLOCKED, not neutral PASS.
- **Revocation:** a revocation or rotation notice must be explicitly owner-authorized, receive a separate mandatory independent technical PASS/VETO assessment, and be externally witnessed with an unambiguous effective time. A revoked key cannot authenticate new checkpoints; previously witnessed evidence remains inspectable with its original trust state and key validity window.
- **Recovery:** require a documented independent owner identity recovery process and public key-transition linkage. Never silently fall back to an alternate key or copy secrets into CI to recover a broken run.
- **Falsifiers:** flip an entry Verdict, edit Decision text, rewrite/delete/reorder records, change candidate SHA, forge or replay witness inclusion, revoke key, change key ID, expire timestamp, remove a historical-gap statement, or make the witness unavailable. Every case must reject and preserve a machine-readable reason.
- **OS security boundary:** G4 only strengthens evidence authenticity; it does **not** solve #475 agent file/read/network isolation, #505 save interception, #463 CLI mismatch or #476 production publisher wiring.

## Owner decision and independent technical-review evidence required

- Exact plan digest, candidate baseline and prior governance text hash.
- Evidence that the maintainer/owner retains sole decision authority, and the independent technical reviewer's identity and conflict-of-interest declaration.
- Explicit, dated **owner approval or rejection** of the exact proposed governance amendment. Do not synthesize a maintainer poll, invented voters, or a vote-window timestamp.
- Independent /qor-audit verdict with actual session ID, reasoned negatives and stable artifact SHA.
- Explicit owner approval for the chosen key and independent witness infrastructure. D3 is not ratified by selecting this draft.
- No local/private VETO contents fabricated as part of the proposal.

## Safety and stop conditions

If owner authorization is absent, reviewer independence cannot be proved, the native audit is VETO/unavailable, or required external G4 witness proofs cannot be obtained, the amendment remains **NOT ADOPTED**. No code changes, historical ledger rewrites, retrospective PASS, new release seal or v6.0.12 publication.

This plan does not delegate release approval, policy-override power, or custody of signing keys to an agent. All resulting decisions remain owner-controlled and falsifiable.
