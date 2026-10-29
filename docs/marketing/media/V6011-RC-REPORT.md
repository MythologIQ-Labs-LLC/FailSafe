# FailSafe v6.0.11 release candidate: qualification, media and readiness report

- **Date:** 2026-10-29
- **Machine:** Windows 11 Pro 10.0.26300 x64, the owner's development machine
- **Verdict:** **NO-GO for publication** (governance #467 has no native PASS). **Engineering: qualified candidate, ready for owner review.**

## A. Release candidate

| Item | Value |
|---|---|
| Version | 6.0.11 (unpublished; the published release is v6.0.10) |
| Branch / HEAD | `release/6.0.11-rc0-prep-no-ci` @ `43ab0ecbafbd73652e27fac64cc7330fe5c17e4b` (pushed; 0 workflow runs) |
| Base | v6.0.10 `c53e26cdc5e09a17c5567830fb867b6b5dab4791` (= `main`, unchanged) |
| Included | #587 (`b104c478`): duplicate `Host` refused on the Console WebSocket, and the install-skills socket follows the Console host (#564 D1/D2, B361). RC probe script (`964a2484`). Release metadata (version, changelogs, README, help markers). **New this session:** `52a40c16` and `fcf0c85d` (release-metadata repairs, below) and `43ab0ecb` (Monitor footer backslash fix plus a regression test). |
| Excluded | #585 (audio vault; draft, acceptance pending), #570 (broad integration hardening), and #475, #478, #505 branches. Unmerged, not qualified, not release inputs. |
| Artifacts | `C:\dev\mythologiq\FailSafe-rc611-qual\artifacts\` (8 VSIX files plus `SHA256SUMS.txt`). win32-x64 `9f732dc3794d0219864873dbcd265bfcc4fd57cafdb9b564e8f520597cf42c56`. All eight hashes are in `SHA256SUMS.txt`. |
| Signing | **Unsigned**, by design. The release pipeline does no Authenticode or vsce signing; integrity relies on `SHA256SUMS.txt` plus `verify-release-provenance.cjs` against both marketplaces. No code-signing certificate is installed on this machine. Nothing is labeled as signed. |

### Defects found and fixed this session (each reproduced, root-caused and covered)

1. **The release-gate test suite was red on the staging HEAD `964a2484`.** `npm run test:node` failed three governance/doc gates:
   - FX938: SYSTEM_STATE "Current Release" was not 6.0.11, and SYSTEM_STATE still called the published v6.0.10 a candidate.
   - The BACKLOG listed v6.0.10 as `🚧 CANDIDATE`.
   - FX1003: two README citations had drifted by 5 lines.

   Fixed in `52a40c16`, following the convention of the v6.0.10 release prep. No ledger entries were added.
2. **No valid package could be built from `964a2484`.** `validate-vsix.cjs` requires a dated CHANGELOG heading and a matching README release marker; every target failed with "Version mismatch … 6.0.11 … 6.0.10". Fixed in `fcf0c85d`. The CHANGELOG uses the RC preparation date, and both the CHANGELOG body and the README marker state that 6.0.11 is unpublished.
3. **The Monitor footer rendered literal backslashes (`provided \"as is\"`)** from v3.5.2 onward, and showed up in every marketing capture. Fixed in `43ab0ecb`. The new `ui-static-text.test.cjs` failed before the fix and passes after it.

## B. Qualification (exact commands, exact heads)

| Gate | Command (from `FailSafe/extension`) | Head | Result |
|---|---|---|---|
| Dependencies | `npm ci` (+ `npm install --no-save better-sqlite3@13.0.3` where the optional native dependency was skipped) | — | exit 0; lockfile unchanged |
| Release preflight | `npm run release:preflight` | 43ab0ecb | **9/9 PASS** (first executed receipt for 6.0.11) |
| Lint | `npm run lint` | 43ab0ecb | 0 errors (133 existing warnings) |
| Compile | `npm run compile` | 43ab0ecb | exit 0 |
| Runner coverage | `npm run test:runner-coverage` | 43ab0ecb | PASS, 710 files claimed |
| Citation parity | `npm run test:citation-parity` | 43ab0ecb | PASS |
| Node suites | `npm run test:node` | fcf0c85d / 43ab0ecb | 930 tests: 911 pass, 17 skipped. **1 failure, environmental:** T10c, which needs Chocolatey at `C:\ProgramData\chocolatey\bin\choco.exe`. One run also hit B369, the known load-sensitive `ArchitectureLinks` timing row, which passes 3/3 in isolation. |
| Extension host | `npm test` (vscode-test, VS Code 1.122.1, isolated HOME) | 52a40c16 | **5,953 passing, 19 pending, 0 failing**; census 558/558 and architecture-index 17 passing (5/5); exit 0 |
| Extension host (exact head) | `npm test` (isolated HOME) | 43ab0ecb (clean tree) | **5,953 passing, 19 pending, 0 failing**; census 558/558 + architecture-index 17 passing (5/5); exit 0 |
| Playwright UI | `npm run test:ui` | 43ab0ecb | **247 passed, 4 skipped, 0 failed** (exit 0) |
| Package matrix | `npm run package:all-targets` | 43ab0ecb | 8/8 built and `validate-vsix` PASS |
| Inventory | `rv inventory --version 6.0.11` | 43ab0ecb | **50/50 pass** |
| Lifecycle (win32-x64, native SQLite) | `rv lifecycle --from <published v6.0.10 win32-x64> --to <candidate>` in disposable VS Code 1.141.1 | 43ab0ecb | **12/12 pass:** install, upgrade, restart, force-kill after commit, restart, rollback to v6.0.10, re-upgrade; `snapshot.created` persisted 1→7; all databases pass `integrity_check`; home isolated; no residual processes |
| Rehearsal report | `rv report` | 43ab0ecb | **rehearsal-pass, 62/62 required checks**; `marketplaceVerified: false` (correct before publication) |

### Windows installed-host security (candidate VSIX installed into an isolated VS Code 1.143.1 profile; Console port 9376 read from FailSafe's own registry)

| Probe | Result |
|---|---|
| `node scripts/probe-console-websocket-rc.cjs --host 127.0.0.1 --port 9376` | **10/10**, exit 0 (101 authorized; 403 for duplicate hostile Host, duplicate identical Host, cross-origin, missing Origin, null Origin, wrong-port Origin, Host rebinding, WebSocket v8, duplicate Origin) |
| same, `--host localhost` | **10/10**, exit 0 |
| same, `--host ::1` | 0/10, ECONNREFUSED: the product binds `127.0.0.1` only. **Not counted as a pass**; recorded as not applicable. |
| Adversarial set (25 raw cases) | 25/25 as expected; no refused handshake received `init` |
| Browser (headless Edge over CDP) | Console loads on both loopback names (101 + `init`); D2 install-skills socket connects from both origins; attacker origin got 0 messages and 0 reads; reconnect after an extension-host restart in 2.0 s; clean shutdown; 3 start/stop cycles left no connections |

### Outstanding platform requirements

- **Linux and macOS installed qualification: NOT DONE.** Their packages were built on Windows and passed the inventory checks (native binary format and architecture), but the lifecycle and SQLite load were not run on those hosts (#502, #243).
- **Marketplace verification** (`rv marketplace`) can only run after publication.
- **Node version:** CI pins Node 20.18.1 (`.nvmrc`); these runs used Node 24.19.0 / npm 11.17.0. Under npm 11, `npm ci` skipped the optional `better-sqlite3`, and packaging from a path containing a UUID silently produced an empty VSIX (npm masks UUIDs in `npm ls`). Both were worked around and are documented; neither affects CI.

### Security and governance findings

- **#467 is unchanged: OPEN, no native PASS.** G0 is NO-GO. No ledger, anchor or Qor-logic change was made, and no receipts were created.
- **Existing P0s, not introduced or changed by 6.0.11** (v6.0.10 ships with them): #475 (Continue/Aider can write outside the worktree), #505 (Enforce cannot prevent editor disk writes; disclosed in the README and in the notifications), #474 (integration conformance). They are not fixed here. **Owner decision:** 6.0.11 strictly reduces exposure compared with the live 6.0.10, but these remain open and must be accepted or deferred explicitly.
- **Test hygiene:** a test in the full extension-host run (likely the `ConsoleHostGuard`-style real-Console tests) creates an empty `~/.failsafe` in the real profile even with `HOME`/`USERPROFILE` redirected. It was removed after every run; the production install was never modified. Worth a backlog item.
- **Clarity follow-up:** the `governance.l3Decided` stream event carries no file or request ID, so an expiry of an older stale request can look like it belongs to a new one. Not a defect, but worth improving.

## C. Product demonstration

| Item | Value |
|---|---|
| Fixture | `C:\dev\mythologiq\failsafe-demo-workspace`, commit `86c12f875d632dd9e21ca46e5afa83e7e8035060` (tag `demo-baseline`); bundled in `docs/marketing/demo-fixture/`. Fictional "Tasklet" TypeScript service with a real defect (TASK-14), an ADR, tests and 9 commits under a synthetic identity. |
| Journey shown | Open repository → FailSafe Monitor and Console → add a regression test (FailSafe flags it: no intent, write not prevented) → test run fails 6/1 → fix (FailSafe grades it **L2** and the evaluator queues an L3 review) → test run passes 7/7 → Console audit log (verdicts, L3 queued) → overview (checkpoints, 1 L3 pending) → diff |
| Screenshots | `C:\dev\mythologiq\FailSafe-media\v6.0.11-rc\screenshots\full\` (7 × 1920×1080 PNG), `...\web\` (1600×900 WebP and JPG), `...\thumbnails\` |
| Video | `...\video\failsafe-6.0.11-rc-walkthrough.mp4` (H.264, 1920×1080, 75.1 s, no audio) and `.webm` (VP9) |
| Captions, transcript, poster | `.en.vtt` (11 cues), `-transcript.md` (with a short text alternative and an actual-vs-scripted statement), `-poster.png` / `.jpg` |
| Checksums | `C:\dev\mythologiq\FailSafe-media\v6.0.11-rc\SHA256SUMS.txt` (35 files) |
| Simulated or unavailable | Editor actions were scripted through the VS Code API (a disposable driver standing in for a developer). No AI agent made changes. Intent creation and approval were not exercised: they need a plan and interactive prompts. The L3 request was left to expire. Single platform only. |

## D. Website handoff

- Branch `docs/589-marketing-media` @ `748c7813` (pushed; 0 runs), with:
  - `docs/marketing/MEDIA_MANIFEST.md`: provenance, captions, alt text, placement, rights, limitations; approval **PENDING OWNER REVIEW**.
  - `docs/marketing/WEBSITE_HANDOFF.md`: 41-word copy plus a long overview, a placement map for `FailsafeCurrentPage.tsx`, reproduction steps.
  - Root `README.md` "See it in action": three verified RC screenshots with alt text and captions; v6.0.10 is still described as the published release.
- **Install count:** the site already reads the live Open VSX API (`useOpenVSXStats`). No count was added anywhere. Owner review item: the hook's hard-coded `16,000+` fallback is shown while loading or when Open VSX is unreachable.
- **Brand:** only the existing approved icons were handed off (`icon.png` 256 RGBA, `failsafe-icon.svg` monochrome). No wordmark SVG exists in the repo, and no new artwork was made.

## E. Repository hygiene

- **Commits:** `52a40c16`, `fcf0c85d`, `43ab0ecb` on the release branch; `748c7813` on `docs/589-marketing-media`. All carry `[skip ci]`; zero workflow runs were triggered.
- **Issues:** #588 and #589 updated with results (comments). Nothing was closed; #564, #465, #467, #475 and #505 remain open as required.
- **Remaining P0/P1:** G0 (#467); Linux/macOS installed qualification (#502/#243); P0s #475, #505 and #474 (existing, owner decision).

## F. Three-step forecast (conservative)

1. **Immediate (owner, ~1–2 h):**
   - Review this report, the captures and the manifest.
   - Decide on the existing P0s (#475, #505, #474).
   - Decide whether #585 joins (it would need its own qualification, roughly a day).
   - Optionally run `npm test` / `rv lifecycle` on Node 20.18.1 to match CI.
2. **Authorization and publication (blocked; elapsed time depends on #467):**
   - Restore native governance and get an exact-subject PASS for `43ab0ecb` (or its successor).
   - Merge to `main`, tag `v6.0.11`, and let the release workflow publish and verify both marketplaces.
   - Engineering time once authorized: about half a day, including one CI run.
3. **Post-release (~half a day):**
   - Run `rv marketplace` plus `rv lifecycle` on the marketplace bytes.
   - Perform Linux/macOS installed SQLite checks (#502).
   - Update SYSTEM_STATE and BACKLOG to RELEASED.
   - Publish the website media once approved and switch its version label.
   - File the hygiene follow-ups (test writing `~/.failsafe`, l3Decided event fields).
