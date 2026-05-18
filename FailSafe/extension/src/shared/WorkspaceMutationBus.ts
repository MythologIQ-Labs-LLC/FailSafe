// WorkspaceMutationBus — targeted-path filesystem mutation aggregator.
// Plan: docs/plan-qor-stale-cache-remediation.md Phase 1 (B192 remediation).
//
// Pure Node stdlib `fs.watch`; no chokidar dep. Each registerWatcher call
// opens its own fs.watch on the supplied absolute path with a per-watcher
// debounce timer; fires the operator-supplied onMutation after the
// debounce settles. Failures (ENOENT, EACCES, unsupported platform) log
// and return a no-op Disposable so callers don't crash. Matches the
// existing `ConsoleLifecycleService.watchMetaLedger` posture for
// degradation behavior.
//
// Design choice: no shared registry of subscribers — each registerWatcher
// holds its own fs.watch handle. This keeps the design simple (no global
// state, no path-registry to maintain, no shared-state synchronization)
// at the cost of one fs.watch handle per subscription. Targeted-path
// usage (4-5 watchers total in the planned scope) means the handle count
// is bounded and negligible.

import * as fs from 'fs';

const DEFAULT_DEBOUNCE_MS = 200;

export interface MutationDisposable {
  dispose(): void;
}

/** Aggregator over Node `fs.watch`. Stateless apart from per-call timers. */
export class WorkspaceMutationBus {
  /**
   * Watch `absPath` and fire `onMutation` after the debounce window settles
   * following each filesystem-level change event. Returns a Disposable that
   * tears down the underlying fs.watch + pending timer when called.
   *
   * Failure modes:
   *   - absPath does not exist: log warning, return no-op Disposable
   *   - fs.watch throws (unsupported platform, EACCES): log warning,
   *     return no-op Disposable
   *
   * Caller is responsible for retaining the Disposable + invoking dispose()
   * on extension deactivate. No retroactive teardown.
   */
  registerWatcher(
    absPath: string,
    onMutation: () => void,
    debounceMs: number = DEFAULT_DEBOUNCE_MS,
  ): MutationDisposable {
    if (!fs.existsSync(absPath)) {
      console.warn(`[WorkspaceMutationBus] watch target missing: ${absPath}`);
      return noOpDisposable();
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let watcher: fs.FSWatcher;
    try {
      watcher = fs.watch(absPath, { persistent: false }, () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          try { onMutation(); } catch (err) {
            console.warn(`[WorkspaceMutationBus] onMutation threw for ${absPath}: ${String(err)}`);
          }
        }, debounceMs);
      });
    } catch (err) {
      console.warn(`[WorkspaceMutationBus] fs.watch failed for ${absPath}: ${String(err)}`);
      return noOpDisposable();
    }

    return {
      dispose: () => {
        if (timer) { clearTimeout(timer); timer = null; }
        try { watcher.close(); } catch { /* already closed */ }
      },
    };
  }
}

function noOpDisposable(): MutationDisposable {
  return { dispose: () => {} };
}
