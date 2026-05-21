# Universal Governance Interceptor (B151)

The interceptor is the single contract-typed seam through which agent tool calls
reach the FailSafe enforcement layer. It exists so later cycles — B152 (runtime
extraction) and B153 (OpenTelemetry / Prometheus export) — can land without
re-churning the public surface.

```
MCP tool call ──▶ McpInterceptor ──▶ IGovernanceInterceptor ──▶ ReceiptContract
                  (adapters/)        (EngineBackedInterceptor)
```

## Modules

| File | Role |
|---|---|
| `IGovernanceInterceptor.ts` | The interface: `evaluate(req): Promise<ReceiptContract>`. |
| `EngineBackedInterceptor.ts` | Implements the interface by delegating to `EnforcementEngine.evaluateAction`. |
| `adapters/McpInterceptor.ts` | Wraps an MCP `{name, arguments}` envelope into an `EvaluationRequestContract`. |
| `contractMappers.ts` | Pure mappers between B190 contracts and `EnforcementEngine` shapes. |
| `ajv-instance.ts` | Module-scoped AJV 2020 instance + cached compiled validators. |
| `index.ts` | Public re-export surface. |

## Boundary rules

**Allowed imports** — this module may import only from:

- `src/contracts/` — B190 governance contract types.
- `src/governance/EnforcementEngine.ts` — the enforcement entry point.
- `src/governance/types/IntentTypes.ts` — `ProposedAction` / `Verdict` shapes.

**Forbidden imports**:

- `src/integrations/bicameral/*` — the dependency direction is one-way.
  `BicameralRoute` imports `McpInterceptor`; `McpInterceptor` receives the MCP
  client by **constructor injection** typed against the minimal local
  `McpInterceptorBackingClient` interface — never an import of the bicameral
  module. `src/integrations/bicameral/*` is untouched by this cycle.

## Verdict → Receipt mapping

`EnforcementEngine` produces `ALLOW | BLOCK | ESCALATE`. `verdictToReceipt`
projects each into a B190 `ReceiptContract`. `evidence` is always an array of
`{kind, ref, summary?}` objects — there is no `evidenceRefs` field.

| Engine verdict | Receipt verdict | Evidence object |
|---|---|---|
| `ALLOW` | `ALLOW` | `{kind:'intent', ref:intentId}` when an intent is present, else `[]`. |
| `BLOCK` | `BLOCK` | `{kind:'axiom_violation', ref:'axiom-N', summary:violation}`; `verdictRationale = remediation`. |
| `ESCALATE` | `ESCALATE` | `{kind:'escalation', ref:escalationTo, summary:reason}`. |

## QUARANTINE policy

`QUARANTINE` is the synthetic verdict for unrecoverable failures — it is **not**
produced by the engine. It is emitted when:

- `EngineBackedInterceptor` catches a throw from `EnforcementEngine.evaluateAction`
  (the error name is carried in `evidence[0].summary`); `evaluate` never rethrows.
- `McpInterceptor` receives a malformed MCP envelope or builds an
  `EvaluationRequestContract` that fails `evaluation_request.json` validation —
  the backing interceptor is **not** invoked in that case.

`MODIFY` is defined in the B190 receipt enum but is unexercised this cycle (no
upstream verdict produces it).

## Evaluation-request id derivation

`EvaluationRequestContract` has no `id` field. `deriveEvaluationRequestId(req)`
derives it deterministically — `eval-${sha256(agentDid|action.kind|timestamp)[:16]}`
— so retried or duplicate requests resolve to the same id.

## No new enforcement surface (RD-1)

`EngineBackedInterceptor` calls `EnforcementEngine.evaluateAction` unchanged. The
engine already dispatches by governance mode and threads `featureGate` into
`evaluateEnforceMode`, so the interceptor inherits the existing mode-gating and
Pro-gating. Routing tool calls through this seam introduces **no new enforcement
surface** — it is posture-compliant per `PRIVATE/docs/LICENSING_POSTURE.md`.
