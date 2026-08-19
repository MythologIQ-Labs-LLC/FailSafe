/**
 * Resilient resource teardown used by both `deactivate()` and the
 * crash-during-activation recovery path in `main.ts` (#240).
 *
 * Before this existed, `deactivate()` called each long-lived resource's
 * teardown inline with no error handling: a throw from one resource (e.g.
 * `ledgerManager.close()`) aborted every subsequent teardown call and left
 * the failure unlogged, and a real activation failure after some resources
 * were already acquired left them leaked entirely, with no cleanup attempt
 * at all. `disposeResources` tears each resource down independently so one
 * broken resource cannot block the rest, and reports which ones failed so
 * cleanup failures are observable in diagnostics instead of silently
 * swallowed.
 */

export interface DisposableResource {
  name: string;
  dispose: () => void | Promise<void>;
}

export interface ResourceLogger {
  warn(message: string, data?: unknown): void;
}

export async function disposeResources(
  resources: DisposableResource[],
  logger?: ResourceLogger,
): Promise<string[]> {
  const failed: string[] = [];
  for (const resource of resources) {
    try {
      await resource.dispose();
    } catch (err) {
      failed.push(resource.name);
      logger?.warn(`Failed to dispose ${resource.name} during teardown`, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return failed;
}
