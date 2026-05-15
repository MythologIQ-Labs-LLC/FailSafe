# Doctrine: Ghost-UI Live-Progress Invariant

**Status**: Workspace-local (FailSafe-managed); pending upstream adoption at
[Qor-logic#58](https://github.com/MythologIQ-Labs-LLC/Qor-logic/issues/58).

**Effective from**: 2026-05-14 (META_LEDGER Entry #369 PASS audit on
plan-qor-install-skills-ux-expansion).

## Rule

For every UI element with progress semantics (progress bar, spinner, phase
indicator, step list), the audit MUST verify that the element's state reflects
the underlying operation's progress at intermediate points, not only at start
and end.

### Checklist

- [ ] Every CSS animation or width transition driven by JS must have at least
      one intermediate state when the underlying operation takes >2 seconds.
- [ ] No `style.width = '0%'` immediately followed by `style.width = '100%'`
      with no intermediate writes (fake-jump pattern; SG-FakeProgress-A).
- [ ] Modals with progress UI MUST subscribe to the backing event stream
      (WebSocket / EventEmitter / etc.) and re-render on each event.
- [ ] Error UI must surface an explicit dismiss/retry control; modal must
      not trap the operator on a terminal error state.

### VETO category

Violations are categorized as `ghost-ui` with sub-category
`live-progress-fake`. Per `qor/references/doctrine-audit-report-language.md`,
this is a **Code-logic defect** ground (handler exists, behavior is wrong)
and routes to `/qor-debug`; if the failure is a plan-text gap (UI described
without specifying live-progress wiring), it routes to plan-text amendment.

## Detection helper

`FailSafe/extension/scripts/lib/ghost-ui-live-progress-lint.cjs` exports
`analyzeProgressElements(htmlSource) -> ProgressElementAnalysis[]`. Each entry
carries an `element` type, `selector`, and `livenessRule: 'OK' | 'STATIC' |
'FAKE_JUMP'`. CLI invocation:

```bash
node FailSafe/extension/scripts/lib/ghost-ui-live-progress-lint.cjs \
  --html <path-to-source>
```

Exit code is 1 if any `FAKE_JUMP` detected, 0 otherwise (2 on usage error).

## Acceptance test cases (mirrored in upstream Qor-logic#58)

Four canonical cases the rule must distinguish:

1. **FAKE_JUMP** — fixture with literal `style.width = '0%'` then
   `style.width = '100%'` with no intermediate writes -> flagged.
2. **OK** — fixture with `style.width = '0%'`, intermediate writes
   (e.g., `style.width = '50%'`), `style.width = '100%'` -> NOT flagged.
3. **STATIC** — progress-bar selector but no `style.width` writes
   (purely CSS-animated or absent) -> NOT flagged (informational).
4. **MALFORMED** — element labeled "progress" but no width manipulation
   -> NOT flagged (no manipulation to validate).

Mirrored locally in
`FailSafe/extension/src/test/scripts/ghostUiLiveProgressLint.test.cjs`
(node:test, 4/4 pass at Phase 5 implement).

## Forward-only application

The rule applies to FUTURE audits in this workspace. Prior audits (META_LEDGER
Entries #355 / #356 / #361 / #362 / #366 / #367 / #368 / #369) reviewed under
the older Ghost UI Pass remain valid. The next `/qor-audit` cycle reads this
doctrine and the lint helper.

## Upstream traceability

Canonical amendment to `.claude/skills/qor-audit/SKILL.md` is filed as
[Qor-logic#58](https://github.com/MythologIQ-Labs-LLC/Qor-logic/issues/58).
When that issue ships, this workspace doctrine is superseded by the SDK-level
rule. The lint helper may be ported to Python
(`qor/scripts/plan_live_progress_lint.py`) by SDK maintainers at that time.
