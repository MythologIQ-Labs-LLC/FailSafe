// No-op INotificationService for the ACP proxy process (GH #172 Part 2). The proxy
// is a headless stdio bridge with no UI surface — there is no user to prompt. All
// user-facing signalling happens in the extension; here notifications resolve to
// "no action taken" so the engine's notification calls degrade silently rather
// than crashing the bridge.

import type { INotificationService } from '../../../../core/interfaces/INotificationService';

export class NoopNotificationService implements INotificationService {
  async showInfo(): Promise<string | undefined> { return undefined; }
  async showWarning(): Promise<string | undefined> { return undefined; }
  async showError(): Promise<string | undefined> { return undefined; }
  async showProgress<T>(_title: string, task: (report: (message: string) => void) => Promise<T>): Promise<T> {
    return task(() => { /* progress reporting is a no-op in the proxy */ });
  }
}
