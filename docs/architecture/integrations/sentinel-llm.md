# Sentinel LLM integration contract

Contract id: `sentinel-llm` (registry row `integration-contract-sentinel-llm`). Recorded against main `c36b9ee2`. Feature states use the five states defined in [the integration portfolio](../INTEGRATION_PORTFOLIO.md); the disposition is a recommendation for the owner, not a decision.

There is no legacy contract review for this integration. By the plan it also covers the Console's Ollama reachability probe in `FailSafe/extension/src/roadmap/ui/modules/connection.js`, which the portfolio reconciles as `folded into sentinel-llm`; that browser module is not owned here.

**Owned files:**
- `FailSafe/extension/src/sentinel/utils/LLMClient.ts`

Related callers (cited, not owned): `FailSafe/extension/src/sentinel/VerdictArbiter.ts`, `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts` (Brainstorm), `FailSafe/extension/src/roadmap/ui/modules/connection.js` (Console probe).

## Customer job

A developer who runs a local model (Ollama by default) wants Sentinel to ask it for a second opinion on a flagged file, and wants Brainstorm to structure a voice transcript, without sending code to a hosted service.

## Measurable value

Metric: the share of Sentinel verdicts that include an LLM evaluation when an LLM mode is selected; in the default heuristic mode the share is zero by design `FailSafe/extension/src/sentinel/VerdictArbiter.ts:179-181` (`if (this.currentMode === 'heuristic') {`).
Baseline: no verdict-quality comparison between heuristic and LLM-assisted modes exists (unverified).

## Why not simply ask an agent

An agent reviews what it is shown; Sentinel decides, per file event, whether to escalate to the model and records the model's answer next to the heuristic result. The value is the automatic escalation and the record, not the model call itself.

## API documentation

none: no entry in `docs/integrations/INTEGRATION_DOCS_INDEX.md` (unverified beyond a search of that file for Ollama).
The client speaks the Ollama HTTP API: `GET /api/tags` for availability and `POST /api/generate` for a prompt `FailSafe/extension/src/sentinel/utils/LLMClient.ts:74` (`await fetch(`) and `FailSafe/extension/src/sentinel/utils/LLMClient.ts:126` (`/api/generate`).

## Privileges and scopes

Credential: none; requests carry no authentication header `FailSafe/extension/src/sentinel/utils/LLMClient.ts:126-128` (`headers: { 'Content-Type': 'application/json' },`).
Endpoint: `failsafe.sentinel.ollamaEndpoint`, default `localhost:11434` over http `FailSafe/extension/package.json:636-638` (`"failsafe.sentinel.ollamaEndpoint": {`).
A workspace file `.failsafe/config/sentinel.yaml` overrides the endpoint and the mode `FailSafe/extension/src/shared/ConfigManager.ts:57-60` (`ollamaEndpoint: sentinelYaml?.sentinel?.ollamaEndpoint ??`).
Validation allows http and https, allows localhost and 127.0.0.1, blocks literal 10/8, 172.16/12, 192.168/16 and 169.254/16 prefixes, and allows every other host, public ones included `FailSafe/extension/src/sentinel/utils/LLMClient.ts:35-53` (`Allow localhost explicitly for local LLM servers`).
Host names are compared as text, so a DNS name resolving to a private address is not blocked `FailSafe/extension/src/sentinel/utils/LLMClient.ts:42-50` (`const hostname = url.hostname.toLowerCase();`).
Pointing the endpoint at a hosted model would send file content off the machine and is marked requires separate approval (unverified: no consent step exists for it).

## Feature state

| Capability | State | Symbol | Reached from | Test (depth) | Notes |
|---|---|---|---|---|---|
| endpoint-validation | verified-shipped | `isValidEndpoint` `FailSafe/extension/src/sentinel/utils/LLMClient.ts:35` (`isValidEndpoint(endpoint: string): boolean {`) | `FailSafe/extension/src/extension/bootstrapSentinel.ts:51` (`const verdictArbiter = new VerdictArbiter(`) | `FailSafe/extension/src/test/sentinel/utils/LLMClient.test.ts` (unit) | Runs on every availability check `FailSafe/extension/src/sentinel/utils/LLMClient.ts:67-71` (`SECURITY: Validate endpoint before making requests`) |
| availability-probe | shipped-unverified | `checkAvailability` `FailSafe/extension/src/sentinel/utils/LLMClient.ts:63` (`async checkAvailability(): Promise<boolean> {`) | `FailSafe/extension/src/sentinel/SentinelDaemon.ts:73` (`this.status.llmAvailable = await this.arbiter.checkLLMAvailability();`) | none | Runs at every Sentinel start in every mode; no test exercises the request |
| file-analysis-prompt | shipped-inert | `callEndpoint` `FailSafe/extension/src/sentinel/utils/LLMClient.ts:121` (`async callEndpoint(prompt: string, timeoutMs = 5000)`) | none | none | Switch: the mode defaults to heuristic `FailSafe/extension/package.json:628` (`"default": "heuristic",`), and heuristic mode never invokes the model `FailSafe/extension/src/sentinel/VerdictArbiter.ts:179-181` (`if (this.currentMode === 'heuristic') {`) |
| brainstorm-transcript-prompt | shipped-unverified | `createBrainstormService` `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:95` (`export function createBrainstormService(`) | `FailSafe/extension/src/roadmap/ConsoleServer.ts:153` (`this.brainstormService = createBrainstormService(options.configProvider);`) | none | Not gated by the Sentinel mode: any reachable valid endpoint gets the transcript `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:104-108` (`if (await llm.checkAvailability()) {`) |
| console-ollama-probe | shipped-unverified | `_probeOllama` `FailSafe/extension/src/roadmap/ui/modules/connection.js:336` (`async _probeOllama() {`) | `FailSafe/extension/src/roadmap/ui/command-center.js:31` (`const client = new ConnectionClient();`) | none | Fixed loopback target, no override `FailSafe/extension/src/roadmap/ui/modules/connection.js:345` (`fetch('http://localhost:11434/api/tags'`) |
| hosted-model-consent | proposed | none | none | none | Not built: no prompt asks before file content goes to a non-loopback endpoint (unverified beyond reading the owned file) |

## Inbound fields

From `/api/tags`: only whether the HTTP status is OK `FailSafe/extension/src/sentinel/utils/LLMClient.ts:78` (`const available = response.ok;`).
From `/api/generate`: `response` text and `total_duration` `FailSafe/extension/src/sentinel/utils/LLMClient.ts:141-149` (`total_duration?: number;`).
The Console probe reads only whether the response is OK `FailSafe/extension/src/roadmap/ui/modules/connection.js:351-352` (`available = !!(res && res.ok);`).

## Outbound fields and egress

Repository content: yes in LLM modes, the file path, matched heuristic pattern ids and the first 2000 characters of the file `FailSafe/extension/src/sentinel/utils/LLMClient.ts:101-108` (`content?.substring(0, 2000)`).
Gate for file content: the Sentinel mode (heuristic by default) and a successful availability check at start `FailSafe/extension/src/sentinel/VerdictArbiter.ts:174-190` (`private shouldInvokeLLM(heuristicResults: HeuristicResult[]): boolean {`).
Repository content: yes for Brainstorm, the voice transcript, whenever the endpoint answers `/api/tags` `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:96-108` (`const fullPrompt = `).
Brainstorm falls back to a VS Code language model when the endpoint is not available, which is another provider's egress `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:113-116` (`vscode.lm.selectChatModels()`).
Metadata: the configured model name `FailSafe/extension/src/sentinel/utils/LLMClient.ts:124-131` (`const model = config.sentinel.localModel;`).
Graph relationships: no `FailSafe/extension/src/sentinel/utils/LLMClient.ts:129-133` (`stream: false`).
Governance evidence: no; the verdict stays local `FailSafe/extension/src/sentinel/VerdictArbiter.ts:206-212` (`promptUsed: prompt,`).
Destination: the configured endpoint, http by default; the Console probe always targets localhost:11434 `FailSafe/extension/src/roadmap/ui/modules/connection.js:345` (`http://localhost:11434/api/tags`).

## Transformations

The prompt is a fixed instruction asking for a risk grade, issues and a confidence `FailSafe/extension/src/sentinel/utils/LLMClient.ts:101-114` (`Analyze this code for security vulnerabilities`).
Hybrid mode invokes the model only when a heuristic flag of medium or higher matched `FailSafe/extension/src/sentinel/VerdictArbiter.ts:187-189` (`r.matched && r.severity !== 'low'`).
An unavailable model in llm-assisted mode falls back to heuristic `FailSafe/extension/src/sentinel/VerdictArbiter.ts:62-66` (`if (this.currentMode === 'llm-assisted') {`).
Brainstorm strips code fences and keeps the outermost JSON object of the reply `FailSafe/extension/src/roadmap/services/ConsoleServerSupport.ts:97-102` (`const first = c.indexOf("{");`).

## Persisted artifacts

The LLM evaluation, including the prompt used, is attached to the verdict object `FailSafe/extension/src/sentinel/VerdictArbiter.ts:206-212` (`promptUsed: prompt,`); where verdicts are stored is outside this contract (unverified beyond the arbiter).
The client itself writes nothing `FailSafe/extension/src/sentinel/utils/LLMClient.ts:22-29` (`export class LLMClient {`).

## Graph links

Implemented: none `FailSafe/extension/src/sentinel/utils/LLMClient.ts:121` (`async callEndpoint(`).
Proposed (not built): a verdict-to-model-evaluation provenance edge, specified in `docs/architecture/INTEGRATION_SCENARIOS.md` (unverified: no code exists).

## Customer UI and actions

Settings: `failsafe.sentinel.mode`, `failsafe.sentinel.localModel` and `failsafe.sentinel.ollamaEndpoint` `FailSafe/extension/package.json:621-638` (`"failsafe.sentinel.mode": {`).
Console: an LLM status row that shows whether the local Ollama probe answered `FailSafe/extension/src/roadmap/ui/modules/connection.js:359-364` (`this.notify('webLlmStatus', this.webLlmState);`).
The Console's status text says data stays on the machine, which holds only while the endpoint is loopback `FailSafe/extension/src/roadmap/ui/modules/llm-status.js:6` (`your data stays on your machine`).

## Governance policy and enforceability limits

Enforced: a non-http(s) or literal private-range endpoint is never contacted by the availability check `FailSafe/extension/src/sentinel/utils/LLMClient.ts:67-71` (`if (!this.isValidEndpoint(endpoint)) {`).
Not enforced: `callEndpoint` does not re-validate the endpoint; it relies on the availability check having run `FailSafe/extension/src/sentinel/utils/LLMClient.ts:121-126` (`const endpoint = config.sentinel.ollamaEndpoint;`).
Advisory: the model's answer feeds a confidence value; it does not by itself block a write `FailSafe/extension/src/sentinel/VerdictArbiter.ts:206-212` (`confidence: this.computeConfidence(heuristicResults, result.response),`).

## Failure, offline, stale and permission semantics

Unreachable endpoint: availability is false after a 2-second timeout and Sentinel stays heuristic `FailSafe/extension/src/sentinel/utils/LLMClient.ts:74-85` (`signal: AbortSignal.timeout(2000)`).
A failed generate call is logged and the verdict has no LLM evaluation `FailSafe/extension/src/sentinel/VerdictArbiter.ts:214-216` (`LLM evaluation failed`).
A non-OK generate status throws `FailSafe/extension/src/sentinel/utils/LLMClient.ts:137-139` (`LLM endpoint returned`).
Stale: availability is checked once at Sentinel start, so a model started later is not used until restart (unverified beyond `checkLLMAvailability` having one caller in `SentinelDaemon.ts`).
The Console probe is re-run at most every 30 seconds and treats every error as not running `FailSafe/extension/src/roadmap/ui/modules/connection.js:337-358` (`reason = 'not-running';`).

## End-to-end scenario and measurable acceptance

Scenario: set the mode to hybrid with Ollama running locally, save a file that trips a medium heuristic, and see a verdict with an LLM evaluation naming the model `FailSafe/extension/src/sentinel/VerdictArbiter.ts:206-212` (`response: result.response,`).
Metric: with the default heuristic mode, zero `/api/generate` requests per saved file (threshold: zero) `FailSafe/extension/src/sentinel/VerdictArbiter.ts:179-181` (`return false;`).
Existing test: `FailSafe/extension/src/test/sentinel/utils/LLMClient.test.ts:19` (`describe('isValidEndpoint', () => {`) (unit; endpoint validation and prompt text only, no request).
Installed-extension test: missing; no test drives Sentinel against a model endpoint (unverified).

## Recommended disposition

Recommendation for the owner: **COMPLETE**. The local-model path is reasonable and off by default, but its boundary is not stated anywhere the user sees it: a workspace file can repoint the endpoint, public hosts and plain http are allowed, Brainstorm sends transcripts whenever the endpoint answers, and the Console says data stays local. Add a loopback-only default with an explicit consent for any other host, and a test that drives one request.

## Open defects

Observed, not filed in this cycle (see Other findings in the portfolio): A workspace `.failsafe/config/sentinel.yaml` can set the LLM endpoint to any public http host, and in an LLM mode file content is posted there without a prompt `FailSafe/extension/src/shared/ConfigManager.ts:57-60` (`ollamaEndpoint: sentinelYaml?.sentinel?.ollamaEndpoint ??`) (outside the plan's LD3 list; filing is the lead's call).
