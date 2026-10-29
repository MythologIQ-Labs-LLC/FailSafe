# FailSafe 6.0.11 RC walkthrough: transcript and text alternative

**Length:** 75 seconds. **Audio:** none (captions only). **Version:** FailSafe 6.0.11 release candidate (not published). **Repository shown:** a fictional demo, not a real project.

## Transcript (matches the captions)

| Time | On screen | Caption |
|---|---|---|
| 0:00 | VS Code Explorer with the `failsafe-demo-workspace` files | Tasklet, a small fictional TypeScript repository, is open in VS Code with FailSafe 6.0.11 (release candidate). |
| 0:04 | `ISSUES.md` open on TASK-14 | Its open issue, TASK-14: impossible due dates such as 2026-02-30 are silently stored as a different day. |
| 0:09 | FailSafe Monitor sidebar: Connected, Sentinel Monitoring, repo compliance C | The FailSafe Monitor shows the Sentinel watching this workspace. FailSafe is running in Enforce mode. |
| 0:12 | FailSafe Console overview inside VS Code: Sentinel hybrid/active, L3 chain VALID, agent health Healthy, operations stream | The FailSafe Console shows the workspace, an active Sentinel, a valid checkpoint chain and the repository compliance grade. |
| 0:21 | `test/validation.test.ts`: a new TASK-14 test is inserted and saved; FailSafe notification "policy denied editor save (write not prevented): AXIOM 1 VIOLATION: No active Intent exists" with **Create Intent** | A regression test for TASK-14 is added and saved. FailSafe flags the save: no intent is active. It reports the change; it does not prevent the write. |
| 0:29 | Terminal: `npm test` ends `# pass 6`, `# fail 1` | Running the tests confirms the bug: 6 pass, 1 fails. |
| 0:35 | `src/validation.ts`: four lines reject a date whose canonical form differs; FailSafe notification "file.write requires active intent for risk level L2 … Risk Grade: L2" | The fix rejects days that do not exist in their month. FailSafe grades this source change L2 and flags it again. |
| 0:43 | Terminal: `npm test` ends `# pass 7`, `# fail 0` | The tests now pass: 7 of 7. |
| 0:50 | Console › Governance › Audit Log: `SENTINEL.VERDICT` PASS entries (L2 for `.vscode/settings.json`, L1 for the test), `GOVERNANCE.L3QUEUED` for `src/validation.ts` | The Governance audit log records each Sentinel verdict and the L3 review request queued for the validation change. |
| 1:00 | Console overview: Sentinel events 4, operations `attempt.committed`, `policy.checked`, `override.requested` (ESCALATE), L3 Queue 1 pending | Back on the overview: new checkpoints, and one L3 item waiting for review. |
| 1:04 | Terminal: `git --no-pager diff --stat`: `.gitignore` +1, `src/validation.ts` +4/−1, `test/validation.test.ts` +6 | The resulting diff: the fix, its test, and the .gitignore entry FailSafe added on first run. The developer can review all of it before committing. |

## Short text alternative

A developer opens a small fictional TypeScript repository in VS Code with FailSafe running in Enforce mode. They add a regression test for a known date-validation bug, and FailSafe flags the save because no intent is active (it reports, it does not block the write). The test run shows one failure. They fix the validator; FailSafe grades that source change at risk level L2 and flags it too. The tests pass 7 of 7. The FailSafe Console's audit log shows the Sentinel verdict for each change and an L3 review request for the source file, and the overview shows the new checkpoints. The video ends on the three-file diff.

## What was and was not real

- Real: VS Code, the installed FailSafe 6.0.11 candidate package, every FailSafe notification, verdict, audit entry and Console view, and the test runs.
- Scripted: the editor actions (opening files, inserting the test and the fix, saving, running commands) were performed by a disposable driver extension through the VS Code API, standing in for a developer's typing and clicks.
- Not shown: no AI agent made these changes, and no intent was created or approved. The L3 request in the queue was left unanswered (FailSafe expires unanswered L3 requests after its 120-second SLA).
