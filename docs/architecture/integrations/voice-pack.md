# Voice Pack integration contract

Contract id: `voice-pack` (registry row `integration-contract-voice-pack`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is a recommendation for the owner, not a decision.

Legacy review: none; no review in `docs/research/integrations/` covers the Voice Pack.

**Owned files:**
- `FailSafe/extension/src/voice-pack/`
- `FailSafe/extension/src/extension/bootstrapVoicePack.ts`
- `FailSafe/extension/src/roadmap/routes/VoicePackRoute.ts`

Not owned here: the install and uninstall commands are registered in the shared `FailSafe/extension/src/extension/bootstrapServers.ts`. The Settings card `FailSafe/extension/src/roadmap/ui/modules/voice-pack-settings-card.js` is covered by the same-origin browser prefix row.

## Customer job

A user of the Console's voice features wants higher-quality local speech recognition and synthesis than the browser provides, installed on request and verified, without the base extension carrying large model files.

## Measurable value

Metric: base VSIX size saved by shipping the speech binaries as a separate download, and the share of installs whose files all match the manifest hashes; every completed install has verified every listed file `FailSafe/extension/src/voice-pack/install-handler.ts:166-178` (`extracted file sha256 mismatch for`).
Baseline: no install count or size figure is recorded in the code, so both are unverified.

## Why not simply ask an agent

An agent can download a file, but it would not pin the pack to the extension version, check the checksum and every manifest hash, refuse a redirect to another host, and swap the directory atomically so a failed install leaves the old pack intact.

## API documentation

none: `docs/integrations/INTEGRATION_DOCS_INDEX.md` has no Voice Pack row; the download uses the GitHub Releases asset URL built in code `FailSafe/extension/src/voice-pack/install-handler.ts:26-31` (`export function resolveVoicePackUrl(version: string): string {`).

## Privileges and scopes

No credential is used; the download is an anonymous HTTPS GET `FailSafe/extension/src/voice-pack/install-handler.ts:96` (`const res = await fetch(url, { redirect: 'follow' });`).
The final response host must be `github.com`, `objects.githubusercontent.com` or `codeload.github.com` `FailSafe/extension/src/voice-pack/types.ts:49-53` (`export const ALLOWED_REDIRECT_HOSTS: readonly string[] = [`).
The pack is extracted by spawning `tar` without a shell `FailSafe/extension/src/voice-pack/install-handler.ts:146-149` (`const child = spawn('tar', ['-xzf', path.basename(tarballPath), '-C', destDir], {`).
Files are written only under the extension's global storage directory `FailSafe/extension/src/voice-pack/install-handler.ts:68` (`const finalDir = path.join(globalStoragePath, 'voice-pack');`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| pack-install | verified-shipped | `installVoicePack` `FailSafe/extension/src/voice-pack/install-handler.ts:39` (`export async function installVoicePack(opts: InstallVoicePackOptions)`) | `FailSafe/extension/src/extension/bootstrapServers.ts:353` (`registerCommand("failsafe.installVoicePack"`) | `FailSafe/extension/src/test/extension/voice-pack-install.test.ts` (unit) | The test stubs fetch; no live download `FailSafe/extension/src/test/extension/voice-pack-install.test.ts:6` (`installFetchStub`) |
| pack-uninstall | verified-shipped | `uninstallVoicePack` `FailSafe/extension/src/voice-pack/install-handler.ts:81` (`export function uninstallVoicePack(globalStoragePath: string): void {`) | `FailSafe/extension/src/extension/bootstrapServers.ts:377` (`registerCommand("failsafe.uninstallVoicePack"`) | `FailSafe/extension/src/test/extension/voice-pack-install-guards.test.ts` (unit) | - |
| install-state-probe | verified-shipped | `probeVoicePackState` `FailSafe/extension/src/voice-pack/voice-pack-detector.ts:30` (`export async function probeVoicePackState(`) | `FailSafe/extension/src/extension/bootstrapVoicePack.ts:48` (`await probeVoicePackState(globalStoragePath, requiredMinVersion)`) | `FailSafe/extension/src/test/voice-pack/voice-pack-detector.test.ts` (unit) | - |
| activation-wiring | verified-shipped | `wireVoicePack` `FailSafe/extension/src/extension/bootstrapVoicePack.ts:20` (`export async function wireVoicePack(`) | `FailSafe/extension/src/extension/bootstrapServers.ts:240` (`await wireVoicePack(context, consoleServer, extensionVersion);`) | `FailSafe/extension/src/test/extension/voice-pack-activation.test.ts` (unit) | Never downloads at activation `FailSafe/extension/src/extension/bootstrapVoicePack.ts:9` (`never downloads at activation`) |
| console-install-routes | shipped-unverified | `setupVoicePackRoutes` `FailSafe/extension/src/roadmap/routes/VoicePackRoute.ts:25` (`export function setupVoicePackRoutes(`) | `FailSafe/extension/src/extension/bootstrapServers.ts:339` (`setupVoicePackRoutes(consoleServer.getExpressApp(), {`) | none | No CI test file contains the route function; the Playwright spec reaches it through a harness and stubs the install POST `FailSafe/extension/src/test/ui/voice-pack.spec.ts:3-4` (`Stubs the actual install/uninstall POSTs via page.route()`) |

## Inbound fields

From GitHub Releases: the pack tarball and its `.sha256` file for the extension's own version `FailSafe/extension/src/voice-pack/install-handler.ts:41-42` (`const checksumUrl = resolveVoicePackChecksumUrl(version);`).
From the extracted pack: `voice-pack.manifest.json` with `version`, `expectedFiles` and per-file `sha256` `FailSafe/extension/src/voice-pack/install-handler.ts:160-171` (`const expected = manifest.sha256[rel];`).

## Outbound fields and egress

Repository content: no `FailSafe/extension/src/voice-pack/install-handler.ts:95-96` (`async function downloadToFile(url: string, destPath: string): Promise<void> {`).
Metadata: yes, two GETs that carry the extension version in the URL, gated by an operator click or command `FailSafe/extension/src/voice-pack/install-handler.ts:30` (`-voice/${PACK_FILENAME(version)}`).
Graph relationships: no `FailSafe/extension/src/voice-pack/install-handler.ts:71` (`return { ok: true, version: manifest.version, finalPath: finalDir };`).
Governance evidence: no `FailSafe/extension/src/voice-pack/install-handler.ts:88-92` (`opts.output.appendLine(`).
Destination: the release base names the old organization slug `FailSafe/extension/src/voice-pack/install-handler.ts:23` (`const RELEASE_BASE = 'https://github.com/MythologIQ/FailSafe/releases/download';`), while the repository's current slug is `MythologIQ-Labs-LLC` `docs/wiki/Changelog-and-Releases.md:3` (`https://github.com/MythologIQ-Labs-LLC/FailSafe/blob/main/CHANGELOG.md`); whether GitHub still redirects the old slug was not tested (unverified).

## Transformations

The extension version selects the release tag `v<version>-voice` and asset name `FailSafe/extension/src/voice-pack/install-handler.ts:22-30` (`failsafe-voice-pack-${version}.tar.gz`).
The tarball's SHA-256 is compared with the published checksum before extraction `FailSafe/extension/src/voice-pack/install-handler.ts:53-57` (`sha256 mismatch: expected`).
The new pack replaces the old one by rename on the same file system `FailSafe/extension/src/voice-pack/install-handler.ts:183-198` (`fs.renameSync(newDir, finalDir);`).

## Persisted artifacts

The pack directory `<globalStorage>/voice-pack/` with its manifest and binaries `FailSafe/extension/src/voice-pack/install-handler.ts:68-69` (`atomicSwap(stagingDir, finalDir, stagingTarball);`).
A temporary staging directory, removed on success and on failure `FailSafe/extension/src/voice-pack/install-handler.ts:72-73` (`cleanup(stagingDir);`).
Nothing is written to the workspace `FailSafe/extension/src/voice-pack/install-handler.ts:44` (`fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-voice-pack-staging-'))`).

## Graph links

Implemented: none `FailSafe/extension/src/voice-pack/install-handler.ts:71` (`finalPath: finalDir`).
Proposed: none; the pack holds no governance data (unverified: no proposal exists).

## Customer UI and actions

Command palette: "FailSafe: Install Voice Pack" and "FailSafe: Uninstall Voice Pack" `FailSafe/extension/package.json:227-232` (`"title": "FailSafe: Install Voice Pack"`).
Console Settings card with Install, Update and Uninstall buttons that POST `/api/actions/install-voice-pack` or `uninstall-voice-pack` `FailSafe/extension/src/roadmap/ui/modules/voice-pack-settings-card.js:191` (`/api/actions/${action}`).
Status from `/api/integrations/voice-pack/status` (state, version, missing files, disk use) `FailSafe/extension/src/roadmap/routes/VoicePackRoute.ts:39-47` (`diskUsageBytes,`).
Progress events are broadcast over the Console WebSocket `FailSafe/extension/src/roadmap/routes/VoicePackRoute.ts:62-66` (`"voicePack.install.progress"`).

## Governance policy and enforceability limits

Enforced: a final host outside the allowlist is rejected before any body is written `FailSafe/extension/src/voice-pack/install-handler.ts:100` (`assertGitHubHost(res.url);`).
Enforced: a checksum or manifest-hash mismatch aborts and leaves the old pack in place `FailSafe/extension/src/voice-pack/install-handler.ts:72-76` (`throw err;`).
Enforced: the Console routes refuse non-loopback callers `FailSafe/extension/src/extension/bootstrapServers.ts:340-344` (`Forbidden: local access only`).
Limit: the checksum comes from the same release as the tarball, so it detects corruption, not a replaced release (unverified: no signature check exists in `install-handler.ts`).
Limit: the Console install route starts the download with no VS Code confirmation `FailSafe/extension/src/roadmap/routes/VoicePackRoute.ts:56-59` (`const report = await installVoicePack({`).

## Failure, offline, stale and permission semantics

Offline or HTTP error: install fails with "download failed: HTTP <status>" and nothing changes `FailSafe/extension/src/voice-pack/install-handler.ts:97-99` (`download failed: HTTP`).
A pack older than the extension is reported stale and is not mounted `FailSafe/extension/src/extension/bootstrapVoicePack.ts:49-58` (`Only set the path when fully installed.`).
A missing or hash-mismatched file reports corrupt with the missing files `FailSafe/extension/src/voice-pack/voice-pack-detector.ts:25-27` (`{ state: 'corrupt', missingFiles }`).
No global storage: the command reports an error `FailSafe/extension/src/extension/bootstrapServers.ts:355` (`Voice Pack: globalStorage unavailable.`).
No CI workflow was found that publishes the `-voice` release asset, so availability for a given version is unverified.

## End-to-end scenario and measurable acceptance

Scenario: open Console Settings, click Install, watch download, verify, extract and manifest-verify progress, and see the card report installed with the extension's version `FailSafe/extension/src/voice-pack/install-handler.ts:48-66` (`emit(opts, { phase: 'manifest-verify', status: 'success' });`).
Metric: a checksum mismatch or an extract failure leaves the prior pack unchanged (threshold: zero changed files) `FailSafe/extension/src/test/extension/voice-pack-install.test.ts:24-37` (`SHA256 mismatch aborts before extract`); the redirect-host bound is held by `FailSafe/extension/src/test/extension/voice-pack-install-guards.test.ts:20` (`retaining a bounded final host`).
Existing tests: unit tests with a stubbed fetch, plus `FailSafe/extension/src/test/ui/voice-pack.spec.ts:1` (`Phase 6 of plan-qor-voice-substrate-extraction`) (playwright-stubbed).
Installed-extension test: none downloads a real pack (unverified).

## Recommended disposition

Recommendation for the owner: **MAINTAIN**. Install, verify, swap and uninstall are built and tested with stubs; the one confirmed defect is the hard-coded old organization slug, a one-line fix plus the test that pins it.

## Open defects

The release base URL uses the old organization slug [B261] `FailSafe/extension/src/voice-pack/install-handler.ts:23` (`MythologIQ/FailSafe/releases/download`); the guard test pins the same slug `FailSafe/extension/src/test/extension/voice-pack-install-guards.test.ts:36` (`github\.com\/MythologIQ\/FailSafe`).
