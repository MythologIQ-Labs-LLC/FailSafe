# FailSafe media manifest: v6.0.11 release candidate (#589)

**Approval status: PENDING OWNER REVIEW.** These assets are not approved for public use. Nothing here has been published to a website, marketplace or release.

## Shared provenance (applies to every asset unless a row says otherwise)

| Field | Value |
|---|---|
| Product | FailSafe (feat. Qor-Logic) VS Code extension |
| Product version | **6.0.11 release candidate, not published.** The published release is v6.0.10. |
| Source commit | `43ab0ecbafbd73652e27fac64cc7330fe5c17e4b` on `release/6.0.11-rc0-prep-no-ci` |
| Installed package | `mythologiq-failsafe-6.0.11-win32-x64.vsix`, SHA-256 `9f732dc3794d0219864873dbcd265bfcc4fd57cafdb9b564e8f520597cf42c56`, built from that commit with `npm run package:all-targets`, installed with `code --install-extension` into an isolated profile |
| Demo fixture | `failsafe-demo-workspace` ("Tasklet"), commit `86c12f875d632dd9e21ca46e5afa83e7e8035060`, tag `demo-baseline`, bundled at [`demo-fixture/failsafe-demo-workspace.bundle`](demo-fixture/failsafe-demo-workspace.bundle). Screenshot 03 used the previous baseline `a488e02f` (same files; only the test reporter changed). |
| Operating system | Windows 11 Pro 10.0.26300 (x64) |
| Editor | VS Code 1.143.1 (`e646868227c3e3a9e3f24277c8c7220be42c0be7`), Default Dark Modern theme, editor font 15 px, zoom 0 |
| Capture date | 2026-10-29 |
| Capture method | `PrintWindow` (`PW_RENDERFULLCONTENT`) on the real VS Code window at 1920×1080. Screenshots are single frames; the video is the frame sequence at 10 fps (751 frames, 75.1 s), encoded at 30 fps. No pixels were added, removed or retouched. |
| Data classification | **Synthetic.** The repository, people, tasks and dates are fictional. The author identity is `Demo Developer <demo.developer@example.invalid>`. No account data, credentials, private URLs or personal information appear. Paths show the local folder `c:\dev\mythologiq\failsafe-demo-workspace`. |
| Actual vs simulated | **Actual:** VS Code, the installed FailSafe candidate, and every FailSafe notification, verdict, risk grade, audit entry, checkpoint and Console view; also the test runs and the Git diff. **Scripted:** the editor actions (opening files, inserting the test and the fix, saving, running terminal commands) were performed through the VS Code API by a disposable driver extension ([`capture-tools/`](capture-tools/)) standing in for a developer. **Not shown:** no AI agent made these changes, and no intent was created, approved or sealed. |
| Rights | FailSafe UI and icon: MythologIQ Labs, LLC (FailSafe is Apache-2.0). VS Code UI: Microsoft; screenshots of VS Code are used as product context. No third-party audio, music or fonts were added. The video has no audio track. |

## Assets

Full-resolution PNGs, WebP/JPG web exports, thumbnails and the video live outside Git, in the owner's durable media folder `C:\dev\mythologiq\FailSafe-media\v6.0.11-rc\`. Their checksums are in [`MEDIA_SHA256SUMS.txt`](MEDIA_SHA256SUMS.txt) (run `sha256sum -c` from that folder). The 1600×900 JPG exports, captions, transcript, brand files, fixture bundle and capture tools are also in this directory; their checksums are in [`REPO_SHA256SUMS.txt`](REPO_SHA256SUMS.txt).

| # | Asset | Resolution | Proposed placement | Caption | Alt text |
|---|---|---|---|---|---|
| 01 | `failsafe-6.0.11-rc-01-console-overview` | 1920×1080 (web 1600×900) | Product page hero or gallery lead | The FailSafe Monitor and Console inside VS Code, watching a demo repository. | VS Code with the FailSafe Monitor sidebar (Connected, Sentinel Monitoring, repository compliance C 76%) and the FailSafe Console overview showing Sentinel hybrid and active, L3 chain VALID, agent health Healthy and the recent operations stream. |
| 02 | `failsafe-6.0.11-rc-02-repository-open-issue` | 1920×1080 | Workflow section, step 1 | A real repository with a real defect: impossible due dates are stored as a different day. | VS Code Explorer listing the demo repository's src, test, docs and scripts folders, with ISSUES.md open on TASK-14, a date-validation bug. |
| 03 | `failsafe-6.0.11-rc-03-first-run-governance-mode` | 1920×1080 | Gallery, "Setup" | On first run in a repository, FailSafe asks how strict to be; Enforce is the default. | FailSafe's "Choose Governance Mode" picker in VS Code offering Enforce (default, require approval), Assist (warn) and Observe (watch only), with notifications that FailSafe is protecting the workspace and its MCP server is listening. |
| 04 | `failsafe-6.0.11-rc-04-change-flagged-no-intent` | 1920×1080 | Workflow section, step 2; video poster | FailSafe flags a change made without an active intent, and says plainly that it did not block the write. | A new regression test in validation.test.ts beside a FailSafe notification: "policy denied editor save (write not prevented): AXIOM 1 VIOLATION: No active Intent exists", with Create Intent, View Active Intent and Show Logs buttons. The Monitor's build step has moved to Audit. |
| 05 | `failsafe-6.0.11-rc-05-fix-risk-graded-l2` | 1920×1080 | Gallery, "Risk" | The fix to a validation module is graded L2, a higher risk level than the test change. | The fix in src/validation.ts highlighted, with a FailSafe notification "file.write requires active intent for risk level L2 … Risk Grade: L2"; the terminal still shows the earlier run with one failing test. |
| 06 | `failsafe-6.0.11-rc-06-governance-audit-log` | 1920×1080 | Workflow section, step 3 | Every verdict and review request lands in a filterable audit log. | The FailSafe Console Governance tab, Audit Log view, listing Sentinel verdicts (PASS L2 for .vscode/settings.json, PASS L1 for validation.test.ts) and a governance L3 queued event for src/validation.ts, with filters and Export CSV. |
| 07 | `failsafe-6.0.11-rc-07-outcome-diff-and-checkpoints` | 1920×1080 | Workflow section, step 4 | The outcome: tests pass, new checkpoints are recorded, one change waits for L3 review, and the diff is ready to inspect. | The FailSafe Console overview with Sentinel events 4, an operations stream including an ESCALATE override request, L3 queue 1 pending, and a terminal showing git diff --stat for three changed files. |
| V | `failsafe-6.0.11-rc-walkthrough.mp4` (H.264) / `.webm` (VP9) | 1920×1080, 30 fps, 75.1 s, no audio | Product page workflow section, click to play (no autoplay) | A 75-second walkthrough: a test exposes a bug, the fix is verified, and FailSafe records the risk and evidence. | Use the transcript's short text alternative. |
| P | `failsafe-6.0.11-rc-walkthrough-poster.png` / `.jpg` | 1920×1080 | Video poster | (same frame as 04) | (same as 04) |
| C | `failsafe-6.0.11-rc-walkthrough.en.vtt` | 11 cues | Video `<track kind="captions">` | n/a | n/a |
| T | `failsafe-6.0.11-rc-walkthrough-transcript.md` | n/a | Linked under the video | Full transcript, short text alternative, actual vs scripted statement | n/a |
| B | `brand/failsafe-icon-256.png`, `brand/failsafe-icon-mono.svg` | 256×256 RGBA; SVG (`currentColor`) | Existing approved icon only | Unchanged copies of `FailSafe/extension/media/icon.png` and `failsafe-icon.svg` | "FailSafe" |

## Local verification (2026-10-29)

- Every PNG, JPG and WebP opens; all full-resolution captures are 1920×1080 and the web exports 1600×900 (`ffprobe`).
- MP4 and WebM decode with `ffprobe`: 1920×1080, 30 fps, 75.1 s.
- The VTT parses (11 cues, last ends at 01:15.100, inside the 75.1 s video). Cue times come from the driver's action log, offset from the capture start.
- The screens reflect the pinned build: the Monitor footer shows the 6.0.11 candidate's fix (`provided "as is"`), and the Console hub API (`/api/hub`) reported `version: "6.0.11"` during the take.
- The fixture bundle clones to `86c12f87` and its tests pass 6/6; after the recorded change, 7/7.

## Known limitations

- **Release candidate, not a release.** The UI is 6.0.11 RC; publication is blocked by #467. Do not caption these as "the current release".
- **Intent workflow not shown.** Creating an intent requires an active plan and interactive prompts. The video shows the flag and the **Create Intent** button but does not use them.
- **The L3 request was left unanswered.** Unanswered L3 requests expire after the 120-second SLA. Do not describe the queue as an approval.
- **Editor saves are reported, not prevented.** The notifications say "write not prevented", in line with the README. Do not market this as blocking edits.
- **Single platform.** Windows 11, VS Code 1.143.1 only. Not captured on macOS, Linux or Cursor.
- **The Console's "Get Started" banner is visible** because Qor-Logic skills were not installed in the demo workspace. That is the real first-run state.
