// File: extension/src/governance/IntentStore.ts
import * as fs from 'fs';
import * as path from 'path';
import * as lockfile from 'proper-lockfile';
import { Intent } from './types/IntentTypes';

const LOCK_OPTS = { retries: { retries: 5, minTimeout: 100, maxTimeout: 1000 } };

export class IntentStore {
  private manifestDir: string;
  private activeIntentPath: string;
  private intentsDir: string;

  constructor(workspaceRoot: string) {
    this.manifestDir = path.join(workspaceRoot, '.failsafe', 'manifest');
    this.activeIntentPath = path.join(this.manifestDir, 'active_intent.json');
    this.intentsDir = path.join(this.manifestDir, 'intents');
    this.ensureDirectories();
  }

  getManifestDir(): string { return this.manifestDir; }

  private ensureDirectories(): void {
    [this.manifestDir, this.intentsDir].forEach(dir => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }

  // D4/D5: Async read with file locking fallback if needed
  async readActiveIntent(): Promise<Intent | null> {
    if (!fs.existsSync(this.activeIntentPath)) return null;
    try {
      const data = await fs.promises.readFile(this.activeIntentPath, 'utf-8');
      const intent = JSON.parse(data) as Intent;
      return this.migrateIntent(intent);
    } catch { return null; }
  }

  /**
   * Release-only read: missing file is a legitimate "no active intent", but
   * unreadable, malformed, or partially written content must never be treated
   * as absent when deciding whether a release may proceed (#473).
   * The existing UI-oriented readActiveIntent retains its forgiving semantics.
   */
  async readActiveIntentStrict(): Promise<Intent | null> {
    let data: string;
    try {
      data = await fs.promises.readFile(this.activeIntentPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    return this.migrateIntent(JSON.parse(data) as Intent);
  }

  private migrateIntent(intent: Intent): Intent {
    if (!intent.schemaVersion || intent.schemaVersion < 2) {
      intent.schemaVersion = 2;
      intent.planId = intent.planId ?? undefined;
      if (!intent.metadata.agentIdentity) {
        intent.metadata.agentIdentity = {
          agentDid: intent.metadata.author,
          workflow: 'manual',
        };
      }
    }
    return intent;
  }

  // D5: Atomic write with file locking
  async saveActiveIntent(intent: Intent): Promise<void> {
    let release: (() => Promise<void>) | undefined;
    try {
      if (fs.existsSync(this.activeIntentPath)) release = await lockfile.lock(this.activeIntentPath, LOCK_OPTS);
      else release = await lockfile.lock(this.manifestDir, LOCK_OPTS); // Lock directory if file doesn't exist
      
      await fs.promises.writeFile(this.activeIntentPath, JSON.stringify(intent, null, 2), 'utf-8');
    } finally { if (release) await release(); }
  }

  // D5: Atomic delete with file locking
  async deleteActiveIntent(): Promise<void> {
    if (!fs.existsSync(this.activeIntentPath)) return;
    const release = await lockfile.lock(this.activeIntentPath, LOCK_OPTS);
    try { await fs.promises.unlink(this.activeIntentPath); } finally { await release(); }
  }

  async archiveIntent(intent: Intent): Promise<void> {
    const archivePath = path.join(this.intentsDir, `${intent.id}.json`);
    await fs.promises.writeFile(archivePath, JSON.stringify(intent, null, 2), 'utf-8');
  }

  getArchivedIntent(intentId: string): Intent | null {
    const archivePath = path.join(this.intentsDir, `${intentId}.json`);
    if (!fs.existsSync(archivePath)) return null;
    return JSON.parse(fs.readFileSync(archivePath, 'utf-8')) as Intent;
  }
}
