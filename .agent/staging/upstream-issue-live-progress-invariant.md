## Proposal: `LiveProgressInvariant` sub-rule for qor-audit Ghost UI Pass

### Summary

Add a sub-rule to `qor-audit/SKILL.md` Step 3 (Ghost UI Pass) that VETOs any plan whose UI has a progress indicator without intermediate state when the backing operation takes more than ~2 seconds. The current Ghost UI Pass checks "every button has a handler" but does NOT detect a UI that simulates progress (`width: 0%` → `width: 100%` with no intermediate writes) while a real backing operation runs silently for 20+ seconds.

### Motivation — concrete defect class this rule would have caught

In the FailSafe extension (`MythologIQ-Labs-LLC/FailSafe`), the **Install QorLogic Skills** card shipped with the following pattern:

- `install-skills-card.js` sets `progressBar.style.width = '0%'` at start.
- Operator clicks Install. The card fires `POST /api/actions/scaffold-skills`.
- The backing pipeline runs 5 sequential phases (Python probe → pip install → per-host `qorlogic install` → provenance verification → hub refresh). Total wall-clock: 20–60 seconds.
- During those 20-60 seconds, the modal shows the progress bar frozen at `0%`. There are no intermediate width updates and no per-phase status messages in the modal.
- WebSocket `skills.install.progress` events ARE emitted by the host for each phase start/complete, but the modal does NOT subscribe to them. The events are visible only via the FailSafe output channel.
- On completion the bar jumps directly to `100%`. On error the modal stays open with a single line of error text and no retry/dismiss controls.

Operator-facing UX: "I clicked Install, nothing happened, the button doesn't seem to work, eventually some text appears." Two prior `qor-audit` PASS cycles (entries #361/#362 of the FailSafe ledger; both audited the surrounding `organize-ux-hotfix` plan) did NOT flag this defect because the current Ghost UI Pass language checks only for handler presence, not for live-feedback fidelity.

The full investigation that surfaced this is recorded at:

- FailSafe META_LEDGER Entry #360 (debug report for the misattribution caused by the same async-vs-UI timing gap).
- FailSafe META_LEDGER Entry #366 (audit that VETOed the proposed in-repo amendment to qor-audit SKILL.md, on the grounds that `.claude/skills/qor-audit/SKILL.md` is qor-logic-managed and would be overwritten on next `qorlogic install`; recommended the rule be contributed upstream instead — this issue).

### Proposed amendment to `qor-audit/SKILL.md` Step 3

Append to the existing Ghost UI Pass section:

````markdown
#### Live-Progress Invariant

For every UI element with progress semantics (progress bar, spinner, phase
indicator, step list), the audit MUST verify that the element's state reflects
the underlying operation's progress at intermediate points, not only at start
and end.

- [ ] Every CSS animation or width transition driven by JS must have at least
      one intermediate state when the underlying operation takes >2 seconds
- [ ] No `style.width = '0%'` immediately followed by `style.width = '100%'`
      with no intermediate writes (fake-jump pattern; SG-FakeProgress-A)
- [ ] Modals with progress UI MUST subscribe to the backing event stream
      (WebSocket / EventEmitter / etc.) and re-render on each event
- [ ] Error UI must surface an explicit dismiss/retry control; modal must not
      trap the operator on a terminal error state

**Any violation -> VETO with `ghost-ui` category, sub-category
`live-progress-fake`.**
````

### Detection mechanism — reference implementation

FailSafe's pending follow-up plan (`docs/plan-qor-install-skills-ux-expansion.md`, audit-VETOed at Entry #366 pending re-audit) ships a Node helper that mechanically detects the fake-jump pattern in source:

- `FailSafe/extension/scripts/lib/ghost-ui-live-progress-lint.cjs` exports `analyzeProgressElements(htmlSource) → [{element, selector, livenessRule: 'OK' | 'STATIC' | 'FAKE_JUMP'}]`.
- Heuristic: parse for `style.width = '0%'` followed by `style.width = '100%'` with no intermediate writes anywhere in the source → flag as `FAKE_JUMP`.

For Python parity (so the rule integrates with the existing Step 0.6 pre-audit lint sweep), the helper would need a Python equivalent under `qor/scripts/`. The Node version is offered as a working reference for the detection rule shape; the canonical Python implementation is whatever the qor-logic SDK maintainers prefer.

### Suggested test cases (for the Python rewrite)

Cases the lint must distinguish:

1. **FAKE_JUMP** — fixture with literal `style.width = '0%'` then `style.width = '100%'` with no intermediate writes anywhere in scope → must flag.
2. **OK** — fixture with `style.width = '0%'`, intermediate writes (e.g., `style.width = '50%'` driven by event subscription), `style.width = '100%'` → must NOT flag.
3. **STATIC** — fixture with progress-bar selector but no `style.width` writes (purely CSS-animated or absent) → must NOT flag (informational only).
4. **MALFORMED** — fixture labeled "progress" but no width manipulation → must NOT flag (no manipulation to validate).

### Phase 55 wiring (optional)

If the rule should run at the Step 0.6 pre-audit lint level (alongside `plan_test_lint` and `plan_grep_lint`), the wiring would be:

```bash
PLAN_PATH=$(python -c "from qor.scripts.governance_helpers import current_phase_plan_path; print(current_phase_plan_path())")
python -m qor.scripts.plan_live_progress_lint --plan "$PLAN_PATH" --repo-root . || true
```

`PLAN_PATH` consumed only as argv (SG-Phase47-A countermeasure); the lint scans plan-cited UI source files for the fake-jump pattern.

### Backward compatibility

Forward-only rule (Phase ≥ N where N is whichever phase lands this amendment). Prior audits (FailSafe Entries #355/#356/#361/#362) reviewed with the old rule and remain valid under that rule's text. The amended rule applies starting with the next `/qor-audit` cycle in any workspace running the new qor-logic version.

### Related upstream issues for context

- Qor-logic#40 — feature-inventory cross-reference requirement (filed via FailSafe SHADOW_GENOME)
- Qor-logic#41 — per-feature TDD discipline
- Qor-logic#42 — per-row infrastructure verification tokens
- Qor-logic#43 — plan-grep-lint API shape verification
- Qor-logic#54 — Phase 61 ledger repair (referenced in FailSafe Process Shadow Genome)

This proposal continues the pattern of FailSafe-surfaced defect classes informing qor-audit rule tightening.

### Acceptance criteria

- [ ] `qor-audit/SKILL.md` Step 3 Ghost UI Pass includes the four checklist items above.
- [ ] `findings_categories` enum (referenced in `qor/scripts/findings_signature.py`) accepts `live-progress-fake` as a sub-category or `ghost-ui` with attached sub-tag.
- [ ] `qor/scripts/plan_live_progress_lint.py` (or equivalent) ships with the four reference test cases above.
- [ ] `qor/references/doctrine-shadow-genome-countermeasures.md` adds an entry for `SG-FakeProgress-A` (the failure pattern this rule catches).
- [ ] Optional: integration into Step 0.6 pre-audit lint sweep.

### Filer attribution

Filed from: FailSafe v5.1.0 cycle, ledger entries #360 (debug) + #366 (plan audit). FailSafe operator: MythologIQ Labs LLC. Files this on behalf of the FailSafe install-skills-ux-expansion plan's Phase 5 audit-gap closure that V1-VETOed because amending the SDK-installed SKILL.md directly is structurally unsupported.
