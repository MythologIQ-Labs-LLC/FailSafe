# plan-qor-b-int-4-mcp-client-host

**Version:** v1
**Slug:** `b-int-4-mcp-client-host`
**Author:** /qor-auto-dev-1 orchestrator (krknapp@gmail.com)
**Date:** 2026-05-28
**Risk Grade:** L2 (refactor of two shipped integrations with extensive test coverage)
**Backlog:** B-INT-4
**Predecessor seals:** #372 (Bicameral MCP integration full-plan), #405 (Open Design v1.1)
**Branch:** `feat/b-int-4-mcp-client-host` (to be created from `main`)

## Promise

Extract a generic `McpClientHost` substrate that owns the shared MCP-over-stdio lifecycle now duplicated across `BicameralMcpClient` and `OpenDesignMcpClient`. Both client classes become thin specializations: each retains its domain-specific surface (typed tool wrappers, runtime guards, error-message prefix, optional hooks) while delegating connect/disconnect/idle/capability/call-raw plumbing to the host. Consolidate the two near-identical `idle-scheduler.ts` modules into a single canonical implementation. Zero behavioral delta: every existing unit + Playwright test passes verbatim post-refactor.

## Why now

- Open Design v1.1 (`OpenDesignMcpClient`, sealed Entry #405) is the second MCP stdio client in the codebase. The B-INT-4 BACKLOG entry explicitly says *"Promote at the second integration, not the first"* — the rule-of-three inflection point is here.
- `idle-scheduler.ts` ships in both `src/integrations/bicameral/` and `src/integrations/open-design/` with the second copy's own header acknowledging it as "DUPLICATE-BY-DESIGN" and noting *"Any bug-fix here should be cross-applied to the Bicameral copy"* (`src/integrations/open-design/idle-scheduler.ts:1-14`). Exactly the debt B-INT-4 retires.
- `BicameralMcpClient.ts` is currently 291 LoC — already over the Section 4 razor (250). Extracting the shared substrate moves it back under the razor incidentally.
- A unified host surface unblocks future MCP integrations from re-implementing the same lifecycle a third time.

## What ships

### New files

| File | Purpose | LoC budget |
|---|---|---|
| `src/integrations/mcp/McpClientHost.ts` | Generic stdio MCP host: lifecycle (`connect`/`disconnect`/`isConnected`/`getCapabilities`/`callRaw`), concurrent-connect coalescing, idle disconnect, `transport.onclose` teardown, optional `preCallGate` + optional `postConnectAssertion` hooks, configurable `clientName` + `errorPrefix`. | ≤ 200 |
| `src/integrations/mcp/idle-scheduler.ts` | Canonical idle-disconnect scheduler. Moved verbatim from `src/integrations/open-design/idle-scheduler.ts` (the version that already exports `DEFAULT_IDLE_DISCONNECT_MS`). | ≤ 80 |
| `src/integrations/mcp/index.ts` | Barrel re-exports: `McpClientHost`, `McpClientHostOptions`, `IdleScheduler`, `DEFAULT_IDLE_DISCONNECT_MS`. | ≤ 30 |

### Modified files

| File | Change | Δ LoC (est.) |
|---|---|---|
| `src/integrations/bicameral/BicameralMcpClient.ts` | Becomes `class BicameralMcpClient extends McpClientHost`. Removes lifecycle methods (connect/disconnect/doConnect/fetchCapabilities/isConnected/getCapabilities). Wires `postConnectAssertion = (client) => assertBicameralProtocolFloor(client)` via constructor. Wires `errorPrefix: 'bicameral tool'` + `notConnectedMessage: 'BicameralMcpClient not connected'` + `clientName: 'failsafe-bicameral-client'`. Retains: typed `callRaw` wrapper (delegates to super with `isToolCallResult` runtime guard) + all v1 + deferred typed tool wrappers. Expected ending size 165-180 LoC (back under the 250 razor; -110 LoC). | -110 |
| `src/integrations/open-design/OpenDesignMcpClient.ts` | Becomes `class OpenDesignMcpClient extends McpClientHost`. Removes lifecycle methods. Wires `preCallGate = (name) => { if (!OpenDesignMcpAllowlist.isReadOnly(name)) throw new Error('WRITE_TOOL_NOT_ENABLED: ...'); }`. Wires `errorPrefix: 'open-design tool'` + `notConnectedMessage: 'OpenDesignMcpClient not connected'` + `clientName: 'failsafe-open-design-client'`. Retains: typed `callRaw` wrapper (`isOpenDesignToolCallResult` runtime guard) + the OpenDesignToolCallResult/Content type exports. Expected ending size 75-95 LoC (-90 LoC). | -90 |
| `src/integrations/bicameral/index.ts` | No surface change (BicameralMcpClient remains a named export from the same barrel). | 0 |
| `src/integrations/open-design/index.ts` | No surface change. | 0 |

### Deleted files

| File | Reason |
|---|---|
| `src/integrations/bicameral/idle-scheduler.ts` | Replaced by `src/integrations/mcp/idle-scheduler.ts` (single canonical copy). |
| `src/integrations/open-design/idle-scheduler.ts` | Same. |

### New tests

| File | Cases | FX |
|---|---|---|
| `src/test/integrations/mcp/McpClientHost.test.ts` | 12 cases: `isConnected` pre/post-connect, transport factory argv/cwd/env pass-through, idempotent connect (single transport spawn under concurrent callers), capability set populated from `listTools`, `transport.onclose` clears client+capabilities+cancels idle, `disconnect` is no-op when already disconnected, `callRaw` increments+decrements idle inflight counter, `callRaw` runtime-guard failure surfaces a typed error with `errorPrefix`, `callRaw` `isError=true` surfaces upstream detail capped at 200 chars, `callRaw` throws `notConnectedMessage` when not connected, optional `preCallGate` is invoked **before** the not-connected check, optional `postConnectAssertion` failure tears down (no leaked half-connected client). | **FX800** McpClientHost lifecycle (12 cases) |
| `src/test/integrations/mcp/idle-scheduler.test.ts` | 6 cases: timer fires at `idleMs`, `beginCall`/`endCall` suppress fire while inflight, `endCall` resets activity timestamp (so window re-starts at end-of-call not start), `cancel()` is idempotent, `idleMs: 0` disables the scheduler entirely, inflight count never goes negative under racing `endCall` calls. | **FX801** Consolidated idle-scheduler (6 cases) |

### Modified tests

All existing `BicameralMcpClient.*.test.ts` (7 files) and `OpenDesignMcpClient.test.ts` should continue to pass verbatim. Test seams (`clientFactory`, `transportFactory`) are preserved on both subclasses through the inherited constructor options. No test file edits expected; if any path break occurs (e.g., a test asserts on a specific error message string), it gets a one-line update only.

## Architecture sketch

```
src/integrations/mcp/
├── McpClientHost.ts            ← shared substrate (new)
├── idle-scheduler.ts           ← canonical (moved from open-design/)
└── index.ts                    ← barrel (new)

src/integrations/bicameral/
├── BicameralMcpClient.ts       ← extends McpClientHost (refactored, ~170 LoC)
├── parsers.ts                  ← unchanged
├── protocol-floor.ts           ← unchanged; wired as postConnectAssertion hook
├── types.ts                    ← unchanged
└── (idle-scheduler.ts deleted)

src/integrations/open-design/
├── OpenDesignMcpClient.ts      ← extends McpClientHost (refactored, ~85 LoC)
├── OpenDesignMcpAllowlist.ts   ← unchanged; wired as preCallGate hook
├── contracts/...               ← unchanged
└── (idle-scheduler.ts deleted)
```

### McpClientHost public surface

```ts
// src/integrations/mcp/McpClientHost.ts
export interface McpClientHostOptions {
  clientName: string;          // passed to `new Client({ name, version })`
  clientVersion?: string;      // default '1.0.0'
  errorPrefix: string;         // used in callRaw runtime-guard + isError messages, e.g. 'bicameral tool' or 'open-design tool'
  notConnectedMessage: string; // thrown by callRaw when not connected, e.g. 'BicameralMcpClient not connected'
  command: string;
  args?: string[];
  cwd: string;
  env?: Record<string, string>;
  idleDisconnectMs?: number;
  /** Optional pre-call gate. Throws to reject the call before idle.beginCall(). */
  preCallGate?: (name: string) => void;
  /** Optional post-connect assertion. Throws to fail-closed teardown. */
  postConnectAssertion?: (client: Client) => void | Promise<void>;
  /** Test seam. */
  clientFactory?: () => Client;
  /** Test seam. */
  transportFactory?: (command: string, args: string[], cwd: string) => StdioClientTransport;
}

export class McpClientHost {
  protected client: Client | null;
  protected transport: StdioClientTransport | null;
  protected capabilities: Set<string> | null;
  protected connectPromise: Promise<void> | null;
  protected readonly idle: IdleScheduler;
  protected readonly opts: McpClientHostOptions;

  constructor(opts: McpClientHostOptions);
  isConnected(): boolean;
  getCapabilities(): Set<string>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  callRaw(name: string, args: Record<string, unknown>): Promise<unknown>;
  // Subclasses narrow the callRaw return type via their own typed wrapper.
}
```

### Bicameral subclass shape (post-refactor)

```ts
// src/integrations/bicameral/BicameralMcpClient.ts (refactored)
import { McpClientHost } from '../mcp/McpClientHost';
import { assertBicameralProtocolFloor } from './protocol-floor';
import { ToolCallResult, isToolCallResult, /* parsers */ } from './parsers';
// ...

export class BicameralMcpClient extends McpClientHost {
  constructor(opts: Omit<McpClientHostOptions, 'clientName' | 'errorPrefix' | 'notConnectedMessage' | 'postConnectAssertion'> & Partial<...>) {
    super({
      ...opts,
      clientName: 'failsafe-bicameral-client',
      errorPrefix: 'bicameral tool',
      notConnectedMessage: 'BicameralMcpClient not connected',
      postConnectAssertion: (client) => assertBicameralProtocolFloor(client),
    });
  }

  /** Type-narrowed callRaw — delegates to host then applies bicameral runtime guard. */
  override async callRaw(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    const raw = await super.callRaw(name, args);
    if (!isToolCallResult(raw)) {
      throw new Error(`bicameral tool ${name} returned a result that failed runtime type guard`);
    }
    return raw;
  }

  // ── v1 + deferred typed wrappers ─────────────────────────────────────────
  async history(): Promise<BicameralFeatureBrief[]> { /* unchanged */ }
  async preflight(filePath: string): Promise<BicameralPreflightResult> { /* unchanged */ }
  // ... etc.
}
```

### Open Design subclass shape (post-refactor)

```ts
// src/integrations/open-design/OpenDesignMcpClient.ts (refactored)
import { McpClientHost } from '../mcp/McpClientHost';
import { OpenDesignMcpAllowlist } from './OpenDesignMcpAllowlist';

export interface OpenDesignToolCallContent { /* unchanged */ }
export interface OpenDesignToolCallResult { /* unchanged */ }
function isOpenDesignToolCallResult(value: unknown): value is OpenDesignToolCallResult { /* unchanged */ }

export class OpenDesignMcpClient extends McpClientHost {
  constructor(opts: ...) {
    super({
      ...opts,
      clientName: 'failsafe-open-design-client',
      errorPrefix: 'open-design tool',
      notConnectedMessage: 'OpenDesignMcpClient not connected',
      preCallGate: (name) => {
        if (!OpenDesignMcpAllowlist.isReadOnly(name)) {
          throw new Error(
            `WRITE_TOOL_NOT_ENABLED: open-design write tools deferred to v1.2 — see plan-open-design-integration-v1.1.md §Open-Q1`,
          );
        }
      },
    });
  }

  override async callRaw(name: string, args: Record<string, unknown>): Promise<OpenDesignToolCallResult> {
    const raw = await super.callRaw(name, args);
    if (!isOpenDesignToolCallResult(raw)) {
      throw new Error(`open-design tool ${name} returned a result that failed runtime type guard`);
    }
    return raw;
  }
}

export type { OpenDesignMcpClientOptions };  // re-exported via host options + omitted defaults
```

## Phases

### Phase 1 — McpClientHost substrate

Files: `src/integrations/mcp/McpClientHost.ts`, `src/integrations/mcp/idle-scheduler.ts`, `src/integrations/mcp/index.ts`, `src/test/integrations/mcp/McpClientHost.test.ts`, `src/test/integrations/mcp/idle-scheduler.test.ts`.

TDD-Light: write failing tests first (12 + 6 = 18 cases), then the host. Move the open-design `idle-scheduler.ts` to `mcp/` verbatim minus the "DUPLICATE-BY-DESIGN" header. Update the header to reflect canonical status.

Section 4 razor budget: McpClientHost ≤ 200, idle-scheduler ≤ 80, index ≤ 30.

### Phase 2 — BicameralMcpClient refactor

Files: `src/integrations/bicameral/BicameralMcpClient.ts`, delete `src/integrations/bicameral/idle-scheduler.ts`. Update import in `BicameralMcpClient.ts` to consume `idle-scheduler` from `../mcp/`.

All 7 existing `BicameralMcpClient.*.test.ts` files MUST pass unmodified. If any path breaks, fix it without changing intent — likely candidates: import path of `IdleScheduler` (now from `../mcp/idle-scheduler`), no other expected breakage since `connectPromise`/`capabilities`/`client`/`transport` fields move to protected members on the host (subclass still accesses them via inheritance).

Section 4 razor: expect 165-180 LoC final (-110 to -125 from current 291).

### Phase 3 — OpenDesignMcpClient refactor

Files: `src/integrations/open-design/OpenDesignMcpClient.ts`, delete `src/integrations/open-design/idle-scheduler.ts`. Update import to `../mcp/`.

`src/test/integrations/open-design/OpenDesignMcpClient.test.ts` MUST pass unmodified.

Section 4 razor: expect 75-95 LoC final (-90 to -110 from current 185).

### Phase 4 — Docs + FEATURE_INDEX + GOVERNANCE_INDEX

Files:
- `docs/FEATURE_INDEX.md` — add FX800 (`McpClientHost lifecycle`), FX801 (`Consolidated idle-scheduler`), both `verified`.
- `docs/INTEGRATIONS.md` — short note under "Bicameral MCP (v1)" + "Open Design integration v1.1" sections pointing at `src/integrations/mcp/McpClientHost.ts` as the shared substrate.
- `docs/GOVERNANCE_INDEX.md` — refresh "Last Reviewed" date; no new Tier entries needed (substrate is source code, not governance doc).
- `CHANGELOG.md` (root + extension) — `[Unreleased]` under `### Changed`: "Refactored Bicameral + Open Design MCP clients onto a shared `McpClientHost` substrate (B-INT-4); zero behavioral delta. FX800 + FX801."

### Phase 5 — Verification

- `npx tsc --noEmit` clean (from `FailSafe/extension/`).
- `npm test` unit suite green (focus subset: `src/test/integrations/bicameral/**` + `src/test/integrations/open-design/**` + `src/test/integrations/mcp/**`).
- Playwright smoke: re-run `integrations-bicameral.spec.ts` + `bicameral-advanced-tools.spec.ts` (5/5 already verified this session — regression must hold).
- Section 4 razor check: every new/modified file ≤ 250 LoC.
- FEATURE_INDEX coverage: FX800 + FX801 entries verified.

## Compliance bindings

- **L3.STABILITY** — both clients are L3 (govern operator-initiated MCP calls). Refactor preserves: idle disconnect TTL invariant, concurrent-connect coalescing invariant, fail-closed on protocol-floor (Bicameral), fail-closed on write-tool gate (Open Design), `transport.onclose` teardown, capability cache invalidation on disconnect. **Behavioral delta = 0.**
- **L3.SECURITY** — Open Design `WRITE_TOOL_NOT_ENABLED` runtime gate moves from `OpenDesignMcpClient.callRaw()` line 158-162 to the `preCallGate` hook. The gate **MUST execute before** any `idle.beginCall()` so the runtime guard remains inviolable. New FX800 test case 11 explicitly asserts ordering.
- **L3.MIGRATION** — Bicameral protocol-floor assertion (`assertBicameralProtocolFloor`) moves from inline `doConnect` lines 130-142 to the `postConnectAssertion` hook. Fail-closed teardown semantics preserved by host: on hook throw, host closes the client, nulls all three state fields (client/transport/capabilities), and re-throws.

## Decision log (pre-audit)

| Decision | Evidence | Confidence | Auto/Deferred |
|---|---|---|---|
| Abstract base class (inheritance) over composition | 95%+ code overlap; two-customization-point surface (errorPrefix + 2 optional hooks); clearer `extends` reads naturally as "is-a stdio MCP client"; subclass `override callRaw` cleanly narrows return type | high | auto |
| Place substrate at `src/integrations/mcp/` (not `src/mcp/`) | Convention: other shared substrate under `src/integrations/` (`open-design/contracts/` for vendored types, etc.); `mcp/` is the right sibling of `bicameral/` + `open-design/` | high | auto |
| Open Design's `idle-scheduler.ts` is the canonical source (it already exports `DEFAULT_IDLE_DISCONNECT_MS`) | `diff` shows the two files are byte-identical apart from headers + the `DEFAULT_IDLE_DISCONNECT_MS` constant; Open Design's is the strict superset | high | auto |
| `protocol-floor.ts` stays in `bicameral/` (not promoted to `mcp/`) | Domain-specific assertion (Bicameral protocol version contract); only one consumer; promotion would be premature generalization | high | auto |
| Subclasses override `callRaw` for type narrowing rather than parameterizing host's return type via generic | Generic on the host (`McpClientHost<R>`) would require erased-at-runtime type info to enforce the runtime guard; subclass override keeps the guard close to the type it narrows to | high | auto |
| No route-factory unification (deferred to B-INT-4b if filed) | BACKLOG B-INT-4 line 414 says "share the connect/disconnect lifecycle, route deps, and Settings card pattern" — explicit "lifecycle" first; routes + Settings card are downstream consumers and out of this cycle's scope | high (scope discipline) | auto; flagged for follow-up |

## Cited file:line references (Citation Inventory Pass)

Per `feedback_verify_external_names_at_plan_time`, every external name in this plan's code-blocks is back-cited:

- `BicameralMcpClient` — `src/integrations/bicameral/BicameralMcpClient.ts:67-291` (current 291-LoC implementation, verified this session)
- `assertBicameralProtocolFloor` — `src/integrations/bicameral/protocol-floor.ts` (consumer at `BicameralMcpClient.ts:47, 134`)
- `IdleScheduler` (Bicameral source) — `src/integrations/bicameral/idle-scheduler.ts:1-70`
- `OpenDesignMcpClient` — `src/integrations/open-design/OpenDesignMcpClient.ts:57-185`
- `OpenDesignMcpAllowlist.isReadOnly` — `src/integrations/open-design/OpenDesignMcpAllowlist.ts` (consumer at `OpenDesignMcpClient.ts:158`)
- `IdleScheduler` (Open Design source, canonical for consolidation) — `src/integrations/open-design/idle-scheduler.ts:1-79`; `DEFAULT_IDLE_DISCONNECT_MS` constant at line 16
- `Client` from `@modelcontextprotocol/sdk/client/index.js` — already-installed dep, used by both files
- `StdioClientTransport` from `@modelcontextprotocol/sdk/client/stdio.js` — already-installed dep, used by both files

No ghost helpers. All names exist in source today; no fabricated symbols introduced.

## Out-of-scope (explicit non-promises)

- Route-factory unification (`BicameralRoute.ts` + Open Design bootstrap routes). Tracked as B-INT-6 (decompose `BicameralRoute.ts`) + would need a new B-INT-7 for Open Design's bootstrap pattern.
- Settings card unification (`bicameral-settings-card.js` + any future Open Design Settings card). Premature; only one card exists today.
- SSE client substrate (Open Design has `OpenDesignSseClient.ts`, no Bicameral analogue). Single integration, no abstraction need.
- Bumping Bicameral or Open Design protocol-floor versions.
- Behavioral changes of any kind.

## Open questions for audit

1. Should `McpClientHost` expose `client` / `transport` / `capabilities` as `protected` (enabling subclass introspection) or fully private with subclasses required to go through accessor methods? Plan currently chooses `protected` for minimal subclass friction. Audit may push back if it sees encapsulation concerns.
2. Should the two `IdleScheduler` classes be **merged** into the host (private member) or **kept as a standalone module** (current plan: standalone)? Plan currently keeps it standalone so the 6-case test surface is straightforwardly addressable + the scheduler is independently mockable.
3. Should `BicameralMcpClient` constructor signature stay identical (caller-transparent change) or accept a partial `McpClientHostOptions` shape that the subclass merges? Plan currently chooses caller-transparent (Bicameral constructor signature unchanged) since `wireFromConfig` in `bootstrapBicameral.ts` is the only construction site and changing its call site = scope creep.

## Audit verdict + absorbed conditions (2026-05-28)

**/qor-audit verdict: PASS** with 4 MINOR conditions (no BLOCKING / MAJOR findings). Independent architect-reviewer (`agentId a94c25432588a4056`). Citations verified clean; no ghost helpers; scope discipline preserved; no external field-level coupling.

The 4 MINOR conditions are absorbed into the implementation plan, no second-round audit needed:

| ID | Finding | Resolution baked into implementation |
|---|---|---|
| **F2** | `postConnectAssertion` ordering not pinned | Acceptance criterion: hook MUST run AFTER `fetchCapabilities` and BEFORE `connect()` resolves. Add FX800 case 13 — "postConnectAssertion observes a populated capability set". |
| **F3** | Test coverage gaps | Extend FX800 from 12 → 15 cases: case 13 (above), case 14 — "concurrent `disconnect()` during in-flight `connect()`" (pin behavior currently ambiguous-by-omission); case 15 — "`preCallGate` throw does NOT increment `idle.beginCall()`". |
| **F4** | `protected` field exposure unnecessary | Change `client`/`transport`/`capabilities`/`connectPromise` from `protected` → `private`. Subclasses never read these fields (typed `callRaw` overrides go through `super.callRaw`). Tighter encapsulation, zero subclass cost. |
| **F5** | Two-pass guard pattern (host returns `unknown` → subclass narrows) | Introduce optional `runtimeGuard?: (raw: unknown) => unknown` host option that runs before the host's `isError` handling. Subclasses pass their guard function once; the override-`callRaw` pattern reduces to a single-line `return super.callRaw(name, args) as <NarrowType>` re-assertion. Single-pass guard, no logic duplication. |

Acceptance criteria for Phase 1 amended accordingly. Phase 1 LoC budget for `McpClientHost.ts` raised from `≤ 200` to `≤ 220` to accommodate the additional `runtimeGuard` hook + the postConnectAssertion ordering comment.
