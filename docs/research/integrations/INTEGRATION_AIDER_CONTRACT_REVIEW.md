# INTEGRATION — Aider Contract Review (Issue #107)

> **Status:** Extracted 2026-06-02 for B-INT-8 from `docs/research/FailSafe Integrations Research.md`. Disposition per the packet's readiness table.

## Disposition

**CONDITIONAL — validate auto-commit suppression on a pinned version.** A good low-cost wrapper target (CLI + Python scripting, file-scoped editing, tight git integration). The one contract gap that matters: reliably disabling/overriding Aider's **auto-commit** on the exact pinned version — the reviewed docs confirm git integration + scripting but not the current suppression-flag spelling, so it must be validated in contract tests before shipping.

## Authentication, permissions, secrets

Local model-provider credentials + local git state, no SaaS auth. Same pattern as Continue: inject provider keys via env only (never CLI flags); the wrapper owns repo-path allowlisting + dirty-worktree refusal. Scriptable from CLI and Python.

## Supported surface, lifecycle, failure modes

`--message` runs one-shot NL instructions, edits only files added to the chat, with built-in git auto-commit — useful for users, **dangerous for FailSafe** as it can bypass the diff gate. v1 posture: capture before/after diffs, treat non-zero exits as first-class evidence, refuse dirty worktrees unless explicitly allowed. The no-auto-commit switch semantics remain a pre-implementation validation item, not an assumption.

## Threat posture & minimum safe slice (v1)

Threats: implicit git commits, dirty-worktree operation, scope expansion from too many added files, API-key leakage. v1: one-shot wrapper with diff capture and no automatic commit acceptance. Tests: missing binary, missing git repo, dirty-worktree refusal, clean-run diff capture, non-zero exits, verified auto-commit suppression on the pinned version.

## Deferred / blockers

Narrow but real: validate the exact auto-commit suppression surface on the pinned version before implementation.

## Implementation checklist (v1)

- [ ] Pin an Aider version and validate non-auto-commit behavior.
- [ ] Refuse dirty worktrees by default.
- [ ] Capture before/after diff even on failure.
- [ ] Inject provider keys only through env.
- [ ] Route high-risk diffs to L3 before commit.
