# The Vibe Coder's Playbook

**Audience**: AI-assisted builders, PMs gaining developer literacy, and true beginners who can extract working-ish code from an agent but haven't yet internalized the engineering disciplines that make AI-assisted work sustainable. **Companion**: the [FailSafe Learn](EDUCATION.md) tab on the Command Center.

You can still move fast. You just don't get to be blind while doing it.

## Why the disciplines

AI agents make it trivial to *produce a lot of change quickly*. Speed alone doesn't make the change *correct* — and it actively hides the moments where engineering judgment is needed. The common failure modes:

- Starting to prompt without a scope.
- Letting the agent expand scope opportunistically — "while I was in there…".
- Editing high-blast-radius files without understanding what they touch.
- Skipping verification because the generated code *looks* right.
- Treating the agent's confident tone as proof.
- Producing a session of churn with no checkpoint to revert to.

The mantra: **Slow down to speed up.** The five disciplines below are the antidote.

## The five essays (the curriculum, in order)

### 1. Slow down to speed up

The cheapest move in software is to slow down at the start. Before each prompt: name what you're about to change and why, in one sentence. Every 20–30 minutes: commit, pause, and ask *can I summarize what I just did?* If you can't, stop and read the diff.

### 2. Scope before prompt

Scope is the smallest useful change. *Smallest* matters: you can always do another small one next. *Useful* matters: a change that fixes nothing visible has no scope; you're tinkering. Pick one of *patch* (behavior, not structure), *refactor* (structure, not behavior), or *rewrite* (both — most expensive). Earn the right to rewrite by trying a patch first.

### 3. Acceptance criteria before code

Done is a definition, not a feeling. Use the template — every time:

```text
I am changing [specific behavior] for [user/context] so that [outcome].
It is done when [observable condition 1], [observable condition 2], and [non-goal/risk boundary].
I will verify it by [command/manual check] and by checking [edge case].
```

The non-goal line matters as much as the goal lines. It's the only thing that prevents the agent from "improving" the neighborhood while it was there.

### 4. Choosing between agent suggestions

Helpful is not the same as correct. When the agent gives a choice, the choice itself is information. When the agent gives only one option, your most undervalued prompt is *"What are two simpler ways to do this?"*

| Question | Why it matters |
|---|---|
| Which option is smallest? | Smaller changes are easier to understand, test, and undo. |
| Which option changes the fewest files? | More files usually means more blast radius. |
| Which option adds dependencies or config? | Dependency/config changes create maintenance and security risk. |
| Which option can I verify clearly? | If the check is unclear, the option is not ready. |
| Which option can I explain back? | If you can't explain it, ask for a smaller or clearer option. |
| Which option is easiest to reverse? | Reversibility matters when the agent is wrong. |

### 5. Verify before you believe

Generated code is a claim. The 6-step verification loop:

1. **Read the diff.** Every file. Every change. Anything changed you didn't ask for is your first signal — stop and ask the agent why.
2. **Run it.** Don't trust *compiles* as a proxy for *works*.
3. **Run any tests/checks that exist.**
4. **Reproduce the original problem** and confirm it's gone.
5. **Check one edge case** the prompt didn't mention. Empty input. The other tenant. The page-reload-mid-flow case.
6. **For risky changes**, ask the agent: *"What could go wrong with this? What did you not test?"* — give it permission to surface risks.

## Your first safe task

A good first governed task is small, reversible, and real. Example: **"Add a one-line tooltip to an existing button."**

1. Open the Learn tab. Once you start touching files, the contextual trigger may surface *Scope before prompt* (the trigger needs both an absent / mismatched plan AND actual file activity — the empty Learn view alone never produces a badge).
2. Write your scope sentence: "Add a tooltip to the Export button explaining the output format."
3. Use the acceptance-criteria template: "It is done when hovering the Export button shows the tooltip text. I'll verify by hovering it. Non-goal: don't change the button label."
4. Prompt the agent with the scope sentence + criteria.
5. Run the verification loop: read the diff, run it, hover the button, check it on Firefox + Chrome.
6. Commit when the criteria check.

You will have practiced all five disciplines on a task too small to break anything. The next one will feel familiar.

## How to read the Learn tab

- Open the Command Center → **Learn** tab.
- The five essays appear as cards. The currently-relevant essay (per the contextual trigger engine, which observes your project state — active plan, file activity, checkpoints, session duration) is sorted to the top with a "Relevant for what you are doing now" badge.
- If a card is showing the "Relevant for what you are doing now" badge, you can click **Mark as read** to hide just that badge for the rest of the session. The essay itself stays in the directory — the five essays are the curriculum, and the curriculum is never hidden.
- The FailSafe Glossary lives below the essays as a reference for FailSafe-specific terms (Sentinel, SHIELD, the ledger, etc.) — it's not the point of the tab, but it's there.
- The proficiency setting in your VS Code Settings (`failsafe.education.proficiency`) selects how the essays are framed: *New to code* / *AI builder* / *Product/PM background*. Set it once; the system never changes it.

## What this isn't

FailSafe Learn does **not** score you, grade you, or infer your skill level. It does **not** quiz you. It does **not** block your work. It is a small, opt-in surface that surfaces a relevant short essay when the project's state suggests one would help. Full curriculum / certification / learning-progression systems belong in FailSafe Pro or a separate extension — explicitly out of scope for this open extension.
