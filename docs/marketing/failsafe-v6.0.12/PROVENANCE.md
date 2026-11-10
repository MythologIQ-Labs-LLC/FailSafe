# Capture and production provenance — FailSafe 6.0.12 film

Recorded and assembled 2026-11-10 on the owner's Windows workstation (Windows 11 Pro 10.0.26300, RTX 5070 Ti). Tracking: FailSafe #645 (media), #589 (earlier media brief), Studio website `Knapp-Kevin/MythologIQ` #175.

**Approval status: PENDING OWNER REVIEW.** Nothing here has been watched or listened to by a person. The checks below are automated (ffprobe, loudness meters, speech-to-text, frame inspection by the producing agent).

## 1. What was filmed

| Item | Value |
|---|---|
| Product | FailSafe (feat. Qor-Logic) **6.0.12**, `mythologiq-failsafe-6.0.12-win32-x64.vsix` |
| Package source | GitHub release `MythologIQ-Labs-LLC/FailSafe` **v6.0.12** (published 2026-11-10T15:39:04Z; tag commit `0e70e53956e893cda40c7eea01722dfc25db7cf0`) |
| Package SHA-256 | `c247052b08b3c5edf7521900e83a2eabeec934705fb27a36cfbb7bc3cc8f2fae`, equal to the release digest and to `SHA256SUMS.txt` |
| Same as the installed copy | The owner's own VS Code has 6.0.12 from the Marketplace (installed 2026-11-10 13:36 local). Its 187 payload files are byte-identical to the release VSIX; only VS Code's `package.json` metadata and `.vsixmanifest` differ. |
| Editor | VS Code **1.145.2** (commit `c4453f8ea430795f941c1b2ff6c9321135a74a02`), Microsoft-signed archive build of the same version and commit as the installed VS Code. The installed copy was mid-update and would not start a second instance, so the archive build was used. |
| Profile | Isolated: own user-data, extensions and HOME folders (`source/capture-rig/isolated-user-settings.json`). The owner's real VS Code profile, settings and extensions were not loaded or changed. |
| Extensions loaded | FailSafe 6.0.12 and a disposable driver extension (`source/capture-rig/driver/`), nothing else. Chat/Copilot features off. |
| Browser | Chrome 157.0.8103.38 with a disposable profile, launched by VS Code itself through `workbench.externalBrowser` when the Monitor's **Console** button was pressed. |
| Fixture | Fictional "Tasklet" TypeScript repo: `failsafe-demo-workspace` tag `demo-baseline` (`86c12f875d632dd9e21ca46e5afa83e7e8035060`) plus one commit adding a fictional `docs/CONCEPT.md`, cloned to `C:\demo\tasklet`. Author "Demo Developer <demo.developer@example.invalid>". Bundle: `source/capture-rig/tasklet-demo-baseline.bundle`. |
| Qor-Logic | qor-logic **0.176.1** already present in a Python environment at `C:\demo\python` (a copy of the environment used in earlier FailSafe qualification); `failsafe.qorlogic.pythonPath` points at it. |

## 2. How it was recorded

- Two windows were recorded at once, each by its own ffmpeg 9.0.1 process using Windows.Graphics.Capture (`gfxcapture`, 30 fps maximum, no cursor), encoded lossless (x264 `-qp 0`, 4:4:4). Frames carry wall-clock timestamps from a shared start, so the two recordings stay in step. Windows only delivers a frame when the window changes, so still stretches have few frames; the edit holds the last frame, it never invents one.
- VS Code window: 1920×1080 content, `window.zoomLevel` 1 (120 %). Chrome: 125 % device scale, window sized so the page is exactly 1920×1080; the tab strip and address bar are cropped off, so the Console recording is the page itself.
- Recorded on the second display. No other window, notification or personal path is in frame. Paths that appear are `C:\demo\tasklet\…` and `C:\demo\python\…`.
- Scripts: `source/capture-rig/` (`prep.ps1` reset and launch, `settle.cjs` pre-roll, `stage.cjs` window sizing, `perform.cjs` the performance, `capture.cjs` recording). Event times for every step: `source/captures/*/events-*.json`. Driver log: `source/captures/take2/evidence/driver-actions.log`.

### Pre-roll, not in the film

1. Fresh profile and fresh fixture; published VSIX installed.
2. **FailSafe: Set Governance Mode** run once and **Enforce** (the highlighted default) chosen, so the first-run mode picker would not open over a later scene. This wrote `.vscode/settings.json` in the fixture.
3. The Monitor's own **Console** button pressed; VS Code opened the Console in Chrome.

### Takes

| Take | Started (UTC) | Used for |
|---|---|---|
| `take2` | 2026-11-10 19:37:56 | Everything except the theme scene. One continuous session, segments recorded in story order. |
| `take2b` | 2026-11-10 19:42:58 | The theme scene, recorded again in the same session straight after `take2` (see "Observed product behaviour" 2). |

Earlier runs (`rehearsal`, `take1`) used the same scripts and are not in the film. Rehearsals before 19:25 UTC used a locally built pre-tag 6.0.12 (SHA `5dc0859e…`); no footage from them is used.

## 3. What is scripted and what is FailSafe

**Scripted (a stand-in for a developer's clicks and keystrokes):** opening files and views, inserting the test and the fix and saving, typing `npm test` and `git diff` in the terminal, pressing FailSafe's own buttons and tabs (Console, Reload, Monitor/SRE, theme chips, Install / Refresh Skills, the host checkboxes, Install in the VS Code dialog). Buttons were pressed by script, so no pointer is visible.

**Not scripted (FailSafe and the tools responding):** the Get Started banner and its disappearance, install progress and "Installed 78 skills across claude", theme changes reaching the Monitor and SRE view and surviving Reload, both "policy denied editor save (write not prevented)" notifications and the L2 risk grade, Sentinel verdicts and audit entries, the L3 request and its expiry, Monitor and Overview numbers, the Delivery text, test output and git output.

**No AI agent made any change in this film.**

## 4. Edit

`source/tools/build_film.py`; exact clip list with source in/out times in `source/edit/edit-decision-list.json`.

- 26 clips, cut for time with hard cuts. No clip is sped up, slowed, recoloured or retouched.
- Framing: one slow push-in on the Monitor (0:11–0:16); the theme scene (0:33–0:51) puts the Console page and the sidebar region of the VS Code window side by side, same clock, scaled down, with the labels "Console" and "Monitor · SRE" added by the edit.
- Generated graphics, not product UI: MythologIQ Labs opener (the studio's `make_opener.py` and mark file), title card, end card, the two labels, the navy backdrop of the side-by-side.
- Logos: MythologIQ mark `mythologiq-silver-concept.webp` (SHA-256 `c0141a60…94b2`, scaled down only); FailSafe icon `extension/media/icon.png` taken from the published VSIX (never scaled up). No FailSafe wordmark file exists; the name is set in DM Sans (OFL).
- Steps recorded but cut: the README hold, the full skill-install wait (about 6 s), three more themes (Atmosphere, Crimson, Midnight), opening the test file before editing, waits between scenes.

## 5. Narration and sound

| Item | Value |
|---|---|
| Tool | **Sonic Rift 0.9.1**, the installed build at `C:\LocalAI\Voice\Chatterbox\demo-v091\app\Sonic Rift`, run with its own Python. All speech generated locally on this machine. |
| Method | `source/tools/failsafe_narration.py` drives the real app window off-screen (the same harness the Sonic Rift, B.O.B. and Sojourner films used; the app has no command-line speech entry point). Voices › New voice › Clone with the Guide design clip, saved as a voice; then Speech with **Qwen3 voice cloning** (`Qwen/Qwen3-TTS-12Hz-1.7B-Base`, Apache-2.0). |
| Voice | "Guide": a synthetic voice designed from a written description with Qwen3 voice design, owner-picked 2026-10-30 for the Sonic Rift film. Reference clip `source/narration/guide-voice-design.wav` (SHA-256 `91e8e930abddadc0ae3280e4f56f1fdebb2bdee045b4682b50a8aa6fd4922b11`). Not a clone of any real person. **Its reuse for FailSafe has not been approved yet.** |
| Settings | Round 2: Speed 0.92, paragraph pause 0.6 s, even volume on, trim silence on, AI watermark on (app default). Seeds are random per take. |
| Takes | Round 1: 4 takes × 8 lines at speed 1.0, rejected as too fast (about 174 words per minute); kept in `audio/narration-takes/round1-rejected-pace/`. Round 2: 3 takes × 9 lines; about 143 words per minute including pauses. |
| Selection | By measurement, not by ear: every round-2 take is word-accurate (Sonic Rift's Whisper transcriber); picks favour voice consistency and pitch close to the other lines (`audio/narration-takes/scores-r2.json`). Picked: S01 t1, S02 t1, S02B t2, S03 t1, S04 t3, S05 t3, S06 t2, S07 t2, S08 t3. |
| Pronunciation | Respelled in the spoken script only: "S R E", "six point zero point twelve", "Core Logic". Captions and transcript keep SRE, 6.0.12, Qor-Logic. |
| Mix | `source/tools/mix_narration.py` places the nine takes on a Sonic Rift Studio timeline (`audio/mix/failsafe-6.0.12-film.sonicrift.json`) and exports with the app's own engine: −16 LUFS target, normalized and peak limited. No music, no ambience, no sting; the film ends on a picture fade. |
| Measured (ffmpeg `ebur128`) | Final MP4 audio: **−16.0 LUFS** integrated, **−1.3 dBFS** true peak, LRA 4.0 LU. No clipping. |
| Wording check | Speech-to-text of the final mix matches the script word for word (228 of 228; `audio/mix/qa-transcription.json`). |

## 6. Checks run

| Check | Result |
|---|---|
| Every recorded window is FailSafe 6.0.12 | Driver log: `failsafe found=true … version=6.0.12`; Console › Config shows "Version: 6.0.12" on screen (0:33–0:51). |
| Theme consistency on the real extension host | Each theme click read back from the Console page, the sidebar and the Monitor/SRE frame: all three equal for Pegasus, Aurora, Atmosphere, Crimson, Midnight, Mythiq, and still Pegasus after Reload (`source/captures/take2b/events-themes.json`). `failsafe.console.theme` is present in the isolated user settings afterwards. |
| Bug, failing test, fix, passing test | In the film: `# pass 6 # fail 1`, then `# pass 7 # fail 0`. Re-run after the take: 7 pass, 0 fail (`evidence/npm-test-after.txt`). Diff: `evidence/git-diff.patch`. |
| Stream specs (ffprobe) | H.264 High, 1920×1080, 30 fps, yuv420p; AAC-LC 48 kHz stereo; 113.5 s; 3,405 frames. |
| Black or stretched frames | `blackdetect` reports none before the closing fade. One frame per shot inspected after assembly: each shows the intended view at the intended moment. |
| Captions | 29 cues timed from the measured pauses inside each take; text identical to the script. |
| Private information | Frames inspected: fictional repo, fictional author, `C:\demo\…` paths, no account names, no notifications from other apps. The Config page's audio device lists are never opened. |
| Checksums | `manifest.json` lists SHA-256 for every file; verified after writing. |

Not done: no person has watched or listened; no check on a phone or in the website layout; no second-machine reproduction.

## 7. Claims this film must not be used to support

- **An editor save denied by policy is reported, not prevented** (#505). Both notifications say "write not prevented" and both files were written. Do not say FailSafe blocked, stopped or protected anything here.
- No intent was created, approved or sealed. Delivery shows "No active or sealed intent in this workspace yet."
- The L3 requests were never answered; FailSafe's own log records each as `"decision":"EXPIRED"` after its 120-second deadline (`source/captures/take2/evidence/hub-after.json`). "L3 Queue: 1 pending" on Overview is not an approval, and neither is the "override.approved" row in the operations list (see section 8, item 4).
- No checkpoint was verified by anyone independent; the film does not show certification or verified delivery.
- "PASS" rows in the Console are Sentinel's own verdicts on file events, not test results or approvals.
- Windows and VS Code only. Cursor, macOS and Linux were not filmed.
- The SRE view shows its empty state ("AGT Adapter not connected"); only its theme is demonstrated.
- The risk register was empty ("No risks recorded yet").
- Recording consent for Mind Map audio and the 6.0.12 security changes are not shown.
- Setup needed qor-logic 0.176.1 already installed in a Python environment; the narration's "the workspace is ready" refers to the skills install shown, not to a one-click setup from nothing.

## 8. Observed product behaviour worth a look (not fixed, not hidden)

1. **The banner's own "Install Qor-Logic Skills" button does nothing on the Overview tab.** The dialog it opens belongs to the Config tab, which is hidden at that moment. The film uses the Config tab's "Install / Refresh Skills" button instead.
2. **Theme clicks were ignored for a short while after the skill install.** In `take1` and `take2` the first Pegasus clicks (two and then three attempts) did not change the theme; later clicks worked within about 110 ms. The theme scene in the film was therefore recorded again (`take2b`) a few minutes later, where every theme applied on the first click.
3. The install log prints the full interpreter path ("Resolved Python: …").
4. **An expired L3 request shows up as "override.approved".** After an L3 request passed its deadline unanswered, the Overview's Recent Operations Stream listed checkpoint rows "override.requested" and "override.approved · PASS", while the audit log recorded the decision as EXPIRED. The row is visible for a few seconds at 1:36. It is FailSafe's wording, shown as recorded; it should not be read as a person approving the change.

## 9. Reproduce

```
powershell -File source/capture-rig/prep.ps1 -Vsix <published vsix>
node source/capture-rig/settle.cjs
node source/capture-rig/stage.cjs
node source/capture-rig/perform.cjs <out dir>
python source/tools/build_film.py <work dir> <package dir>
```

The scripts carry this machine's paths (`C:\demo\tasklet`, `C:\demo\python`, the VS Code archive, the second display at x=3432) and need editing elsewhere.
