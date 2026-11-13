# Provenance: FailSafe v6.0.13 Statewright demo reel (preview, GH #673)

**Status: historical signed-out review preview, now committed to public draft PR #680. No website or social promotion is approved.** This cut shows Statewright's signed-out Log in page. The signed-in empty Run History replacement was subsequently recorded; see `../PROVENANCE.md`. The original open item at the end is retained as a historical capture-time note.

## 1. Software filmed

| Item | Identity |
|---|---|
| Extension | `mythologiq.mythologiq-failsafe` **6.0.13**, target `win32-x64`, installed from the **VS Code Marketplace** (gallery id `c37a297b-82c6-4bf4-8490-c8a76fcb57f5`, publisher id `4196fdce-2d8a-457f-b6ea-59bc61ee81d0`, "MythologIQ Labs", not pre-release) by `rig/prep-6013.ps1` (`code --install-extension MythologIQ.mythologiq-failsafe@6.0.13`). |
| VSIX bytes | Marketplace download cached by VS Code: SHA-256 `84d64b9144421d0ea8f959ecedda536b58dca310f06f04e781020724b638a6fd`. This is identical to `mythologiq-failsafe-6.0.13-win32-x64.vsix` in the GitHub Release SHA256SUMS. |
| Code shown | `dist/extension/ui/modules/statewright-handoff.js` (installed build) SHA-256 `70313f48495547baae6966da5bd8333fb12e3aa4cb8fa7545334d5e69b3bcc6f`. Card text on screen: "Statewright AI", pill "WEBSITE HANDOFF", link "Open Statewright Run History" -> `https://statewright.ai/runs` (plain `target="_blank"` anchor). |
| VS Code | Microsoft VS Code 1.145.2 stable, archive build, commit `c4453f8ea430795f941c1b2ff6c9321135a74a02`, `Code.exe` signed by Microsoft Corporation. Isolated `--user-data-dir`, `--extensions-dir`, HOME/APPDATA under the work dir. It is not the owner's VS Code. |
| Browser | Google Chrome 157.0.8103.40 with a **new, disposable profile** under the work dir (`rig/chrome-profile`, created empty right before the take). It was launched by VS Code itself through `workbench.externalBrowser` -> `rig/open-console.cmd`. It is not the owner's browser or profile. No sign-in, no typing, no clicks on Statewright. |
| Workspace | Fictional "tasklet-6013" fixture repo (`C:\demo\tasklet-6013`, git user "Demo Developer"). |
| Disposable driver | `qual.failsafe-qual-driver` 0.0.2, present only in the isolated extensions dir. It runs VS Code commands (`failsafe.openSidebar`, `workbench.action.showCommands`) and never produces FailSafe output. |

## 2. Capture method

- One continuous take (`source/captures/take1`) recorded on 2026-11-13 (UTC) with `rig/perform-6013.cjs`. ffmpeg 9.0.1 `gfxcapture` (Windows.Graphics.Capture) records each window by HWND: VS Code 1920x1080 and the whole Chrome window 1920x1188 (tab strip, address bar and a 1920x1080 page). Lossless x264 (qp 0), a shared wall clock for both windows, and `-copyts` honored in the edit.
- Actions are real input. The Command Palette is opened and "FailSafe: Open Console" is typed with CDP `Input.insertText`, then Enter with CDP key events. VS Code then opens the Console in the browser. Integrations, Catalog and **Open Statewright Run History** are clicked with trusted CDP mouse events (`Input.dispatchMouseEvent` via Playwright) on FailSafe's own controls. The new tab and Statewright's redirect to `/login?redirect=/runs` are the product's and the site's own behavior. `events.json` logs every step and every pointer position.
- The pre-roll (not filmed, `rig/settle.cjs`) chose the default governance mode in FailSafe's own picker so the picker could not open during the take.

## 3. Edit (`source/tools/build_6013.py`, `source/edit/edit-decision-list.json`)

- Sequence: title card 5 s -> VS Code clip (source 1.73 to 14.45 s) -> Chrome clip (source 17.06 to 53.16 s, continuous, no internal cuts) -> end card 9 s. There are 0.5 s cross-fades into and out of the footage. The cut from VS Code to Chrome skips about 2.6 s while Chrome starts and the window is sized. Nothing is retimed, recolored or retouched.
- The Chrome window is shown whole, scaled to 1746x1080 on navy, so the address bar (`localhost:9376/?workspace=c:\demo\tasklet-6013...`, then `statewright.ai/runs`) stays visible.
- **Added layer: pointer.** The capture excludes the OS cursor because input was sent by CDP and the owner's mouse was not taken over. A standard arrow pointer is drawn at the exact logged coordinates of the CDP mouse events, with a 0.35 s ring at each logged mouse-down (3 clicks). The pointer is hidden 0.15 s after the Statewright tab opens. No pointer is drawn where no event happened. This is not the desktop-native cursor the issue mentions; it is listed under QA notes.
- No redaction was needed in this cut: the signed-out page has no account data.
- Cards are generated from the canonical logos in the **published 6.0.13 VSIX**, `assets/release-branding/` (only scaled down): `source-failsafe-studio.png` (SHA-256 `74d5e8c6...f80e53cb0`) and `source-mythologiq-studio.webp` (`c0141a60...9694b2`). The repo's `build-release-notes-pdf.cjs` traces both to `MythologIQ public/assets`. The font is DM Sans (SIL OFL 1.1, `source/fonts/`), the same font as the v6.0.12 film.

## 4. Audio

| Item | Detail |
|---|---|
| Narration | Sonic Rift 0.9.1, installed locally, run off-screen through its own UI code (`failsafe_narration.py`, `sonic_rift_harness.py`). Qwen3 voice cloning (Apache-2.0) of the owner-chosen synthetic voice `narrator-male-3.wav` (SHA-256 `e3d0b639...afead17f6`, a Qwen3 voice-design voice, not a real person). Settings as accepted for the v6.0.12 film: speed 0.85, paragraph pause 0.7 s, even volume, trim silence, AI watermark on. 3 takes per line, all kept (`source/narration/takes/`). Picks (`picks-signedout.json`): N1 t3, N2 t1, N3 t3, N4 t3, N5 t1, N6 t1. Scoring is in `scores-6013.json`. |
| Music | `MUSIC_bed_takeC.wav` (SHA-256 `a3079284...14e3b`): the owner-chosen bed from the v6.0.12 film, an original ACE-Step 1.5 generation (MIT licence), 84 BPM, D major, seed 20261110 (log in `source/music/`, user path redacted). No third-party music. |
| Mix | Sonic Rift Studio engine, headless (`mix_narration_6013.py`). Project `source/mix/failsafe-6.0.13-statewright.sonicrift.json`. Music at -12 dB, ducked -9 dB under the voice, 1.5 s fade in, 3 s fade out, master -16 LUFS. Measured on the final MP4: **-16.0 LUFS integrated, -1.1 dBFS true peak**. |
| Pronunciation | Whisper (Sonic Rift transcriber) on the final mix matches the script word for word except that "Statewright" is spelled "Stateright" / "state right" (6 times). Those are homophones, so the word is spoken /steɪt raɪt/ as intended. "palette" vs "pallet" is the same kind of homophone. `source/edit/qa-transcription.json`. |

## 5. Claims check

The narration and cards claim only what the footage and the v6.0.13 code show: a labeled website handoff and a link that opens statewright.ai/runs. They state that Statewright handles sign-in and run history on its own site, and that FailSafe does not import that history, does not enforce those workflows and has no connection (the code has no adapter, credential, status probe or provider data). No runs, transitions or provider UI are claimed or fabricated.

## 6. Privacy checks

- Every frame was reviewed at 1 fps on contact sheets, plus full-resolution key frames and a 5 fps sheet of the click transition. Visible: VS Code with the fictional workspace, generic Command Palette entries, the FailSafe Console for `c:\demo\tasklet-6013`, and Statewright's public Log in page. There are no user names, emails, tokens, owner paths, other tabs, bookmarks or extensions. The Chrome profile is a blank, generic one.
- The Console URL contains a one-time `fsThemeKey` parameter, which FailSafe strips from the address bar before the recording window starts. The visible URL has no key. The key is redacted in the delivered `events.json`.
- The delivered files were searched (text and binary) for the owner's account and user names. One music-generation log contained a Windows user path, which was redacted to `<user>`. `events.json` does not record page text.
- Nothing was signed in, typed into Statewright, uploaded, published, committed or pushed.

## 7. Deliverable hashes (SHA-256)

| File | Bytes | SHA-256 |
|---|---|---|
| FailSafe-v6.0.13-Statewright-Demo.mp4 (H.264 High yuv420p 1920x1080 30 fps, AAC-LC 48 kHz stereo, 61.83 s) | 4243593 | e3eb7778e91071a55872d125fef91e53e7bfde21fdab848f1734f411d811e5a4 |
| FailSafe-v6.0.13-Statewright-Demo.en.srt | 957 | fdcb3cf400b2f240ca904673ada1aaa765adfb98825d1cb20c0d2fe920ddbbbb |
| thumbnail.png (1920x1080, film 0:35.5) | 686637 | 8b1dcbab15e17cc78430852a8b693f7e6473d820f73c492b3342ae1ff732897b |
| source/captures/take1/vscode.mkv | | d4b1869a4476d535b6aa76d59432602ff704c471ce3bc040ff1950d0595b65b8 |
| source/captures/take1/console.mkv | | 185f44a56e45d370cfbc933b135018bd5144a5a0fa2dbe596bd55bba76d8fd3c |
| source/captures/take1/events.json | | 6d792176bd414a0ab031a6c5256c9411533847ef7fbe76c15001db48e76c4069 |
| source/mix/.../master.wav | | b7444ae0f1bd613f1072018dd0abab385100a6be84252e29203b27d75abd4f7e |

`SHA256SUMS.txt` lists every file in this folder.

## Historical open item: signed-in Run History variant (subsequently resolved in the main cut)

The owner asked, through the coordinating session, to show their signed-in, empty Statewright Run History page with the account name and initials blurred. That needs an account session, and this preview does not include it. Everything else is ready:

- Revised N5 narration is recorded (`source/narration/takes/VO_N5_m3v2-take*.wav`, word-accurate; pick t1). Text: "Statewright shows its own Run History page. This account has no runs yet. They appear once a workflow is activated in a connected Statewright client. FailSafe does not import that history or enforce those workflows. This card is a link, not a connection."
- `perform-6013.cjs` holds the Statewright page for 18 s, does not log page text and never hovers the header. `build_6013.py` applies irreversible pixelation and blur from `<take>/redact.json`, before scaling and from the moment the tab opens.
