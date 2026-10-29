# FailSafe website handoff (#589)

For the MythologIQ Labs site (`Knapp-Kevin/MythologIQ`, page `src/pages/products/FailsafeCurrentPage.tsx`). **Owner review is required before any of this is used publicly.** This handoff does not authorize a deployment.

## Product copy

**Short (41 words):**
> FailSafe is an open-source VS Code extension that watches what changes in your workspace, grades the risk of each change, and keeps a local audit trail of verdicts, checkpoints and review requests, so AI-assisted work stays reviewable before you commit it.

**Longer overview:**
> FailSafe runs locally inside VS Code. Its Sentinel watches the files in your workspace and gives every change a verdict and a risk grade. In Enforce mode, a change made without an active intent is flagged at once; FailSafe reports editor saves rather than blocking them, and says so. Changes that FailSafe's evaluator escalates are queued for L3 review. The FailSafe Console collects the evidence in one place: an audit log of verdicts and governance events, a checkpoint chain you can verify, and a repository compliance grade. External integrations are opt-in.

Both are written from behavior shown in the captures. Avoid claims these captures do not support: "blocks every agent action", "prevents edits", security certifications, adoption or performance numbers.

## Placement map (current page structure)

| Page section | Today | Proposed | Assets |
|---|---|---|---|
| Hero (`failsafe-logo.webp`) | Website logo | Keep the existing approved logo | none new |
| `#failsafe-workflow` "From agent activity to evidence you can inspect." | Text steps | Add the walkthrough video under the heading, click to play, with captions and a transcript link. Optionally pair each step with 02 → 04 → 06 → 07 | `failsafe-6.0.11-rc-walkthrough.mp4` / `.webm`, poster, `.en.vtt`, transcript; screenshots 02, 04, 06, 07 |
| `#failsafe-interface` "See what the extension makes visible." | v5.1.6 screenshots, labeled historical | Replace or supplement with the 6.0.11 RC set, and update the caption from "v5.1.6" to the version actually published by then | 01, 03, 05, 06 (web 1600×900 WebP, JPG fallback) |
| Install count (`useOpenVSXStats`) | Live Open VSX count | **No change from this work.** See the owner review item below | none |

Suggested markup for the video (no autoplay):

```html
<video controls preload="metadata" width="1920" height="1080"
       poster="/assets/products/failsafe/failsafe-6.0.11-rc-walkthrough-poster.jpg">
  <source src="/assets/products/failsafe/failsafe-6.0.11-rc-walkthrough.webm" type="video/webm">
  <source src="/assets/products/failsafe/failsafe-6.0.11-rc-walkthrough.mp4" type="video/mp4">
  <track kind="captions" srclang="en" label="English" src="/assets/products/failsafe/failsafe-6.0.11-rc-walkthrough.en.vtt" default>
</video>
```

Captions and alt text for every asset are in [`MEDIA_MANIFEST.md`](MEDIA_MANIFEST.md).

## Install count: keep the live source

The page shows the Open VSX install count from `src/hooks/useOpenVSXStats.ts`. That hook fetches `https://open-vsx.org/api/MythologIQ/mythologiq-failsafe` live and caches it for an hour. These assets add no count. Do not hard-code a number into any copy or image, and keep the attribution to Open VSX next to the figure.

**Owner review item:** the hook has a hard-coded fallback, `FAILSAFE_INSTALL_FLOOR = 16_000`, which is shown as "16,000+" while the request is loading and whenever Open VSX is unreachable. That fallback is an estimate shown as if it were data. Consider showing a neutral placeholder, or the last cached real value with its date, when the live count is unavailable.

## Before publishing: owner checklist

- [ ] Approve or reject each screenshot and the video (see the manifest's approval status).
- [ ] Decide the version label. These are **6.0.11 release-candidate** captures. Publish them as "current" only after v6.0.11 ships, or label them as a preview.
- [ ] Host the MP4, WebM, poster and VTT from `docs/marketing/media/video/` on this branch, for example under `/assets/products/failsafe/`. Verify the checksums in `docs/marketing/media/SHA256SUMS.txt` after upload.
- [ ] Keep the "reports, does not block editor saves" wording wherever saves are mentioned.
- [ ] Decide on the install-count fallback (above).
- [ ] Optional: record narration. The video is silent and captioned; any voice-over must be original or licensed.

## Reproducing the captures

1. Clone the fixture: `git clone -b main docs/marketing/demo-fixture/failsafe-demo-workspace.bundle failsafe-demo-workspace`. The `demo-baseline` tag is `86c12f87`.
2. Build and install the candidate VSIX from the source commit into an isolated VS Code profile (`capture-tools/launch-iso.ps1` shows the isolation: separate `--user-data-dir`, `--extensions-dir`, and `HOME`/`USERPROFILE`/`APPDATA` redirected).
3. Install the disposable driver (`capture-tools/qual-driver-*`) next to FailSafe, open the fixture, answer the first-run governance-mode picker with Enforce, then queue `capture-tools/walkthrough.cjs` while `capture-tools/wincap.ps1 -FramesDir …` records.
4. Reset with `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/reset-demo.ps1`, and delete `.failsafe/` and `.vscode/` for a first-run state.
