# PR #629 native qualification (2026-11-08)

**Source:** PR #629, `test/v6012-markdown-auto-link-encoding-20261108` @ `3df81dc4fe39961d70bee46a1798a5d89d71d06f`.
- Its parent is PR #628 @ `20f04f37`. Its tree is **byte-identical** to the local combination `ad88e268` = `497c0821` + #624 + #625 + #626 (`git diff --quiet` exit 0).
- #629 changes only `src/test/integrations/tracker-import/tracker-markdown.test.ts` (+34/−5). There is no product change.
- #623 is untouched at `497c0821`.

**Build and environment:**
- Detached worktree; Node 22.23.4; `npm ci`, then `npm run build:package` (exit 0).
- The hosts were driven by a temporary `useInstallation.fromPath` copy of `.vscode-test.mjs`, deleted afterwards. The worktree is clean.

## Verdict: **PASS. Ready for governed integration. Not authorized for merge.**

## Hosts

| Host | VS Code | Electron | Node |
|---|---|---|---|
| Pinned | 1.122.1 | 39.8.8 | 22.22.1 |
| Current stable | 1.145.2 | 43.8.3 | 24.22.1 |

## Results

| Gate | 1.122.1 | 1.145.2 |
|---|---|---|
| `tracker-markdown.test` (#480 T11, 5 tests including the new negative-control test), plus qualification probes | 7 passing, 0 failing, exit 0 | 7 passing, 0 failing, exit 0 |
| Full extension-host suite, `default` configuration | **6,064 passing, 19 pending, 0 failing** | **6,064 passing, 19 pending, 0 failing** |
| Full extension-host suite, `architecture-index` configuration | 17 passing, 0 failing | 17 passing, 0 failing |
| Full suite exit code | 0 | 0 |

**Host-independent gates:**
- `test:node`: 960 tests, 942 pass, 0 fail, 18 skipped.
- `test:runner-coverage`: PASS (724 files).
- `~/.failsafe` was absent before and after.

The #480 T11 failure seen on new VS Code (1.141.1/1.145.2) at `ad88e268` is resolved. Pinned behavior is unchanged.

## Markdown-safety matrix (the host's real `markdown.api.render`, with a verbatim copy of #629's helper)

**Probe:** `md-probe.test.js`, qualification-only and never committed to the product tree. Raw output is in `probe-<host>.json`.

| Input | 1.122.1 | 1.145.2 | Helper |
|---|---|---|---|
| Bare URL ending in `\` | `href …p.png%5C`, text `…p.png\` | same | accepted (same destination) |
| Escaped image syntax (the T11 case) | autolink `…p.png` (no `\`) | autolink `href …p.png%5C`, text `…p.png\` | accepted. **This is the observed renderer difference** |
| `[Trusted link](https://evil.example)` | anchor | anchor | **REJECTED** |
| `[http://trusted.example](http://evil.example)` | anchor | anchor | **REJECTED** |
| Text `https://evil.example/p.png\`, href `other.example/p.png%5C` | anchor | anchor | **REJECTED** (a different destination fails even when `%5C` is involved) |
| Raw `<a href="https://evil.example">Trusted</a>` | anchor | anchor | **REJECTED** |
| `[**Trusted**](https://evil.example)` (label contains markup) | anchor | anchor | accepted. **Pre-existing helper blind spot**, see below |
| Image inside a link | `<a><img></a>` | same | not matched by the helper; caught by the `<img` assertion |
| `![x](…)`, raw `<img onerror>`, raw `<script>` | rendered as tags | rendered as tags | the renderer passes HTML through. Product escaping is what prevents it (next table) |

The new unit negative controls in #629 also run and pass on both hosts: `%2F`, `%40`, double-encoded `%255C`, a different host and a plain label are all rejected.

**Real chat-participant output at the three sites** (`intent`, `status`, `seal`; hostile purpose; `probe-<host>-chat.json`):

| Check | 1.122.1 | 1.145.2 |
|---|---|---|
| Any `<img>` tag | none | none |
| Any `<script>` tag | none | none |
| Any element carrying `onerror` | none | none |
| `[link](http://evil.example)` rendered as a link labelled "link" | no | no |
| Anchors present | only same-text autolinks of bare URLs | same, with `…p.png%5C` / `…p.png\` |

## Findings (no change made; not caused by #629)

1. **Anchor-text blind spot.**
   - **Cause:** the helper's regex `<a href="…"[^>]*>([^<]*)</a>` (same as the original assertion) only inspects anchors whose `href` is the first attribute and whose label has no markup.
   - **Effect:** a disguised link with a formatted label (`<a href="https://evil.example"><strong>Trusted</strong></a>`) would not be flagged by this check.
   - **Why the gate still holds:** product escaping currently yields no such anchor at the chat sites (probe above).
   - **Fix (owner decision):** a stricter test would compare the label's text content.
2. **Chat-site test coverage.** The chat-site test asserts only `!<img` plus the anchor check. Unlike the Jira test, it does not assert `!<script`. The probe confirms no `<script>`, `onerror` element or raw HTML reaches the chat rendering on either host. Adding those assertions is optional hardening.

Neither finding weakens #629 relative to its parent. #629's normalization is limited to `%5C`/`%5c` → `\` in `href` before an exact comparison.

**Not run here:**
- macOS/Linux hosts;
- packaged-VSIX installed-host run;
- CI (no push to #629).
