# FailSafe 6.0.12 product film — review package and website handoff

**FailSafe: From Change to Confidence** · *Build with AI. Know what changed.*
1 min 53.5 s · 1920×1080 · 30 fps · H.264 / AAC · narrated, English captions

**Status: review copy, PENDING OWNER REVIEW.** Do not publish, deploy or replace the 6.0.11 media until the owner has watched and listened to the film and approved it. Tracking: FailSafe #645 (and #589); website `Knapp-Kevin/MythologIQ` #175, Stage B.

Everything between the title card and the end card is a real screen recording of the published FailSafe 6.0.12 on a fictional repository. How it was made, what is scripted, and what the film must not be used to claim: [PROVENANCE.md](PROVENANCE.md). Words and scene description: [transcript.md](transcript.md). Checksums: [manifest.json](manifest.json).

## Layout

| Folder | Contents |
|---|---|
| `video/` | The narrated film, a silent captioned variant, poster (PNG, JPG), WebVTT captions |
| `screenshots/full/` | Full-resolution PNGs from the recordings; `web/` 1600×900 WebP and JPG; `thumbnails/` 480×270 JPG; `source-frames/` the unedited frames the two composites were built from |
| `audio/` | `narration/` the nine selected takes (unprocessed WAV); `narration-takes/` every take and the scores; `voice-candidates/` and `music-candidates/` what the owner chose from; `mix/` the Sonic Rift project, its export (master, stem) and QA; the final film mix WAV |
| `source/` | `captures/` raw window recordings and event logs; `capture-rig/` the capture scripts and fixture bundle; `tools/` narration, mix, edit and caption scripts; `edit/` the cut list and cards; `narration/` the script and the voice design clip |

**Large files and Git.** The repository has no LFS and ignores `docs/`. Following the 6.0.11 media precedent, the media branch carries the deliverables (video, poster, captions, screenshots, selected narration takes, scripts, documents; about 44 MB, added with `git add -f`). The raw captures, all narration takes and the WAV masters (about 582 MB) stay on the workstation at `C:\dev\mythologiq\failsafe\docs\marketing\failsafe-v6.0.12\`; `manifest.json` lists each with its SHA-256 and `"in_git": false`. The media branch is not meant to be merged into `main`.

## Website placement (Studio #175, Stage B)

| Asset | Proposed use |
|---|---|
| `video/failsafe-6.0.12-from-change-to-confidence.mp4` | Featured film on the FailSafe product page. No autoplay with sound; show controls. |
| `video/…-poster.jpg` (`.png` master) | `poster` for the video element and the film's link preview. |
| `video/…​.en.vtt` | `<track kind="captions" srclang="en" label="English" default>`. |
| `transcript.md` | Accessible transcript beside or under the player. |
| `video/…-silent-captioned.mp4` | Optional muted loop or social preview. It is a variant; do not present it as the film. |
| `screenshots/web/06-homepage-console-monitor-6.0.12.webp` | Homepage card and hero (16:9, 1600×900; master 2400×1350). |
| `screenshots/web/01…05c` | Product gallery, in number order. |
| `screenshots/full/07-monitor-panel-mobile.png` | Narrow layouts (360×1004, the Monitor panel at native size). |

The 6.0.11 RC gallery and silent walkthrough are untouched and should be kept and labelled as historical when this replaces them.

### Screenshots: alt text and captions

| File | Alt text | Caption |
|---|---|---|
| `01-console-overview-dark` | FailSafe Console overview in the dark Mythiq theme: 81 Sentinel events, 0 active threats, a valid L3 chain and a list of recent operations. | The Console overview after first-run setup. |
| `02-monitor-vscode-dark` | VS Code with the FailSafe Monitor in the sidebar showing the build step, Sentinel status "Monitoring" and workspace health tiles, next to the demo project's README. | The Monitor sits in the VS Code sidebar. |
| `03-console-monitor-pegasus-light` | The FailSafe Console settings page and the Monitor sidebar side by side, both in the light Pegasus theme. | One theme, chosen in the Console, applied to the Monitor as well. (Composite of two simultaneous recordings.) |
| `04-fix-risk-notice` | VS Code with a fix in `validation.ts` selected and a FailSafe notification reading "policy denied editor save (write not prevented)" with risk grade L2. | FailSafe reports a save made without an active intent and grades the risk. The save is reported, not prevented. |
| `04b-governance-audit-log` | The Console's Governance audit log listing verdict and transparency entries with timestamps. | Recorded events in the audit log. |
| `05-tests-pass` | VS Code terminal showing the test run ending with 7 passed and 0 failed. | The regression test passes after the fix. |
| `05b-diff` | VS Code terminal showing `git diff` for `src/validation.ts` with the added lines in green. | The change, as Git sees it. |
| `05c-delivery-pending` | The Console's Delivery view reading "No active or sealed intent in this workspace yet." | Nothing has been approved or sealed yet. |
| `06-homepage-console-monitor-6.0.12` | The FailSafe 6.0.12 Console overview and the Monitor sidebar side by side in the same dark theme. | FailSafe 6.0.12: Console and Monitor in one theme. (Composite of two simultaneous recordings.) |
| `06-alt-homepage-console-monitor-after-journey` | Same layout later in the session, with 83 events. | Alternate. Its operations list includes FailSafe's "override.approved" row for an expired request; prefer `06`. |
| `07-monitor-panel-mobile` | The FailSafe Monitor panel alone, dark theme. | The Monitor at native size. |

Crops: the composites are 16:9 and hold up at 1600×900. On a phone the Console text in `06` is small; use `07` or the 4:3 centre of `01` there. This has been judged from the images only, not in the site's layout.

### Suggested description (38 words)

FailSafe is a free, open-source companion for solo developers who build with AI in VS Code. It keeps changes visible, grades their risk, and records decisions. Version 6.0.12 brings one theme to the Console, Monitor and SRE view.

Do not add install counts, "blocks", "prevents", "certified" or "verified delivery" to copy based on this film; see PROVENANCE.md section 7.

## Owner review checklist

1. Watch and listen to the whole film: pronunciation of FailSafe, "S R E", "six point zero point twelve", "Core Logic"; pace (about 146 words per minute); any jump between takes. Nobody has listened to the finished cut end to end yet.
2. Confirm the narrator across the whole film: you chose the male voice (candidate 3) from a single sample line on 2026-11-10, after rejecting the first cut's voice. Its pitch varies a little from line to line.
3. Accept the added setup scene and its line (scene 2b), and the music: you chose bed C from a 36-second preview and have not heard it under the whole film. Check its level against the voice and the fade over the end card.
4. Decide whether the "override.approved" row at 1:36 and the empty SRE state at 0:39 are acceptable on screen.
5. Confirm the end-card wording and the Marketplace / Open VSX / GitHub references.
6. Decide where the 582 MB of sources should live long term, and whether the media branch may be pushed.
