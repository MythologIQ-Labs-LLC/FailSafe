# Plan: B-BIC-1..5 — Bicameral integration quick wins

**change_class**: feature
**doc_tier**: standard
**high_risk_target**: false
**originating_remediation**: deep-review subagent audit (2026-05-19)
**target_version**: v5.2.x
**Review boundary**: stage artifacts only; push when sealed.

## Scope

Five high-leverage / low-cost fixes against the Bicameral MCP integration, bundled in one cycle because they touch overlapping files. Out of scope: the remaining 18 enhancements (B-BIC-6..23) and B-INT-1..5.

## Decision Log

| Decision | Confidence | Evidence |
|---|---|---|
| Make `ledgerManager` an optional dep on `BicameralRouteDeps` | high | Test fixtures shouldn't be forced to construct a real ledger; routes already gracefully 503 on missing deps. |
| Default `rationale` to empty string when not in request body | high | UI textarea is B-BIC-12's scope; V1 wire just captures the field when present, doesn't block ratify without it. |
| Add `transport.onclose` callback inline in `connect()` rather than a separate disposer | high | Closure captures `this` cleanly; one site, one assignment. |
| Cache `capabilities` as a `Set<string>` on first `connect()`; null on disconnect | high | Matches existing pattern (lazy fields, nulled on disconnect). |
| Sanitizer is a single utility function exported from `install-handler.ts` | high | Reused at two emit sites (line 88-91 in route + line 114-122 in install-handler); single source. |

## Phase 1: B-BIC-1 — META_LEDGER + USER_OVERRIDE on ratify

### Affected files
- `src/roadmap/routes/BicameralRoute.ts`:
  - `BicameralRouteDeps` gains optional `ledgerManager?: import("../../qorelogic/ledger/LedgerManager").LedgerManager`.
  - Ratify success path appends:
    ```ts
    if (deps.ledgerManager?.isAvailable()) {
      await deps.ledgerManager.appendEntry({
        eventType: "USER_OVERRIDE",
        agentDid: "vscode-user",
        payload: {
          action: "bicameral.ratify",
          decisionId,
          verdict,
          rationale: typeof req.body?.rationale === "string" ? req.body.rationale : "",
        },
      });
    }
    ```
  - Wrapped in try/catch so a ledger write failure doesn't break the ratify response.
- `src/extension/bootstrapServers.ts`: thread `ledgerManager` into `setupBicameralRoutes` call site (via `getBicameralRouteDeps` if it exists, or directly).

### Unit tests
- `src/test/roadmap/BicameralRoute.test.ts` (EXTEND if exists; NEW otherwise) — 3 cases:
  1. Ratify with `ledgerManager` injected → `appendEntry` called with `USER_OVERRIDE` + `bicameral.ratify` payload.
  2. Ratify without `ledgerManager` dep → no throw, response still `{ok:true}`.
  3. Ratify with `ledgerManager.appendEntry` throwing → response still `{ok:true}` (ledger failure is non-blocking).

## Phase 2: B-BIC-2 — disposer registration + rewire cleanup

### Architecture corrections (cycle-1 review)
- `ConsoleServerSurface` extended with `getBicameralClient(): BicameralMcpClient | null` (real ConsoleServer already exposes it at `ConsoleServer.ts:254`; surface was just type-narrowed).
- `wireFromConfig` also captures the prior client and calls `disconnect()` before assigning a new one (rewire-orphan fix; in spirit of B-BIC-2).

### Affected files
- `src/extension/bootstrapBicameral.ts`:
  - Add `getBicameralClient(): BicameralMcpClient | null;` to `ConsoleServerSurface`.
  - In `wireFromConfig`: capture `const prior = consoleServer.getBicameralClient();` BEFORE `setBicameralClient(...)`, then `void prior?.disconnect().catch(() => undefined);` to avoid orphan on config rewire.
  - In `wireBicameralIntegration` body, after `wireFromConfig()`, push a disposer using the typed accessor (no `as unknown` cast):
    ```ts
    context.subscriptions.push({
      dispose: () => {
        const client = consoleServer.getBicameralClient();
        void client?.disconnect().catch(() => undefined);
      },
    });
    ```

### Unit tests
- `src/test/extension/bicameral-activation.test.ts` (EXTEND) — 2 cases:
  1. On `wireBicameralIntegration`, a disposable is pushed to `context.subscriptions` that calls `client.disconnect()` on dispose.
  2. Config-change (`failsafe.integrations.bicameral.command`) triggers `prior.disconnect()` before new client is set.

## Phase 3: B-BIC-3 — transport close listener

### Affected files
- `src/integrations/bicameral/BicameralMcpClient.ts`:
  - In `connect()`, after `await client.connect(transport)`:
    ```ts
    transport.onclose = () => {
      this.client = null;
      this.transport = null;
      this.capabilities = null;
    };
    ```
  - Note: also reset capabilities (added in Phase 4) so a reconnect re-fetches.

### Unit tests
- `src/test/integrations/bicameral/BicameralMcpClient.test.ts` (EXTEND) — 2 cases:
  1. `connect()` attaches `transport.onclose`; invoking it flips `isConnected()` to `false`.
  2. After `transport.onclose` fires, subsequent `callTool` (via `history()`) throws "not connected".

## Phase 4: B-BIC-4 — capability negotiation via `listTools()`

### Affected files
- `src/integrations/bicameral/BicameralMcpClient.ts`:
  - New private field `private capabilities: Set<string> | null = null;`.
  - In `connect()`, after `await client.connect(transport)`:
    ```ts
    try {
      const tools = await client.listTools();
      const names = Array.isArray((tools as { tools?: Array<{ name?: string }> }).tools)
        ? (tools as { tools: Array<{ name?: string }> }).tools.map((t) => t.name || "").filter(Boolean)
        : [];
      this.capabilities = new Set(names);
    } catch { this.capabilities = new Set(); }
    ```
  - New public method `getCapabilities(): Set<string> { return new Set(this.capabilities ?? []); }` (defensive copy).
  - In `disconnect()`, set `this.capabilities = null`.
  - In `transport.onclose` (Phase 3), already resets capabilities.
  - **Per cycle-1 review**: SDK guarantees `tools[].name: string`, so the listTools narrowing can be simplified — but keep one layer of defensive narrowing because `client.listTools` is fetched via SDK and we have observed `as never` casts elsewhere in the codebase for protocol drift safety. Use a single guard with `Array.isArray` + filter on `typeof name === 'string'`.
- `src/roadmap/routes/BicameralRoute.ts`: add `GET /api/integrations/bicameral/capabilities` returning `{tools: string[]}` from connected client. (Operator/UI consumers can use this; future B-BIC-13 UI dim work consumes it.)

### Unit tests
- `src/test/integrations/bicameral/BicameralMcpClient.test.ts` (EXTEND) — 3 cases.
  **Test isolation directive**: each case constructs a fresh `BicameralMcpClient` (no module-level shared instance) because the new `capabilities` cache is per-instance state.
  1. After `connect()`, `getCapabilities()` returns the names from `client.listTools()`.
  2. When `listTools()` throws, `getCapabilities()` returns empty set (no crash).
  3. After `disconnect()`, `getCapabilities()` returns empty set.

## Phase 5: B-BIC-5 — install stdout/stderr sanitizer

### Affected files
- `src/integrations/bicameral/install-handler.ts` (lines 113-122 per cycle-1 review):
  - New exported utility `sanitizeStdoutTail(raw: string, maxLen = 2048): string`:
    ```ts
    export function sanitizeStdoutTail(raw: string, maxLen = 2048): string {
      const stripped = String(raw ?? "")
        .replace(/\x1b\[[0-9;]*[mGKHF]/g, "")  // CSI sequences (SGR/cursor)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");  // C0 controls (preserves \t\n\r)
      return stripped.length > maxLen ? stripped.slice(-maxLen) : stripped;
    }
    ```
  - Sanitize at the two stdout/stderr handler assignment sites (lines 116 + 121) where `step.stdoutTail = tail` is written.
- **Per cycle-1 review**: `BicameralRoute.ts` does NOT need a separate sanitizer call — it only forwards the already-sanitized `step` object via broadcast. No change to route file.

### Unit tests
- `src/test/integrations/bicameral/install-handler.test.ts` (EXTEND) — 3 cases:
  1. `sanitizeStdoutTail` strips `\x1b[31mred\x1b[0m` → `"red"`.
  2. Strips C0 controls: `"a\x00b\x07c"` → `"abc"`. Preserves `\t \n \r`.
  3. Caps length to 2048: input of 3000 chars returns the last 2048.

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX514 | NEW | `src/test/roadmap/BicameralRoute.test.ts` | Bicameral ratify success appends USER_OVERRIDE ledger entry (when ledgerManager dep present); non-blocking on failure |
| FX515 | NEW | `src/test/extension/bicameral-activation.test.ts` (extended) | wireBicameralIntegration pushes a context.subscriptions disposer that calls client.disconnect() |
| FX516 | NEW | `src/test/integrations/bicameral/BicameralMcpClient.test.ts` (extended — transport close) | transport.onclose flips isConnected to false; subsequent callTool throws |
| FX517 | NEW | `src/test/integrations/bicameral/BicameralMcpClient.test.ts` (extended — capabilities) | getCapabilities() returns listTools() names; defensive on throw; resets on disconnect |
| FX518 | NEW | `src/test/integrations/bicameral/install-handler.test.ts` (extended) | sanitizeStdoutTail strips ANSI + C0 controls + caps length |

## CI Commands
- `npm run lint` — ESLint 0 errors.
- `npm test` — mocha pass (baseline + ~12 new functional cases).
- No Playwright trigger (no UI surface change; B-BIC-12 textarea explicitly deferred).
