/**
 * #388: the ordered teardown list, extracted from main.ts so the ORDER — which
 * is load-bearing — can be asserted by a CI-executed test.
 *
 * `disposeResources` awaits each entry sequentially, so position is a real
 * contract, not a formatting choice:
 *  - `planManager` MUST come after `consoleServer`, or the console could serve
 *    a request against a disposed planManager.
 *  - `trustEngine` MUST come after `qorelogicManager`, which also disposes it.
 * Both disposers are idempotent, so the duplicate `context.subscriptions`
 * registrations (which cover normal unload) are safe alongside these.
 */
export interface TeardownHandles {
  consoleServer?: { stop(): void } | undefined;
  planManager?: { dispose(): void } | undefined;
  ledgerManager?: { close(): void } | undefined;
  shadowGenomeManager?: { close(): void } | undefined;
  sentinelDaemon?: { stop(): void | Promise<void> } | undefined;
  mcpServer?: { stop(): void | Promise<void> } | undefined;
  qorelogicManager?: { dispose(): void } | undefined;
  trustEngine?: { dispose(): void } | undefined;
  genesisManager?: { dispose(): void } | undefined;
  governanceStatusBar?: { dispose(): void } | undefined;
  eventBus?: { dispose(): void } | undefined;
}

export interface TeardownEntry {
  name: string;
  dispose: () => void | Promise<void>;
}

export function buildTeardownResources(h: TeardownHandles): TeardownEntry[] {
  return [
    { name: "consoleServer", dispose: () => h.consoleServer?.stop() },
    { name: "planManager", dispose: () => h.planManager?.dispose() },
    { name: "ledgerManager", dispose: () => h.ledgerManager?.close() },
    { name: "shadowGenomeManager", dispose: () => h.shadowGenomeManager?.close() },
    { name: "sentinelDaemon", dispose: () => h.sentinelDaemon?.stop() },
    { name: "mcpServer", dispose: () => h.mcpServer?.stop() },
    { name: "qorelogicManager", dispose: () => h.qorelogicManager?.dispose() },
    { name: "trustEngine", dispose: () => h.trustEngine?.dispose() },
    { name: "genesisManager", dispose: () => h.genesisManager?.dispose() },
    { name: "governanceStatusBar", dispose: () => h.governanceStatusBar?.dispose() },
    { name: "eventBus", dispose: () => h.eventBus?.dispose() },
  ];
}
