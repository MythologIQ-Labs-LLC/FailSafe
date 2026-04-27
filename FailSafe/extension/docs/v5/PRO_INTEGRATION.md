# FailSafe Pro Integration (v5)

## Product Boundary

**FailSafe** (this extension) is the open VS Code / Cursor governance and skills surface.
- Editor-level audits, skill registry, checkpoints, governance UI
- Local-first; no cloud calls beyond `qor-logic` package install
- MIT licensed, distributed via VS Code Marketplace and Open VSX

**FailSafe Pro** is the desktop native application for SDLC visibility and governance.
- OS-level enforcement, file locking, team workflows, remote connections beyond the editor boundary
- Full SDLC trace from intent → plan → audit → implement → seal, surfaced outside the editor
- BSL-1.1 licensed
- Product site: <https://mythologiq.studio/products/failsafe-pro>
- Download: <https://mythologiq.studio/products/failsafe-download>
- Pairs with this extension; not a replacement

Use the extension when you want local editor guardrails. Add Pro when you need full SDLC visibility, OS-level enforcement, and managed runtime operations.

## Discovery from the Extension

Two surfaces expose the Pro download URL:

1. **Command palette** — `FailSafe: About FailSafe Pro` invokes `failsafe.openFailSafeProDownload`, which opens the canonical URL externally.
2. **Settings panel** — the Command Center Settings tab includes a "FailSafe Pro" card with an `About FailSafe Pro` button.

The URL is defined once in `src/shared/constants.ts` as `FAILSAFE_PRO_DOWNLOAD_URL`. Do not duplicate it across modules. The product-site URL (`/products/failsafe-pro`) is referenced in user-facing documentation only.

## CodeGenome

CodeGenome is the code intelligence substrate planned for richer graph, symbol, impact, and workspace-trace workflows.

Source contract:
- Preferred: <https://github.com/MythologIQ-Labs-LLC/codegenome>
- Fallback: when the public URL is unavailable, the private source URL is recorded in `.failsafe/v5-sources.json` under key `codegenome.repository`.

FailSafe v5 links to CodeGenome but does not require it at runtime. FailSafe Pro may use CodeGenome for richer enforcement and code intelligence in future releases.

## Why one canonical URL

If the website route changes upstream, fix it via a website redirect — not by scattering new URLs through the codebase. The drift guard in `src/test/shared/constants.test.ts` enforces this.
