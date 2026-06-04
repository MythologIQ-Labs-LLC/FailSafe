# ACP Governance Adapter — Documentation & Security Review

**Artifact:** `src/integrations/acp/` foundation (types + mapper + interceptor + permission-authority) · GH #172 / PR #173
**Scope reviewed:** `acpTypes.ts`, `acpMapper.ts`, `AcpInterceptor.ts`, `acpPermissionAuthority.ts`, engine seam (`contractMappers.ts`, `ObserveModeEvaluator.ts`), integration docs registry, FEATURE_INDEX rows FX843–FX845.

## Verdict

**Fix-then-ship.** The governance core is structurally sound and honestly fail-closed in the dangerous direction, but two items are hard gates before merge: (1) the **missing `acp/README.md` + unregistered `INTEGRATION_DOCS_INDEX.md` row** (mandatory structure/maintenance rules — these are governance bugs, not nits), and (2) **ACP-ADV-02**, the default observe-mode auto-allow that directly contradicts the module's advertised "fail-closed / deny-by-default" posture. The remaining security findings are real but bounded by the offline-foundation stage (no live transport, no ledger wiring) and most are honestly pre-disclosed in the research brief — they should be tracked as hard release blockers for the transport follow-up, not merge blockers for the core.

---

## Documentation findings

### Gaps (missing required content)

- **[BLOCKER] No `acp/README.md`.** `acp/` is the only one of 17 peer integrations without a README; `mcp/README.md` confirmed present, `acp/` confirmed absent (dir listing: only the 4 `.ts` files). `INTEGRATION_STRUCTURE_STANDARD.md:22` makes README mandatory and a deviation "a structure bug." Must follow the template at `INTEGRATION_STRUCTURE_STANDARD.md:39-74`: value statement; metadata block (Pattern: mcp/JSON-RPC; Status: in review #172; ACP spec + schema.json URLs); "What it does"; Configuration (state explicitly *no settings ship yet*); Security (fail-closed QUARANTINE, COOPERATIVE-PATH-only caveat, no transport/network/secrets); Command/wiring (*not yet wired — pure core*); Files; and "Verified surface" back-citing ACP method/field names to `schema.json`.
- **[BLOCKER] ACP not registered in `INTEGRATION_DOCS_INDEX.md`.** The binding maintenance rule (lines 8-14) requires the row be added in the *same* cycle; the index was "Last reviewed: 2026-06-04" — the brief's own date — so the row was omitted in the producing cycle. A missing row is explicitly "a governance bug" (line 14). Add under "In review" (merge-blocked by the main ruleset like Linear/Teams/Jira); extend the legend or map ACP to the MCP family since legend (line 21) has no `acp` pattern.
- **Honest-scope caveat documented in only 1 of 4 modules.** The cooperative-path-only limitation (a non-cooperative agent may act off-channel; only Pro's OS daemon closes it) lives only at `acpPermissionAuthority.ts:10-13`. The primary entry points `AcpInterceptor.ts:1-10` and `acpTypes.ts:1-15` omit it, while `AcpInterceptor.ts:6` asserts "identical fail-closed posture to the MCP adapter" with no hint fail-closed here governs only voluntarily-surfaced intents. This is the single most consequential scope limit; the brief says to "state this plainly" (brief 6, 55, 109, 200). Fix: add a "Scope (honest)" paragraph to the `AcpInterceptor.ts` header and a one-line pointer in `acpTypes.ts`, cross-referencing `acpPermissionAuthority.ts:10-13`.
- **`verdictToOutcome` MODIFY JSDoc is incomplete (dead branch undocumented).** `acpPermissionAuthority.ts:47-48` explains MODIFY "denies" via the ACP-side reason but omits that MODIFY is presently **unreachable** from the engine-backed path: `verdictToReceipt` (`contractMappers.ts:95-118`) only ever emits ALLOW/BLOCK/ESCALATE — confirmed, no MODIFY variant. A maintainer cannot answer "can I delete this branch?" Add a note: MODIFY is a defensive forward-compat default, not a reachable mapping today (brief GAP #3).
- **Deny-by-default sentinel never asserted as a security property.** `acp_unknown` handling is described mechanically at `acpMapper.ts:66-69` and `AcpInterceptor.ts:89-90`, but the *invariant* — that an unmapped/throwing intent has no valid `action.kind`, fails `describeMalformedIntent`/AJV, and therefore QUARANTINEs (never silently allows) — is emergent, inferred only by tracing to `AcpInterceptor.ts:54-56`. State it explicitly at `acpMapper.ts:76` (default branch) and `AcpInterceptor.ts:95-97` (catch).
- **`describeMalformedIntent` per-type minimums lack rationale.** `AcpInterceptor.ts:30-57` documents the *what* and the fail-closed policy but not *why* each required-field set is the minimal governable set (fs_write needs path+content; tool_call needs only toolCallId; terminal_create needs command but not sessionId). These thresholds are governance-load-bearing; a future loosening could widen the ungoverned surface unknowingly. Add a one-line rationale per case.

### Inaccuracies (doc says X, code/reality says Y)

- **Research-brief path is wrong from the package root.** `acpTypes.ts:8` cites `docs/research-brief-acp-governance-2026-06-04.md`, but the file lives at workspace-root `docs/`, two levels above `src/integrations/acp/`; from `FailSafe/extension/` the relative `docs/...` does not resolve. Disambiguate to `<repo-root>/docs/...` or copy the brief into the extension docs tree.
- **Brief↔code drift: McpEnvelope ghost names.** Brief §3/§7 (lines 67-69, 148-151) specifies mapping onto `McpEnvelope` `{name, arguments}` via `acp*ToEnvelope` helpers. Shipped code maps directly to the generic `EvaluationRequestContract` action `{kind, target, payload}` (`acpMapper.ts:21-78`) with `acp*ToAction` names — confirmed in source. The shipped shape is cleaner; this is doc drift, not a code bug. Reconcile in README/PR; do not carry `acp*ToEnvelope` forward.
- **Brief §7 mapper list omits `terminal_create`.** Brief 148-151 lists only tool/fs/permission mappers, yet calls `terminal/create` the "highest-value shell-execution interception point." Code *does* implement `acpTerminalCreateToAction` (`acpMapper.ts:45-51`) — code is more complete than the brief. README/PR "Verified surface" must list all four intents/mappers.
- **FX843–FX845 Docs column off-convention.** Rows point at the research brief; sibling FX838–FX840 point at `INTEGRATION_DOCS_INDEX.md` (`FEATURE_INDEX.md:1028-1035`). A one-time brief is not the maintained registry. After registering ACP, change the Docs column to `INTEGRATION_DOCS_INDEX.md` (or `src/integrations/acp/README.md`).

### Nits

- `AcpInterceptor` class JSDoc is 4 words (`AcpInterceptor.ts:59`); the boundary note lives only in the file header, not on the hover-visible exported symbol. Expand to 2-3 lines (fail-closed posture, governance-core-only/no-transport, cross-link `decidePermission`).
- `AcpToolCall` (`acpTypes.ts:43-51`) types `status`/`locations` as governor-relevant, but `acpToolCallToAction` (`acpMapper.ts:25-31`) reads neither — slight over-claim. Note they are modeled for future scoping, not yet propagated.
- FX844 says the interceptor "reuses **EngineBackedInterceptor** seam"; code imports only the `IGovernanceInterceptor` interface (backing is constructor-injected — `AcpInterceptor.ts:13,61-67`). Soften to "dispatches to an injected `IGovernanceInterceptor` (EngineBackedInterceptor in production)."
- FX843–FX845 are "verified" with no signal they are unwired pure core; add a Notes-column "foundation only — not yet wired to ACP transport" so a Reality-vs-Promise pass doesn't read ACP governance as live.
- Brief §7 items 5 (mcpServers vetting) and 6 (`acpHostDetection.spec.ts`, #161) did not ship and have no files — state in the PR they are deferred follow-ups.
- No test (even skipped/descriptive) marks the cooperative-path-only boundary. Add a top-of-suite comment in `acpPermissionAuthority.test.ts` so a coverage audit sees a deliberate gap, not an omission.

---

## Security findings (CONFIRMED only, by severity)

### HIGH

**ACP-ADV-02 — Default observe-mode auto-allows every ACP request, inverting the advertised deny-by-default**
*Framework:* NIST SP 800-53 **AC-3** (Access Enforcement) / OWASP **A04:2021** Insecure Design / EU AI Act **Art. 14** (human oversight default-on).
*Where:* `EnforcementEngine.ts:94` + `ObserveModeEvaluator.ts:34-45` + `EnforceModeEvaluator.ts:18-28` + `acpPermissionAuthority.ts:58-60`.
*Why real (verified):* On a fresh workspace `getGovernanceModeState()` returns `{mode:'observe', defaulted:true}`; `evaluateObserveMode` **always** returns `status:'ALLOW'` even when Axiom1 would block — confirmed at `ObserveModeEvaluator.ts:19-38` (it logs "OBSERVE MODE: Would have blocked" then returns ALLOW). `verdictToReceipt` maps that to verdict `ALLOW` (`contractMappers.ts:106-107`), and `verdictToOutcome('ALLOW', …)` selects the first allow option (`acpPermissionAuthority.ts:58-60`). Net: `decidePermission` auto-grants every request by default. `enforce` mode also short-circuits to ALLOW when the `governance.lockstep` gate is off. The header advertises "Fail-closed / deny-by-default" (`acpPermissionAuthority.ts:43-52`) — directly contradicted. Not disclosed in the brief, which frames the gate as fail-closed/advisory-on-skip, not auto-allow-on-default-mode. (Downgraded from "critical": no live transport gates a real agent yet, and this is the engine's pre-existing observe-mode telemetry posture — but the authority inheriting it while advertising fail-closed is an operator-misleading defect.)
*Fix:* `decidePermission` must not silently inherit observe/assist/lockstep-off auto-allow. Surface the effective mode in the receipt and treat any ALLOW produced under a non-enforcing mode as a non-grant (`cancelled`) plus a loud "governance not enforcing" warning — or require enforce semantics for this seam. Add a regression test: on a defaulted/observe engine, `decidePermission` does NOT auto-select an allow option.

### MEDIUM

**ACP-AGENTIC-01 — `action.payload` (argv, fs content, tool rawInput) is dropped before the engine; command/content is never governed**
*Framework:* NIST **SI-10** (Information Input Validation) / OWASP **A08:2021** Software & Data Integrity / EU AI Act **Art. 12** (record-keeping of inputs).
*Where:* `contractMappers.ts:51-61` (specifically `:54-60`) + `EngineBackedInterceptor.ts:44` + `acpMapper.ts:39,49`.
*Why real (verified):* `acpMapper` builds rich payloads (terminal args/cwd `:49`, fs content `:39`, tool rawInput `:29`), but `evaluationRequestToProposedAction` copies ONLY `{type, targetPath, intentId, proposedAt, proposedBy}` (`contractMappers.ts:54-60`, confirmed) and never reads `action.payload`. `ProposedAction.type` is the closed union `file_write|file_create|file_delete|file_rename`, and the only enforcer using `targetPath` is Axiom2 path-scoping — so a `terminal_create` maps to `targetPath='rm'`/`'git'` evaluated as a file path with the dangerous argv invisible. The new finding beyond the brief's GAP #1/#2 framing: payload is dropped *entirely*, so the "command-policy evaluation" claim at `acpMapper.ts:44` is currently false.
*Fix:* Do not advertise command/content governance until the engine can read it. Either widen `ProposedAction` + add a command/content axiom, or until then make `AcpInterceptor` fail-closed (QUARANTINE) for `acp_terminal_create`/`acp_tool_call` whose risk lives in payload; add a test that a destructive `terminal_create` does not ALLOW. Hard release blocker for any "governs ACP terminal/fs effect" claim.

**ACP-AGENTIC-03 — fs_write content and tool rawInput (potentially secrets) flow verbatim, unbounded and unredacted, into the governance payload**
*Framework:* NIST **SC-28 / SI-12** (info-at-rest protection, handling/retention) / OWASP **A09:2021** Logging Failures / EU AI Act **Art. 10** (data governance).
*Where:* `acpMapper.ts:29,39,59` + `AcpInterceptor.ts:82-84` + `contractMappers.ts:136`.
*Why real (verified):* `acpFsWriteToAction` copies full file content into `payload.content` (`:39`); tool/permission mappers spread the entire agent-supplied `rawInput` (`:29,:59`). `describeMalformedIntent` applies no size cap (`AcpInterceptor.ts:30-57`); `evaluation_request.json:18` permits arbitrary payload (`additionalProperties:true`). On AJV failure the request detail is `JSON.stringify`'d into the quarantine summary (`AcpInterceptor.ts:82-84`) → `ReceiptEvidence.summary`. Per MEMORY.md the ledger is Merkle-chained/immutable, so anything persisted cannot be redacted later. (Kept medium: nothing persists the receipt in this foundation — leak is latent until a persisting consumer exists — but the unbounded/unredacted construction is real and should be fixed at the mapper before persistence is wired. Merges duplicate ACP-ADV-05.)
*Fix:* Never carry raw fs_write content or raw rawInput/env into the payload. Replace content with a bounded digest (sha256 + byte length + small redacted preview); cap serialized payload size in `describeMalformedIntent` (QUARANTINE on exceed); redact before quarantine/receipt summaries (reuse `mcp-policy-audit` secret-redaction). Govern on path/scope/hash, never the verbatim body.

**ACP-AGENTIC-05 — Permission options accepted without validating each `option.kind`/`optionId`; authority can be forced to `cancelled`**
*Framework:* NIST **SI-10** (input validation) / OWASP **A04:2021** Insecure Design / EU AI Act **Art. 14** (oversight integrity).
*Where:* `AcpInterceptor.ts:49-53` + `acpPermissionAuthority.ts:33-65`.
*Why real (verified):* `describeMalformedIntent` for `permission` checks only `Array.isArray(request.options)` (`AcpInterceptor.ts:50`) — never validates each `kind` is one of the four `AcpPermissionOptionKind` values nor that `optionId` is non-empty. Empty `options:[]` passes (`Array.isArray([])` is true). `verdictToOutcome` then picks by agent-declared kind; an agent offering only allow-kind options (or zero, or mislabeled) forces a BLOCK/QUARANTINE verdict through `pickOption(REJECT_KINDS) → null → {outcome:'cancelled'}` (`acpPermissionAuthority.ts:63-64`). The `cancelled` fallback is itself fail-closed (never auto-allows on deny — tested), but per the brief the spec does not force the agent to treat a client-originated `cancelled` as refusal (brief 49,55), so a non-cooperative agent can downgrade every deny to an ambiguous cancel. Merges duplicate ACP-ADV-04. (Medium, not high: the dangerous direction is blocked; the new exploitable bit is missing option validation enabling forced-cancel.)
*Fix:* Validate every `options[]` entry — `kind` ∈ the four `AcpPermissionOptionKind`, `optionId` a non-empty unique string, else QUARANTINE. Require ≥1 reject-kind option for any request whose verdict may deny; when a deny cannot be expressed as a genuine `reject_*` selection, treat it as a hard protocol failure (refuse/kill the turn), not a soft `cancelled`. Never equate `cancelled` with `denied` in ledger/operator records.

### LOW

**ACP-AGENTIC-02 — `acp_*` action kinds force-cast to the closed `ProposedAction['type']` union; no engine branch recognizes them**
*Framework:* NIST **SI-10** / OWASP **A04:2021** (type-confusion / unsound cast).
*Where:* `acpMapper.ts:27,37,47,63,76` + `contractMappers.ts:55` + `IntentTypes.ts:304`.
*Why real (verified):* `contractMappers.ts:55` coerces `req.action.kind as ProposedAction["type"]` (confirmed) whose real union is the four `file_*` values; no enforcer branches on `action.type`, so the verdict depends entirely on whether the target string resolves inside intent scope. Disclosed verbatim as brief GAP #1 / open Q#7; union-widening scoped out of #172. (Low — effectively the root cause of ACP-AGENTIC-01; de-duplicated.)
*Fix:* Do not cast unknown kinds; add an explicit allowlist translation (`acp_fs_write → file_write`, …) and fail-closed (QUARANTINE) for kinds the engine cannot interpret. Test: an `acp_*` kind with no engine semantics QUARANTINEs rather than coincidentally ALLOWs.

**ACP-ADV-07 — `pickOption` falls back to `allow_always`, violating the code's own "never auto-allow_always" guarantee**
*Framework:* NIST **AC-3** / OWASP **A04:2021**.
*Where:* `acpPermissionAuthority.ts:28,38-40,46-47,58-60`.
*Why real (verified):* `ALLOW_KINDS = ['allow_once','allow_always']` (`:28`); `pickOption` prefers `allow_once` then falls back to any ALLOW_KIND (`:38-39`). The JSDoc claims "never auto-`allow_always`" (`:46-47`). On an ALLOW verdict where the agent offers only an `allow_always` option, the code is forced to select it — contradicting the stated guarantee. The existing test (`acpPermissionAuthority.test.ts:22-23`) only covers the `allow_once`-present case. (Low: triggers only under ALLOW — itself requiring a non-fail-closed mode per ACP-ADV-02 — and an agent-controlled option set.)
*Fix:* Do not fall back to `allow_always`; if no `allow_once` on an ALLOW verdict, return `{outcome:'cancelled'}`. Regression test: ALLOW with `allow_always`-only options must NOT auto-select it.

**ACP-ADV-03 — Agent-controlled cosmetic `title` used as the governed target while the real command hides in dropped rawInput (poisons audit provenance)**
*Framework:* NIST **AU-10** (non-repudiation) / EU AI Act **Art. 12** (accurate record-keeping).
*Where:* `acpMapper.ts:28,58` + `acpTypes.ts:56-62`.
*Why real (verified):* `target = tc?.title ?? tc?.toolCallId …` (`acpMapper.ts:58`, `:28`); `title` is fully agent-controlled while the real argv lives in the dropped `rawInput`. The receipt/ledger records the cosmetic title for an action that may be something else. (Low; a consequence of the payload-drop — resolves once payload is carried and target is derived from the security-relevant field.)
*Fix:* Derive target from the security-relevant field (canonicalized `rawInput.command`/argv), keeping `title` only as a non-authoritative display label.

**ACP-NIST-03 — No audit/ledger record at the decision point; QUARANTINE/BLOCK leave no durable forensic trail**
*Framework:* NIST **AU-2 / AU-3** (audit events/content) / EU AI Act **Art. 12** (logging).
*Where:* `AcpInterceptor.ts:75-103` + `acpPermissionAuthority.ts:72-78` + `EngineBackedInterceptor.ts:41-51`.
*Why real (verified):* `intercept`/`decidePermission` return a receipt/outcome with no ledger append, log, or metric; `EngineBackedInterceptor.evaluate` does not persist; `receipt.ledgerEntryRef` is never populated on the ACP path. *Not independently exploitable* (`exploitable:false`); an honest consequence of the deliberately no-I/O offline foundation (`AcpInterceptor.ts:8-10`). Must be addressed before live wiring.
*Fix:* Before wiring transport, make the interceptor/authority (the I/O boundary, keeping mappers pure) persist each non-ALLOW verdict and every malformed QUARANTINE to `LedgerManager` and populate `receipt.ledgerEntryRef`. Make adapter-level audit emission an explicit acceptance criterion for the transport follow-up.

---

## Rejected / non-issues

- **ACP-ADV-01 / ACP-ADV-05 / ACP-ADV-04** — duplicates of ACP-AGENTIC-01 / -03 / -05 respectively (same root causes: payload-drop, raw-content spread, forced-cancel). Merged; their "critical/high" severities also rejected given the offline foundation, default observe mode, and verified fail-closed-in-the-dangerous-direction behavior (`acpPermissionAuthority.test.ts:44-47`).
- **ACP-NIST-01 (Art. 14 silent-verdict UX), -05/ACP-ADV-06 (cooperative-path/off-channel bypass)** — honestly-disclosed *scope* statements, not code defects. The off-channel bypass is the artifact's central documented boundary (`acpPermissionAuthority.ts:10-13`; brief threat-model 95-109, Pro-daemon backstop). ESCALATE→reject_once collapse is a deliberate, tested fail-closed choice. Surfacing the limitation at runtime is a future enhancement.
- **ACP-NIST-02 / -06** — record-keeping concern is subsumed by ACP-AGENTIC-01 + ACP-NIST-03. The path-traversal premise is **factually wrong**: `Axiom2Enforcer.isPathInScope` itself does `path.resolve` + `fs.realpathSync` and rejects `..`/absolute escapes (`Axiom2Enforcer.ts:35-72`) — canonicalization chokepoint exists downstream and is fail-closed.
- **ACP-NIST-04** — a positive-control observation (fail-closed posture correct and tested); not a finding.
- **ACP-AGENTIC-04 (eval-id ms collision)** — deterministic content-address by design (`contractMappers.ts:3-5`); receipts also carry a unique `randomBytes` id; no ledger wired. Reasonable hardening, not a confirmed finding.
- **ACP-AGENTIC-06 (static agentDid / dropped sessionId)** — `agentDid` is constructor-overridable; per-session attribution is forward work overlapping ACP-NIST-03. Not exploitable.
- **ACP-AGENTIC-07 (DoS unbounded payload)** — folded into ACP-AGENTIC-03's size-cap fix.
- **ACP-ADV-08** — `__proto__`-via-spread is a non-sink here (spread copies it as an own enumerable property, does not pollute `Object.prototype`, and payload is dropped before the engine); oversized-content/empty-options already captured by ACP-AGENTIC-03/-05; `additionalProperties:true` is by design for a free-form payload contract.

---

## Prioritized fix list

### Fix-now — Documentation

1. **Create `src/integrations/acp/README.md`** per `INTEGRATION_STRUCTURE_STANDARD.md:39-74` (BLOCKER — structure bug). Describe actual mapping as ACP intent → `EvaluationRequestContract` action `{kind,target,payload}` (not McpEnvelope); list all four intents/mappers; state no-settings + not-yet-wired explicitly.
2. **Register ACP in `INTEGRATION_DOCS_INDEX.md`** under "In review," same change (BLOCKER — governance bug, maintenance rule lines 8-14). Extend the legend or map to MCP family.
3. **Repoint FX843–FX845 Docs column** to `INTEGRATION_DOCS_INDEX.md`/README; soften FX844 "EngineBackedInterceptor seam" → "injected IGovernanceInterceptor"; add "foundation only — not yet wired" note.
4. **Add the honest-scope paragraph** to `AcpInterceptor.ts` + `acpTypes.ts` headers; fix the brief path citation at `acpTypes.ts:8` to `<repo-root>/docs/…`.

### Fix-now — Code / Security

5. **ACP-ADV-02 (HIGH):** do not inherit observe/assist/lockstep-off auto-allow in `decidePermission`; surface effective mode + treat non-enforcing ALLOW as non-grant; regression test.
6. **ACP-AGENTIC-03 (MED):** digest/cap/redact payload at the mapper before any persistence is wired; size cap in `describeMalformedIntent`.
7. **ACP-AGENTIC-05 (MED):** validate each permission `option.kind`/`optionId`; never equate `cancelled` with `denied`.
8. **ACP-ADV-07 (LOW, cheap):** drop the `allow_always` fallback now (small, prevents guarantee violation) + regression test.
9. **Stop advertising command/content governance** (`acpMapper.ts:44` "command-policy evaluation") until ACP-AGENTIC-01 is resolved, OR fail-closed `acp_terminal_create`/`acp_tool_call` whose risk lives in payload — pick one before merge to avoid a false claim shipping.

### Track-as-follow-up (gate the transport PR, not this merge) — Documentation

- Add MODIFY-unreachable note (`acpPermissionAuthority.ts:47-48`); deny-by-default invariant at `acpMapper.ts:76`/`AcpInterceptor.ts:95-97`; per-type `describeMalformedIntent` rationale; class-JSDoc expansion; `AcpToolCall` status/locations note; cooperative-path marker in `acpPermissionAuthority.test.ts`.
- In the PR description: state brief §7 items 5 (mcpServers vetting) + 6 (#161 host-detection) are deferred; reconcile the McpEnvelope/`acp*ToEnvelope` ghost names; enumerate all four mappers.

### Track-as-follow-up — Code / Security (hard release blockers for the live-transport PR)

- **ACP-AGENTIC-01 (MED):** widen `ProposedAction` + command/content axiom so argv/cwd/content are actually governed. Hard blocker for any "governs ACP terminal/fs effect" claim.
- **ACP-AGENTIC-02 (LOW):** replace the unsound `as ProposedAction['type']` cast (`contractMappers.ts:55`) with an explicit allowlist translation; QUARANTINE uninterpretable kinds.
- **ACP-ADV-03 (LOW):** derive target from the security-relevant field, not agent-controlled `title`.
- **ACP-NIST-03 (LOW/info):** wire `LedgerManager` persistence + `receipt.ledgerEntryRef` at the I/O boundary; make adapter audit emission an explicit acceptance criterion for the transport follow-up.

---
_Review via 7-agent doc+security workflow (acp-doc-security-review): 2 doc reviewers + NIST/EU-AI-Act (compliance-auditor) + OWASP/Agentic (security-auditor) + adversarial (penetration-tester) → security-auditor verifier → synthesis. 2026-06-04._
