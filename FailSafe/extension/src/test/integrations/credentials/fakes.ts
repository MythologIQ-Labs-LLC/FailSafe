// Test doubles for IntegrationCredentials (#482): an in-memory Secret Storage
// with failure injection and cross-window change events, a settings
// inspector, and a logger that records everything it is given.

import type { ISecretStore } from '../../../core/interfaces/ISecretStore';
import type { ConfigurationInspector, CredentialLogger } from '../../../integrations/credentials/IntegrationCredentials';
import type { PlainTextCopy, StoredScope } from '../../../integrations/credentials/credentialRegistry';

export class FakeSecretStore implements ISecretStore {
  readonly data = new Map<string, string>();
  storeCalls = 0;
  getCalls = 0;
  failStore = false;
  failGet = false;
  hangGet = false;
  /** Return a different value on read-back, as a broken keychain would. */
  corruptReadBack = false;
  private listeners: Array<(key: string) => void> = [];

  private held: Array<() => void> = [];

  async get(key: string): Promise<string | undefined> {
    this.getCalls++;
    if (this.hangGet) return new Promise((resolve) => { this.held.push(() => resolve(this.data.get(key))); });
    if (this.failGet) throw new Error('keychain locked');
    const v = this.data.get(key);
    return v !== undefined && this.corruptReadBack ? `${v}-corrupt` : v;
  }

  async store(key: string, value: string): Promise<void> {
    this.storeCalls++;
    if (this.failStore) throw new Error('keychain refused');
    this.data.set(key, value);
    this.fire(key);
  }

  async delete(key: string): Promise<void> {
    this.data.delete(key);
    this.fire(key);
  }

  onDidChange(listener: (key: string) => void): { dispose(): void } {
    this.listeners.push(listener);
    return { dispose: () => { this.listeners = this.listeners.filter((l) => l !== listener); } };
  }

  /** Answer every get() that was held by hangGet (a late keychain). */
  releaseHeld(): void {
    const held = this.held;
    this.held = [];
    for (const r of held) r();
  }

  /** Another window changed a secret. */
  externalDelete(key: string): void {
    this.data.delete(key);
    this.fire(key);
  }

  private fire(key: string): void {
    for (const l of this.listeners) l(key);
  }
}

export class FakeInspector implements ConfigurationInspector {
  readonly settings = new Map<string, PlainTextCopy[]>();
  identity: string | undefined = 'file:///work/project';
  failRemove = false;
  /** remove() resolves but the value stays (a settings write that did not land). */
  silentRemove = false;
  /** Called after each remove(); lets a test change a setting mid-flow. */
  removed: Array<{ settingKey: string; scope: StoredScope }> = [];
  beforeRemove?: (settingKey: string, scope: StoredScope) => void;

  set(settingKey: string, scope: PlainTextCopy['scope'], value: string, folder?: string): void {
    const list = (this.settings.get(settingKey) ?? []).filter((c) => !(c.scope === scope && c.folder === folder));
    list.push({ scope, value, ...(folder ? { folder } : {}) });
    this.settings.set(settingKey, list);
  }

  inspect(settingKey: string): PlainTextCopy[] {
    return (this.settings.get(settingKey) ?? []).map((c) => ({ ...c }));
  }

  async remove(settingKey: string, scope: StoredScope): Promise<void> {
    this.beforeRemove?.(settingKey, scope);
    if (this.failRemove) throw new Error('settings file is read-only');
    this.removed.push({ settingKey, scope });
    if (this.silentRemove) return;
    this.settings.set(settingKey, (this.settings.get(settingKey) ?? []).filter((c) => c.scope !== scope));
  }

  workspaceIdentity(): string | undefined {
    return this.identity;
  }
}

export class RecordingLogger implements CredentialLogger {
  readonly entries: string[] = [];
  info(message: string, data?: unknown): void { this.entries.push(`${message} ${JSON.stringify(data ?? '')}`); }
  warn(message: string, data?: unknown): void { this.entries.push(`${message} ${JSON.stringify(data ?? '')}`); }
}
