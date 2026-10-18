# Sentinel LLM integration contract

Contract id: `sentinel-llm` (registry row `integration-contract-sentinel-llm`). Recorded against main `c36b9ee2`; the destination policy, the operator approval and the guarded transport were added on main after v6.0.8 (#538, B273) and are not released. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is the owner's work-queue decision of 2026-10-18 (#538); COMPLETE means finish the named gaps, not that the integration is complete.

There is no legacy contract review for this integration. By the plan it also covers the Console's Ollama reachability probe in `FailSafe/extension/src/roadmap/ui/modules/connection.js`, which the portfolio reconciles as `folded into sentinel-llm`; that browser module is not owned here.

**Owned files:**
- `FailSafe/extension/src/sentinel/utils/LLMClient.ts`
- `FailSafe/extension/src/sentinel/utils/llmDestinationPolicy.ts`
- `FailSafe/extension/src/sentinel/utils/llmTransport.ts`
- `FailSafe/extension/src/sentinel/utils/llmEgressAuthorizer.ts`

Related callers (cited, not owned): `FailSafe/extension/src/sentinel/VerdictArbiter.ts`, `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts` (Brainstorm), `FailSafe/extension/src/roadmap/ui/modules/connection.js` (Console probe), `FailSafe/extension/src/extension/llmEgressWiring.ts` (the shared authorizer and the forget command), `FailSafe/extension/src/shared/net/addressPolicy.ts` (address classes, shared with github-checks).

## Customer job

A developer who runs a local model (Ollama by default) wants Sentinel to ask it for a second opinion on a flagged file, and wants Brainstorm to structure a voice transcript, without sending code to a hosted service.

## Measurable value

Metric: the share of Sentinel verdicts that include an LLM evaluation when an LLM mode is selected; in the default heuristic mode the share is zero by design `FailSafe/extension/src/sentinel/VerdictArbiter.ts:223-224` (`if (this.currentMode === 'heuristic') {`).
Baseline: no verdict-quality comparison between heuristic and LLM-assisted modes exists (unverified).

## Why not simply ask an agent

An agent reviews what it is shown; Sentinel decides, per file event, whether to escalate to the model and records the model's answer next to the heuristic result. The value is the automatic escalation and the record, not the model call itself.

## API documentation

none: no entry in `docs/integrations/INTEGRATION_DOCS_INDEX.md` (unverified beyond a search of that file for Ollama).
The client speaks the Ollama HTTP API: `GET /api/tags` for availability and `POST /api/generate` for a prompt `FailSafe/extension/src/sentinel/utils/LLMClient.ts:56` (`path: '/api/tags'`) and `FailSafe/extension/src/sentinel/utils/LLMClient.ts:130` (`path: '/api/generate'`).

## Privileges and scopes

Credential: none; requests carry only a content type `FailSafe/extension/src/sentinel/utils/llmTransport.ts:56-58` (`'Content-Type': 'application/json'`).
Endpoint: `failsafe.sentinel.ollamaEndpoint`, default `localhost:11434` over http, machine scope (read from user settings) `FailSafe/extension/package.json:645-648` (`"failsafe.sentinel.ollamaEndpoint": {`).
Because the setting is machine scope, VS Code ignores a value in workspace settings (a compatibility break on main); a per-workspace override goes in `.failsafe/config/sentinel.yaml` and may name only an endpoint on this machine. ConfigManager still labels a workspace value as `workspace-setting`, as defence in depth `FailSafe/extension/src/sentinel/utils/llmDestinationPolicy.ts:88-89` (`source: 'workspace-setting'`).
A workspace file `.failsafe/config/sentinel.yaml` still overrides the endpoint and the mode, and ConfigManager records where the endpoint came from `FailSafe/extension/src/shared/ConfigManager.ts:51` (`resolveSentinelEndpoint(sentinelYaml?.sentinel?.ollamaEndpoint`).
Main only, not in v6.0.8: a workspace file or workspace setting may name only a host on this machine (`localhost`, 127.0.0.0/8, `::1`); any other host is allowed only from the user setting `FailSafe/extension/src/sentinel/utils/llmDestinationPolicy.ts:67` (`if (source !== 'user-setting')`).
Main only: such a host is contacted only after the operator approves that exact origin (scheme, host and port) for that operation in a modal VS Code dialog `FailSafe/extension/src/sentinel/utils/llmEgressAuthorizer.ts:100` (`await window.showWarningMessage(dialog.title, { modal: true, detail: dialog.detail }`).
VS Code reports remote-machine settings and Dev Container settings as user values, so a repository's dev container can set a user-scope endpoint; it still needs the approval, and the dialog says the value comes from user or remote-machine settings `FailSafe/extension/src/sentinel/utils/llmEgressAuthorizer.ts:65` (`user or remote-machine settings`).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| destination-policy | main-unreleased | `decideLlmDestination` `FailSafe/extension/src/sentinel/utils/llmDestinationPolicy.ts:59` (`export function decideLlmDestination(`) | `FailSafe/extension/src/sentinel/utils/LLMClient.ts:176` (`decideLlmDestination(config.sentinel.ollamaEndpoint`) | `FailSafe/extension/src/test/sentinel/utils/llmDestinationPolicy.test.ts` (unit) | Re-read on every probe and generate call; replaces the v6.0.8 `isValidEndpoint` check, which admitted any public host. Main only, not in v6.0.8 |
| address-guard | main-unreleased | `createLlmHttp` `FailSafe/extension/src/sentinel/utils/llmTransport.ts:33` (`export function createLlmHttp(resolve?: ResolveFn): LlmHttpFn {`) | `FailSafe/extension/src/sentinel/utils/LLMClient.ts:42` (`this.http = options.http ?? createLlmHttp();`) | `FailSafe/extension/src/test/sentinel/utils/llmTransport.test.ts` (unit) | Every resolved address is checked before connecting; redirects are not followed; the response is capped and the timeout is one deadline. Main only, not in v6.0.8 |
| hosted-model-consent | main-unreleased | `createLlmEgressAuthorizer` `FailSafe/extension/src/sentinel/utils/llmEgressAuthorizer.ts:84` (`export function createLlmEgressAuthorizer(`) | `FailSafe/extension/src/extension/llmEgressWiring.ts:17` (`createLlmEgressAuthorizer(context.globalState, vscode.window)`) | `FailSafe/extension/src/test/sentinel/utils/llmEgressAuthorizer.test.ts` (unit) | One instance per activation, shared by Sentinel and Brainstorm. Main only, not in v6.0.8 |
| forget-approvals | main-unreleased | `registerForgetLlmApprovalsCommand` `FailSafe/extension/src/extension/llmEgressWiring.ts:24` (`export function registerForgetLlmApprovalsCommand(`) | `FailSafe/extension/src/extension/bootstrapSentinel.ts:37` (`registerForgetLlmApprovalsCommand(context, llmAuthorizer);`) | `FailSafe/extension/src/test/extension/forget-llm-approvals.test.ts` (installed-vscode) | "FailSafe: Forget Sentinel LLM Approvals". Main only, not in v6.0.8 |
| availability-probe | shipped-unverified | `checkAvailability` `FailSafe/extension/src/sentinel/utils/LLMClient.ts:50` (`async checkAvailability(`) | `FailSafe/extension/src/sentinel/SentinelDaemon.ts:73` (`this.status.llmAvailable = await this.arbiter.checkLLMAvailability();`) | none | Runs at every Sentinel start in every mode. Main differs (unreleased): the start probe never asks, and a destination that needs approval is offered in the background in an LLM mode `FailSafe/extension/src/sentinel/VerdictArbiter.ts:65` (`this.llmAvailable = await this.llmClient.checkAvailability(`) |
| file-analysis-prompt | shipped-inert | `callEndpoint` `FailSafe/extension/src/sentinel/utils/LLMClient.ts:121` (`async callEndpoint(prompt: string, timeoutMs = 5000)`) | none | none | Switch: the mode defaults to heuristic `FailSafe/extension/package.json:637` (`"default": "heuristic",`), and heuristic mode never invokes the model `FailSafe/extension/src/sentinel/VerdictArbiter.ts:223-224` (`if (this.currentMode === 'heuristic') {`) |
| brainstorm-transcript-prompt | shipped-unverified | `createBrainstormService` `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:98` (`export function createBrainstormService(`) | `FailSafe/extension/src/roadmap/ConsoleServer.ts:157` (`createBrainstormService(options.configProvider`) | none | Not gated by the Sentinel mode: in v6.0.8 any reachable valid endpoint gets the transcript. Main differs (unreleased): only a destination the policy allows, after asking `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:112` (`llm.checkAvailability(`) |
| console-ollama-probe | shipped-unverified | `_probeOllama` `FailSafe/extension/src/roadmap/ui/modules/connection.js:336` (`async _probeOllama() {`) | `FailSafe/extension/src/roadmap/ui/command-center.js:32` (`const client = new ConnectionClient();`) | none | Fixed loopback target, no override `FailSafe/extension/src/roadmap/ui/modules/connection.js:345` (`fetch('http://localhost:11434/api/tags'`) |

## Inbound fields

From `/api/tags`: only whether the HTTP status is 2xx `FailSafe/extension/src/sentinel/utils/LLMClient.ts:57` (`const available = response.status >= 200 && response.status < 300;`).
From `/api/generate`: `response` text and `total_duration` `FailSafe/extension/src/sentinel/utils/LLMClient.ts:144-152` (`total_duration?: number;`).
The Console probe reads only whether the response is OK `FailSafe/extension/src/roadmap/ui/modules/connection.js:351-352` (`available = !!(res && res.ok);`).

## Outbound fields and egress

Repository content: yes in LLM modes, the file path, matched heuristic pattern ids and the first 2000 characters of the file `FailSafe/extension/src/sentinel/utils/LLMClient.ts:101-108` (`content?.substring(0, 2000)`).
Gate for file content: the Sentinel mode (heuristic by default), a successful availability check, and on main the destination policy on every call `FailSafe/extension/src/sentinel/VerdictArbiter.ts:205-221` (`private shouldInvokeLLM(heuristicResults: HeuristicResult[]): boolean {`).
Repository content: yes for Brainstorm, the voice transcript, whenever the allowed endpoint answers `/api/tags` `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:103-114` (`const fullPrompt = `).
Brainstorm falls back to a VS Code language model when the endpoint is not available or is refused, which is another provider's egress `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:120-121` (`vscode.lm.selectChatModels()`).
Metadata: the configured model name `FailSafe/extension/src/sentinel/utils/LLMClient.ts:126-133` (`const model = this.configProvider.getConfig().sentinel.localModel;`).
Graph relationships: no `FailSafe/extension/src/sentinel/utils/LLMClient.ts:132-136` (`stream: false`).
Governance evidence: no; the verdict stays local `FailSafe/extension/src/sentinel/VerdictArbiter.ts:250-256` (`promptUsed: prompt,`).
Destination: the configured endpoint, http by default; on main only the target the policy allowed, with every resolved address checked at connect time `FailSafe/extension/src/sentinel/utils/llmTransport.ts:55` (`lookup: guardedLookup(request.addresses, resolve),`); the Console probe always targets localhost:11434 `FailSafe/extension/src/roadmap/ui/modules/connection.js:345` (`http://localhost:11434/api/tags`).

## Transformations

The prompt is a fixed instruction asking for a risk grade, issues and a confidence `FailSafe/extension/src/sentinel/utils/LLMClient.ts:101-114` (`Analyze this code for security vulnerabilities`).
Hybrid mode invokes the model only when a heuristic flag of medium or higher matched `FailSafe/extension/src/sentinel/VerdictArbiter.ts:232-233` (`r.matched && r.severity !== 'low'`).
An unavailable model in llm-assisted mode falls back to heuristic `FailSafe/extension/src/sentinel/VerdictArbiter.ts:69-70` (`if (this.currentMode === 'llm-assisted') {`); on main, an approval given later re-probes and restores the configured mode `FailSafe/extension/src/sentinel/VerdictArbiter.ts:108` (`this.currentMode = configured;`).
Brainstorm strips code fences and keeps the outermost JSON object of the reply `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:104-108` (`const first = c.indexOf("{");`).

## Persisted artifacts

The LLM evaluation, including the prompt used, is attached to the verdict object `FailSafe/extension/src/sentinel/VerdictArbiter.ts:250-256` (`promptUsed: prompt,`); where verdicts are stored is outside this contract (unverified beyond the arbiter).
Main only: approvals are stored per origin and operation in extension global state, never in a workspace file `FailSafe/extension/src/sentinel/utils/llmEgressAuthorizer.ts:107` (`await state.update(LLM_APPROVALS_KEY,`); declines are kept in memory until VS Code restarts `FailSafe/extension/src/sentinel/utils/llmEgressAuthorizer.ts:103` (`declined.add(keyOf(request));`).

## Graph links

Implemented: none `FailSafe/extension/src/sentinel/utils/LLMClient.ts:121` (`async callEndpoint(`).
Proposed (not built): a verdict-to-model-evaluation provenance edge, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Settings: `failsafe.sentinel.mode`, `failsafe.sentinel.localModel` and `failsafe.sentinel.ollamaEndpoint` `FailSafe/extension/package.json:630-648` (`"failsafe.sentinel.mode": {`).
Main only: a modal dialog names the destination origin in full, flags plain http as unencrypted, says what is sent and which model, and offers Allow `FailSafe/extension/src/sentinel/utils/llmEgressAuthorizer.ts:52-58` (`export function llmEgressRequest(request: LlmEgressRequest): OperatorActionRequest {`).
Main only: the command "FailSafe: Forget Sentinel LLM Approvals" clears stored approvals and this session's declines `FailSafe/extension/package.json:227-228` (`"title": "FailSafe: Forget Sentinel LLM Approvals"`).
Console: an LLM status row that shows whether the local Ollama probe answered `FailSafe/extension/src/roadmap/ui/modules/connection.js:359-364` (`this.notify('webLlmStatus', this.webLlmState);`).
The Console's status text says data stays on the machine, which holds only while the endpoint is loopback `FailSafe/extension/src/roadmap/ui/modules/llm-status.js:6` (`your data stays on your machine`).

## Governance policy and enforceability limits

Enforced (main only): a workspace-chosen endpoint that is not on this machine is never contacted, and a user-chosen one only after approval for that origin and operation `FailSafe/extension/src/sentinel/utils/LLMClient.ts:185-188` (`await this.authorizer.authorize(`).
Enforced (main only): `callEndpoint` re-applies the policy and never asks; an endpoint changed after an approval has another origin and no approval `FailSafe/extension/src/sentinel/utils/LLMClient.ts:122-124` (`throw new Error('LLM destination refused');`).
Enforced (main only): a loopback destination must resolve only to loopback addresses, and an approved remote one to none of the private, link-local, loopback, unspecified or translated ranges `FailSafe/extension/src/shared/net/addressPolicy.ts:95` (`export function guardedLookup(`).
Not enforced: with VS Code's proxy support (`http.proxySupport`, default `override`) a resolved proxy may replace the transport's agent, so the address check may not run; the destination policy still applies before any request is built (unverified: the tests cover the direct path only).
Not enforced: a Dev Container or remote-machine setting reads as a user setting; it still needs the approval `FailSafe/extension/src/sentinel/utils/llmDestinationPolicy.ts:84` (`export function resolveSentinelEndpoint(`).
Advisory: the model's answer feeds a confidence value; it does not by itself block a write `FailSafe/extension/src/sentinel/VerdictArbiter.ts:250-256` (`confidence: this.computeConfidence(heuristicResults, result.response),`).

## Failure, offline, stale and permission semantics

Unreachable or refused endpoint: availability is false after a 2-second deadline and Sentinel stays heuristic `FailSafe/extension/src/sentinel/utils/LLMClient.ts:56` (`timeoutMs: 2000`).
A failed or refused generate call is logged and the verdict has no LLM evaluation `FailSafe/extension/src/sentinel/VerdictArbiter.ts:258-260` (`LLM evaluation failed`).
A non-2xx generate status, a redirect included, throws `FailSafe/extension/src/sentinel/utils/LLMClient.ts:140-141` (`LLM endpoint returned`).
Main only: an approved remote whose name resolves to a private, VPN, CGNAT, link-local or loopback address is refused, so a model server on the local network no longer works (owner decision filed as B291); the operator gets one non-modal warning per origin per session that names the origin and the reason and carries no content `FailSafe/extension/src/sentinel/utils/llmEgressAuthorizer.ts:79` (`export function refusedAddressMessage(origin: string): string {`), raised from `FailSafe/extension/src/sentinel/utils/LLMClient.ts:160-165` (`notifyRefusedAddress?.(request.target.origin)`).
Main only: Forget also re-checks availability without asking, so Sentinel stops using a destination whose approval was removed `FailSafe/extension/src/sentinel/VerdictArbiter.ts:47` (`onDidForget?.(`), and an Allow clicked on a dialog opened before Forget is not used `FailSafe/extension/src/sentinel/utils/llmEgressAuthorizer.ts:101` (`if (asked !== generation) return false;`).
Any error in the policy or the authorizer refuses and is logged without the content `FailSafe/extension/src/sentinel/utils/LLMClient.ts:176-178` (`LLM destination refused`).
Stale: availability is checked once at Sentinel start, so a model started later is not used until restart (unverified beyond `checkLLMAvailability` having one caller in `SentinelDaemon.ts`).
The Console probe is re-run at most every 30 seconds and treats every error as not running `FailSafe/extension/src/roadmap/ui/modules/connection.js:337-358` (`reason = 'not-running';`).

## End-to-end scenario and measurable acceptance

Scenario: set the mode to hybrid with Ollama running locally, save a file that trips a medium heuristic, and see a verdict with an LLM evaluation naming the model `FailSafe/extension/src/sentinel/VerdictArbiter.ts:250-256` (`response: result.response,`).
Metric: with the default heuristic mode, zero `/api/generate` requests per saved file (threshold: zero) `FailSafe/extension/src/sentinel/VerdictArbiter.ts:223-224` (`return false;`).
Metric (main only): zero requests to a workspace-chosen non-loopback host, measured by a counting server through a real ConfigManager `FailSafe/extension/src/test/sentinel/ConfigManager.llm-source.test.ts:52` (`C1 a real ConfigManager`).
Existing tests: `FailSafe/extension/src/test/sentinel/utils/LLMClient.egress.test.ts:25` (`#538 LLMClient egress: destination policy (B273)`) (unit, real local servers); `FailSafe/extension/src/test/sentinel/utils/LLMClient.test.ts:7` (`describe('LLMClient', () => {`) (unit, prompt text).
Installed-extension test: the forget command is registered and runs in the extension host `FailSafe/extension/src/test/extension/forget-llm-approvals.test.ts:18` (`R1 the command is registered and runs`); no test drives Sentinel against a model endpoint in the installed extension (unverified).

## Recommended disposition

Owner decision 2026-10-18 (#538), accepting the recommendation: **COMPLETE**. On main the boundary is now enforced: a workspace can no longer point content off the machine, a user-chosen remote model needs an explicit approval per destination and use, and redirects and remapped names are refused. What remains: the Console still says data stays local even after a remote approval, availability is checked only at start, the proxy path is not covered, and an approval can be revoked only all at once.

## Open defects

Filed as B291 (#538): allowing an approved model server on a private or LAN address is an owner decision; it is refused today `FailSafe/extension/src/shared/net/addressPolicy.ts:31` (`export const FORBIDDEN_REMOTE = blockList(`).
Fixed on main, unreleased (#538): B273, a workspace `.failsafe/config/sentinel.yaml` could set the LLM endpoint to any public http host and, in an LLM mode, file content was posted there without a prompt; the endpoint is now labelled by source `FailSafe/extension/src/shared/ConfigManager.ts:63` (`ollamaEndpointSource: endpoint.source,`).
