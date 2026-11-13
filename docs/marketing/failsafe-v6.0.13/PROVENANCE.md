# Provenance: FailSafe v6.0.13 Statewright demo reel (preview, GH #673)

**Status: owner-review preview, now committed and pushed to public draft PR #680. No website, marketplace, or social promotion has been approved.** This cut shows Statewright's signed-in, empty Run History page. The earlier signed-out cut, which shows Statewright's Log in page, is kept in `alt-signedout/` with its own PROVENANCE.md.

## 1. Software filmed

| Item | Identity |
|---|---|
| Extension | `mythologiq.mythologiq-failsafe` **6.0.13**, target `win32-x64`, installed from the **VS Code Marketplace** (gallery id `c37a297b-82c6-4bf4-8490-c8a76fcb57f5`, publisher id `4196fdce-2d8a-457f-b6ea-59bc61ee81d0`, "MythologIQ Labs", not pre-release) by `source/rig/prep-6013.ps1` (`code --install-extension MythologIQ.mythologiq-failsafe@6.0.13`). |
| VSIX bytes | Marketplace download cached by VS Code: SHA-256 `84d64b9144421d0ea8f959ecedda536b58dca310f06f04e781020724b638a6fd`. This is identical to `mythologiq-failsafe-6.0.13-win32-x64.vsix` in the GitHub Release SHA256SUMS. |
| Code shown | `dist/extension/ui/modules/statewright-handoff.js` (installed build) SHA-256 `70313f48495547baae6966da5bd8333fb12e3aa4cb8fa7545334d5e69b3bcc6f`. Card on screen: "Statewright AI", pill "WEBSITE HANDOFF", link "Open Statewright Run History" -> `https://statewright.ai/runs` (plain `target="_blank"` anchor). |
| VS Code | Microsoft VS Code 1.145.2 stable, archive build, commit `c4453f8ea430795f941c1b2ff6c9321135a74a02`, `Code.exe` signed by Microsoft Corporation. Isolated user-data, extensions and home directories under the work dir. It is not the owner's VS Code. |
| Browser, FailSafe part | Google Chrome 157.0.8103.40 with a new, disposable profile under the work dir. VS Code launched it through `workbench.externalBrowser`. Nothing was signed in there. |
| Browser, Statewright page | The owner's own default browser, Microsoft Edge, signed in to the owner's Statewright account (see section 3). |
| Workspace | Fictional "tasklet-6013" fixture repo (`C:\demo\tasklet-6013`, git user "Demo Developer"). |
| Disposable driver | `qual.failsafe-qual-driver` 0.0.2, present only in the isolated extensions dir. It runs VS Code commands and never produces FailSafe output. |

## 2. Capture of the FailSafe part (take1)

- One continuous take (`source/captures/take1`) recorded 2026-11-13 01:27 UTC (2026-11-12 local time) with `source/rig/perform-6013.cjs`. ffmpeg 9.0.1 `gfxcapture` (Windows.Graphics.Capture) records each window by HWND: VS Code 1920x1080 and the whole Chrome window 1920x1188. Lossless x264, one shared clock, and `-copyts` honored in the edit.
- Actions are real input. The Command Palette is opened and "FailSafe: Open Console" is typed with CDP `Input.insertText`, then Enter with CDP key events; VS Code opens the Console. Integrations, Catalog and **Open Statewright Run History** are clicked with trusted CDP mouse events on FailSafe's own controls. The new tab opening at `statewright.ai/runs` is the product's real behavior. `events.json` logs every step and pointer position (the one-time Console theme key is redacted).

## 3. Statewright page segment (owner's signed-in browser)

- **Source:** `source/captures/edge-signedin/statewright-runs-signedin-redacted.mkv` (1880x870, 30 fps, 20.0 s, SHA-256 `723e7b9f9ddaac45b02b04d839609cb679672c9b6461cd3635838d6af8b9f2d3`).
- **Who recorded it:** the coordinating main session, on 2026-11-12, in the owner's own signed-in Microsoft Edge, at the owner's direct instruction. This agent did not touch any browser for this segment.
- **What the clip is:** a page-viewport crop of `https://statewright.ai/runs`, with no browser chrome, address bar, bookmarks, profile picture, other tabs or consent banner. The account name and the "KK" avatar are irreversibly covered by a solid box in the header colour. The raw, unredacted capture was deleted by the main session.
- **What it shows:** the header (logo, Workflows, Runs, API Keys, Docs, theme icon); "Run History"; "0 runs"; "Run transitions are recorded on every plan. Detailed tool logs require Enterprise or Team with the audit add-on."; "No workflow runs yet. Activate a workflow in a connected Statewright client to see runs appear here." No menu or other page is opened.
- **How it joins take1:** the cut is placed on the first take1 frame in which the new Chrome tab paints Statewright's page (source 38.283 s, found automatically from frame content). Before the cut, the take shows the click and the new tab loading `statewright.ai/runs` (blank). The page that follows comes from the owner's signed-in Edge session, not from the disposable Chrome profile, which was signed out. This joins two real recordings of the same URL; it is listed under QA notes.

## 4. Edit (`source/tools/build_6013.py`, `source/edit/edit-decision-list.json`)

| Film time | Content |
|---|---|
| 0 to 5.0 s | Title card |
| 4.5 to 17.2 s | VS Code clip (take1 source 1.73 to 14.45 s) |
| 17.2 to 37.5 s | Chrome clip (take1 source 18.01 to 38.28 s, continuous) |
| 37.5 to 56.4 s | Statewright clip, 18.9 s, held on its last frame |
| 55.9 to 64.3 s | End card |

- There are 0.5 s cross-fades into and out of the footage. The cut from VS Code to Chrome skips Chrome's start-up and window sizing, and about 1 s of idle Console Overview is trimmed. Nothing is retimed, recolored or retouched.
- **Framing:**
  - The Chrome window is shown whole, scaled to 1746x1080 on navy.
  - The Statewright clip is shown at native pixels (1.0x, no scaling), centred on navy (x=20, y=105).
- **Added layer: pointer.** A pointer is drawn at the logged coordinates of the trusted CDP mouse events, with a 0.35 s ring at each of the 3 logged clicks. It is hidden 0.15 s after the new tab opens, so it never appears over the Statewright page. This is not the desktop-native cursor; see QA notes.
- **Cards:** canonical logos from the published 6.0.13 VSIX `assets/release-branding/` (`source-failsafe-studio.png` `74d5e8c6…`, `source-mythologiq-studio.webp` `c0141a60…`), only scaled down. Font: DM Sans (SIL OFL 1.1).

## 5. Audio

| Item | Detail |
|---|---|
| Narration | Sonic Rift 0.9.1, local, run off-screen through its own UI code. Qwen3 voice cloning (Apache-2.0) of the owner-chosen synthetic voice `narrator-male-3.wav` (SHA-256 `e3d0b639…afead17f6`; designed voice, not a real person). Speed 0.85, paragraph pause 0.7 s, AI watermark on. Picks (`source/narration/picks.json`): N1 t3, N2 t1, N3 t3, N4 t3, **N5 m3v2 t1** (the signed-in empty-state line), N6 t2. All takes are kept in `source/narration/takes/`; scores are in `scores-6013*.json`. |
| Music | `MUSIC_bed_takeC.wav` (SHA-256 `a3079284…14e3b`): the owner-chosen original ACE-Step 1.5 bed (MIT licence) from the v6.0.12 film. No third-party music. |
| Mix | Sonic Rift Studio engine, headless. Project `source/mix/failsafe-6.0.13-statewright.sonicrift.json`. Music at -12 dB, ducked -9 dB under the voice, master -16 LUFS. Measured on the final MP4: **-16.1 LUFS integrated, -1.1 dBFS true peak**. |
| Wording and pronunciation | Whisper on the final mix matches the script, with "Statewright" transcribed as the homophones "Stateright" / "StateWrite" (spoken /steɪt raɪt/). "Open" at the start of the last line was dropped in the full-mix pass; transcribing the last 8.4 s on its own gives "OpenStateRite Run History from Failsafe. Version 6.0.13 is available now." (`source/edit/qa-transcription.json`). |

## 6. Claims check

The narration and cards claim only what is shown and what the v6.0.13 code does:
- a labeled website handoff, and a link that opens Statewright's own Run History page;
- that page is empty for this account, and Statewright itself says runs appear once a workflow is activated in a connected client;
- FailSafe does not import that history, does not enforce those workflows, and the card is a link, not a connection.

No runs, transitions or provider data are claimed or fabricated.

## 7. Privacy checks

- **Statewright segment, every frame at full resolution:** 553 consecutive frames of the final MP4 (film 37.47 to 55.87 s) match the supplied redacted clip pixel for pixel (mean absolute difference below 1.0), and all 600 clip frames are identical to its first frame apart from 3 codec-noise pixels. The covered header area is one uniform colour in every frame (std at most 1.0, at most 4 levels from the header colour). Frame 0 was inspected at full resolution: no name, initials, email or other account data. The 0.5 s cross-fade to the end card blends only this clean picture with the card.
- **Rest of the film:** reviewed at 1 fps on contact sheets, plus full-resolution key frames and the cut at 5 fps. It shows only the fictional workspace, generic Command Palette entries, the Console for `c:\demo\tasklet-6013`, and a blank loading tab at `statewright.ai/runs`. There are no names, emails, tokens or owner paths.
- **Delivered files:** searched (text and binary) for the owner's account and user names; one Windows user path in a copied music log was redacted. `events.json` contains no page text and the theme key is redacted.
- At the initial capture and QA checkpoint, nothing had yet been uploaded, committed or pushed. This review kit is now committed and pushed to public draft PR #680; it is publicly accessible as PR content. No owner approval for website, marketplace, or social promotion is implied.

## 8. Deliverable hashes (SHA-256)

| File | Bytes | SHA-256 |
|---|---|---|
| FailSafe-v6.0.13-Statewright-Demo.mp4 (H.264 High yuv420p 1920x1080 30 fps, AAC-LC 48 kHz stereo, 64.3 s) | 4269897 | 44bbd9701ce7db21cc36cbfb85863b5a11ebbd49a334559a6081d00a99b41231 |
| FailSafe-v6.0.13-Statewright-Demo.en.srt (12 cues) | 1123 | 7aa47eaa9e08ba00f22a007027374d863d8835e8cc088e759d7c2da49a6516a5 |
| thumbnail.png (1920x1080, film 0:35.0, the Statewright card) | 685189 | 1a5938c809e9e940ed5033a61c16bf2ce8de108fb6577cffd592d3fb95b0f0f9 |
| source/captures/edge-signedin/statewright-runs-signedin-redacted.mkv | 111934 | 723e7b9f9ddaac45b02b04d839609cb679672c9b6461cd3635838d6af8b9f2d3 |
| source/captures/take1/vscode.mkv | | d4b1869a4476d535b6aa76d59432602ff704c471ce3bc040ff1950d0595b65b8 |
| source/captures/take1/console.mkv | | 185f44a56e45d370cfbc933b135018bd5144a5a0fa2dbe596bd55bba76d8fd3c |
| source/mix/export-failsafe-6.0.13-statewright/master.wav | | 6f558b8c8e257f76d3118f58a22a4124be1a8477a27a571053a403543c4d68cc |

`SHA256SUMS.txt` lists every file in this folder, including `alt-signedout/`.

## QA notes for the owner

- The pointer is drawn in post at the logged positions of the real input events. It is not the desktop cursor.
- The click and new tab come from the disposable Chrome profile, and the page after the cut comes from the owner's signed-in Edge (both are real recordings of `statewright.ai/runs`). The browsers look different: the Chrome footage shows its window frame, while the Statewright page is shown as a page-only crop.
- The Console's first-run "Get Started" banner (Qor-Logic skills not installed) is visible.
- Captions were checked against the script, the transcription and the measured pauses. A final listening pass by ear is still recommended.
