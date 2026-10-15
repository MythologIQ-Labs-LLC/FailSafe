/**
 * IntegrationCredentials - the one place FailSafe integrations get a
 * credential from (#482, FX962).
 *
 * Values live in VS Code Secret Storage (through ISecretStore), never in
 * settings. Older installs kept them in plain failsafe.integrations.* settings;
 * those are reported as plaintextPending and moved only with the operator's
 * consent (credentialMigration.ts). A plain-text setting is never returned as
 * a value.
 *
 * A workspace credential beats the user credential. Nothing here logs,
 * returns in an error, or throws a credential value.
 */

import type { ISecretStore } from '../../core/interfaces/ISecretStore';
import {
  CREDENTIALS, ORPHANED_SECRET_SETTINGS, descriptor, isCredentialKey, secretKey,
  type CredentialId, type PlainTextCopy, type StoredScope,
} from './credentialRegistry';

export * from './credentialRegistry';
export { providerMessage } from './credentialRedaction';

/** The settings surface the manager and migration need (vscode adapter in vscodeCredentialAdapters.ts). */
export interface ConfigurationInspector {
  /** Non-empty values of settingKey: user, workspace, and folder copies (folder only in a multi-root window). */
  inspect(settingKey: string): PlainTextCopy[];
  /** Clear settingKey at the user (Global) or Workspace target. */
  remove(settingKey: string, scope: StoredScope): Promise<void>;
  /** workspaceFile URI, else the first folder URI; undefined with no folder open. */
  workspaceIdentity(): string | undefined;
}

export interface CredentialLogger {
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
}

export interface Resolution {
  value?: string;
  scope?: StoredScope;
  /** A plain-text copy exists in user or workspace settings. */
  plaintextPending: boolean;
  /** The scopes of those plain-text copies. */
  plaintextScopes: StoredScope[];
  /** Secret Storage could not be read; nothing is known about stored values. */
  unavailable: boolean;
}

export interface IntegrationCredentialsOptions {
  /** How long init() waits for Secret Storage before treating it as unavailable. */
  initTimeoutMs?: number;
}

const DEFAULT_INIT_TIMEOUT_MS = 5000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Secret Storage did not answer in time')), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

export class IntegrationCredentials {
  private cache = new Map<string, string>();
  private unavailable = true;
  private loading: Promise<void> | undefined;
  private generation = 0;
  private readonly initTimeoutMs: number;
  /** Keys being written here; their change events wait for the verified result. */
  private readonly writing = new Set<string>();

  constructor(
    private readonly store: ISecretStore,
    private readonly config: ConfigurationInspector,
    private readonly logger: CredentialLogger,
    options: IntegrationCredentialsOptions = {},
  ) {
    this.initTimeoutMs = options.initTimeoutMs ?? DEFAULT_INIT_TIMEOUT_MS;
    store.onDidChange?.((key) => { void this.reloadKey(key); });
  }

  /** Load the user and current-workspace credentials. Never throws. */
  init(): Promise<void> {
    const gen = ++this.generation;
    this.loading = this.load(gen).finally(() => { if (this.generation === gen) this.loading = undefined; });
    return this.loading;
  }

  /** Reload, e.g. after the workspace folders change (new workspace identity). */
  refresh(): Promise<void> {
    return this.init();
  }

  /** Resolves when no load is in flight. */
  async whenReady(): Promise<void> {
    while (this.loading) await this.loading;
  }

  private async load(gen: number): Promise<void> {
    try {
      const loaded = await withTimeout(this.readAll(), this.initTimeoutMs);
      if (gen !== this.generation) return;
      this.cache = loaded;
      this.unavailable = false;
    } catch {
      if (gen !== this.generation) return;
      this.cache.clear();
      this.unavailable = true;
      this.logger.warn('Secret Storage is unavailable; integration credentials cannot be read');
    }
  }

  private async readAll(): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const identity = this.config.workspaceIdentity();
    for (const d of CREDENTIALS) {
      for (const scope of ['user', 'workspace'] as const) {
        const key = secretKey(d.id, scope, identity);
        if (!key) continue;
        const value = await this.store.get(key);
        if (value) out.set(key, value);
      }
    }
    return out;
  }

  private async reloadKey(key: string): Promise<void> {
    if (!isCredentialKey(key) || this.unavailable || this.writing.has(key)) return;
    try {
      const value = await this.store.get(key);
      if (value) this.cache.set(key, value);
      else this.cache.delete(key);
    } catch {
      this.cache.delete(key);
    }
  }

  isUnavailable(): boolean {
    return this.unavailable;
  }

  /** The stored credential for id, and whether plain-text copies remain. */
  resolve(id: CredentialId): Resolution {
    const plaintextScopes = this.plaintextScopes(id);
    const plaintextPending = plaintextScopes.length > 0;
    if (this.unavailable) {
      if (!this.loading) void this.init();
      return { plaintextPending, plaintextScopes, unavailable: true };
    }
    const identity = this.config.workspaceIdentity();
    for (const scope of ['workspace', 'user'] as const) {
      const key = secretKey(id, scope, identity);
      const value = key ? this.cache.get(key) : undefined;
      if (value) return { value, scope, plaintextPending, plaintextScopes, unavailable: false };
    }
    return { plaintextPending, plaintextScopes, unavailable: false };
  }

  private plaintextScopes(id: CredentialId): StoredScope[] {
    const scopes = new Set<StoredScope>();
    for (const copy of this.config.inspect(descriptor(id).settingKey)) {
      if (copy.scope !== 'folder') scopes.add(copy.scope);
    }
    return [...scopes];
  }

  /** Any plain-text credential copy, including folder copies and orphaned settings. */
  hasPlainText(): boolean {
    return [...CREDENTIALS.map((d) => d.settingKey), ...ORPHANED_SECRET_SETTINGS]
      .some((k) => this.config.inspect(k).length > 0);
  }

  hasWorkspace(): boolean {
    return this.config.workspaceIdentity() !== undefined;
  }

  private keyFor(id: CredentialId, scope: StoredScope): string {
    const key = secretKey(id, scope, this.config.workspaceIdentity());
    if (!key) throw new Error('No workspace is open, so there is no Workspace scope.');
    return key;
  }

  /** Read the stored value directly from Secret Storage (not the cache). */
  async readStored(id: CredentialId, scope: StoredScope): Promise<string | undefined> {
    return this.store.get(this.keyFor(id, scope));
  }

  /**
   * Store, read back and compare. The cache changes only after a verified
   * write; a failed one puts the previous stored state back (best effort) so
   * an unverified value is never used.
   */
  async storeVerified(id: CredentialId, scope: StoredScope, value: string): Promise<void> {
    const key = this.keyFor(id, scope);
    this.writing.add(key);
    try {
      const previous = await this.store.get(key);
      try {
        await this.store.store(key, value);
        if (await this.store.get(key) !== value) throw new Error('Secret Storage returned a different value on read-back');
      } catch (error) {
        await this.restore(key, previous);
        throw error;
      }
      this.cache.set(key, value);
    } finally {
      this.writing.delete(key);
    }
  }

  private async restore(key: string, previous: string | undefined): Promise<void> {
    try {
      if (previous === undefined) await this.store.delete(key);
      else await this.store.store(key, previous);
    } catch {
      this.logger.warn('Secret Storage could not be restored after a failed write');
    }
    if (previous === undefined) this.cache.delete(key);
    else this.cache.set(key, previous);
  }

  /** Store or replace a credential. */
  async set(id: CredentialId, scope: StoredScope, value: string): Promise<void> {
    const v = value.trim();
    if (!v) throw new Error('A credential cannot be empty; use Clear to remove it.');
    await this.storeVerified(id, scope, v);
    this.logger.info('Integration credential stored', { id, scope });
  }

  /** Delete a stored credential (revocation). */
  async clear(id: CredentialId, scope: StoredScope): Promise<void> {
    const key = this.keyFor(id, scope);
    await this.store.delete(key);
    this.cache.delete(key);
    this.logger.info('Integration credential cleared', { id, scope });
  }

  /** Every cached value, for redaction only. */
  knownValues(): string[] {
    return [...this.cache.values()];
  }
}
