# Remediation determination and audit-authorization boundary, 2026-11-07

**Sources:**
- frozen qor-logic 0.176.1 `qor/skills/sdlc/qor-remediate/SKILL.md` and `qor/skills/governance/qor-audit/SKILL.md`;
- AGENTS.md;
- #467 comments of 2026-10-20 to 11-06;
- `recovery/MANIFEST.md`.

## 1. What `/qor-remediate` can legitimately produce here

- **Health:** the exemption (`qor:governance-health-exempt`) lets it run, and health is in any case 8/8 OK.
- **Native result:** Steps 1–3 on the committed record (`native-remediate-dryrun.json`; the shadow genome is unchanged by the run) give 7 unaddressed groups and **one** classification:
  - `repeated-veto-pattern` for event `ce7c36d8…`;
  - it maps to a doctrine/gate proposal.
- **Already proposed:** that event has a committed proposal, `.qor/gates/2026-08-21T2030-233res/remediate.json` (sha256 `5b1d610603b7e249720c4bc87d9b675e57e7fb53fc07cb3df7ac42f8fd1a0103`), with a valid `cannot-automate` `closure_enforcer`. The event is already `addressed_pending: true`.
  - A new Step 4/5 run would only duplicate that proposal and gate. **No new remediation artifact was emitted.**
- **Unclassified events:** the other six (3 `gate_override`, 1 `capability_shortfall`, 2 `degradation`) match no native pattern, so `/qor-remediate` produces no proposal for them.
- **The #467 subject (parked VETOs #610–#612 and event `7126134e`):** **UNRESOLVED.** The inputs are not on this machine (manifest), so no #467 remediation proposal can be produced from recoverable evidence. Nothing about them is inferred.

## 2. Exact authorization boundary for `/qor-audit reviews-remediate:<path>`

From the frozen audit skill:

| Requirement | Source | State |
|---|---|---|
| `governance-health --profile skill-entry` not DAMAGED/INCOMPLETE | qor-audit "Governance Health Preflight" | **met** (8/8 OK) |
| An existing `remediate.json` at `<path>` | qor-remediate Step 5/6 | met **only** for `.qor/gates/2026-08-21T2030-233res/remediate.json` (plan-233, not #467) |
| The **operator** invokes `/qor-audit` with skill arg `reviews-remediate:<path>`; "the ONLY trigger"; "an ordinary plan audit never sets it" | qor-audit Step 4.1 | **not met**: no operator signal names an actual path. The owner's approval named the process (`<actual path>` was a placeholder), and the only reviewable path is not the #467 remediation |
| Option B independent review when `audit_risk_score` reports `option_b_required` (fresh-context auditor, not a solo audit) | qor-audit "Author-momentum risk auto-dispatch" | would apply; satisfiable by a fresh-context reviewer once triggered |
| PASS verdict and a valid `closure_enforcer` before any `addressed: true` flip | qor-remediate Step 6; qor-audit Step 4.2 | n/a until an audit runs |
| No fourth ordinary audit cycle (#467) | #467 2026-10-20/21 | respected: a reviews-remediate audit is not an ordinary plan audit |

## 3. Verdict

**No remediation-review audit was run.** No PASS or VETO verdict exists from this lane. Two prerequisites are not genuinely satisfied:
1. **No #467 remediation exists to review.** Its inputs are UNRESOLVED.
2. **No operator signal names a concrete `reviews-remediate:<path>`.**

**What would unblock it, if the owner chooses (an explicit owner decision, not inferred here):**
- **(a)** Supply the parked #610–#612 artifacts and event `7126134e` from the host that produced them. Then native `/qor-remediate` runs there or on a hash-verified copy, followed by `/qor-audit reviews-remediate:<that remediate.json>`.
- **(b)** Or invoke `/qor-audit reviews-remediate:.qor/gates/2026-08-21T2030-233res/remediate.json`, with Option B independence. That closes only the August plan-233 repeated-VETO pattern. **It does not resolve #467.**
- **In either case,** v6.0.12 implementation still needs its own audited plans (#463 in PR #627, #475), and release needs a seal. None of that is backdated.
