// File-backed, READ-ONLY IntentProvider for the ACP proxy process (GH #172 Part 2).
// The enforce path needs the active intent to evaluate scope/alignment (axiom 1/2).
// It is read via the vscode-free `IntentStore` (reads
// `.failsafe/manifest/active_intent.json`). The proxy NEVER creates intents — that
// is an operator action in the extension — so createIntent fail-closes loudly
// rather than fabricating governance state from a side channel.

import type { IntentProvider } from '../../../../governance/EnforcementEngine';
import type { Intent } from '../../../../governance/types/IntentTypes';
import { IntentStore } from '../../../../governance/IntentStore';
import { IntentSchema } from '../../../../governance/types/IntentTypes';

export class FileIntentProvider implements IntentProvider {
  private readonly store: IntentStore;

  constructor(workspaceRoot: string) {
    this.store = new IntentStore(workspaceRoot);
  }

  async getActiveIntent(): Promise<Intent | null> {
    const raw = await this.store.readActiveIntent();
    if (!raw) return null;
    // Validate defensively (mirrors IntentService) — a malformed intent file must
    // not crash the proxy; treat it as "no active intent". The Zod parse asserts
    // the Intent contract, so the validated result is an Intent by construction.
    try { return IntentSchema.parse(raw) as Intent; } catch { return null; }
  }

  createIntent(): Promise<Intent> {
    return Promise.reject(
      new Error('ACP proxy is read-only for intents: create intents via the FailSafe extension'),
    );
  }
}
