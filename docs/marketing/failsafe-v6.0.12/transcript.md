# FailSafe: From Change to Confidence (v6.0.12) — transcript and text alternative

**Film:** `video/failsafe-6.0.12-from-change-to-confidence.mp4` · 1 min 53.5 s · 1920×1080, 30 fps · narrated (English)
**Captions:** `video/failsafe-6.0.12-from-change-to-confidence.en.vtt`
**Status:** review copy. The owner has accepted the narration and music; publication is not yet approved.

The narration is a synthetic voice and the music is an original instrumental, both generated locally in Sonic Rift 0.9.1. The music is a quiet bed with no lyrics; it carries no information. The picture is a real screen recording of FailSafe 6.0.12 running in VS Code 1.145.2 on a fictional repository ("Tasklet"). Editor actions were performed by script; no AI agent made the changes. FailSafe's responses on screen are its own.

## Narration

| Time | Scene | Narration |
|---|---|---|
| 0:01 | 1. The problem | AI can help you write code faster. But when something changes, how do you know what happened, what it affects, and whether it's ready to ship? |
| 0:11 | 2. Meet FailSafe | Meet FailSafe. A development companion that helps solo developers keep their work visible, understand potential risks, and maintain a record of important decisions. |
| 0:23 | 2b. First-run setup | Setup starts in the Console. Install the Qor-Logic skills, approve the request in VS Code, and the workspace is ready. |
| 0:34 | 3. One interface, one experience | With version 6.0.12, the Console, Monitor, and SRE views share a consistent visual experience. Change your theme, and your workspace follows. The information stays familiar, wherever you're working. |
| 0:51 | 4. A real development problem | Now imagine a small but important bug. A date validator accepts a day that doesn't exist. We document the issue, write a regression test, and see the failure for ourselves. |
| 1:05 | 5. Understanding the risk | Fixing the code is only part of the job. FailSafe helps surface the risks and governance requirements around a change, so the developer knows what still needs attention. |
| 1:17 | 6. Verify the result | The corrected validator passes its tests. We can inspect the difference, see the recorded decisions, and compare the result with what we intended to change. |
| 1:28 | 7. From evidence to decision | Every change has a story. What we set out to do, what we changed, what we checked, and what still needs review. FailSafe helps make that story easier to follow. |
| 1:40 | 8. Closing | Move faster without losing sight of the work. FailSafe. Build with AI. Know what changed. |

Scene 2b was added to the approved starting script at the owner's direction (2026-11-10) so the film shows the first-run "Get Started" banner and the real skill install instead of hiding the banner. "Qor-Logic" is spoken as "core logic".

## What the picture shows

| Time | On screen |
|---|---|
| 0:00 | MythologIQ Labs opener, then the FailSafe icon and the film title on dark navy. |
| 0:04 | VS Code with the fictional Tasklet repository; its README says it is a fictional demo. The FailSafe Monitor opens in the sidebar. |
| 0:11 | Slow push-in on the Monitor: build step, Sentinel status "Monitoring", workspace health tiles. |
| 0:16 | The FailSafe Console in the browser on first run. A "Get Started" banner says the Qor-Logic skills are not installed. |
| 0:21 | Console › Config › Qorlogic Skills. "Install / Refresh Skills" opens a dialog; Claude is left as the only target host. |
| 0:26 | VS Code asks "Install Qor-logic skills?" with Install and Cancel. Install is chosen. |
| 0:29 | The Console lists the install steps and reports "Installed 78 skills across claude". Back on Overview the banner is gone. |
| 0:33 | Side by side: the Console (left) and the Monitor sidebar (right). The Pegasus (light) theme is clicked in the Console; the Monitor turns light with it. |
| 0:39 | The sidebar is switched to the SRE view, still light. Aurora (teal) is clicked; Console and SRE view both turn teal. |
| 0:46 | Back on Pegasus, the Monitor's Reload button is pressed; the Monitor comes back in Pegasus. Mythiq (dark) is clicked and both return to dark. |
| 0:51 | `ISSUES.md`: TASK-14, impossible due dates such as 2026-02-30 are stored as a different day. |
| 0:54 | A regression test is added to `test/validation.test.ts` and saved. FailSafe shows: "FailSafe policy denied editor save (write not prevented): AXIOM 1 VIOLATION: No active Intent exists…". The file is saved anyway; FailSafe reports the save, it does not prevent it. |
| 0:58 | `npm test` in the terminal: `# pass 6`, `# fail 1`. The new test fails. |
| 1:05 | The fix is applied to `src/validation.ts` and saved. FailSafe shows: "FailSafe policy denied editor save (write not prevented): Action file.write requires active intent for risk level L2… Risk Grade: L2". |
| 1:11 | Console › Config: Governance Mode is Enforce. Then Governance › Audit Log with the recorded entries. |
| 1:16 | `npm test` again: `# pass 7`, `# fail 0`. |
| 1:20 | `git diff --stat` and the diff of `src/validation.ts` in the terminal. |
| 1:24 | Governance › Audit Log: verdicts, transparency records and an L3 request queued for review. Nobody answered it; it expired later. |
| 1:27 | Governance › Risks ("No risks recorded yet"), then Compliance (Sentinel active, chain valid, which metrics are authoritative and which are unknown). |
| 1:32 | Workspace › Delivery: "No active or sealed intent in this workspace yet." Nothing was approved or sealed. |
| 1:36 | Console Overview: 83 Sentinel events, L3 queue "1 pending", recent operations. A row named "override.approved" is FailSafe's own label for a closed L3 request; nobody approved anything. |
| 1:40 | VS Code with the Monitor in the sidebar and the Console's editor-tab view beside it. |
| 1:44 | End card: FailSafe · Build with AI. Know what changed. · Version 6.0.12 · Free and open source · Install "FailSafe (feat. Qor-Logic)" from the VS Code Marketplace or Open VSX · github.com/MythologIQ-Labs-LLC/FailSafe · MythologIQ Labs. |

## Short text alternative

A two-minute narrated walkthrough of FailSafe 6.0.12 in VS Code. It shows first-run setup from the Console, one theme applied live across the Console, Monitor and SRE view, and a small bug fix on a fictional repository: a failing regression test, the fix, FailSafe's risk notices and audit entries, passing tests, and the delivery view showing that nothing has been approved yet.
