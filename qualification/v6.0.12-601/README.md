# v6.0.12 / #601 qualification receipts

Evidence for the v6.0.12 release candidate on `feature/601-monitor-theme-sync-v6012-no-ci`.
This branch is the candidate head plus this folder only; it is not for merge.

- **Candidate head:** `e3792d8a` (tree identical to this branch's parent).
- **Packaged from:** `e3792d8a`, a clean tree (no untracked files in the package).
- **Machine:** Windows 11 Pro, Node 22.23.4 (the CI and release toolchain).
- **Recorded:** 2026-11-06.
- **Status:** not tagged, not published, no production approval.

## 1. The defect at the original head `16b69aeb`

`baseline-16b69aeb/ehost-probe-16b69aeb.json` comes from a real VS Code extension host driven over CDP.

- The sidebar embeds `http://localhost:9376/?ui=compact`. That page (`index.html`) had `data-theme=null`, linked only `roadmap.css`, and never announced a theme. The sidebar chrome stayed `mythiq`.
- After the external Console was switched to Aurora, the Monitor and the chrome were unchanged.
- The external Console runs in the system browser (`vscode.env.openExternal`), which shares no storage with VS Code's Electron webview.
- Partitioned or not, a `localStorage` / `storage`-event design cannot connect the two.
- The branch's Playwright spec embedded `command-center.html`, which the real sidebar never loads.

## 2. The fix

- **Theme authority:** the theme lives in the extension host, in the application-scoped setting `failsafe.console.theme`, owned by `ConsoleThemeAuthority`.
- **Server routes:**
  - `GET /api/v1/ui/theme` returns the current state.
  - `GET /api/v1/ui/theme.js` applies the theme before first paint.
  - `POST /api/v1/ui/theme` changes the theme.
  - The server broadcasts `ui.theme`, with a revision and a per-process epoch, on the existing origin-checked WebSocket.
- **Write protection:** `POST` requires the existing Console request guard (loopback socket, loopback Host, exact Origin, `application/json`) **and** a per-process 256-bit key.
  - The key is compared in constant time.
  - VS Code adds it only to the Console links it opens.
  - The page moves the key into session storage and removes it from the address bar.
  - Without the key the theme is read-only.
- **Sidebar chrome:** rendered by the host in the current theme, and follows host messages only.
- **Monitor and SRE view:** use the shared tokens. Status colors keep their meaning, and accent colors used as text stay readable on Pegasus.

## 3. Installed-host acceptance (packaged VSIX, not a development path)

`installed-acceptance/acceptance.json` scored **30 passed, 0 failed**.

The run installed `mythologiq-failsafe-6.0.12-win32-x64.vsix` into a disposable profile. That profile had its own HOME/USERPROFILE, user data and extensions folders.

`workbench.externalBrowser` pointed at a recorder. So the Console URL VS Code really opens was opened in a separate Chromium, and the user's browser was never launched.

| Area | Result |
|---|---|
| External Console via the real `openExternal` link | Key present, then removed from the address bar |
| Storage | The external browser cannot see the webview Monitor's storage |
| All six themes, live | External Console → sidebar chrome, Monitor iframe and `failsafe.console.theme`. `--bg-panel` was identical on all three surfaces for each theme |
| Settings path | Editing the setting re-themes the chrome, the Monitor and the external Console live |
| Forged input | Embedded-page `postMessage` to the chrome is ignored. A wrong key or a missing key gets 401 |
| SRE switching | The SRE view opens in the theme and follows live changes. The Monitor returns in the current theme |
| Lifecycle | Sidebar reload, window reload and full restart keep the theme. The restart shows the host-rendered `data-theme` |
| High contrast | The chrome uses VS Code contrast colors, and the FailSafe theme is unchanged (screens 05, 06) |

## 4. Installed-host security (`installed-acceptance/security/`)

- **`probe-console-websocket-rc.cjs`:** 10/10 on `127.0.0.1` and 10/10 on `localhost`.
- **Adversarial WebSocket handshakes:** 25 cases. The 2 authorized controls got 101 with an `init` frame only. The other 23 were refused (403/400), including duplicate Host, Origin variants, rebinding and missing Host.
- **Theme write route with the real key** (`theme-route-matrix.json`):

  | Hostile variant | Status |
  |---|---|
  | Foreign Origin | 403 |
  | Null Origin | 403 |
  | Webview Origin | 403 |
  | `text/plain` body | 415 |
  | Rebinding Host | 403 |
  | No key | 401 |
  | Wrong key | 401 |
  | Selector-injection value | 400 |

  None of these requests changed the theme.

## 5. Release verification (`rv/`)

- **`package:all-targets`:** 8 of 8 targets passed `validate-vsix`. Hashes are in `rv/SHA256SUMS.txt`.
- **`rv inventory`:** 50/50.
- **`rv lifecycle`:** 12/12. It covered the published 6.0.11 win32-x64 (`72f2d231…`, matches the GitHub release) → 6.0.12, through upgrade, crash, rollback and re-upgrade, in VS Code 1.141.1.
- **`rv report`:** `rehearsal-pass`, 62/62. This is a pre-release rehearsal, not a marketplace verification.

## 6. Tests

| Gate | Head | Result |
|---|---|---|
| lint | `e3792d8a` | 0 errors (133 pre-existing warnings) |
| runner coverage, citation parity, `release:preflight` | `e3792d8a` / `ce6e79f0` | pass; preflight 9/9 |
| `test:node` | `e3792d8a` | 944 tests: 926 pass, 0 fail, 18 skipped |
| `test:ui` (Playwright, full) | `ac3c4610`, product-identical to `e3792d8a` | 253 passed, 4 skipped |
| #601 Playwright spec, repeated | `a94e312f`+ | 42/42 over 3×2 repeats with 4 workers |
| Extension host (`npm test` configurations), VS Code Insiders | `93e2f236` and `e3792d8a` | 5,793 + 17 passing, 19 pending, 35 failing; census 560/560 + 5/5 |

**About the 35 extension-host failures:**
- The user's stable VS Code was mid-update and held the `vscode-updating` mutex, which stops every stable build from starting. So the suite ran on a local Insiders build.
- The published v6.0.11 tree run the same way fails the same 35 tests plus one more (`tests/*.txt`).
- All but two are `EPERM` when removing temp git repositories in test teardown. The other two are a RiskStore lock-path teardown and a Markdown-safety check tripped by Insiders' mermaid preview markup.
- **These are not regressions.** A stable 1.122.1 run (the pinned CI host) is still owed before GO.

## 7. Real-profile monitoring (`profile-watch/`)

- **Defect found:** during the extension-host suites, both the v6.0.12 candidate and the published v6.0.11 tree wrote `~/.failsafe/servers.json` into the real Windows profile.
  - The activated extension registers its Console server, and the ServerRegistry tests write under `os.homedir()`.
  - This was hidden before, when another editor held port 9376.
- **Fix:** `e3792d8a` gives each test configuration a disposable home.
- **Verification:** a full rerun recorded zero events.
- **Cleanup:** the test-created `~/.failsafe`, which held one temp test-workspace entry, was removed. So was the harness-created `~/.vscode-insiders`, which VS Code makes under the OS profile regardless of `USERPROFILE`.

## 8. Visual check (`visual/`)

- **Scope:** the Monitor and SRE view in all six themes at sidebar width, with a populated hub.
- **Lowest text contrast after the fix:** 4.05 to 12.0.
- **Lowest values:** the shared `--text-muted` labels in Pegasus and Midnight, the same token the Console uses.
- **Excluded:** the active chevron's white-on-gradient reading is a measurement artifact, because the probe ignores gradients.

## 9. Not verified here

- The extension-host suite on stable VS Code 1.122.1 (blocked locally by the mutex above).
- Theme behavior inside Simple Browser ("Open Console (Editor Tab)"): its nested frame is not visible over CDP. Electron-internal storage partitioning therefore stays unmeasured. The design does not depend on it.
- Windows contrast themes (forced colors) and macOS/Linux hosts.
