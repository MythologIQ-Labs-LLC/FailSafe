# Installed-host evidence for PR #653 (exact source `b395693d174e837a7c053f4193a376d1c0a7f9ae`)

**When:** 2026-11-11 at 17:13:19 and 17:14:10 UTC, on the owner's Windows 11 workstation. The same 14 checks also passed on both hosts at `e9ff78bd` (about 15:13 to 15:15 UTC) and at `dd766c15` and `1fd4a557` on VS Code 1.145.2 (2026-11-10).

**Package:** built from the exact commit in a clean detached worktree with `npm run build:package` and `node scripts/package-target.cjs --host`.
- File: `failsafe-653-b395693d.vsix`, SHA-256 `70e19874ea5a9fd2cc72adbdae8ee70b0b8a8d6f96be2eb645a963a3720a926d`, target `win32-x64`.
- `validate-vsix.cjs` passed.
- Its unpacked contents, the manifest included, are byte-identical to the packages built from `dd766c15` (tested on 2026-11-10) and `e9ff78bd`. Only the zip timestamps differ. Commits after `dd766c15` changed tests, plans and records only.

**Method:** `installed653.cjs` in this directory.
- Installs the VSIX into a disposable VS Code profile and extensions directory, and starts that host.
- Opens the FailSafe sidebar, which starts the extension's own Console server.
- Loads the Integrations tab from that server in a clean-profile Google Chrome, with no request interception, then clicks the Statewright link.
- The JSON files hold every check with its detail.

| Host | Result |
|---|---|
| VS Code 1.145.2 (portable archive) | 14 of 14 (`vscode-1.145.2.json`) |
| VS Code 1.141.1 (portable copy) | 14 of 14 (`vscode-1.141.1.json`) |
| VS Code 1.122.1 (portable archive) | **Not run.** The host exits at startup with "Code is currently being updated", because the system-wide `vscode-updating` mutex is held. No installer process was running. The likely holder is the owner's own running VS Code with a staged update, which was not restarted because this work runs inside it. |
| Cursor or another VS Code-compatible editor | **Not run.** None is installed on this workstation. |

**What the 14 checks established, on both hosts:**
- The installed extension ships the renderer and the handoff module, and the card is visible in the Console served by the installed extension. The link has exactly `href="https://statewright.ai/runs"`, `target="_blank"` and `rel="noopener noreferrer"`, with no `ping` or `download`.
- Before any click: zero requests to the `statewright.ai` host, out of about 150 page requests. The only URL that mentions Statewright is the local module `http://localhost:9376/modules/statewright-handoff.js`.
- The card makes no connection, sign-in or authentication claim, and the link can be focused from the keyboard.
- The click opens a new tab whose first navigation is exactly `GET https://statewright.ai/runs`. That request carries no `Referer`, `Cookie`, `Authorization` or `Origin`.
- No request to Statewright mentions the local Console origin, its port or the workspace path. The opened page has no `window.opener`. The Console tab stays where it was.
- **Real destination:** Statewright answered with HTTP 200 and sent the signed-out browser to `https://statewright.ai/login?redirect=/runs`, offering Google, GitHub, Microsoft and email sign-in.
- With the local catalog request failing, the Console shows "Could not load integrations" and the Statewright link is still present.

**Not done:**
- **The signed-in Run History view.** It needs the owner's Statewright account in the test browser. It is reported here as not tested.
- **The two hosts above.**

Screenshots from the 1.145.2 run: `console-integrations.png`, `statewright-destination.png` (the real sign-in page) and `catalog-unavailable.png`.
