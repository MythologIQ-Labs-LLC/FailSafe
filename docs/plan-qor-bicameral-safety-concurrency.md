# Plan: Bicameral safety + concurrency batch (B-BIC-8 + 9 + 11 + 21 + 22 + 23)

**change_class**: feature

**doc_tier**: standard

**terms_introduced**:
- term: BicameralProtocolFloor
  home: `FailSafe/extension/src/integrations/bicameral/BicameralMcpClient.ts`
- term: IdleDisconnectScheduler
  home: `FailSafe/extension/src/integrations/bicameral/BicameralMcpClient.ts` (private helper)

**boundaries**:
- limitations:
  - B-BIC-22: protocol floor compares `getServerVersion()?.version` (the upstream Bicameral *implementation* version, which matches the pip-installed `bicameral-mcp` version). Upstream MCP *protocol* version negotiation is the SDK's job; this is application-version assertion. Fail-closed means: if missing OR below `MIN_BICAMERAL_VERSION`, disconnect + throw at the end of `connect()`.
  - B-BIC-9: idle TTL counts time since last *successful* `callRaw`; the disconnect happens silently (operator can re-trigger by clicking any Bicameral action — the next `callRaw` invokes `ensureConnected()` lazily). No UI prompt.
  - B-BIC-23: runtime guard rejects `callTool` results that lack the `content` array OR a numeric `isError`. Existing usages parse `result.content[0].text` defensively; the guard is permissive enough to allow `structuredContent`-only responses.
  - B-BIC-11: structured error text comes from `result.content[0].text` when present; falls back to the existing generic message. Broadcast event is best-effort (consoleServer.broadcast may not be wired in unit-test fixtures).
- non_goals:
  - Idle disconnect HEARTBEAT (no `keepalive` ping; just timeout-based). Heartbeat is a separate feature.
  - UI surfacing of protocol-floor warnings (handled via the existing `cc-qorlogic-floor-warning` pattern from B197; bicameral equivalent deferred to a follow-up UI item — out of this cycle's scope).
- exclusions:
  - B-BIC-12 / 13 / 14 / 15 — UI items (separate bundle).
  - B-BIC-17 / 18 — Sentinel + Risks routing (separate strategic item).

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX540 | NEW | `FailSafe/extension/src/test/integrations/bicameral/BicameralMcpClient.connectRace.test.ts` | B-BIC-8 + B-BIC-21: Promise.all([connect(), connect()]) returns same Promise; concurrent connect+disconnect sequences leave client in coherent state |
| FX541 | NEW | `FailSafe/extension/src/test/integrations/bicameral/BicameralMcpClient.protocolFloor.test.ts` | B-BIC-22: connect() reads getServerVersion + getServerCapabilities; rejects when version below MIN_BICAMERAL_VERSION; passes when ≥ floor; missing version → fail-closed |
| FX542 | NEW | `FailSafe/extension/src/test/integrations/bicameral/BicameralMcpClient.runtimeGuard.test.ts` | B-BIC-23: isToolCallResult guard accepts {content:[...]} + {structuredContent:any} + {isError:bool}; rejects strings/numbers/null/missing-required |
| FX543 | MODIFIED | `FailSafe/extension/src/test/integrations/bicameral/BicameralMcpClient.callRaw.test.ts` | B-BIC-11: structured error text from result.content[0].text now appears in thrown Error.message; existing FX526 callRaw cases still pass |
| FX544 | NEW | `FailSafe/extension/src/test/integrations/bicameral/BicameralMcpClient.idleDisconnect.test.ts` | B-BIC-9: idle TTL fires disconnect after configured ms; next callRaw triggers ensureConnected re-entry; configurable via constructor option |

## Open Questions

(All resolved during plan authoring.)

1. **In-flight connect cache shape (B-BIC-8)**: store `private connectPromise: Promise<void> | null = null`. On re-entry, return the same promise. On completion (success OR throw), clear to null so subsequent connects can retry.
2. **Protocol floor source (B-BIC-22)**: read from existing `MIN_BICAMERAL_VERSION` exported from `install-handler.ts` (already pinned at `'0.14.0'` per B-INT-3). Single source of truth.
3. **Idle TTL configurable scope (B-BIC-9)**: VS Code setting `failsafe.integrations.bicameral.idleDisconnectMs` (default 900_000 = 15min, 0 = disabled). Constructor option for test injection.
4. **`ensureConnected()` re-entry (B-BIC-9)**: when idle-disconnect fires, the next `callRaw()` lazily reconnects. Guard against concurrent `callRaw + idle-disconnect` race via the existing `connectPromise` cache from B-BIC-8 (cycles compose cleanly).
5. **Runtime guard permissiveness (B-BIC-23)**: real MCP servers return either `{content:[{type,text}]}` or `{structuredContent:any}` or both. Guard accepts when EITHER is present + (`isError` is `undefined | boolean`). Rejects `null` / `undefined` / primitives.

## Phase 1: B-BIC-8 — connect() concurrency race

### Affected Files

- `FailSafe/extension/src/integrations/bicameral/BicameralMcpClient.ts` — add private `connectPromise: Promise<void> | null` field. `connect()` caches the in-flight promise on first call and returns the cached value on re-entry. On settle (success or throw), clear the cache.

### Changes

```ts
private connectPromise: Promise<void> | null = null;

async connect(): Promise<void> {
  if (this.client) return;
  if (this.connectPromise) return this.connectPromise;
  this.connectPromise = this.doConnect().finally(() => { this.connectPromise = null; });
  return this.connectPromise;
}

private async doConnect(): Promise<void> {
  // existing connect body verbatim
}
```

### Unit Tests

See FX540 (Phase 6) — combined with B-BIC-21 race tests.

## Phase 2: B-BIC-22 — MCP protocol/version floor assertion

### Affected Files

- `FailSafe/extension/src/integrations/bicameral/BicameralMcpClient.ts` — at the end of `doConnect()`, call `client.getServerVersion()`; if missing OR version below `MIN_BICAMERAL_VERSION`, disconnect + throw.
- `FailSafe/extension/src/integrations/bicameral/BicameralMcpClient.ts` — import `MIN_BICAMERAL_VERSION` from `./install-handler` (or re-export the constant to keep the import clean).

### Changes

```ts
private async assertProtocolFloor(client: Client): Promise<void> {
  const impl = client.getServerVersion();
  const version = impl?.version;
  if (typeof version !== 'string') {
    throw new Error('Bicameral server did not report version; refusing to proceed.');
  }
  if (compareSemver(version, MIN_BICAMERAL_VERSION) < 0) {
    throw new Error(
      `Bicameral server version ${version} is below the supported floor ${MIN_BICAMERAL_VERSION}; refusing to proceed.`,
    );
  }
}
```

`compareSemver` re-uses the helper from `upstream-row.ts` (Phase 4 of the prior bicameral cluster) — import from there.

### Unit Tests

See FX541.

## Phase 3: B-BIC-23 — runtime type guard on callTool return

### Affected Files

- `FailSafe/extension/src/integrations/bicameral/parsers.ts` — add `isToolCallResult(v: unknown): v is ToolCallResult` runtime guard.
- `FailSafe/extension/src/integrations/bicameral/BicameralMcpClient.ts` — `callRaw()` now uses the guard; rejects malformed via clear Error.

### Changes

```ts
// In parsers.ts
export function isToolCallResult(v: unknown): v is ToolCallResult {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  const hasContent = Array.isArray(o.content);
  const hasStructured = o.structuredContent !== undefined;
  const isErrorOk = o.isError === undefined || typeof o.isError === 'boolean';
  return (hasContent || hasStructured) && isErrorOk;
}

// In BicameralMcpClient.callRaw
async callRaw(name: string, args: Record<string, unknown>): Promise<ToolCallResult> {
  if (!this.client) await this.ensureConnected();
  const raw = await this.client!.callTool({ name, arguments: args });
  if (!isToolCallResult(raw)) {
    throw new Error(`bicameral tool ${name} returned a result that failed runtime type guard`);
  }
  // existing isError + return logic continues
}
```

### Unit Tests

See FX542.

## Phase 4: B-BIC-11 — structured isError payload surfacing

### Affected Files

- `FailSafe/extension/src/integrations/bicameral/BicameralMcpClient.ts` — `callRaw()` when `result.isError === true`, extract `result.content?.[0]?.text` and include in thrown `Error.message`. Optional: broadcast event via injected callback when configured (gated on availability).

### Changes

```ts
if (raw.isError) {
  const detail = raw.content?.[0]?.text;
  const msg = detail
    ? `bicameral tool ${name} reported isError=true: ${String(detail).slice(0, 200)}`
    : `bicameral tool ${name} reported isError=true`;
  throw new Error(msg);
}
```

Broadcast wiring is OUT of scope for this cycle (no consoleServer dependency in BicameralMcpClient yet); the better error surfaces immediately via thrown message.

### Unit Tests

See FX543 — extend existing FX526 callRaw test to assert the detail-bearing message.

## Phase 5: B-BIC-9 — idle disconnect TTL

### Affected Files

- `FailSafe/extension/src/integrations/bicameral/BicameralMcpClient.ts` — add `private lastActivityAt: number = 0` + `private idleTimer: ReturnType<typeof setTimeout> | null = null`. `callRaw()` updates `lastActivityAt` on entry. `scheduleIdleCheck()` sets a single-shot timeout for `idleDisconnectMs` from `lastActivityAt`; on fire, if still idle, disconnect.
- Constructor option `idleDisconnectMs?: number` added to `BicameralMcpClientOptions`. Default 900_000 (15min). `0` disables.
- `FailSafe/extension/package.json` — new VS Code setting `failsafe.integrations.bicameral.idleDisconnectMs` (number, default 900000).
- `FailSafe/extension/src/extension/bootstrapBicameral.ts` — read the setting; pass into `BicameralMcpClient` constructor options.

### Changes

```ts
interface BicameralMcpClientOptions {
  command: string;
  args?: string[];
  cwd: string;
  /** B-BIC-9: idle disconnect TTL in ms. 0 = disabled. Default 900_000 (15min). */
  idleDisconnectMs?: number;
  clientFactory?: () => Client;
  transportFactory?: (command: string, args: string[], cwd: string) => StdioClientTransport;
}

private lastActivityAt = 0;
private idleTimer: ReturnType<typeof setTimeout> | null = null;

// In callRaw, before client.callTool:
this.lastActivityAt = Date.now();
this.scheduleIdleCheck();

private scheduleIdleCheck(): void {
  const ms = this.opts.idleDisconnectMs ?? 900_000;
  if (ms <= 0) return;
  if (this.idleTimer) clearTimeout(this.idleTimer);
  this.idleTimer = setTimeout(() => {
    const elapsed = Date.now() - this.lastActivityAt;
    if (elapsed >= ms) {
      void this.disconnect().catch(() => undefined);
    }
  }, ms);
}

private async ensureConnected(): Promise<void> {
  if (this.client) return;
  await this.connect();
}
```

`disconnect()` clears `idleTimer`. `callRaw` first line becomes `if (!this.client) await this.ensureConnected();`.

### Unit Tests

See FX544.

## Phase 6: B-BIC-21 — Concurrent connect/disconnect race tests

### Affected Files

- `FailSafe/extension/src/test/integrations/bicameral/BicameralMcpClient.connectRace.test.ts` — NEW. 4 cases covering B-BIC-8 + B-BIC-21:
  - `Promise.all([connect(), connect()])` resolves to the same effect (single transport spawned).
  - `connect(); await; disconnect(); connect();` cycles cleanly without leaks.
  - Interleaved `connect() + disconnect()` (no await between) does not leak the in-flight transport.
  - `connect()` rejection clears the cached promise so the next `connect()` retries.

### Changes

See above.

### Unit Tests

FX540 (4 cases) + FX541 (5 cases) + FX542 (6 cases) + FX543 (1 new case appended to FX526 file) + FX544 (4 cases). Total NEW + MODIFIED: 20 cases.

## CI Commands

- `cd FailSafe/extension && npm run compile` — TypeScript builds without errors
- `cd FailSafe/extension && npm run lint` — no new lint violations
- `cd FailSafe/extension && npx mocha out/test/integrations/bicameral/BicameralMcpClient.{connectRace,protocolFloor,runtimeGuard,callRaw,deferredTools,idleDisconnect}.test.js --ui tdd` — 20 new + existing pass
- `cd FailSafe/extension && npm test` — full mocha suite green
