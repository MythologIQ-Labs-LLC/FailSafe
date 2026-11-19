# Voice Pack integration contract

Contract id: `voice-pack` (registry row `integration-contract-voice-pack`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

Legacy review: none; no review in `docs/research/integrations/` covers the Voice Pack.

**Owned files:**
- `FailSafe/extension/src/voice-pack/`
- `FailSafe/extension/src/extension/bootstrapVoicePack.ts`
- `FailSafe/extension/src/roadmap/routes/VoicePackRoute.ts`

Not owned here: the install and uninstall commands are registered in the shared `FailSafe/extension/src/extension/bootstrapServers.ts`. The Settings card `FailSafe/extension/src/roadmap/ui/modules/voice-pack-settings-card.js` is covered by the same-origin browser prefix row.

## Customer job

A user of the Console's voice features wants higher-quality local speech recognition and synthesis than the browser provides, installed on request and verified, without the base extension carrying large model files.

## Measurable value

Metric: base VSIX size saved by shipping speech binaries as a separate download, and the share of installs passing all six pinned browser-asset hashes. This v6.1.0 candidate validates a strict seven-file archive and six SHA-256 entries before staging `FailSafe/extension/src/voice-pack/safe-archive.ts:114` (`fail('manifest sha256 mismatch:`). Published v6.0.13 remains unchanged; independent publisher authentication and installed-host acceptance are still open (#710).
Baseline: no install count or size figure is recorded in the code, so both are unverified.

## Why not simply ask an agent

An agent can download a file, but it would not pin the pack to the extension version, check the checksum and every manifest hash, refuse an untrusted redirect, or attempt a recoverable directory replacement. A process crash or failed rollback can still require operator recovery.

## API documentation

none: `docs/integrations/INTEGRATION_DOCS_INDEX.md` has no Voice Pack row; the download uses the GitHub Releases asset URL built in code `FailSafe/extension/src/voice-pack/install-handler.ts:32` (`export function resolveVoicePackUrl(version: string): string {`).

## Privileges and scopes

No credential is used; each download is an anonymous HTTPS GET made one hop at a time in manual redirect mode `FailSafe/extension/src/voice-pack/allowlisted-fetch.ts:77` (`return await fetch(hop, { redirect: 'manual' });`).
Every hop, including the first, must be HTTPS on `github.com`, `objects.githubusercontent.com`, `codeload.github.com` or `release-assets.githubusercontent.com`, with no userinfo and the default port, and is checked before it is requested `FailSafe/extension/src/voice-pack/allowlisted-fetch.ts:103` (`assertAllowedUrl(current, prefix);`) against `FailSafe/extension/src/voice-pack/types.ts:63-68` (`'release-assets.githubusercontent.com',`); at most five redirects are followed `FailSafe/extension/src/voice-pack/types.ts:71` (`export const MAX_VOICE_PACK_REDIRECTS = 5;`).
The v6.1.0 candidate parses bounded gzip/USTAR internally without spawning `tar`, rejects archive links, unexpected paths/types and duplicate entries, and verifies all six hashes before creating payload files `FailSafe/extension/src/voice-pack/safe-archive.ts:126` (`export function extractValidatedVoiceArchive(`). Unsupported PAX/GNU extensions fail closed pending producer cross-platform qualification.
The installer requires a real, absolute storage root and rejects linked or non-directory ancestors before creating missing storage folders `FailSafe/extension/src/voice-pack/install-handler.ts:70` (`function requireVoiceStorageRoot(root: string): string {`). This is a preflight guard, not race-free OS directory-handle containment against a concurrently mutating same-user filesystem.
Installed files are promoted under the extension's global storage directory `FailSafe/extension/src/voice-pack/install-handler.ts:112` (`const finalDir = path.join(storageRoot, 'voice-pack');`); temporary downloads and extraction are staged in the OS temporary directory `FailSafe/extension/src/voice-pack/install-handler.ts:99` (`fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-voice-pack-staging-')`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| pack-install | verified-shipped | `installVoicePack` `FailSafe/extension/src/voice-pack/install-handler.ts:92` (`export async function installVoicePack(opts: InstallVoicePackOptions)`) | `FailSafe/extension/src/extension/bootstrapServers.ts:395` (`registerCommand("failsafe.installVoicePack"`) | `FailSafe/extension/src/test/extension/voice-pack-install.test.ts` (unit) | The tests stub fetch; no live download `FailSafe/extension/src/test/extension/voice-pack-install.test.ts:6` (`installFetchStub`). No `-voice` release is published, so a real install fails with HTTP 404 until one is ([B287]) |
| pack-uninstall | verified-shipped | `uninstallVoicePack` `FailSafe/extension/src/voice-pack/install-handler.ts:130` (`export function uninstallVoicePack(globalStoragePath: string): void {`) | `FailSafe/extension/src/extension/bootstrapServers.ts:419` (`registerCommand("failsafe.uninstallVoicePack"`) | `FailSafe/extension/src/test/extension/voice-pack-install-guards.test.ts` (unit) | - |
| install-state-probe | verified-shipped | `probeVoicePackState` `FailSafe/extension/src/voice-pack/voice-pack-detector.ts:30` (`export async function probeVoicePackState(`) | `FailSafe/extension/src/extension/bootstrapVoicePack.ts:48` (`await probeVoicePackState(globalStoragePath, requiredMinVersion)`) | `FailSafe/extension/src/test/voice-pack/voice-pack-detector.test.ts` (unit) | - |
| activation-wiring | verified-shipped | `wireVoicePack` `FailSafe/extension/src/extension/bootstrapVoicePack.ts:20` (`export async function wireVoicePack(`) | `FailSafe/extension/src/extension/bootstrapServers.ts:256` (`await wireVoicePack(context, consoleServer, extensionVersion);`) | `FailSafe/extension/src/test/extension/voice-pack-activation.test.ts` (unit) | Never downloads at activation `FailSafe/extension/src/extension/bootstrapVoicePack.ts:9` (`never downloads at activation`) |
| console-install-routes | shipped-unverified | `setupVoicePackRoutes` `FailSafe/extension/src/roadmap/routes/VoicePackRoute.ts:25` (`export function setupVoicePackRoutes(`) | `FailSafe/extension/src/extension/bootstrapServers.ts:381` (`setupVoicePackRoutes(consoleServer.getExpressApp(), {`) | none | No CI test file contains the route function; the Playwright spec reaches it through a harness and stubs the install POST `FailSafe/extension/src/test/ui/voice-pack.spec.ts:3-4` (`Stubs the actual install/uninstall POSTs via page.route()`) |

## Inbound fields

From GitHub Releases: the pack tarball and its `.sha256` file for the extension's own version `FailSafe/extension/src/voice-pack/install-handler.ts:95` (`const checksumUrl = resolveVoicePackChecksumUrl(version);`).
From the bounded in-memory archive: `voice-pack.manifest.json` with the exact requested `version`, six `expectedFiles`, and each SHA-256 `FailSafe/extension/src/voice-pack/safe-archive.ts:111` (`const hash = m.sha256[name];`).

## Outbound fields and egress

Repository content: no `FailSafe/extension/src/voice-pack/install-handler.ts:158` (`async function downloadToFile(url: string, destPath: string): Promise<VoicePackDownloadProvenance> {`).
Metadata: yes, two downloads that carry the extension version in the URL, each up to six requests, gated by an operator click or command `FailSafe/extension/src/voice-pack/install-handler.ts:36` (`-voice/${PACK_FILENAME(version)}`).
Graph relationships: no `FailSafe/extension/src/voice-pack/install-handler.ts:118` (`return { ok: true, version: manifest.version, finalPath: finalDir, provenance:`).
Governance evidence: no; the install report and the output log record provenance (requested URL, final URL as origin plus path, sha256), not a ledger entry `FailSafe/extension/src/voice-pack/install-handler.ts:155` (`[voice-pack] provenance ${what}`).
Destination: GitHub Releases of `MythologIQ-Labs-LLC/FailSafe` `FailSafe/extension/src/voice-pack/install-handler.ts:29` (`const RELEASE_BASE = 'https://github.com/MythologIQ-Labs-LLC/FailSafe/releases/download';`); GitHub answers a release asset with a 302 to `release-assets.githubusercontent.com` (observed with curl on 2026-10-18, not tested against the live service), which the allowlist accepts.

## Transformations

The extension version selects the release tag `v<version>-voice` and asset name `FailSafe/extension/src/voice-pack/install-handler.ts:28` (`failsafe-voice-pack-${version}.tar.gz`).
The tarball's SHA-256 is compared with the published checksum before extraction `FailSafe/extension/src/voice-pack/install-handler.ts:57` (`sha256 mismatch: expected`).
A redirect's `Location` is resolved against the current hop, and the final URL is kept as origin plus path only `FailSafe/extension/src/voice-pack/allowlisted-fetch.ts:108` (`finalUrl: originAndPath(current)`).
The installer stages a replacement and uses a recoverable rename transaction; an interrupted process is not a fully atomic multi-directory commit `FailSafe/extension/src/voice-pack/transactional-swap.ts:128` (`io.renameSync(prepared, final);`).

## Persisted artifacts

The pack directory `<globalStorage>/voice-pack/` with its manifest and binaries `FailSafe/extension/src/voice-pack/install-handler.ts:113` (`const swap = atomicSwapVoicePack(stagingDir, finalDir, stagingTarball);`).
A temporary staging directory is removed after successful promotion on a best-effort basis, with a visible cleanup warning on failure `FailSafe/extension/src/voice-pack/transactional-swap.ts:151` (`io.rmSync(staging, { recursive: true, force: true });`). An unsuccessful install attempts cleanup without masking its original error `FailSafe/extension/src/voice-pack/transactional-swap.ts:198` (`io.rmSync(stagingDir, { recursive: true, force: true });`).
Nothing is written to the workspace `FailSafe/extension/src/voice-pack/install-handler.ts:99` (`fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-voice-pack-staging-'))`).

## Graph links

Implemented: none `FailSafe/extension/src/voice-pack/install-handler.ts:118` (`finalPath: finalDir`).
Proposed: none; the pack holds no governance data (unverified: no proposal exists).

## Customer UI and actions

Command palette: "FailSafe: Install Voice Pack" and "FailSafe: Uninstall Voice Pack" `FailSafe/extension/package.json:247-252` (`"title": "FailSafe: Install Voice Pack"`).
Console Settings card with Install, Update and Uninstall buttons that POST `/api/actions/install-voice-pack` or `uninstall-voice-pack` `FailSafe/extension/src/roadmap/ui/modules/voice-pack-settings-card.js:191` (`/api/actions/${action}`).
Status from `/api/integrations/voice-pack/status` (state, version, missing files, disk use) `FailSafe/extension/src/roadmap/routes/VoicePackRoute.ts:39-47` (`diskUsageBytes,`).
Progress events are broadcast over the Console WebSocket `FailSafe/extension/src/roadmap/routes/VoicePackRoute.ts:62-66` (`"voicePack.install.progress"`).

## Governance policy and enforceability limits

Enforced: a hop that is not HTTPS, not on an allowlisted host, carries userinfo or names a port is refused before it is requested `FailSafe/extension/src/voice-pack/allowlisted-fetch.ts:45-56` (`redirect target rejected: host ${u.hostname} not in allowlist`).
Enforced: a response the fetch redirected by itself (`redirected`, or a response URL that is empty or differs from the requested hop) or an opaque redirect is refused before its body is read, so a fetch that ignores manual mode cannot deliver a body from another host `FailSafe/extension/src/voice-pack/allowlisted-fetch.ts:60-72` (`the fetch followed a redirect itself`).
Enforced: error text names only the requested URL's origin and path or a refused hop's host, so a signed asset query never reaches an error, a progress event or the log `FailSafe/extension/src/voice-pack/allowlisted-fetch.ts:107` (`HTTP ${res.status} for ${originAndPath(url)}`).
Enforced: a checksum or manifest-hash mismatch aborts before replacement, and the original failure is propagated `FailSafe/extension/src/voice-pack/install-handler.ts:125` (`throw failure;`). If promotion fails, the old pack is restored where possible; a failed rollback retains its backup for recovery `FailSafe/extension/src/voice-pack/transactional-swap.ts:135` (`Prior installation is preserved at`).
Enforced: the Console routes refuse non-loopback callers `FailSafe/extension/src/extension/bootstrapServers.ts:379-383` (`Forbidden: local access only`).
Limit: the checksum comes from the same release as the tarball, so it detects a damaged download, not a replaced release; no hash is pinned in the extension and no signature is checked ([B287]) `FailSafe/extension/src/voice-pack/install-handler.ts:40` (`function resolveVoicePackChecksumUrl(version: string): string {`).
Limit: a fetch that ignores manual mode has already requested every hop it followed by the time the response is refused; the guard keeps its body out, not the request `FailSafe/extension/src/voice-pack/allowlisted-fetch.ts:60` (`function assertNotFollowed(res: Response, hop: string, prefix: string): void {`).
Limit: the Console install route starts the download with no VS Code confirmation `FailSafe/extension/src/roadmap/routes/VoicePackRoute.ts:56-59` (`const report = await installVoicePack({`).

## Failure, offline, stale and permission semantics

Offline or HTTP error: install fails with "download failed: HTTP <status> for <URL>" ("checksum fetch failed: ..." for the checksum) and nothing changes `FailSafe/extension/src/voice-pack/allowlisted-fetch.ts:107` (`HTTP ${res.status} for`).
A pack older than the extension is reported stale and is not mounted `FailSafe/extension/src/extension/bootstrapVoicePack.ts:49-58` (`Only set the path when fully installed.`).
A missing or hash-mismatched file reports corrupt with the missing files `FailSafe/extension/src/voice-pack/voice-pack-detector.ts:25-27` (`{ state: 'corrupt', missingFiles }`).
No global storage: the command reports an error `FailSafe/extension/src/extension/bootstrapServers.ts:397` (`Voice Pack: globalStorage unavailable.`).
No `v*-voice` release exists (`gh release list`, 2026-10-18) and no workflow publishes one, so today every install fails with HTTP 404 ([B287]) (unverified in code: observed with `gh release list` on 2026-10-18).

## End-to-end scenario and measurable acceptance

Scenario: open Console Settings, click Install, watch download, verify, extract and manifest-verify progress, and see the card report installed with the extension's version `FailSafe/extension/src/voice-pack/install-handler.ts:110` (`emit(opts, { phase: 'manifest-verify', status: 'success' });`).
Metric: a checksum mismatch or an extract failure leaves the prior pack unchanged (threshold: zero changed files) `FailSafe/extension/src/test/extension/voice-pack-install.test.ts:24-37` (`SHA256 mismatch aborts before extract`); the redirect rule is held by `FailSafe/extension/src/test/extension/voice-pack-install-redirects.test.ts:95` (`V3 an off-allowlist intermediate hop is refused before it is requested`) and `FailSafe/extension/src/test/extension/voice-pack-install-redirects.test.ts:166` (`V9 a fetch that follows redirects itself despite manual mode is refused`).
Existing tests: unit tests with a stubbed fetch but genuine gzip/USTAR fixture bytes, plus `FailSafe/extension/src/test/ui/voice-pack.spec.ts:1` (`Phase 6 of plan-qor-voice-substrate-extraction`) (playwright-stubbed).
Installed-extension test: none downloads a real pack (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **MAINTAIN**. Install, verify, swap and uninstall are built and tested with stubs, and the download now follows GitHub's current redirects under a per-hop allowlist; what remains is publishing a release ([B287]).

## Open defects

No Voice Pack release is published and no workflow publishes one, so Install fails with HTTP 404 [B287] `FailSafe/extension/src/voice-pack/install-handler.ts:29` (`MythologIQ-Labs-LLC/FailSafe/releases/download`).

## Build-time dependency boundary — v6.1.0 candidate (#707)

The 6.0.13 source originally carried `piper-tts-web` and `@xenova/transformers` in the **core root** `devDependencies`. This made ordinary `npm ci` attempt a native `onnxruntime-node@1.20.1` CUDA download via Piper, even though the shipped voice experience uses browser JS/WASM and the base VSIX excludes the separately downloaded voice pack. FailSafe governance is not a general-purpose inference runtime.

Draft #712 proposes removing those root devDependencies and their unreferenced lock graph, preserving already committed browser assets, and supplying an explicit version/integrity-pinned `vendor:voice` workflow which obtains only the two npm tarballs and never installs their transitive native dependencies. `vendor:piper` stays as a pinned Piper-only compatibility entrypoint; `bundle.cjs` fails if required committed assets are absent. The vendor files document exact sources, filenames, and operator actions.

**This is a candidate, not a shipped or qualified property.** The exact-head clean `npm ci`, cross-platform build/VSIX, voice browser execution, release package integrity and native governance must pass before these claims become a release guarantee. The archive extraction/installer security issues in #710 remain independent of this build-time separation.
