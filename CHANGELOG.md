# Changelog

All notable changes to FailSafe will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [5.3.3] - 2026-05-28

Integration-surface batch: the first Open Design write path (L3-gated `create_artifact`), Section-4 razor + clobber-guard cleanup across the Bicameral / Marketplace / TabGroup surfaces, and a transparency audit date-filter fix. Sealed at META_LEDGER #409–#414.

### Added

- **Open Design `create_artifact` through L3 (B-OD-8)** — the non-destructive `create_artifact` write tool is admitted via L3 human approval (Buffer & auto-execute): `POST /api/actions/open-design-create-artifact` enqueues an L3 item and returns 409 pending; `OpenDesignL3Executor` runs the buffered call on approval + appends a ledger USER_OVERRIDE. Gate-by-construction one-shot token on `OpenDesignMcpClient`; the 3 destructive tools stay rejected. New per-item `POST /api/actions/decide-l3` + L3-queue UI. FX806–FX811. Sealed META_LEDGER #409.

### Changed

- **Decompose `BicameralRoute.ts` (B-INT-6)** — 490 → 34 LoC under the Section-4 razor. Extracted `bicameralRouteShared.ts` (deps + `governToolCall` + helpers) + `bicameralLifecycleRoutes.ts` + `bicameralDecisionRoutes.ts`; `bicameralToolRoutes.ts` repointed at the shared core (breaks the prior import cycle). Public surface preserved via re-export; zero behavioral change (195 Bicameral mocha + 7 Playwright pass verbatim). Sealed META_LEDGER #410.
- **Decompose `bicameral-card.js` + `MarketplaceRoute.ts` (B-INT-7)** — both under the Section-4 razor. `bicameral-card.js` 314 → 98 (state renderers → `bicameral-card-render.js`); `MarketplaceRoute.ts` 382 → 29 (shared HITL-nonce core + read/install/scan route modules). Public surfaces preserved; zero behavioral change (90 mocha + 10 Playwright pass verbatim). Sealed META_LEDGER #411. Follow-up (#413): the marketplace `install/:id/confirm` completion decomposed into `handleInstallCompletion`/`runPostInstallScan`/`recordInstallLedger` to clear the 40-line function razor (58 marketplace tests verbatim).

### Fixed

- **TabGroup-level clobber guard for all sub-views (B-INT-12, FX812)** — generalizes the v5.3.2 Bicameral-only guard: `TabGroup.renderActive` gives every inactive sub-view a persistent detached scratch container, so an event-driven render on any inactive sub-view (timeline/genome/replay/risks/governance/skills) writes off-DOM and is rebuilt into the live pane on re-activation. One-place change, zero per-renderer edits, behavior-preserving. Independent audit PASS; 29 TabGroup + 481 sub-view + 14 Playwright verbatim. Sealed META_LEDGER #412.
- **Transparency audit date-filter dropped late-in-day records (FX813, qor-debug)** — `TransparencyRenderer.matchesFilter` compared a UTC ISO instant (`Z`, ms precision) against local minute-precision date bounds using lexicographic string `<`/`>`, silently hiding evening records (UTC date past local midnight) + the final minute of each day. Fixed by comparing on the epoch axis (`Date.parse`, `to` inclusive of its whole minute). TZ-independent regression test added. Sealed META_LEDGER #414.

## [5.3.2] - 2026-05-28

Internal-quality release bundling the two post-v5.3.1 integration-surface refactors (B-INT-4 + B-INT-5). No marketplace-feature change beyond the Integrations tab now presenting one sub-view per integration. Sealed at META_LEDGER Entry #407 (B-INT-4) + #408 (B-INT-5).

### Changed

- **Integrations tab sub-tab switcher (B-INT-5)** — the Integrations tab moved from a single stacked-card panel to a `TabGroup` sub-tab switcher (one sub-view per integration), matching the agents/governance/workspace pattern. The monolithic `IntegrationsRenderer` split into `BicameralRenderer` (`bicameral-renderer.js`, 250 LoC — at the Section 4 razor) + `OpenDesignRenderer` (`open-design-renderer.js`, 39 LoC, read-only static card); `integrations.js` deleted. FX802/FX803 verified (jsdom 9/9 + Playwright pill-switch). Plan: `plan-b-int-5-integrations-subtabs.md`.
- **Internal refactor (B-INT-4)** — Bicameral + Open Design MCP clients now extend a shared `McpClientHost` substrate at `src/integrations/mcp/`. The two near-identical `idle-scheduler.ts` copies are consolidated into a single canonical module. **Zero behavioral delta** — all existing unit suites (156 Bicameral cases + 64 Open Design / contracts cases) plus the FX487/488/489/490 + FX589 Playwright specs pass verbatim. `BicameralMcpClient.ts` drops from 291 → 188 LoC (back under the Section 4 razor); `OpenDesignMcpClient.ts` drops from 185 → 91 LoC. New FX800 (15 cases — McpClientHost lifecycle, including the preCallGate-before-not-connected-check and postConnectAssertion-after-fetchCapabilities ordering invariants) + FX801 (6 cases — consolidated IdleScheduler).

### Fixed

- **TabGroup inactive-sub-view clobber (B-INT-5 qor-debug, FX804)** — `TabGroup.onEvent` fans events to all sub-views, but only the active one owns the shared content element; an autonomous `bicameral.connected` broadcast (background auto-connect) arriving while the Open Design sub-tab was active re-painted the Bicameral card over the live pane. Fixed with an additive `_tgMounted` flag (`TabGroup.renderActive`) + an early-return DOM-write guard in `BicameralRenderer.render()` (state still mutates while inactive → fresh on re-select). Test-first regression guard T6 (red→green).

## [5.3.1] - 2026-05-28

Hotfix release. v5.3.0 was tagged but its Release Pipeline failed at Build & Test — `integrations-tab.test.ts:34` hardcoded `cards.length === 1` ("Bicameral is the only card in v1") which became outdated when v5.3.0 added the Open Design Settings card to the Integrations tab; the VS Code Marketplace + Open VSX publish jobs were skipped, so v5.3.0 was never installable. **v5.3.1 is the first v5.3.x build that actually ships to the marketplaces.**

**Zero feature changes from v5.3.0** — the Open Design integration v1 (provenance) + v1.1 (MCP + SSE + probe) + WARN-only governance substrate v1 ship verbatim.

### Fixed

- **`integrations-tab.test.ts` — assert 2 cards for v5.3.0+** — the legacy `Bicameral is the only card in v1` test fired `2 !== 1` after v5.3.0 added `renderOpenDesignCard()` to `IntegrationsRenderer._renderCards()`. Test now asserts exactly 2 cards plus positive presence checks for both `.cc-bicameral-card` and the Open Design card (matched via `textContent`).

## [5.3.0] - 2026-05-28

### Added

- **Open Design integration v1.1 (B-OD-7)** — MCP adapter + per-run SSE attach + daemon-liveness probe. New `src/integrations/open-design/` modules: `OpenDesignDaemonProbe` (HTTP probe at `127.0.0.1:7456/api/version` with 30s TTL cache + 5s timeout + discriminated alive/refused/timeout/non_200/parse_error result), `OpenDesignMcpClient` (stdio MCP wrapper transplanted from the Bicameral pattern with concurrent-connect coalescing + idle-disconnect + transport.onclose teardown + capability cache from `listTools()`), `OpenDesignSseClient` (per-run `/api/runs/<id>/events` subscriber with SSE wire-format parsing + Last-Event-ID re-attach + capped exponential backoff up to 3 attempts), `OpenDesignMcpAllowlist` (static enumeration of 7 read-only + 4 write tools back-cited to upstream `apps/daemon/src/mcp.ts@abe72af` line numbers; includes destructive `delete_file` + `delete_project` + `write_file`). Vendored `ChatSseEvent` discriminated union under `contracts/sse-chat.ts` with Apache-2.0 attribution. New `src/extension/bootstrapOpenDesignMcp.ts` wires the operator wizard command `failsafe.openDesign.registerMcp` + opt-in pre-construction via `failsafe.integrations.openDesign.mcpEnabled` (default false) + forward-setting `failsafe.integrations.openDesign.sseEnabled` (default false). **v1.1 invariant**: write tools (`create_artifact`, `write_file`, `delete_file`, `delete_project` — 3 destructive) are REJECTED at runtime by `OpenDesignMcpClient.callRaw()` with `WRITE_TOOL_NOT_ENABLED`; L3-gated exposure deferred to v1.2 (B-OD-8). FX720-FX725 (60 cases — 9 sse-chat + 7 probe + 7 allowlist + 10 mcp-client + 6 sse-client + 7 bootstrap + 14 cross-coverage from FX700/FX701). Plan: `plan-open-design-integration-v1.1.md` (v3 PASS verdict; closes the 4-cycle Plan-Time Hallucination remediation loop per the new `feedback_verify_external_names_at_plan_time` doctrine). See `docs/INTEGRATIONS.md` (Open Design v1.1 section).
- **Open Design integration v1 (B-OD-1)** — file-path-based provenance attribution for agent runs whose edits land in `.od/artifacts/<projectId>/` paths. Opt-in via `failsafe.integrations.openDesign.enabled` (default `false`; requires extension reload). New `AgentProvenance` discriminated union on `AgentRun`; new `IAgentProvenanceDetector` interface + `OpenDesignProvenanceDetector` implementation; `AgentRunRecorder` gains an optional `{ provenanceDetectors }` options-bag constructor argument + a public `attachProvenance(runId, provenance)` method. Monitor Agents → Replay sub-view renders an "Open Design" origin pill on attributed runs. FX700-FX705 (28 cases). Plan: `plan-open-design-integration-v1.md` (v3). See `docs/INTEGRATIONS.md` (Open Design section) for the v1 surface + v1.1 roadmap.
- **qor.scripts substrate modules v1** (target v5.3.0; plan-qor-substrate-modules-v1) — WARN-only governance substrate layer invoked via the new `failsafe.substrate.run` Command Palette entry. Three modules in v1: `secret_scanner` (gitleaks v8), `feature_index_verify` (TS-local adapter — corrects an upstream column-header DRIFT), `model_pinning_lint` (silent-no-op against `.claude/skills/`, documented in `summary.note`). One `'substrate.run.complete'` event per run on the FailSafe EventBus; findings surface in a "FailSafe Substrate" Output channel + a `showInformationMessage` toast. WARN-only posture: findings never block operator workflow. FX710-FX715 (32 test cases total). New docs at `docs/SUBSTRATE_MODULES.md`; backlog `[B-SUBSTRATE-1..6]`.

## [5.2.2] - 2026-05-26

Hotfix release for the v5.2.x cycle. v5.2.0 and v5.2.1 are both dead-on-marketplace git tags in `main` — each had a Release Pipeline run that failed at the Build & Test job before the publish jobs ran. v5.2.0 (`ba9a927`, run `26470883885`) failed on 5 unit-test failures from orphaned SHIELD-anchor lesson literals + an FX615 tag-filter test race. v5.2.1 (`7631ac1`, run `26484008504`) failed on a latent Playwright harness regression in `popout-ui.spec.ts:6` that was masked by v5.2.0's earlier unit-test failures (CI never reached Playwright in v5.2.0's run; v5.2.1's unit-test fix made the latent regression visible). v5.2.2 closes the harness regression. **Zero feature delta from v5.2.1** (which itself had zero feature delta from v5.2.0) — the FailSafe Learn rebuild, Ollama probe fix, and a11y baseline ship verbatim. See the [5.2.0] entry below for the full content.

### Fixed

- **`popout-ui.spec.ts` Playwright harness migration to `serveConsoleServerUI`** — the legacy `http.createServer` static-file harness rooted at `src/roadmap/ui/` could not resolve the cross-directory ESM imports introduced by `LearnRenderer` in v5.2.0: `src/roadmap/ui/modules/learn.js` imports `../../../education/lessonTriggers.js`; `learn-essay-list.js` + `learn-glossary.js` import `../../../education/lessons.js`. These resolve in production through the bundling step and (during other Playwright specs) through the `ConsoleServer`'s module-resolution machinery, but the static-file pattern never reached outside `src/roadmap/ui/`. The browser issued 404s for `/education/*.js`, the `<script type="module">` import chain aborted with `net::ERR_ABORTED`, `command-center.js` never bootstrapped, the `.tab-btn` click handlers at `command-center.js:152-174` were never attached, and clicking the workspace tab silently did nothing. The new spec uses `serveConsoleServerUI` — the same harness as `command-center-learn-multimode.spec.ts`, `agents-tab.spec.ts`, `workspace-tab.spec.ts`, and every other v5.2.0+ Playwright spec that boots `command-center.html`. All functional assertions preserved verbatim (5 tab visibility checks + 3 tab-click → `#panel.active` assertions + 6-row theme select assertion). Forward contract documented in the spec header: any new Playwright spec that boots `command-center.html` must use `serveConsoleServerUI`; the static-file pattern is dead for the v5.2.0+ codebase.
- **No production-code change in this release.** The hotfix is test-infrastructure only.

### Process / lessons captured

- **CI failure masking is a real risk.** v5.2.0's 5 unit-test failures stopped `xvfb-run -a npm run test:all` before Playwright ran, silently hiding the popout-ui regression for the entire v5.2.0 → v5.2.1 cycle. A CI run that fails at phase N can mask additional regressions in phase N+1. Operators should expect at least one more iteration after the first fix when CI fails early.
- The two-tag dead-on-marketplace sequence (v5.2.0 + v5.2.1) is documented in operator memory `project_v5_2_x_dead_tags` for future-cycle reference.

_v5.2.2 released 2026-05-26 — `package.json` bumped to 5.2.2; META_LEDGER seal entry #396._

## [5.2.1] - 2026-05-26

Hotfix release for the v5.2.0 cycle. The v5.2.0 Release Pipeline (run id `26470883885`) failed at the Build & Test job with 5 unit-test failures; the VS Code Marketplace + Open VSX publish jobs were SKIPPED, so the `v5.2.0` git tag exists in main's history (`ba9a927`) but the extension was never installable. v5.2.1 is the first v5.2.x build that ships to the marketplaces. **Zero feature delta from v5.2.0** — the FailSafe Learn rebuild, the Ollama probe fix, and the global a11y baseline ship verbatim. See the [5.2.0] entry below for the full content.

### Fixed

- **Three orphaned SHIELD-anchor lesson literals** in `src/education/lessons.ts` — `shield.plan`, `shield.audit`, `shield.substantiate` were left in `LESSON_LIST` after the v5.2.0 cycle stripped the Monitor SHIELD lesson expander, becoming dead content that the FX598 lesson-anchor coherence check (`every lesson anchor is mounted somewhere`), the FX598 webview-mount assertion, the FX598 ghost-fixture parity test, and the FX602 governance-moment classifier all correctly flagged. v5.2.1 drops the literals and adds a dead-entry guard. The surviving `governance-mode` lesson (Settings card + `FirstRunModePicker`) carries forward unchanged. Header comment on `LESSON_LIST` documents the re-introduction protocol: re-add the literal AND a consuming mount in the same commit, never one without the other.
- **FX615 Glossary tag-filter test re-render race** in `src/test/education/learn-glossary-render.test.ts` — the test held a stale button reference across the post-click DOM rebuild that the tag filter triggers. Updated to re-query the button after the click event. No production change; test-only stability fix.
- **Five governance test files** updated to assert against the surviving `governance-mode` carry-forward + a regression guard that the three dropped SHIELD anchors are not silently re-introduced (`src/test/education/lessons.test.ts`, `lesson-types.test.ts`, `glossary-lessons.test.ts`, `lesson-anchor-coherence.test.ts`, `learn-glossary-render.test.ts`).

### Process / known follow-ups

- Two pre-existing Playwright spec failures (`src/test/ui/popout-ui.spec.ts`, `src/test/ui/bicameral-advanced-tools.spec.ts`) were observed locally but are **not** v5.2.1 regressions and were never part of the 5 CI failures that blocked v5.2.0. Both pre-date this hotfix branch; both will be triaged in a separate follow-up. They are explicit non-blockers for the v5.2.1 publish.

_v5.2.1 released 2026-05-26 — `package.json` bumped to 5.2.1; META_LEDGER seal entry #395._

## [5.2.0] - 2026-05-26

**FailSafe Learn — Software Development Craft** is the v5.2.0 release-gating feature. The Learn tab on the Command Center teaches the software-development craft to AI-assisted builders, PMs gaining developer literacy, and true beginners — through five short essays surfaced contextually as they work, plus the FailSafe Glossary as a secondary reference. Mantra: *Slow down to speed up.* Not training software — no quizzes, no scoring, no grading, no learner inference. FX591 / FX598 / FX601 / FX606 modified; FX608–FX613 added. See `docs/plan-qor-failsafe-learn-swe-craft.md`, `docs/EDUCATION.md`, `docs/VIBE_CODER_PLAYBOOK.md`, and `docs/compliance-education-component.md`.

### Added

- **Five SWE-craft essays** on the Learn tab — *Slow down to speed up* · *Scope before prompt* · *Acceptance criteria before code* · *Choosing between agent suggestions* · *Verify before you believe* — each at three tier framings ("New to code" / "AI builder" / "Product/PM background"). Two essays carry operator-binding templates (the acceptance-criteria template; the 6-question option-evaluation table). Content authored against the Phase 0 content matrix at `.failsafe/governance/CONTENT_MATRIX_failsafe-learn-swe-craft.md`; literals split into sibling content modules (`src/education/lessons-content-swe-essays.ts` + `-2.ts`) following the existing `glossary-content-*.ts` pattern. FX591 (v2).
- **Learn-tab essay-list renderer** (`src/roadmap/ui/modules/learn-essay-list.js`) — filters the registry to `learn.essay.*` anchors and renders all 5 cards as an always-on curriculum directory (title, current-tier body, embedded templates where applicable). Cards with fired contextual triggers sort first with a "Relevant for what you are doing now" badge; only those cards carry a **Mark as read** control (`data-learn-essay-ack`) that suppresses *only* the badge for the rest of the session (sessionStorage flag `fs-learn-nudge-dismissed:<anchor>` — the essay itself remains in the directory). FX609.
- **Contextual surfacing trigger engine** (`src/education/lessonTriggers.ts`) — a pure-function evaluator that maps hub state (`activePlan`, `recentCheckpoints`, `unattributedFileActivity`, `governancePhase`) onto five nudge anchors (one per essay). Includes a per-anchor frequency cap (1/session) and a per-session global cap (2 total) — both enforced **cumulatively across renders** via webview `sessionStorage` counters (`fs-learn-nudge-count:<anchor>`), so the same nudges do not re-fire on every hub update. Dismissals via the "Mark as read" control suppress only the *relevant-now badge* (sessionStorage flag `fs-learn-nudge-dismissed:<anchor>`); the underlying essay always remains in the curriculum directory. `scope-before-prompt` requires actual file activity to fire — opening Learn on a passive empty state never produces a relevant-now badge. The `choose-agent-option` high-blast-radius detector covers JS/TS lockfiles (npm/yarn/pnpm/bun), tsconfigs, common bundler configs, Python (`requirements*.txt`, `Pipfile[.lock]`, `pyproject.toml`, `poetry.lock`), Rust (`Cargo.{toml,lock}`), Go (`go.{mod,sum}`), VSIX manifests / packaged `.vsix`, and any `.github/workflows/` path. Session-duration timing is **client-side only** (webview `sessionStorage`; binding GDPR constraint — never transmitted server-side). FX608.
- **Tier framing** (`failsafe.education.proficiency.enumDescriptions`) — three operator-binding labels: *New to code* / *AI builder* / *Product/PM background*. The enum values are unchanged; only the descriptions reframe them as starting-point selectors, not skill scores. FX613.
- **SWE-craft vocabulary dominance check** (FX612) — extends the lesson-anchor coherence test with an automated assertion that the aggregated `learn.essay.*` body text contains SWE-craft vocabulary at ≥ 3× the FailSafe-governance vocabulary count. Binding enforcement of ideation failure-remediation class 1 ("content drifts back to FailSafe-vocab-only"); a hostile FailSafe-vocab-only fixture is caught.
- **Essay-list mount class** in the lesson-anchor coherence check (FX598 extension). `learn.essay.*` anchors are positively validated against the essay-list surface (`learn-essay-list.js`); a dead essay anchor is caught.

### Changed

- **The Learn tab is now SWE-craft-centric.** The five SWE-craft essays are the primary content; the FailSafe Glossary remains as a secondary reference below them. `LearnRenderer` (`learn.js`) recomposes around `renderEssayList` + the trigger engine. FX606 modified.
- **FX601 glossary Playwright assertion** updated — the "absent when disabled" test now expects `#cc-learn-essay-list` to be absent (parallel to the glossary), since both primary and secondary content are gated by the same `education.enabled` discipline.
- **`docs/EDUCATION.md`, `docs/VIBE_CODER_PLAYBOOK.md`, `docs/UI_MANIFEST.md`, `docs/FEATURE_INDEX.md`** rewritten or updated for the v2 reality.
- **The proficiency setting's `description`** in `package.json` reframed: "Where the FailSafe Learn content meets you — a starting-point selector, not a skill score. The operator picks; FailSafe never infers."
- **Server registry writes** now use a unique temporary file per write instead of the shared `servers.json.tmp` path. This removes a parallel Command Center test/server race where concurrent registry cleanup could delete another writer's temp file before the atomic rename.

### Removed (rejected v1 + v3 Educational Component)

The v1 Educational Component (sealed META_LEDGER #388) and v3 Guided Dev Cycle (sealed #389) were **rejected by the operator on 2026-05-22**: they taught FailSafe vocabulary, not software development. Removed in this rebuild:

- `src/education/devCycleTrack.ts` (the SHIELD-lifecycle track data model).
- `src/roadmap/ui/modules/guided-dev-cycle.js` (the Guided Dev Cycle panel renderer).
- `src/test/education/devCycleTrack.test.ts`, `src/test/education/guided-dev-cycle.test.ts`, `src/test/ui/command-center-guided-dev-cycle.spec.ts` (the FX603/604/605/607 tests).
- `docs/GUIDED_DEV_CYCLE.md` (documented the rejected concept).
- The bundle.cjs / copy-ui-js.cjs `devCycleTrack` browser-ESM emit was replaced with the `lessonTriggers` emit.
- FX598's v3 track-command extension reverted.
- The 4 v1 governance-moment lesson literals (`governance-mode`, `shield.plan`, `shield.audit`, `shield.substantiate`) carry forward in the registry — they power the v1 Settings governance-mode card + Monitor SHIELD phase tracker (both kept unchanged); they are NOT the Learn tab's content.

### Visual rebuild (2026-05-25 — in flight, uncommitted)

The v2 Learn tab shipped a single-pane composition (essay list + glossary stacked); the visual treatment was operator-rejected as low quality (no design reference consulted, no Chrome verification). This rebuild redoes the visual layer on top of the existing content, dispatched against 3 parallel design-research sources (`ui-designer` Direction A + Direction B + `accessibility-tester` + `web-design-guidelines`). Plan: `plan-learn-tab-visual-rebuild.md`.

- **Two-sub-tab `TabGroup` host** on the Learn tab — pills `[Read][Glossary]`. Default active is Read. Practice surface deleted in this cycle (the Mad-Libs prompt builder was hollow; a follow-up "zoom-in evaluator" plan will re-add a genuine Practice surface).
- **Read sub-view sectioned-essay rebuild** — each essay card carries a per-essay accent rail (4px, mapped to existing `--accent-{green/cyan/gold/orange/red}` tokens), inline-SVG icon, `~Nm read` chip (top-right, `tabular-nums`), pull-quote callout, H4-subheaded sections, and (for `acceptance-criteria` + `choose-agent-option`) inline template sub-panels. The acceptance-criteria template gains a **Copy** button that writes the canonical template to the clipboard.
- **Sticky horizontal jump-strip** at top of Read (FX619 NEW) — five anchor links with per-essay accent on hover + a relevant-now dot when the contextual trigger fires. Cards carry matching `id="cc-learn-essay-<slug>"` for browser-native scroll. Wraps to 2 lines under narrow webview widths.
- **Reference sub-view → Glossary** (FX615 modified) — renamed file `learn-reference.js` → `learn-glossary.js`, class `LearnReference` → `LearnGlossary`, all CSS `.cc-learn-ref-*` → `.cc-learn-glossary-*`. Per-row `[SWE]/[FS]` chips removed. The current visual treatment is a tag-filter UI (filter buttons + A-Z/Z-A sort dropdown) over a single alphabetized all-terms list. Search input adopts a11y attrs (`inputmode="search"`, `spellcheck="false"`, `autocomplete="off"`, paired `.visually-hidden` `<label>`); results container is `aria-live="polite"`.
- **Bicameral co-existence** (FX618 modified) — the integration-partner entry `glossary.bicameral-integration` co-exists with the v1 two-chambers `glossary.bicameral` entry; both render in the Glossary with distinct display terms. The two-chambers framing is preserved as a regression guard.
- **48-term SWE software glossary** (FX617) — 15 + 15 + 18 entries across `glossary-content-swe.ts` / `-swe-2.ts` / `-swe-3.ts`, joined through `glossary-aggregator.ts`. No anchor collisions with the legacy 12 FailSafe glossary entries (namespaced `glossary.swe.*`).

### A11y baseline (2026-05-25 — global CSS)

Added once near the top of `command-center.css`, applies extension-wide (not just Learn):

- **`@media (prefers-reduced-motion: reduce)`** disables all transitions + animations (`transition-duration: 0.01ms !important`). Closes WCAG 2.3.3 — the existing CC had zero coverage despite 21 `transition:` declarations.
- **Global `:focus-visible`** outline (`2px solid var(--primary)`, 2px offset) on `.cc-pill`, the Copy button, jump-strip anchors, glossary search input, glossary row-expand toggles. Closes WCAG 2.4.7 — the existing CC had a single `:focus-visible` rule, leaving every other interactive surface keyboard-blind.
- **`.visually-hidden` utility** — standard SR-only label class for the glossary search input's WCAG 3.3.2 paired label.
- **`max-width: min(68ch, 100%)`** on body prose — preserves 45-75ch readable line length while surviving WCAG 1.4.4 200% zoom without horizontal scroll.
- **Light-theme accent badge fallback** — `--accent-gold` (1.7:1) and `--accent-green` (2.5:1) on white panel fail WCAG 1.4.3 AA; `@media (prefers-color-scheme: light)` switches the relevant-now badge to a neutral `var(--bg-panel)` background. (Operator verification noted: in VS Code webviews `prefers-color-scheme` may not track the editor theme; theme-class selector swap is a deferred follow-up.)

### Fixed

- **Mindmap "Ollama (Server)" false-positive "Connected"** — `llm-status.js:74` previously hardcoded `status: 'Connected', active: true` for the Ollama row with no probe of any kind, so the panel claimed Ollama was running even when it wasn't installed. Added an actual probe: `_probeOllama()` in `connection.js` fetches `http://localhost:11434/api/tags` with a 1.5s timeout, caches the result with a 30s TTL, and notifies `webLlmStatus` listeners on completion. The Ollama row now reflects reality (`Connected ✓` / `Not Running` / `Checking…` / `Unavailable`). FX192 test suite extended from 1 case (the bug-encoding "always Connected") to 4 cases covering the full probe state space. Brainstorm renderer subscribes to `webLlmStatus` notifications so the async probe result triggers a re-render.

### Compliance

- **`docs/compliance-education-component.md`** — fresh determination for FailSafe Learn v2. Stays **outside** EU AI Act Annex III high-risk education/training classification (no assessment, no scoring, no learning-outcome evaluation, no level inference — operator self-selects tier). More strongly aligned with Article 4 AI-literacy than v1 was. Binding GDPR design contract: session-duration timing client-side only. Two binding escalation triggers: any introduction of scoring/grading/inference → re-ideate; any expansion to a full curriculum within the open extension → escalate to FailSafe Pro / separate-extension scope decision.

_v5.2.0 released 2026-05-26 — `package.json` bumped to 5.2.0; META_LEDGER seal entries #392 (substantive) + #393 (gate-closure extension)._

## [5.1.8] - 2026-05-22

B-INT-1 surfaces the 11 remaining Bicameral MCP tools (routes + a styled, grouped Advanced-tools card section) + B-EM-1 Sentinel-evaluator/Governance-mode UI disambiguation + B132 brainstorm node-label truncation feedback + the B199 CRITICAL test-coverage epic closeout + a v5.1.7 activation-test regression fix surfaced by restoring the full `vscode-test` suite (2739 passing, 0 failing). FX584–FX590. SHIELD-sealed via META_LEDGER Entry #385 (consolidated v5.1.8 cycle). See `docs/plan-qor-v5-1-8-cycle.md`. v5.2.0 remains gated on the Educational component — not this release.

### Added

- **Bicameral Advanced-tools surface** (B-INT-1). The 11 remaining Bicameral MCP tools (`ingest`, `search`, `brief`, `judgeGaps`, `resolveCompliance`, `linkCommit`, `update`, `reset`, `dashboard`, `validateSymbols`, `getNeighbors`) are now reachable. Each gets a `POST /api/actions/bicameral-<tool>` route — registered via a new `bicameralToolRoute` factory in `src/roadmap/routes/bicameralToolRoutes.ts`, `rejectIfRemote`-scoped, `409` when disconnected, `400` on a malformed body. State-changing tools (`ingest`, `update`, `reset`, `resolveCompliance`, `linkCommit`) route through the B151 `McpInterceptor` governance seam; pure-query tools call the client directly. A collapsed-by-default **"Advanced tools"** section in the bicameral card (`src/roadmap/ui/modules/bicameral-advanced-tools.js`) exposes all 11 as labelled invoke rows with per-tool inputs and capability-gating (a tool absent from `/status` `capabilities` renders disabled). The client surface was already complete (B-BIC-19); this cycle adds the route + UI surface. The section is fully styled in `command-center.css` (no inline styles), splits the tools into a **Query tools** group and a visually-distinct **Mutation tools** group, shows a per-row loading state during invocation, and renders results in a labelled success/error container. 14 cases (FX586–FX589 incl. a Playwright invoke-flow case).

### Changed

- **Sentinel-evaluator vs Governance-mode UI disambiguation** (B-EM-1). Five UI sites rendered `sentinel.mode` (`SentinelMode` = `heuristic`/`llm-assisted`/`hybrid`) with a `|| 'observe'` fallback — `'observe'` is a `GovernanceMode`, an invalid value for the field — and some labelled the value as if it were the governance mode. New `sentinelModeValue()` leaf supplies the corrected `'heuristic'` default; `integrity.js` relabels `Governance Mode:` → `Sentinel Mode:`, `governance.js`/`operations.js` prefix the value with `Sentinel`, `tickers.js` relabels `PROTOCOL` → `SENTINEL`. 8 cases (FX584).
- **Brainstorm node-label truncation feedback** (B132). Brainstorm node labels were silently shortened to 200 chars server-side with no client signal. `BrainstormRoute.ts` (`POST`/`PATCH /node`) now returns additive `labelTruncated` + `labelOriginalLength` fields when the cap is hit (`NODE_LABEL_MAX` + `withTruncationInfo` extracted to `brainstorm-label-truncation.ts`); the brainstorm UI surfaces a dismissible `.bs-truncation-notice` on add and edit, styled as an inline info banner in `command-center.css`. 6 cases (FX585) + a Playwright case (FX590).

### Fixed

- **Bicameral activation tests — latent v5.1.7 regression.** B-BIC-6 (v5.1.7) made the spawn-command validator async (`isSafeBicameralCommandResolved` with `realpath`), so `wireFromConfig` now calls `setBicameralCommand`/`setBicameralClient` after an `await`. Three `bicameral-activation.test.ts` cases asserted those calls synchronously and silently broke — masked because v5.1.7's `vscode-updating`-mutex degraded posture never ran the full `vscode-test` suite. v5.1.8 restored the full suite (2739 passing / 1 pending / 0 failing); the three cases are now async-aware. Production wiring was already correct — test-only fix.

### Closed

- **B199 — comprehensive Playwright + integration test-coverage epic** (CRITICAL) is closed. Phases 1–9 and sub-items B-B199-1..6 are all verified complete; every cited FX row was confirmed present in `FEATURE_INDEX.md` with its spec on disk. FX539 (B-B199-1 brainstorm E2E) was retroactively indexed during the closeout. FX513/FX519 carry `test.skip`-staged cases pending B197 — accepted residual. Two pre-existing razor-debt items surfaced during B-INT-1 were filed as B-INT-6/B-INT-7.

## [5.1.7] - 2026-05-21

B151 universal governance interceptor (the B190 → B151 → B152 → B153 architecture chain; B190 itself shipped in 5.1.6) + B191 Monitor SHIELD-visibility verification + B-INT-2 bicameral.preflight → L3 + B198 subscribe-without-mutate UI remediation + B-BIC validator/UX/governance batches (6/7, 12/13/14/15, 17/18) + B-B199-3/4/5/6 test-coverage gaps. FX547–FX583. SHIELD-sealed via META_LEDGER Entry #384 (consolidated v5.1.7 cycle). See `docs/plan-qor-b151-governance-interceptor.md`, `docs/plan-qor-b-int-2-preflight-l3.md`, `docs/plan-qor-b198-subscribe-without-mutate.md`, `docs/plan-qor-batch1-bbic-decision-row-ux.md`, `docs/plan-qor-batch2-bbic-validator-hardening.md`, `docs/plan-qor-batch3-b199-coverage-gaps.md`, `docs/plan-qor-batch4-bbic-governance-integration.md`. v5.2.0 remains gated on the Educational component — not this release.

### Added

- **`IGovernanceInterceptor` contract seam** (B151). Single `evaluate(req): Promise<ReceiptContract>` interface at `src/governance/interceptor/` — the universal pre-action governance entry point. Receipts validate against `receipt.json`; evidence is always `{kind, ref}` objects, never bare strings; ids are derived deterministically via `contractMappers`. 5 cases (FX547).
- **`EngineBackedInterceptor`** (B151). Delegates to the existing `EnforcementEngine` and maps `Verdict` → `ReceiptContract` (ALLOW/BLOCK/ESCALATE → schema-valid receipts; an engine throw → a QUARANTINE receipt, no rethrow). No new enforcement surface. 5 cases (FX548).
- **`McpInterceptor` adapter** (B151). Wraps an MCP `{name, arguments}` envelope into an `EvaluationRequestContract`; malformed input yields a QUARANTINE receipt without invoking the backing interceptor. Minimal local client interface — no bicameral import. 5 cases (FX549).
- **`contractMappers`** (B151). Deterministic id derivation, `ProposedAction` ↔ `EvaluationRequest` round-trip, and `Verdict` → `Receipt` projection. 6 cases (FX550).
- **`PreflightToL3Mediator`** (B-INT-2). Subscribes the bicameral `preflight` tool to the L3 approval pipeline: a drifted decision attaches preflight evidence to the queued L3 entry. Graceful degradation (null/disconnected client → no attach; a thrown preflight is swallowed). Minimal local `L3PreflightDeps` interface. 6 cases (FX553).
- **`L3ApprovalService.attachPreflightEvidence` + tier-3 preflight wiring** (B-INT-2). In-place `meta.preflight` merge with flag dedup on the live L3 queue; `processEvaluationDecision` fires preflight non-blocking after a tier-3 entry is queued. 7 cases (FX554 + FX555).
- **L3 preflight-conflict UI** (B-INT-2). `renderL3PreflightConflicts` in the governance panel and `formatPreflightConflicts` on `L3ApprovalPanel` surface drifted-decision conflict lines; all decision titles HTML-escaped. 7 cases (FX556 + FX557).
- **Shared accessible modal helper** (B198). `modal-helper.openModal` — one helper with `role="dialog"`, `aria-modal`, focus trap, Escape-to-close, and focus restoration; three modal sites in `risks.js` + `roadmap.js` delegate to it. 6 cases (FX559).
- **Bicameral decision-row UX batch** (B-BIC-12/13/14/15). Open-binding route + decision-row "Open" affordance (`POST /api/actions/bicameral-open-binding`); capability-gated `/bicameral-ingest` empty-state hint driven by a new `/status` `capabilities` field; composite Sync action firing status + history + drift on one press; binding `<code>` overflow clamp. 14 cases (FX561–FX564).
- **Bicameral install-detector validator hardening** (B-BIC-6/7). `isSafeBicameralCommandResolved` adds symlink-containment re-check via `realpath` with a fail-closed catch branch; `isSafeBicameralCommand` gains an `extraRoots` allowlist parameter; `defaultExtraRoots()` apply-by-default Windows chocolatey/scoop roots. 15 cases (FX565–FX569).
- **Bicameral verdict event → Sentinel + Risk Register** (B-BIC-17/18). `BicameralRoute` drift/ratify handlers emit `bicameral.verdict` events (eventBus-absent-safe); `SentinelWatchPolicy.classifyBicameralVerdict` maps `drifted` → high/notify; `RiskRegisterManager.upsertRisk`/`closeRisk` give keyed idempotent risk lifecycle; `DriftToRiskMediator` mirrors verdicts into the Risks Register (drift upserts a `bicameral:{decisionId}` risk, ratify closes it). 16 cases (FX580–FX583).
- **Cross-host install-record coverage** (B-B199-4). A layout-correct `writeRecordForHost` helper sourcing paths from `HOST_INSTALL_LAYOUTS` closes the gap where `kilo-code` (`.kilo` base) and `gemini` (`.gemini/commands`) install-record round-trips were untested, including a regression-guard that a record at the wrong `.kilo-code` path is not picked up. 4 cases (FX575).

### Changed

- **`BicameralRoute` is now interceptor-governed** (B151). The `history` / `drift` / `ratify` tool routes route through `McpInterceptor`; a behavioural-parity spec (FX551) pins success bodies, error envelopes, and HTTP status against a pre-migration snapshot fixture so the migration is provably zero-behaviour-change. `src/integrations/bicameral/` remains zero-diff.
- **`SkillsRenderer` cache invalidation + `TabGroup` sub-view lifecycle** (B198). `SkillsRenderer` now invalidates its cache on `skills.*` / `voicePack.*` events (subscribe-without-mutate — no spurious re-fetch on unrelated `hub.refresh`); `TabGroup.switchTo` destroys the outgoing sub-view renderer; re-render-safe `destroy()` added to `skills.js` + `risks.js`. 9 cases (FX558 + FX560).
- **E2E coverage-gate hardening** (B-B199-5). `check-e2e-coverage.cjs` rewritten: `[no-e2e]` overrides are now per-file scoped (`[no-e2e: <path-fragment> — <reason>]`); the legacy unscoped form no longer grants a blanket pass; a blanket override is opt-in and explicit via `[no-e2e: * — <reason>]`; a new `mode:'release'` checks a merge-commit range instead of the staged index and fails closed when the range is unresolvable; every excused/bypassed file emits a greppable `[e2e-gate] AUDIT:` line. 12 cases (FX570–FX574).
- **B191 Monitor parity assertion strengthened**. The FX525 `bus-renderer-flow.spec.ts` disk → `/api/hub` → Monitor compact-UI parity case was strengthened; research confirmed B191's SHIELD-activity visibility is already resolved by B192/B193/B199, so B191 closed as verify-and-close (L1).

### Security

- **Symlink-containment re-check on bicameral command resolution** (B-BIC-6). `isSafeBicameralCommandResolved` resolves symlinks via `realpath` and rejects any command whose real path escapes the home directory (or a supplied `extraRoot`) — closing a bypass where an in-home symlink pointed outside home. Fail-closed: a non-existent path (`ENOENT`) is rejected.

### Documentation

- **`docs/TEST_COVERAGE_TRADEOFFS.md`** (B-B199-3/6). New document recording accepted residual test-coverage risk: voice substrate live behaviour (real Whisper/Piper E2E impractical without the ~86 MB separate-download vendor binaries) and stub-only specs. `integrations-bicameral.spec.ts` + `voice-pack.spec.ts` carry STUB-ONLY header banners pointing at the trade-off doc; the real install/connect paths stay unit-covered.

## [5.1.6] - 2026-05-20

Bicameral HIGH cluster (B-BIC-16/19/20) + safety + concurrency batch (B-BIC-8/9/11/21/22/23) + upstream awareness (B-INT-3) + B-B199-2 Replay + Genome behavioral E2E + B-EM-2/B-EM-3 enforcement-mode polish + governance contract schemas (B190). SHIELD-sealed via PR #77 (Entries #378/#379/#380), PR #78 (Entry #382), and PR #79 (Entry #383). See `docs/plan-qor-bicameral-cluster-high.md`, `docs/plan-qor-bicameral-safety-concurrency.md`, `docs/plan-qor-b199-2-replay-genome-e2e.md`, `docs/plan-qor-em-2-em-3-enforcement-mode-polish.md`.

### Added

- **BicameralMcpClient type-surface refactor** (B-BIC-19). `callRaw(name, args)` promoted to public surface; 11 typed wrapper methods (`ingest`, `search`, `brief`, `judgeGaps`, `resolveCompliance`, `linkCommit`, `update`, `reset`, `dashboard`, `validateSymbols`, `getNeighbors`) each backed by a per-tool runtime guard. Parsers + guards extracted to `src/integrations/bicameral/parsers.ts` to keep `BicameralMcpClient.ts` under the 250-line razor. 25 new mocha cases (FX526 + FX527).
- **Vendored echo-mcp-server live-subprocess test** (B-BIC-20). Self-contained TypeScript MCP server using `@modelcontextprotocol/sdk/server/stdio`, declaring all 15 bicameral tool names with canned JSON satisfying Phase 1's runtime guards + side-channel file recording received arguments. Spawned via `process.execPath`. 5 cases (FX528) close the prior gap where Bicameral tests stubbed the transport rather than exercising it.
- **DriftToL3Mediator** (B-BIC-16). New mediator class subscribes to bicameral drift events + `qorelogic.l3Decided`. Drift status-edge enqueues L3 with `kind: 'bicameral.drift'` + `meta.decisionId` (de-dup by `bicameral:{decisionId}`). On L3 decide: APPROVED + APPROVED_WITH_CONDITIONS → `client.ratify('ratify')`; REJECTED → `'reject'`; DEFERRED/EXPIRED/UNDER_REVIEW/QUEUED no-op. `L3ApprovalRequest` extended with optional `kind?` + `meta?` fields (backward-compatible). 11 cases (FX529 + FX530).
- **UpstreamMonitor service** (B-INT-3). Polls GitHub `/releases/latest` + `/search/issues?q=repo:{slug}+is:open` every 24h (configurable via `failsafe.integrations.bicameral.upstreamPollMs`). Regex-allowlisted owner/repo slug (`^[\w.-]+/[\w.-]+$`) checked **before any** `httpFetch` call (fail-closed). Default repo `BicameralAI/bicameral-mcp` configurable via `failsafe.integrations.bicameral.upstreamRepoUrl`. 6 cases (FX532).
- **`GET /api/integrations/bicameral/upstream`** route (B-INT-3). Local-only access via `rejectIfRemote`. Returns last snapshot or 503 if monitor not wired / no poll completed. 4 cases (FX533).
- **`renderUpstreamRow`** Settings card helper (B-INT-3). Snapshot row (latest release tag + open-issue count) + version warning when installed bicameral-mcp is below floor (>=0.14) or at/above ceiling (<0.16). 6 cases (FX534).
- **pip version-floor pin** (B-INT-3). `BICAMERAL_PIP_SPEC = 'bicameral-mcp>=0.14,<0.16'` constant in install-handler; install bridge surfaces the spec in the spawned `pip install` command.
- **Replay sub-view behavioral E2E** (B-B199-2 Phase 1). 8 Playwright cases (FX535) exercise the Agents-tab Replay sub-view: empty state, list view active/completed counts, slice cap 20, click-card → detail navigation, step kind badge + diff stats, governance card (action + risk + confidence), back-button return, `agentRun` WS event triggers re-fetch.
- **Genome sub-view behavioral E2E** (B-B199-2 Phase 2). 6 Playwright cases (FX536) exercise the Agents-tab Genome sub-view: empty pattern + unresolved state, pattern-card render with failure-mode labels + counts, show-all toggle (filtered → all), slice cap 12, unresolved entries table with status indicators, `failureArchived` WS event triggers re-fetch.
- **Test-only renderer registry** (B-B199-2 Phase 0). Single-line addition at end of `command-center.js init()`: `if (typeof globalThis !== 'undefined') globalThis.__failsafeRenderers = renderers;`. Required by FX535.8 + FX536.6 WS-event synthesis. Benign in production: namespaced under `__failsafe*`, no secrets exposed.
- **`ModeTransitionHistory.hydrateFromLedger`** (B-EM-2). Replays `governance.modeChanged` events from META_LEDGER on activation so the in-memory ring buffer survives extension restart. 11 SG-035 cases (FX537): empty-ledger no-op, ordering preserved, cap 10 honored, non-governance / malformed entries ignored, idempotent on re-hydrate.
- **`FirstRunModePicker`** (B-EM-3). VS Code quickpick offering Observe/Assist/Enforce on initial install. Selection persists to workspace config; cancel-path no-op; suppressed when already configured. 6 cases (FX538) under vscode-test electron suite.
- **`BicameralMcpClient.connect()` concurrency cache** (B-BIC-8). In-flight connect promise cached and returned to concurrent callers; eliminates the race where parallel `connect()` invocations could spawn duplicate transports.
- **Idle disconnect TTL** (B-BIC-9). Client disconnects after a configurable idle period (default 15 minutes) of zero in-flight requests; new `failsafe.integrations.bicameral.idleDisconnectMs` setting. `idle-scheduler.ts` helper extracted with timer + inflight-counter.
- **Structured `isError` payload surfacing** (B-BIC-11). Bicameral tool errors now surface the structured detail in the thrown message rather than the bare `isError=true` flag, making MCP-side errors actionable.
- **MCP protocol/version floor assertion** (B-BIC-22). `protocol-floor.ts` helper asserts the MCP protocol version at connect-time and refuses to attach to servers below the floor (fail-closed).
- **Runtime type guard on `callTool()` return** (B-BIC-23). All BicameralMcpClient call paths run the parsed payload through a runtime guard before returning, preventing malformed shapes from leaking into downstream consumers.
- **Concurrent connect/disconnect race tests** (B-BIC-21). New test cases exercise interleaved `connect()` / `disconnect()` invocations to verify the in-flight cache + idle-disconnect interactions remain deterministic under contention.
- **`semver.ts` shared helper**. `compareSemver` extracted from `upstream-row.ts` into a sibling module so the new `protocol-floor.ts` can share the same lightweight semver compare (returns -1/0/+1; strips `v` prefix; ignores pre-release tags). Restores Section 4 razor compliance for `upstream-row.ts`.
- **Governance contract schemas** (B190). 8 JSON Schema 2020-12 contract definitions (`evaluation_request`, `ledger_entry`, `intent`, `failure_mode`, `approval`, `checkpoint`, `receipt`, `governance_config`) under `src/contracts/`, a typed `types.ts` surface with the `CONTRACT_VERSIONS` map, and fixture-match + well-formedness tests.

### Changed

- **Audit cycle 1 → 2 remediation** (cluster-high plan). Six findings closed before implementation: (F1) `qorelogic.l3Decided` payload-shape citation drift, (F2) UpstreamMonitor SSRF allowlist enforcement before fetch, (F3) deferred-tool count contradiction reconciled (11 wrappers, not 12), (F4) DEFERRED/EXPIRED verdict no-op mapping clarified, (F5) FX528 SG-035 violation (stub → live subprocess), (F6) false-empty "Open Questions: None" replaced with explicit list.
- **Safety + concurrency audit cycle 1 → 2 remediation**. APPROVE-WITH-MANDATORY-EDITS verdict closed via 3 must-fix + 2 should-fix items addressed inline. `BicameralMcpClient.ts` stands at 284L (over the 250-line razor by 34L); explicit exception documented in the audit since the 11 deferred-tool wrappers **are** the public API surface and extracting them would violate the type-surface contract.

### Fixed

- **Extension activation no longer crashes on hosts without a global `fetch`**. The B-INT-3 `UpstreamMonitor` was wired at activation time with the bare global `fetch`; on Node runtimes that do not expose `fetch`, this threw `ReferenceError` and aborted activation, leaving no `failsafe.*` commands registered. The HTTP transport is now feature-detected — falling back to a minimal `node:https` GET shim (`http-fetch-shim.ts`) — and the monitor wiring is isolated in a fail-safe `try/catch` so a non-critical background poller can never abort activation.

### Security

- **UpstreamMonitor SSRF allowlist** — `REPO_SLUG_RE = /^[\w.-]+\/[\w.-]+$/` enforced inside `poll()` **before** any `httpFetch`. Fail-closed branch sets error snapshot + warn log. Verified by FX532 cases 2 + 3 (invalid slug rejected pre-fetch; shell metacharacters in URL blocked).
- **MCP protocol-floor fail-closed** — Bicameral integration now refuses to attach to MCP servers below the supported protocol version (`protocol-floor.ts`); a non-conforming server reports a clean error instead of leaving the client in a half-initialised state.

## [5.1.5] - 2026-05-19

Bicameral MCP integration (v1) + stale-cache remediation (B192) + voice substrate extraction (B195) + enforcement-mode escalation UX (B194) + SentinelDaemon governance-file coverage residual fix-up (B193). See `docs/INTEGRATIONS.md`, `docs/governance-cache-invalidation.md`, `docs/governance-mode-transitions.md`, and `docs/plan-qor-sentinel-governance-extensions.md`.

### Added

- **Bicameral MCP — Integrations tab** (`docs/plan-qor-bicameral-mcp-integration.md`). New Command Center tab dedicated to third-party integrations. Bicameral is the only entry in v1; pattern extensible to additional MCP servers.
- **Install bridge** with solo / team mode picker. Runs `pip install bicameral-mcp` + `bicameral-mcp setup --mode {solo|team}` via list-form spawn against the operator's resolved Python; nothing is bundled in the VSIX. Live per-step progress over WebSocket.
- **BicameralMcpClient** — thin wrapper around `@modelcontextprotocol/sdk` stdio transport. Connect/disconnect is lazy; `history`/`preflight`/`drift`/`ratify` tools are surfaced through HTTP routes that scope to local-only access (`rejectIfRemote`).
- **Bicameral Settings card** — install state + version + `failsafe.integrations.bicameral.autoConnect` toggle + "Re-install / Re-setup…" shortcut. The autoConnect setting drives an opt-in background connect attempt at activation when the workspace is configured.
- **VS Code settings**: `failsafe.integrations.bicameral.command` (default `"bicameral-mcp"`), `failsafe.integrations.bicameral.pipCommand` (default `"pip"`), `failsafe.integrations.bicameral.autoConnect` (default `false`).
- **Bicameral surface** — `src/roadmap/routes/BicameralRoute.ts` (status + install + connect / disconnect / history / drift / ratify + auto-connect toggle); `src/extension/bootstrapBicameral.ts` (lazy client wiring + config-watcher rebuild + auto-connect probe); `src/roadmap/ui/modules/bicameral-settings-card.js`.
- 11 new mocha test files covering Bicameral client / install detector / install handler / Integrations tab JSDOM render / Bicameral card states (functional under SG-035).
- **`WorkspaceMutationBus`** (`src/shared/WorkspaceMutationBus.ts`) — targeted-path fs.watch aggregator with per-watcher debounce (200ms default, 1500ms META_LEDGER override). Pure Node stdlib; no new deps.
- **`LedgerManager.getLedgerPath()`** — public accessor for the SQLite db path; lets HubSnapshotService + TrustEngine resolve the watch target without threading `configProvider` through their constructors.
- **`HubSnapshotService.refreshChainValidity()`** — invalidates `cachedChainValid` + `chainValidAt` on bus-emitted db mutations; next `getCheckpointSummary()` re-walks the chain via `verifyCheckpointChain()`.
- **`HubSnapshotService.dispose()`** + **`PlanManager.dispose()`** + **`TrustEngine.dispose()`** — release bus subscriptions on extension deactivate.
- **18 new functional cases** across 5 test files (FX498/499/501/502/503 — all under SG-035 acceptance discipline).
- **Voice Pack — separate-download companion** (`docs/plan-qor-voice-substrate-extraction.md`). Resolves B195 marketplace-cap risk per the 2026-05-18 disposition decision (`feedback_voice_separate_download.md`). Base VSIX drops below the 30 MB ceiling; voice features become opt-in.
- **Install / uninstall paths**: VS Code commands `failsafe.installVoicePack` + `failsafe.uninstallVoicePack`. Settings tab Voice Pack card with 4-state render (`absent` / `installed v<X>` / `stale` / `error`) including explicit **Dismiss** + **Retry** on terminal errors (per F1 audit-cycle-1 remediation; satisfies SG-FakeProgress-A Live-Progress Invariant).
- **Voice substrate**: `src/voice-pack/{types,voice-pack-detector,install-handler,index}.ts`. Pure Node 20+ stdlib (`fetch` with redirect-follow + bounded GitHub-host allowlist; `crypto`, `stream`, `child_process` for `tar -xzf`). No new npm dependencies.
- **ConsoleServer static-mount overlay**: `setupAllRoutes()` mounts `globalStorageUri/voice-pack/` at `/vendor` BEFORE the default uiDir static, so pack files take priority when installed. Falls through gracefully when absent (existing `error:piper_not_vendored` engine error path engages — surfacing the Install Voice Pack affordance via `voice-controller.probeVoicePack()`).
- **VoicePackRoute**: `GET /api/integrations/voice-pack/status` (probe + version + missingFiles + diskUsageBytes), `POST /api/actions/install-voice-pack` (bridge with WS-broadcast per-phase progress), `POST /api/actions/uninstall-voice-pack`.
- **Voice-pack build pipeline**: `scripts/package-voice-pack.cjs` writes `dist/failsafe-voice-pack-<version>.tar.gz` + `.sha256` + manifest.json with every-file sha256. `.vscodeignore` excludes the heavy vendor paths from VSIX packaging. `scripts/validate-vsix.cjs` adds a 30 MB ceiling assertion (B195 acceptance gate).
- **18 voice-pack functional tests** across 6 test files (FX491–FX497).
- **Enforcement-mode escalation UX** (`docs/plan-qor-enforcement-mode-escalation-ux.md`, B194 resolution). New `governance.modeChanged` typed event + `ModeTransitionHistory` in-memory ring (cap 10) + populated `hub.governanceModeState` + `hub.recentModeTransitions`. Monitor sidebar gains an observe-mode advisory banner ("Switch to assist or enforce when ready →") that links to Settings; Governance tab gains a "Mode Transitions" feed with reverse-chronological rows showing previous/new mode + reason + actor + timestamp. BreakGlass payloads enriched with full transition context (cycle-2 reviewer caught the `system:auto-expire` vs ledger `system:break-glass-timer` mismatch — actor strings now coherent). Closes silent `hub.governanceModeState` non-population bug surfaced in research. 4-cycle audit PASS via independent architect-reviewer (SG-007 Option B). 5 tests (FX504-FX509 — 20 unit cases + 3 Playwright cases). See `docs/governance-mode-transitions.md`.
- **B199 Phase 2 — Settings tab E2E + B-EM-4 harness unblocker** (`docs/plan-qor-b199-phase2-settings-e2e.md`). 3 active FX512/FX513 Playwright cases + 2 deferred-skip pending B197 merge.
- **B199 Phases 3-9 — full Command Center tab coverage + WS broadcast matrix + bus-renderer E2E**. Phase 3 (Voice Pack installed state, FX519). Phase 4 (Agents tab structural, FX520). Phase 5 (Workspace tab, FX521). Phase 6 (Governance tab, FX522). Phase 7 (Overview tab, FX523). **All 6 top-level Command Center tabs now have structural Playwright coverage.** Phase 8 (WS broadcast matrix — 16 broadcast types, FX524 — closes deep-audit HIGH). Phase 9 (real disk META_LEDGER → /api/hub → Monitor compact-UI E2E, FX525 — closes deep-audit CRITICAL "B191 bus→renderer fixture-only"). Remaining B199 gaps (B-B199-1..6) captured in BACKLOG for follow-on cycles.
- **Bicameral integration quick wins (B-BIC-1..5)** (`docs/plan-qor-bicameral-quickwins.md`). Five high-leverage fixes: (1) ratify → META_LEDGER USER_OVERRIDE; (2) extension-deactivate disposer + rewire cleanup; (3) transport.onclose crash recovery; (4) BicameralMcpClient.getCapabilities() listTools cache; (5) install stdout/stderr ANSI + C0 sanitizer. 15 new FX514-FX518 cases.
- **B197 qor-logic version-floor surfacing**: hub payload now carries `installedVersion` + `meetsFloor`; Settings card surfaces a `cc-qorlogic-floor-warning` block when below `MIN_QOR_LOGIC_VERSION`. FX511 (6 cases).
- **Bicameral UI design-token cleanup** (`bicameral-card.js`): 6 fabricated/wrong theme tokens corrected; inline `.cc-card` / `.cc-btn` overrides removed so the canonical CSS classes own glass-morphism + radius + padding.
- **B193 SentinelDaemon governance-file coverage residual fix-up** (`docs/plan-qor-sentinel-governance-extensions.md`). Phase 60 §2 Track C pre-shipped most of B193 (`.md`/`.yaml`/`.yml`/`.json` watched, `.failsafe/**` blanket exclusion removed). Residual cycle: corrects aspirational whitelist paths to canonical fs locations (`.failsafe/risks/risks.json`, `.failsafe/manifest/active_intent.json` + `manifest/intents/` glob); adds `docs/META_LEDGER.md` + `docs/BACKLOG.md` + `docs/plan-*.md` to whitelist and `isGovernanceSurface` priority-boost (verdict pipeline now sees these as `'high'` priority); broadens `.failsafe/governance/` to a blanket prefix that covers 70+ on-disk variant files (AUDIT_REPORT_*, SESSION_STATE_*, RESEARCH_BRIEF_*) the suffix-equality match dropped silently. 10 new SG-035 functional cases (FX510). 1-cycle architect-reviewer PASS.

### Changed

- **`ConsoleLifecycleService.watchMetaLedger`** routes through `WorkspaceMutationBus` when present (1500ms debounce preserved); falls back to raw `fs.watch` when no bus is provided (test back-compat).
- **`bootstrapCore`** constructs `WorkspaceMutationBus` alongside `EventBus`; **`bootstrapServers`** + **`bootstrapQorLogic`** thread it to ConsoleServer + TrustEngine. All bus-receiving constructor parameters are optional (existing test fixtures without bus continue to work unchanged).

### Not done — see B-SC-6

L3ApprovalService was originally listed as a B192 stale-cache victim. Audit cycle 1 surfaced that its backing `VscodeStateStore` wraps `vscode.Memento` (in-process VS Code state with no filesystem path to watch). The existing `HubSnapshotService.buildHubSnapshot` pull-call to `qorelogicManager.refreshL3Queue?.()` handles its in-process staleness. An EventBus-driven alternative (publish `qorelogic.l3Queue.mutated` on writes) is deferred to a separate cycle.

## [5.1.0] - 2026-05-14

Minor release. Model-sourced Risk Register (coding agents author risks via MCP tool, chat subcommand, or auto-derivation from SHIELD lifecycle), Install Skills UX expansion (live progress + per-host picker + dry-run preview + LiveProgressInvariant doctrine), OpenVSX/VS Code Marketplace alignment at v5.0.0 baseline, brand sweep (eliminated all `Qore` legacy spellings), release pipeline safety gate (production environment approval), full SRE panel attribution (Microsoft AGT + Qortara), 36 new FX415–FX420 functional tests, and a complete brand + skill-source-attribution sweep. Supersedes the unreleased 2026-05-06 draft.

### Added

- **Model-sourced Risk Register** (`plan-qor-model-sourced-risks`). Risks now come from the coding model itself: agents call the new MCP tool `failsafe.create_risk`, use the `@failsafe /risk` chat subcommand to draft + confirm risks, or let FailSafe auto-derive risks from SHIELD lifecycle signals (GATE VETO ledger entries, DEBUG entries, Shadow-Genome `genome.failureArchived` EventBus emissions). Each risk records its source (`mcp` / `audit-veto` / `debug` / `shadow-genome` / `manual` for legacy migrations) plus structured `derivedFrom` lineage that powers de-duplication.
- **Install Skills UX expansion** (`plan-qor-install-skills-ux-expansion`, sealed at META_LEDGER entry #371). Modal install flow with live progress + retry, operator-editable host registry, per-host skill picker, dry-run preview, and a new workspace `LiveProgressInvariant` doctrine + lint helper. Upstream `Qor-logic#58` filed for canonical SDK amendment.
- **OpenVSX v5.0.0 catch-up publish workflow** (`.github/workflows/openvsx-catchup.yml`). Manual `workflow_dispatch` job that publishes a specific historical version to OpenVSX only, used to align OpenVSX with VS Code Marketplace when a prior release was direct-`vsce`-published. v5.0.0 was published to OpenVSX on 2026-05-14 via this workflow.
- **Microsoft Agent Governance Toolkit + Qortara attribution** on the SRE panel (disconnected setup card + persistent footer link in both states).
- **Sync Framework asymmetry fix**: `FrameworkSync.propagate(systemId)` now calls `AgentConfigInjector.inject(system)` after the dir-copy step, so picking a single target (e.g. GitHub Copilot) actually writes the governance block to `.github/copilot-instructions.md`. Toasts now report what was written (`framework dir copied, updated <path>`) instead of claiming success on no-ops.

### Changed

- **Skill source attribution**: skills sourced from the Qor-Logic Python package now display as `qor-logic`; FailSafe-authored skills display as `FailSafe`; external skills (ElevenLabs, Three.js, …) keep their actual upstream credit. Implemented in `roadmap/services/SkillFrontmatter.ts:resolveSourceCredit` and `SkillParser.ts` default attribution.
- **Brand spelling sweep**: eliminated all `QoreLogic` / `Qorelogic` / `QORELOGIC` / standalone `Qore` / `qore` casings across `FailSafe/extension/src/` and `package.json`. User-facing strings hyphenated to "Qor-Logic"; PascalCase identifiers remain `QorLogic`. Files renamed: `bootstrapQoreLogic.ts` → `bootstrapQorLogic.ts`; `QoreLogicManager.ts` → `QorLogicManager.ts`; `QoreRoute.ts` → `QorRoute.ts`; `QoreRuntimeService.ts` → `QorRuntimeService.ts`. The lowercase compound `qorelogic` (config-key namespace + source directory) is held in a deferred-rename bucket pending a settings-migration plan.
- **Organize-UX hotfix** (sealed #364): contextual-summary helper now reports actual organize action outcomes instead of the misleading "Bootstrap: 1 step(s) deferred" message. Host-side decision V1 Path C wired; organize callbacks now surface success/no-op/failure separately.

### Removed

- **`failsafe.addRisk` command + QuickPick wizard** deleted from `commands.ts`, `RiskRegisterProvider.ts`, and `package.json`. Manual risk entry is replaced by the model-sourced surfaces above. Legacy risks in `risks.json` are auto-migrated to `source: 'manual'` on first load.
- **Redundant skill prefixes**: 10 `ql-*.md` skills + 10 `ql-*` reference templates + 3 `qore-*` script directories deleted from user-scope `~/.claude/`; 13 `ql-*.md` commands + 7 `ql-*` agents + 4 `ql-*` references deleted from project-scope `.claude/commands/`. Canonical `qor-*` skills remain.
- **Hearthlink skill leftovers** (6 files) deleted from `.claude/commands/` — they belonged to a separate project.

### Fixed

- **Banner Install Skills button** previously POSTed to `/api/actions/scaffold-skills` with no body and silently triggered a server-side VS Code QuickPick that opened in the extension host (invisible from the browser tab). Now opens the same in-browser modal the Settings card uses, with host pickers, scope radios, and preview button.
- **`/api/actions/scaffold-skills/preview` 404**: the SPA-fallback middleware in `ConsoleRouteRegistrar.setupAllRoutes` was registered before the qorlogic routes (added after `consoleServer.start()`), so any `/api/*` POST not matched by core routes hit the fallback. Split the SPA fallback into a separate `finalizeFallback()` step that bootstrap calls after `registerQorlogicRoutes(...)`. Preview POST now reaches its handler.
- **Install Skills 501** "Scaffold not available" from the Settings card: `ConsoleServer.setupAllRoutes()` was being called in the constructor, so `ApiRouteDeps` captured `scaffoldSkills`/`scaffoldWithWebOptions` as `null` before `bootstrapServers.ts` wired them. Moved `setupAllRoutes()` into `start()` so callback wiring happens first.
- **Brainstorm canvas TypeError**: `.showNavInfo(false)` was called unconditionally on `ForceGraph`'s chain, but the method only exists on `ForceGraph3D`. Guarded inside the 3D branch.
- **Active build step ↔ Recommended next step inconsistency** on the Monitor: when META_LEDGER is IDLE but an active plan phase is highlighted in the track, the next-step tile no longer says "Run /qor-plan…" — it now derives from the same active phase title the track uses.
- **Long install summary** ("Installed 160 skill(s) at /path/.claude/agents/, /path/.claude/skills/, …") collapsed into a digestible headline + collapsible per-host detail blocks.

### Security

- **Release pipeline: manual approval gate** added between `build` and the two `publish-*` jobs in `.github/workflows/release.yml`. Both `publish-vscode` and `publish-openvsx` now require an explicit `production` environment review before they fire, preventing accidental same-second dual-publishes if `validate:vsix` misses a regression.

### Test discipline

- 36 new functional tests (FX415–FX420 series) for the model-sourced Risk Register: `RiskManager` migration + dedup, `failsafe.create_risk` MCP tool handler, `RiskAutoDerivation` derivers + mappers, `AuditGateArtifactReader`, `RiskChatHandler` draft/confirm, and Risks UI source-pill rendering.

---

## [5.1.0-pre.2026-05-06] (unreleased draft — superseded by 5.1.0)

The content below was authored on 2026-05-06 as an in-progress draft for v5.1.0 but was never tagged/published. It is preserved here verbatim for historical reference; all of its features are also captured in the `## [5.1.0] - 2026-05-14` release above.

Minor release. Comprehensive E2E coverage methodology + release-class CI gate (B199 Phase 1) + Monitor B191 functional proof. Surfaced and fixed three latent Monitor bugs that unit tests could not catch — most notably a missing `type="module"` on the Monitor's bootstrap script that meant the compact UI never actually rendered in production.

### Added

- Comprehensive E2E coverage methodology — Playwright test harness (`serveCompactUI` + `ledgerFixtures` helpers) and two new specs: `monitor-shield-progression.spec.ts` (8 cases covering all 6 SHIELD phases + plan title + WS-broadcast re-render) and `monitor-staleness.spec.ts` (1 connected → disconnected → reconnected lifecycle case).
- Release-class CI coverage gate — `scripts/check-e2e-coverage.cjs` invoked from the pre-push hook when the active plan's `change_class` is `feature` or `breaking`. Blocks pushes whose staged surface files (UI, ConsoleServer routes, commands) lack a corresponding `*.spec.ts`, unless a `[no-e2e: <reason>]` token appears in a commit message in the push range. Hotfix is exempt.
- New npm scripts: `test:e2e` (runs Playwright) and `test:e2e:coverage` (runs the gate against currently-staged files).

### Fixed

- Monitor never bootstrapped in production (root cause behind B191's user-visible "Monitor doesn't see my work"). The compact UI's `<script src="roadmap.js">` was missing `type="module"` despite using ES module imports — the script silently failed to execute. No prior unit test exercised UI JS execution, so this was invisible.
- SEAL phase rendered "Substantiate active" instead of "all four done". `PHASE_INDEX_MAP['SEALED']` was 4 (same as SUBSTANTIATE) in `monitor-render.js`. Bumped to 5 so SEAL correctly renders all four steps `done`.
- IDLE phase rendered "Plan active" instead of "all pending". Added an IDLE early-return branch in `getPhaseInfo` that fires only when no other phase signal exists; preserves existing IDLE+runState and IDLE+recentCompletions fallthrough semantics.

### Test discipline

- Mocha suite: 958 → 959 passing (+1 net from new `IDLE with empty plan → index -1` assertion); 1 pending; 0 failing.
- Playwright suite: 7 → 16 passing (+9 net); 1 pre-existing skip; 0 failing.

### Known divergence

- Open VSX still shows v4.9.9; v5.0.0 published to VS Code Marketplace but Open VSX replication did not fire and no git tag was created for v5.0.0. v5.1.0 release will need to either leapfrog Open VSX from 4.9.9 → 5.1.0 directly, or backfill-publish v5.0.0 to Open VSX first.

## [5.0.0] - 2026-04-25

Major release. Public reveal of the FailSafe / FailSafe Pro product split. The v4 bundled-skills installer is replaced by ingestion from the [`qor-logic`](https://pypi.org/project/qor-logic/) PyPI package. Skills now begin with `qor-` (was `ql-`). The Command Center reads workspace truth — META_LEDGER, BACKLOG, plan files, audit reports, and CHANGELOG — instead of showing empty placeholder state.

### Added (Round 3 — Voice & Brainstorm UX, 2026-05-06)

- Multilingual speech-to-text — Whisper model picker (tiny / base / small) and BCP-47 language selector in the Voice settings section. Default model switched from English-only `whisper-tiny.en` to multilingual `whisper-tiny`.
- Voice status badge — single-element DOM badge in the Brainstorm right panel surfacing the unified state stream (idle / listening / processing / speaking / error:*).
- Auto-match voice — when enabled, switching STT language auto-selects the matching Piper TTS voice from a 12-language catalog.
- TTS error transparency — Piper vendor presence failures (`piper_not_vendored`, `wrong_mime`, `init_failed`) now surface to the status badge instead of silent console.info.
- Brainstorm history limit — configurable (1-100, default 10) via Settings → Brainstorm; replaces the hardcoded 10-entry cap.
- Brainstorm export — JSON download filename now includes timestamp + timezone offset (`brainstorm-YYYY-MM-DD-HH-MM-SS±OOOO.json`); avoids same-session overwrites.
- Notifications severity gating — Settings → Notifications card lets operators silence info-tier toasts independently from error-tier toasts.

### Changed (Round 3)

- ConsoleServer decomposition — extracted `QoreRuntimeService` and four route handlers (`QoreRoute`, `FeatureStatusRoute`, `SkillsApiRoute`, `HookRoute`) from `ConsoleServer.ts`. Internal architectural refactor; no user-visible API change.
- Voice controller — multi-subscriber state and analyser fan-out with cache-and-replay on subscribe; late subscribers (badge, modal visualizer) now see current state on attach.

### Security (Round 3)

- HTML escape discipline applied across all settings and overview surfaces that interpolate store-derived or hub-derived values into innerHTML — closes XSS pathways in Voice settings, audio device data attributes, TTS voice picker, ticker bar (Sentinel mode), risk register cells, governance Sentinel card, and Settings Configuration card.
- Allowlist hardening — Whisper model id validated against `ALLOWED_WHISPER_MODELS` (3 entries) at construction and on swap; Piper voice id validated against `ALLOWED_PIPER_VOICES` (20 entries). Closes localStorage-XSS supply-chain pivot to arbitrary HuggingFace / Piper voice fetch.
- Voice substrate hardening — model swap reentry guard, idle/processing analyser cache invalidation, listener fan-out snapshot iteration, modal `onMicButton` wrapper restoration, idempotent destroy.

### Added (Round 2 — Install UX, 2026-05-05)

- Install transparency report (#49): every install action emits a structured `QorLogicInstallReport` with one invocation per phase (`python-probe`, `pip-install`, `qorlogic-install` per host, `provenance`, `refresh`). The Settings card renders the report inline; failed steps stay visible with command + stderr until the next run.
- Host/scope QuickPick (#50): the Settings card "Install QorLogic Skills" button now prompts for hosts (multi-select) and scope (`repo`|`global`) before installing; selections persist to workspace state and pre-check on re-run.
- New command palette entry "FailSafe: Install QorLogic Skills (defaults)" (`failsafe.installQorLogicSkillsDefaults`) — bypasses the QuickPick and installs `[claude, codex]` at `repo` scope, intended for automation and the command palette quick path.
- "Show Output" button on the Settings install card focuses the FailSafe (QorLogic) output channel via the new `POST /api/actions/show-output` route.

### Changed (Round 2)

- **Internal ABI break**: `ConsoleServer.setScaffoldCallback` now expects `() => Promise<QorLogicInstallReport | null>` (was `Promise<{scaffolded, skipped, error?}>`). The single source-of-truth report type lives in `installSkillsReport.ts`.
- Broadcast event `skills.install.progress` payload field renamed `step` → `invocation`. The new shape carries `phase`, `host`, `scope`, `command`, `interpreter`, `destination`, `installedCount`, `version`, `summary`, `error`, `stderrTail`.
- `createInstallSkillsHandler` signature: `(context: ExtensionContext, ingestor, callbacks?, mode='prompt')`. Mode `'defaults'` bypasses the QuickPick.
- `QorLogicSkillIngestor` exposes `probePython`, `ensurePackageInstalled`, `installHost(host, scope)`, `getWorkspaceRoot`, `rescanWorkspace` for orchestrator-driven granular installs.

### Added

- `qor-logic` package installer with auto-detected Python interpreter (setting → ms-python → probe).
- `QorLogicSkillIngestor` runs `qorlogic install --host claude --scope repo` and `--host codex` by default; supports `kilo-code` and `gemini` opt-in.
- Synthesized `SOURCE.yml` provenance for ingested skills.
- `failsafe.openFailSafeProDownload`, `failsafe.bootstrap`, and `failsafe.organize` commands.
- Always-visible "Install / Refresh QorLogic Skills" + "Bootstrap Workspace" buttons in the Command Center Settings tab.
- Setting `failsafe.qorlogic.pythonPath` for explicit Python override.
- Workspace-truth UI: META_LEDGER backfills Operations Phases / Recent Verdicts / Recent Completions; BACKLOG populates Risks tab; new Latest Audit + Recent Releases cards on Overview.
- New docs: `FailSafe/extension/docs/v5/QORLOGIC_SKILL_INGESTION.md`, `FailSafe/extension/docs/v5/PRO_INTEGRATION.md`.

### Changed

- "Install Skills" button label → "Install QorLogic Skills".
- The bundled `dist/extension/skills/` is no longer included in the VSIX.
- Extension `description` revised off the legacy "AI governance platform" framing.
- Skill IDs migrated from `ql-*` to `qor-*` across source and project-local skill directories.
- Operations Phases stat now reflects META_LEDGER reality (was 0/0); render capped at 10 cards plus a summary row.
- **Phase 1 ConsoleServer decomposition (B164/B165)** — extracted 4 portable, framework-agnostic modules: `WebSocketManager` (28L), `TransparencyLogger` (35L), `RiskRegisterManager` (30L), `EventSubscriptionManager` (185L; 12 EventBus listeners covering governance verdicts, sentinel events, transparency, and run lifecycle). ConsoleServer 1371→1177L (-194L). Foundation for the Phase 2 decomposition delivered in Round 3.
- "About FailSafe Pro" command + Settings card open the product/learn page <https://mythologiq.studio/products/failsafe-pro> (was: opened the download URL despite being labeled "About") (#46).

### Fixed

- Operations Phases stat: `completed > planned` no longer renders as `4 / 0`; `planned` floored to `completed` so each completion implies at least one plan (#47).
- Install QorLogic Skills: progressive step display, button disables while running, hub refresh on completion (#48).

### Removed

- v4 bundled-skill copy path (`bootstrapServers.ts` direct `dist/extension/skills` → `.claude/skills` copy). Existing user skills already on disk are not touched.

### Security

- All subprocess invocations use list-form `spawn(cmd, args)`; no shell strings. pip install bounded by 120 s timeout, qorlogic install per host by 180 s timeout.

## [4.9.9] - 2026-03-17

### Fixed

- Install Skills button works — bundled skills path corrected (B189).
- Brainstorm Prep Bay visible in Command Center right panel (B188).
- TabGroup sub-view right panels surfaced for all 3 tab groups.

## [4.9.8] - 2026-03-17

### Fixed

- Error budget excludes resolved verdicts — VETO→PASS cycles no longer inflate burn gauge (B187).

### Added

- Clickable blocker/error budget navigation to Command Center audit log (B185).
- SRE Activity Feed with ALLOW/DENY/AUDIT badges (B179).
- SRE SLO Dashboard with multi-SLI grid and error budget gauges (B180).
- SRE Fleet Health with per-agent status, circuit breaker state, and success rate (B180).
- Configurable adapter base URL replacing hardcoded default (B178).

### Architecture

- Sentinel rendering extracted to `sentinel-monitor.js` (roadmap.js 632→486L) (B186/D33).
- SRE types extracted to `SreTypes.ts` with v2 schema (B178).

## [4.9.6] - 2026-03-16

### Added

- SRE panel: active policies, agent trust scores, OWASP ASI coverage, and SLI compliance indicator via `agent-failsafe` REST bridge (B167-B169).
- SRE toggle in Monitor sidebar for switching between Monitor and SRE views (B168).
- `agent-failsafe` Python package gains `server` optional extra with FastAPI `/sre/snapshot` endpoint.

## [4.9.5] - 2026-03-16

### Added

- Agent Run Replay: execution trace capture and step-by-step replay panel for agent session debugging (B146).
- Governance Decision Contracts: typed decision pipeline with risk categorization and sentinel event adapter (B147).
- Marketplace README repositioned as "AI Coding Safety" category.

### Security

- 3 XSS/path-traversal/re-entrancy fixes in replay panel and run recorder.

## [4.9.2] - 2026-03-13

### Added

- META_LEDGER file watcher for auto-refresh of governance state in Monitor (B140).
- Shared hook sentinel utility for unified hook toggle management (B107).
- Release pipeline verification test coverage (B108/B137/B138/B139).

### Fixed

- GovernancePhaseTracker recognizes SUBSTANTIATED verdict correctly (B140).
- Hook toggle convergence between Console and VS Code settings (B107).

## [4.9.0] - 2026-03-13

### Added

- Agent Run Replay: execution trace capture and step-by-step replay panel for agent session debugging (B146).
- Governance Decision Contracts: typed decision pipeline with risk categorization and sentinel event adapter (B147).
- Marketplace README repositioned as "AI Coding Safety" category.

### Security

- 3 XSS/path-traversal/re-entrancy fixes in replay panel and run recorder.

## [4.8.0] - 2026-03-13

### Added

- Agent Execution Timeline: step-by-step visualization of agent actions with governance decision overlay (B142).
- Risk & Stability Indicators: real-time agent health status with observe-mode notification and fallback logic (B143).
- Shadow Genome Debugging Panel: interactive browser for failure patterns with filtering and pattern details (B144-B145).
- New commands: `FailSafe: Agent Health Status`, `FailSafe: Agent Execution Timeline`, `FailSafe: Shadow Genome Debugger`.

## [4.7.2] - 2026-03-11

### Fixed

- L3 escalation resilience: Added try/catch blocks around L3 queuing in `L3ApprovalService` and `VerdictRouter` to prevent potential crashes on connection failures.

### Performance

- Concurrent Folder Manifold Calculation: Shifted folder processing from sequential to concurrent using `Promise.all`, showing improved execution time during workspace initialization.

## [4.7.0] - 2026-03-10

### Added

- Agent Marketplace: curated catalog of 11 external agent repositories with HITL security gates.
- Security Scanner integration: Garak/Promptfoo CLI for vulnerability scanning with risk grades.
- Microsoft Agent Governance Toolkit Adapter: Python bridge to agent-os, agent-mesh, agent-hypervisor, agent-sre.
- Trust tiers for marketplace items: unverified → scanned → approved → quarantined.

### Changed

- Skills tab extended with Marketplace view toggle.
- Connection module handles marketplace/adapter WebSocket events.
- Ledger types include MARKETPLACE_INSTALL and MARKETPLACE_UNINSTALL events.

## [4.6.6] - 2026-03-09

### Added

- Repository Governance as a Service: workspace compliance validation with grading (A-F) and remediation guidance.
- Multi-workspace server registry for independent FailSafe instances across VS Code windows.
- Compliance metric in Monitor UI with grade display and violation tooltips.
- S.H.I.E.L.D. phase tracker parsing META_LEDGER.md for governance state awareness.
- Workspace selector in Command Center for switching between active instances.

### Changed

- Hub snapshot enriched with workspace identity and compliance data.
- Dynamic port propagation replaces hardcoded 9376.

## [4.6.5] - 2026-03-10

### Changed

- Cross-agent skill consolidation: 200+ files across 7 locations → canonical `.claude/skills/` + `.claude/agents/` + automated transpilation.
- Skills migrated from flat `.claude/commands/qor-*.md` to directory-based `.claude/skills/qor-*/SKILL.md` with YAML frontmatter.
- Agent definitions separated to `.claude/agents/qor-*.md` with subagent frontmatter.
- ModelAdapter output directories corrected for Claude, Codex, Gemini, Copilot, and Cursor.
- VSIX bundling de-complected: agents removed from skill pipeline, directory-based patterns added.
- Antigravity restructured from Genesis/Qorelogic to skills/agents layout.
- `FailSafe/Claude/` (20 stale duplicate files) deleted.
- 12 quarantined skills cleaned up (9 superseded removed, 3 archived).
- `AGENTS.md` created at repo root for cross-agent compatibility.

## [4.6.4] - 2026-03-09

### Fixed

- Trust state was transient: event-driven invalidation via EventBus replaces stale init-only cache. Mutations persist to SQLite and cache rebuilds from DB on trust updates, quarantines, and releases.
- Trust timestamps fabricated: `getTrustScore()` now returns DB `updated_at` instead of `new Date()`. Audit trails reflect real mutation times.
- Checkpoint chain validity assumed on startup: now auto-verified during initialization; failures recorded.
- Command Center version hardcoded to 4.4.0: now reads from package.json.

### Added

- Trust persistence with optimistic locking, version-based concurrency control, and exponential backoff retry for concurrent agent trust updates.
- Three trust event types (`trustUpdated`, `agentQuarantined`, `agentReleased`) for EventBus cache invalidation.

### Changed

- TrustEngine decomposed: 449L → 3 files (223L + 167L + 40L) for Section 4 compliance.

## [4.6.3] - 2026-03-08

Incremental hotfix for Monitor & Command Center parity. Further refinements forthcoming.

### Fixed

- Console Server `express.static` missing `dotfiles: "allow"` — all CSS/JS/image assets silently 404'd under dotfile install paths.
- Monitor sidebar: active build/debug session tracking via IDE lifecycle events.
- "Recently Completed" falls through to checkpoint history when plan data is empty.
- L3 approval queue auto-prunes expired items on read (SLA enforcement).
- Command Center: verdict alert banner, live network activity, verdict-aware mission strip.
- XSS hardening on Command Center overview innerHTML interpolations.

## [4.6.2] - 2026-03-08

### Fixed

- Console Server 404 on dotfile install paths (`.vscode/`, `.antigravity/`). Latent bug in Express `sendFile()` dotfile protection.

## [4.6.1] - 2026-03-08

### Fixed

- Missing sidebar SVG icon in activity bar.
- Release Pipeline branch policy validation for tag-based CI.
- Icon reference validation added to release preflight gate.

## [4.6.0] - 2026-03-08

### Changed

- Section 4 Razor decomposition: ConsoleServer 3265L→1124L, stt-engine 400L→249L, EnforcementEngine 250L→122L with 16 extracted modules.
- Voice brainstorm bug fixes: rAF batching, TTS error handling, node taxonomy, waveform visualizer, truncation logging (B119, B120, B125, B129, B132).
- Hook toggle UI and release gate enhancements (B107, B108, B138, B139).
- Socket.dev compliance: deprecated API removal, post-build pattern sanitization.
- Governance doc storage migrated to `.failsafe/governance/`.

## [4.5.1] - 2026-03-07

### Fixed

- Activation crash when ledger database is unavailable
- CI validator parameter mismatch in `validate.ps1`

## [4.5.0] - 2026-03-07

### Changed

- Skill Discovery now carries tags and source credit; Skills panel uses type-ahead tag filter with autocomplete.
- Brainstorm, STT, and ideation modules refined for cleaner runtime behavior.
- CI VSIX guardrails workflow consolidated to single-source build with proprietary content scan.
- Governance skill lifecycle cohesion: 19 skills with next-step routing, canonical routing table, /qor-document authoring skill.

---

## [4.4.1] - 2026-03-06

### Changed

- Extension activation now uses explicit command/view/chat activation events instead of startup-wide activation.
- Socket policy manifests updated to ignore accepted capability classes used by design.
- Socket badge/version markers aligned to `4.4.1` across docs.

---

## [4.4.0] - 2026-03-06

### Changed

- Version synchronization with extension/package release markers and marketplace documentation.
- Mindmap terminology alignment across operator-facing documentation and Command Center navigation.

---

## [4.3.2] - 2026-03-04

> _"Performance & Polish"_

### Changed

- **Checkpoint Integrity Flow** - Full chain verification moved out of heartbeat-critical paths and exposed through explicit verify actions in Console UI.
- **Robust Local Server Startup** - API and roadmap server startup paths now resolve available ports within fallback ranges to reduce activation failures.
- **Message-Driven Webview Refresh** - Transparency and Economics panels now update incrementally via postMessage after initial render.
- **Operator Docs Rewrite** - Bundled extension help documents now align to the unified Console tab model and current command surface.

### Documentation

- Voice-brainstorm docs now reflect shipped voice + manual workflows and document runtime vendor prerequisites.

---

## [4.3.1] - 2026-03-03

> _"Security Hardening"_

### Fixed

- **SQL Injection Protection** — `SchemaVersionManager.hasColumn()` now validates table names against a strict whitelist (`shadow_genome`, `schema_version`, `soa_ledger`) before PRAGMA queries, preventing dynamic table name injection.
- **XSS Prevention in LivingGraphTemplate** — Graph tooltip and stats elements now HTML-escape all dynamic node data (`label`, `type`, `state`, `riskGrade`) before rendering. Stats element switched from `innerHTML` to `textContent` for numeric-only content.
- **XSS Prevention in RevertTemplate** — Revert result display now HTML-escapes step status, name, detail, and error messages before innerHTML assignment.
- **README Logo Path** — Corrected logo reference from root `icon.png` to `FailSafe/extension/icon.png` to display the current FailSafe branding.

---

## [4.3.0] - 2026-03-02

> _"Telemetry Loop"_

### Added

- **Pre-Commit Guard** (`failsafe.installCommitHook`, `failsafe.removeCommitHook`) - Installs an authenticated thin-client git hook that queries `GET /api/v1/governance/commit-check` before commit.
- **Provenance Tracking** - Records AI authorship attribution to the SOA ledger as `PROVENANCE_RECORDED` events and exposes artifact history via `GET /api/v1/governance/provenance/:artifactPath`.
- **CI Governance Context Export** - Adds `tools/export-governance-context.sh` and release workflow artifact upload so shipped builds retain public governance context.

### Changed

- Release documentation, README surfaces, and packaged extension metadata now align on `v4.3.0`.
- Bundled extension operator docs now ship with the VSIX for component-level and process-level guidance.

### Fixed

- Quality sweep remediation sealed for `v4.3.0`: IPv6 SSRF coverage in `GovernanceWebhook`, dead-code removal in `capabilities.ts`, and Razor compliance restoration in `SentinelRagStore.ts`.

## [4.2.0] - 2026-02-27

> _"The Answer to the Ultimate Question of Life, the Universe, and Everything."_

### Added

- **Multi-Agent Governance Fabric** — Runtime detection and governance injection for Claude CLI, Copilot, Codex CLI, and Agent Teams via `SystemRegistry` and `FrameworkSync`.
- **Governance Ceremony** (`failsafe.onboardAgent`) — Single-command opt-in/opt-out for governance injection across all detected AI agents.
- **First-Run Onboarding** — Multi-agent governance coverage options during initial setup.
- **Agent Coverage Dashboard** — Console route showing detected agents, injection status, and compliance state.
- **Undo Last Attempt** (`failsafe.undoLastAttempt`) — Checkpoint-based rollback with integrity verification.
- **Discovery Phase Governance** — DRAFT → CONCEIVED status gate with ledger-tagged graduation markers.
- **Terminal Correlator** — Maps terminals to agent systems for cross-agent audit correlation.
- **Workflow Run Model** — Run/stage/gate/claim/evidence contracts aligned to governance lifecycle.
- **Intent Schema v2** — `schemaVersion`, `agentIdentity`, and `planId` fields with v1 migration.
- **Verdict Replay Batch** — Bulk verdict replay with timing-safe hash comparison.
- **CheckpointManager** — Bridges QoreLogic ledger and Sentinel substrates for checkpoint metrics.

### Changed

- `SystemRegistry` extended with terminal-based agent detection.
- `RoadmapServer` gains `setSystemRegistry()` deferred setter.
- `QoreLogicSubstrate` interface extended with `systemRegistry` field.
- Event types expanded with `DISCOVERY_RECORDED` and `DISCOVERY_PROMOTED`.

---

## [4.1.0] - 2026-02-27

### Added

- **Gap 1: Mode-Change Audit Trail** — All `governance.mode` configuration changes now recorded to SOA ledger with `USER_OVERRIDE` event type.
- **Gap 2: Break-Glass Protocol** — Time-limited governance overrides with justification requirements, auto-revert, and full audit trail.
- **Gap 3: Artifact Hash on Write** — SHA-256 hash of file content at save-time recorded in ledger for verification.
- **Gap 4: Verdict Replay Harness** — `failsafe.replayVerdict` command for audit verification of past governance decisions.

### Changed

- Ledger payload now includes `policyHash` for replay fidelity.
- New methods: `LedgerManager.getEntryById()`, `PolicyEngine.getPolicyHash()`.

---

## [4.0.0] - 2026-02-27

### Added

- **Token Economics Dashboard** — Real-time visibility into prompt token usage, RAG savings, and cost-per-action metrics.
- **Economics Service Layer** — Pure TypeScript module with `CostCalculator`, `EconomicsPersistence`, `TokenAggregatorService`.
- **Governance Mode System** — Three modes (Observe, Assist, Enforce) selectable via settings or command.
- **Risk Register Panel** — Dedicated webview for tracking and managing project risks.
- **Transparency Stream Panel** — Real-time governance event stream in the sidebar.
- **Chat Participant** — `@failsafe` chat commands for intent, audit, trust, status, and seal operations.

### Changed

- UI terminology: "Operations Hub" renamed to "Command Center".
- API-first service isolation for future Tauri/Rust extraction.

---

## [3.6.0] - 2026-02-17

### Changed

- **Marketplace Categories** - Updated from `["Other", "Linters", "Visualization"]` to `["Machine Learning", "Testing", "Visualization"]` for better discoverability in the VS Code Marketplace.
- **Keywords Expanded** - Added 8 new keywords: `ai safety`, `agent governance`, `code audit`, `risk management`, `compliance`, `deterministic governance`, `intent management`, `checkpoint`.
- **Documentation** - Added marketplace category badges to README files for transparency.

### Added

- **Governance Modes** - Three modes to match workflow needs:
  - `observe` - No blocking, just visibility and logging. Zero friction.
  - `assist` - Smart defaults, auto-intent creation, gentle prompts. Recommended for most users.
  - `enforce` - Full control, intent-gated saves, L3 approvals. For compliance workflows.
- **Set Governance Mode Command** - `FailSafe: Set Governance Mode` to quickly switch between modes.
- **Auto-Intent Creation** - In Assist mode, FailSafe automatically creates intents when missing.
- **Default Governance Mode** - New installations default to `observe` mode for zero-friction onboarding.
- **EnforcementEngine** - Now respects governance mode setting for all enforcement decisions.

---

## [3.5.6] - 2026-02-12

### Changed

- Release metadata/version bump to 3.5.6 to start the Command Center UI overhaul sprint.

---

## [3.5.2] - 2026-02-11

### Fixed

- Marketplace/registry screenshot rendering fixed by moving sidebar image references to packaged extension media paths.

### Changed

- Release metadata/version bump to 3.5.2 across extension and distribution manifests.

---

## [3.5.1] - 2026-02-11

### Added

- Sidebar UI streamlining finalized (`Open Hub`, `Editor`, `Reload` shell controls + compact card alignment pass).
- `All Installed` skills lane added to Operations Hub skills surface to prevent phase-only visibility loss.
- Release screenshot artifact for streamlined sidebar UI added at `FailSafe/docs/images/sidebar-ui-3.5.1.png`.

### Changed

- First-party proprietary skill naming normalized to `qore-*` convention across FailSafe skill roots.
- Tauri skill packs adopted into FailSafe-owned skill library with `creator: MythologIQ Labs, LLC`.
- Skill discovery root resolution hardened to avoid false empty-catalog conditions.
- Documentation surfaces (root, extension, VSCode/OpenVSX package READMEs) updated to reflect 3.5.1 behavior and current commands.

---

## [3.0.1] - 2026-02-06

### Added

- **Release Discipline Enforcement** - New `/qor-repo-release` workflow artifact.
- **Sentinel Sidebar Monitoring** - Complete `SentinelViewProvider` and `SentinelTemplate`.
- **Structural Decomposition** - Decomposed `main.ts` into specialized bootstrap modules forSection 4 Simplicity.

### Fixed

- **Sentinel UI Hang** - Resolved perpetual loading by registering missing webview provider.
- **Type Solidification** - Hardened `FailSafeEventType` and `PlanningHubPanel` model mappings.

### Changed

- **KISS Refactor** - Flattened `DashboardPanel` constructor and templates to eliminate bloat.
- **Environment Parity** - Sync 3.0.1 graduation across VSCode, Claude, and Antigravity.

---

## [2.0.1] - 2026-02-05

### Added

- Webview template modules for Cortex Stream, Dojo, Dashboard, and Living Graph (Razor compliance).
- Shared tooltip helper with data-tooltip rendering across Genesis views.

### Fixed

- Cortex Stream search overlay text removed to eliminate redundant labels.
- Tooltips now display for advanced governance terminology and calculated metrics.

### Changed

- Documentation refreshed for the 2.0.1 release.

---

## [2.0.0] - 2026-02-05

### Added

- **Gold Standard Repository Skills**
  - `/qor-repo-audit` - Gap analysis against Gold Standard checklist
  - `/qor-repo-scaffold` - Generate missing community files (CODE_OF_CONDUCT, CONTRIBUTING, SECURITY, GOVERNANCE)
  - `/qor-repo-release` - Release discipline enforcement
- **Ambient Integration** - Repository governance hooks in existing commands
  - `/qor-bootstrap` Step 2.5: Repository readiness check
  - `/qor-plan` Step 4.5: Plan branch creation
  - `/qor-audit` Pass 7 + Step 5.5: Repo governance audit
  - `/qor-implement` Step 12.5: Implementation staging
  - `/qor-substantiate` Step 9.5: Final staging & merge
- **GitHub API Integration** - `github-api-helpers.md` reference for gh CLI patterns
- **Template Library** - 9 templates in `docs/conceptual-theory/templates/repo-gold-standard/`
- **Self-Application** - FailSafe now has Gold Standard community files at root
- **Multi-Environment Sync** - v2.0.0 skills synced to Claude, Antigravity, VSCode
- **Specialized Agents**
  - `ql-technical-writer` - Documentation quality specialist
  - `ql-ux-evaluator` - UI/UX testing with optional Playwright

---

## [1.3.0] - 2026-02-05

### Added

- **Plan Navigation** - DojoViewProvider now links to Roadmap view
- **Governance Integration** - GovernanceRouter plan events at lines 91-107
- **PlanManager Wiring** - Complete integration in main.ts

---

## [1.2.2] - 2026-02-05

### Fixed

- **D1**: Verified `calculateComplexity` exists (ArchitectureEngine lines 120-142)
- **D2**: Added `architecture.contributors` and `architecture.maxComplexity` config properties
- **D3**: Removed orphan `tsconfig.json` from workspace root

---

## [1.2.1] - 2026-02-05

### Added

- **BACKLOG.md Integration** - Unified source of truth for blockers, backlog, and wishlist
- **7 Command Integrations**:
  - `/qor-status` - Step 2.5 backlog check, Outstanding Items output
  - `/qor-bootstrap` - Step 6.5 BACKLOG.md creation
  - `/qor-audit` - Step 5.5 blocker registration on VETO
  - `/qor-implement` - Step 10.5 mark blockers complete
  - `/qor-substantiate` - Step 3.5 blocker verification
  - `/qor-plan` - Step 3.5 register backlog items
  - `/qor-refactor` - Step 5.5 register tech debt

---

## [1.2.0] - 2026-02-05

### Added

- **UI Clarity Enhancements** (Navigator)
  - Improved section and metric spacing
  - 6 info hints with tooltips in DojoViewProvider
  - 6 filter tooltips in CortexStreamProvider
  - Collapsible Quick Start Guide with toggleGuide handler
- **New Shared Components**
  - `shared/styles/common.ts` (74 lines)
  - `shared/components/InfoHint.ts` (66 lines)
  - `shared/content/quickstart.ts` (87 lines)

---

## [1.1.1] - 2026-02-05

### Added

- **VSCode Chat Participant** - `FailSafeChatParticipant.ts` (239 lines)
  - Slash commands for governance queries
  - Trust stage helper method (V1 remediation)
- **Chat Integration** - package.json chat participant registration

---

## [1.1.0] - 2026-02-05

### Added

- **Event-Sourced Plan Management** (Pathfinder)
  - `PlanManager.ts` (218 lines) - Event sourcing with YAML persistence
  - `RoadmapViewProvider.ts` (217 lines) - SVG-based visualization
  - `types.ts`, `events.ts`, `validation.ts` - Plan data model
- **Three View Modes** - Roadmap, Kanban, Timeline
- **30 Test Cases** - Full PlanManager test coverage
- **GovernanceRouter Integration** - `findPhaseForArtifact`, `setPlanManager` methods

---

## [1.0.7] - 2026-02-05

### Fixed

- Excluded test files from extension package to reduce bundle size
- Node.js version compatibility improvements

---

## [1.0.6] - 2026-02-04

### Fixed

- Extension icon path for VS Code Marketplace listing

---

## [1.0.5] - 2026-02-04

### Fixed

- Marketplace listing copy and metadata improvements

---

## [1.0.4] - 2026-02-04

### Fixed

- **Node.js Version Compatibility:** Resolved NODE_MODULE_VERSION mismatch by implementing pre-built binary support for better-sqlite3. The extension now works reliably across different Node.js versions.

### Added

- **Node Version Pinning:** Added `.nvmrc` configuration (Node 20.18.1) to ensure consistent build environments.
- **Binary Configuration:** Implemented pre-built binary downloads for native dependencies, eliminating version mismatches during installation.

---

## [1.0.0] - 2026-01-22

### Added

**Phase 4: Genesis UI & Feedback Loop**

- Implemented **The Dojo** sidebar with interactive workflow tracking
- Enhanced **Living Graph** with D3.js force-directed visualization, risk-grading, and trust-scaling
- Refined **Cortex Stream** with real-time filtering, search, and UX-centric keyboard shortcuts
- Implemented **FeedbackManager** with JSON-backed community feedback persistence and export support

**Phase 3: Governance & Trust**

- Migrated **TrustEngine** from in-memory to SQLite persistence via LedgerManager
- Implemented **Shadow Genome** protocol for archival and learning from agent failures

**Phase 2: Sentinel Enforcement**

- Implemented **Heuristic Pattern Library** for active monitoring
- Added **ExistenceEngine** for structural claim verification
- Implemented **ArchitectureEngine** for Macro-KISS enforcement (Polyglot/Bloat detection)

---

## [0.2.0] - 2026-01-22

### Added

- **Ledger Hardening:** Implemented full cryptographic verification for hash chain
- **Secure Storage:** Migrated HMAC signing keys to VS Code SecretStorage
- **Atomic Config:** Implemented atomic writes for configuration files

### Fixed

- **Database Locks:** Fixed issue where SQLite database remained locked after extension reload
- **Genesis Block:** Replaced placeholder genesis hash/signature with computed values

---

## [0.1.0] - 2026-01-22

### Added

- Initial project scaffold
- Basic SQLite Ledger implementation

---

_For the full roadmap, see [ROADMAP.md](ROADMAP.md)._
