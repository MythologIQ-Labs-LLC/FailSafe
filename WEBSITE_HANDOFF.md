# FailSafe: website homepage crop (2026-11-02)

**What this is:** a legible 2:1 homepage crop of an **existing** v6.0.11 RC screenshot. It adds nothing new and replaces nothing. The full v6.0.11 RC set, with its manifest, video and capture tools, stays on `docs/589-marketing-media` (owner review pending).

**Why:** the current homepage tile uses the full 1920×1080 console overview. At homepage size its text is unreadable, and it shows a "Qor-logic skills not installed" banner. This crop keeps three things large enough to read:

- the code change (TASK-14 due-date fix);
- FailSafe's signal: *"policy denied editor save (write not prevented) … requires active intent for risk level L2 … Risk Grade: L2"*, with **Create Intent** and **View Active Intent**;
- the honest context: the terminal shows a failing test (`fail 1`), which is the defect being fixed.

## Placement

| Page | Slot | File |
| --- | --- | --- |
| Homepage | FailSafe tile, replacing `failsafe-6.0.11-rc-01-console-overview-1600.jpg` | `homepage/failsafe-6.0.11-rc-05-risk-graded-crop-2x1.webp` (PNG alongside), 1552×776 |

The product page keeps the full RC carousel and walkthrough video unchanged.

## Story for a solo developer

When you, or an AI assistant working in your editor, change code without a declared intent, FailSafe flags it as it happens, grades the risk, and points you to the fix (declare an intent). The audit log records the event. You stay in flow.

## Claims the page must not make

- **Don't say "blocks", "prevents" or "protects".** The notice itself says the write was **not prevented**.
- **Don't say an AI agent made this edit.** A scripted driver made the RC captures. A governed agent run (Aider in a disposable worktree, with a review-diff dialog) exists in the code but was **not captured**: it needs a model API key (spend) or a local model that didn't fit the memory budget.
- **Don't call it the current release.** It's the 6.0.11 **RC** build; the released VSIX is a different build.
- **Licensing:** FailSafe is Apache-2.0. Don't mention any paid edition.
- The "Qor-logic" wording in FailSafe UI refers to the bundled `qor-logic` integration (PyPI `qor-logic`), not to Qortara Logic.
