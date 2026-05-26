// FailSafe Educational Component — Phase 2A: SWE-domain glossary (B/3).
//
// RD-6 / RD-1: leaf data module — no runtime imports, no DOM. Carries the
// version-control / change-management slice. See `glossary-content.ts` for
// the authoring conventions; `lessons.ts` concatenates all SWE_GLOSSARY_LESSONS_*.

import type { Lesson } from "./lessons";

/** SWE-domain glossary, part B of 3 — version control & change management. */
export const SWE_GLOSSARY_LESSONS_B: Lesson[] = [
  {
    id: "glossary-branch",
    anchor: "glossary.swe.branch",
    kind: "glossary",
    domain: "swe",
    term: "Branch",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "A branch is a parallel copy of your project where you can try changes without disturbing the main version. You make a branch, experiment, and only fold the work back in when you are happy with it. The main branch stays clean meanwhile.",
      intermediate: "A branch is a moveable pointer to a commit, isolating a line of work. Long-lived branches accrue merge cost; short-lived ones keep integration cheap. Branch lifetime is a process choice, not a tool one.",
      advanced: "Branch = moveable commit pointer = isolated work line. Lifetime tunes integration cost.",
    },
  },
  {
    id: "glossary-commit",
    anchor: "glossary.swe.commit",
    kind: "glossary",
    domain: "swe",
    term: "Commit",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "A commit is a saved checkpoint of your project at one moment, with a short message explaining the change. The history of commits is the project's timeline — you can go back to any point and see exactly what the code looked like then.",
      intermediate: "A commit is an atomic, addressable snapshot of the working tree plus metadata. Small focused commits make review, bisect, and revert tractable; jumbo commits defeat all three.",
      advanced: "Commit = atomic addressable snapshot + metadata. Granularity drives bisect/review/revert utility.",
    },
  },
  {
    id: "glossary-diff",
    anchor: "glossary.swe.diff",
    kind: "glossary",
    domain: "swe",
    term: "Diff",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "A diff shows what changed between two versions of a file — which lines were added, removed, or altered. It is how reviewers see your work without reading the whole file: just the red lines that left and the green ones that arrived.",
      intermediate: "A diff is the line-level delta between two tree states. Diff readability is the cheapest review aid you have — formatting-only noise buried with logic changes is a code-review killer.",
      advanced: "Diff = line-level inter-state delta. Signal-to-noise ratio = review-cost driver.",
    },
  },
  {
    id: "glossary-merge",
    anchor: "glossary.swe.merge",
    kind: "glossary",
    domain: "swe",
    term: "Merge",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "Merging folds the changes from one branch into another. Most of the time the tool figures it out, but if both branches changed the same lines you get a conflict and have to choose which version (or how to combine them) wins.",
      intermediate: "A merge integrates two divergent histories into a single tree, creating a merge commit unless fast-forward applies. Conflicts arise where the two sides edit the same region — never automatic.",
      advanced: "Merge = history-integration op producing union tree. Conflict = overlapping region edit.",
    },
  },
  {
    id: "glossary-pull-request",
    anchor: "glossary.swe.pull-request",
    kind: "glossary",
    domain: "swe",
    term: "Pull request",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "A pull request (PR) is a formal proposal to merge your branch into another. It bundles your diff, a description, and a place for others to comment, approve, or block. It is the gate before your changes land in the shared codebase.",
      intermediate: "A pull request is the review-and-gate surface around a branch merge. It carries diff, description, checks, and reviewer state — the smaller the PR, the better the review signal.",
      advanced: "Pull request = reviewable merge proposal + check surface. PR size inversely scales review quality.",
    },
  },
  {
    id: "glossary-code-review",
    anchor: "glossary.swe.code-review",
    kind: "glossary",
    domain: "swe",
    term: "Code review",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "Code review is when another person reads your proposed change before it lands. They look for bugs, unclear bits, missing tests, or simpler ways to do the same thing. It is a quality check and a knowledge-sharing step at once.",
      intermediate: "Code review trades a small latency hit for shared ownership, bug catch, and cross-pollination of context. Style nits should go to a linter; review attention belongs on design and correctness.",
      advanced: "Code review = peer pre-merge check. Reserve human attention for design + correctness; automate style.",
    },
  },
  {
    id: "glossary-rebase",
    anchor: "glossary.swe.rebase",
    kind: "glossary",
    domain: "swe",
    term: "Rebase",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "Rebasing rewrites your branch's history so it looks like you started from the current tip of another branch. The result is a clean straight line instead of a merge knot. It rewrites history, so you avoid it on branches other people share.",
      intermediate: "Rebase replays your commits onto a new base, producing linear history. The trade-off is rewritten SHAs — fine for local or single-author branches, hazardous on shared ones.",
      advanced: "Rebase = replay onto new base = linearised history at cost of new SHAs. Avoid on shared refs.",
    },
  },
  {
    id: "glossary-conflict",
    anchor: "glossary.swe.conflict",
    kind: "glossary",
    domain: "swe",
    term: "Conflict",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "A conflict happens when two changes touch the same lines and the tool cannot tell which to keep. It marks the file with both versions side by side and asks you to pick. Resolving the conflict means editing the file into the final state you want.",
      intermediate: "A conflict is a region the merge engine cannot auto-resolve because both sides edited overlapping content. Resolution requires human intent — the tool can only show the disagreement, not decide it.",
      advanced: "Conflict = unresolvable overlap requiring human merge intent. Tooling shows, does not decide.",
    },
  },
  {
    id: "glossary-patch",
    anchor: "glossary.swe.patch",
    kind: "glossary",
    domain: "swe",
    term: "Patch",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "A patch is a diff saved as a portable file. You can hand it to someone else and they can apply it to their copy of the code to get the same change. Patches are how fixes traveled before pull requests, and they still show up in security backports.",
      intermediate: "A patch is a serialised diff plus enough metadata to be applied out-of-band. Useful for backports, email-driven workflows, and any scenario where you cannot share branches directly.",
      advanced: "Patch = portable serialised diff. Backport + out-of-band delivery vehicle.",
    },
  },
  {
    id: "glossary-refactor",
    anchor: "glossary.swe.refactor",
    kind: "glossary",
    domain: "swe",
    term: "Refactor",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "Refactoring is changing how code is organised without changing what it does. You rename things for clarity, split a long function into smaller ones, move shared logic to one place. The behaviour is unchanged; only the shape gets cleaner.",
      intermediate: "Refactor is a behaviour-preserving structural change, ideally covered by tests so you can prove preservation. Mixing refactor with behavioural change in one commit blinds review.",
      advanced: "Refactor = behaviour-preserving structural change. Keep separate from behavioural deltas.",
    },
  },
  {
    id: "glossary-rewrite",
    anchor: "glossary.swe.rewrite",
    kind: "glossary",
    domain: "swe",
    term: "Rewrite",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "A rewrite is throwing out an existing piece of code and building the same feature again from scratch. It sounds clean but tends to lose all the small fixes the original accumulated. Most teams prefer to refactor incrementally instead.",
      intermediate: "A rewrite replaces a component wholesale rather than evolving it. The cost is rediscovering every undocumented requirement the old code already honoured — usually larger than estimated.",
      advanced: "Rewrite = wholesale replacement. Hidden requirements = the always-underestimated cost.",
    },
  },
  {
    id: "glossary-regression",
    anchor: "glossary.swe.regression",
    kind: "glossary",
    domain: "swe",
    term: "Regression",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "A regression is when something that used to work stops working after a change. It is the special kind of bug you introduce while fixing or improving something else. Regression tests are the tests written to keep old bugs from coming back.",
      intermediate: "A regression is a behavioural breakage in previously-working functionality, usually surfaced by a downstream test or report. A regression test pins the fix so the same break cannot recur silently.",
      advanced: "Regression = previously-working behaviour now broken. Regression test = pinned anti-recurrence assertion.",
    },
  },
  {
    id: "glossary-blast-radius",
    anchor: "glossary.swe.blast-radius",
    kind: "glossary",
    domain: "swe",
    term: "Blast radius",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "Blast radius is how much damage a change can do if it goes wrong. A typo in one screen has a small blast radius; a change to the shared database schema has a huge one. The bigger the radius, the more carefully you stage the change.",
      intermediate: "Blast radius is the scope of impact when a change misbehaves — users affected, services touched, data altered. It is the input to staging strategy: canary, feature flag, or just-ship.",
      advanced: "Blast radius = worst-case impact scope of a change. Drives staging strategy.",
    },
  },
  {
    id: "glossary-reversibility",
    anchor: "glossary.swe.reversibility",
    kind: "glossary",
    domain: "swe",
    term: "Reversibility",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "Reversibility is how easily you can undo a change. Reverting a commit is highly reversible; dropping a database table is not. Knowing which kind you are about to make should change how much review and testing you require before you do it.",
      intermediate: "Reversibility classifies a change by how cheaply it can be undone. Two-way-door changes can ship fast; one-way-door changes deserve deliberate review and a rollback plan baked in.",
      advanced: "Reversibility = undo cost. Two-way door fast, one-way door needs rollback plan.",
    },
  },
  {
    id: "glossary-acceptance-criteria",
    anchor: "glossary.swe.acceptance-criteria",
    kind: "glossary",
    domain: "swe",
    term: "Acceptance criteria",
    levels: ["beginner", "intermediate", "advanced"],
    body: {
      beginner: "Acceptance criteria are the checklist that says a piece of work is actually done. They are written before the work starts and phrased so anyone can tell whether each one is met. Without them \"done\" is whatever the implementer felt like calling done.",
      intermediate: "Acceptance criteria are pre-agreed, observable conditions that define completion. They convert vague intent into testable assertions and pre-empt the \"that is not what I meant\" loop at review time.",
      advanced: "Acceptance criteria = pre-agreed observable completion conditions. Done = all met.",
    },
  },
];
