/**
 * credentialMigration - move plain-text credential settings into Secret
 * Storage, only with the operator's consent (#482, FX962).
 *
 * Each value is stored, read back and compared before anything is removed.
 * A stored value that differs from the plain-text copy is never overwritten
 * silently: the operator picks which one to keep. Folder copies are ignored
 * by VS Code for these settings and are listed for manual removal only. The
 * report names credentials, scopes and outcomes; it never contains a value.
 */

import {
  CREDENTIALS, ORPHANED_SECRET_SETTINGS, scopeName,
  type CredentialDescriptor, type PlainTextCopy, type StoredScope,
} from './credentialRegistry';
import type { ConfigurationInspector, CredentialLogger, IntegrationCredentials } from './IntegrationCredentials';

export type MigrationOutcome =
  | 'migrated' | 'failed' | 'stale-plaintext' | 'stale-discarded' | 'stale-adopted'
  | 'plaintext-kept' | 'plaintext-removed' | 'removal-failed' | 'ignored-folder-copy';

export interface MigrationLine { label: string; settingKey: string; scope: string; outcome: MigrationOutcome }

export interface MigrationReport {
  lines: MigrationLine[];
  /** A workspace or folder copy existed: it may have been committed or shared. */
  rotationAdvised: boolean;
  /** A user copy was removed, and Settings Sync will remove it on other machines. */
  settingsSyncNote: boolean;
  ok: boolean;
}

export type StaleChoice = 'keep' | 'use' | 'leave';

export interface RemovalSummary {
  /** Labels of credentials whose migrated plain-text copies would be removed. */
  credentials: string[];
  /** Of those, the ones that came from workspace settings. */
  fromWorkspace: string[];
  /** Settings FailSafe never reads, offered for removal. */
  orphans: string[];
}

export interface MigrationPrompts {
  /** A stored value differs from the plain-text copy. undefined (Escape) means leave both. */
  staleChoice(label: string, scope: string): PromiseLike<StaleChoice | undefined>;
  /** One question for every migrated copy; stale copies are never part of it. */
  confirmRemoval(summary: RemovalSummary): PromiseLike<boolean>;
}

interface Removable { d?: CredentialDescriptor; settingKey: string; label: string; scope: StoredScope; value: string }

interface Run {
  creds: IntegrationCredentials;
  config: ConfigurationInspector;
  prompts: MigrationPrompts;
  lines: MigrationLine[];
  rotationAdvised: boolean;
  settingsSyncNote: boolean;
}

function add(run: Run, item: { label: string; settingKey: string }, scope: string, outcome: MigrationOutcome): void {
  run.lines.push({ label: item.label, settingKey: item.settingKey, scope, outcome });
}

/** Remove a copy only if it still holds the handled value, then confirm it is gone. */
async function removeCopy(run: Run, r: Removable, done: MigrationOutcome): Promise<void> {
  const name = scopeName(r.scope);
  const current = run.config.inspect(r.settingKey).find((c) => c.scope === r.scope);
  if (!current || current.value !== r.value) { add(run, r, name, 'plaintext-kept'); return; }
  try {
    await run.config.remove(r.settingKey, r.scope);
  } catch {
    add(run, r, name, 'removal-failed');
    return;
  }
  const still = run.config.inspect(r.settingKey).some((c) => c.scope === r.scope);
  add(run, r, name, still ? 'removal-failed' : done);
  if (!still && r.scope === 'user') run.settingsSyncNote = true;
}

async function handleStale(run: Run, d: CredentialDescriptor, copy: PlainTextCopy & { scope: StoredScope }): Promise<void> {
  const name = scopeName(copy.scope);
  const choice = await run.prompts.staleChoice(d.label, name);
  const r: Removable = { d, settingKey: d.settingKey, label: d.label, scope: copy.scope, value: copy.value };
  if (choice === 'keep') { await removeCopy(run, r, 'stale-discarded'); return; }
  if (choice !== 'use') { add(run, d, name, 'stale-plaintext'); return; }
  try {
    await run.creds.storeVerified(d.id, copy.scope, copy.value);
  } catch {
    add(run, d, name, 'failed');
    return;
  }
  await removeCopy(run, r, 'stale-adopted');
}

/** Store one copy. Returns the copy when it is safe to offer for removal. */
async function migrateCopy(run: Run, d: CredentialDescriptor, copy: PlainTextCopy & { scope: StoredScope }): Promise<Removable | 'stale' | 'failed'> {
  const name = scopeName(copy.scope);
  try {
    const existing = await run.creds.readStored(d.id, copy.scope);
    if (existing && existing !== copy.value) return 'stale';
    if (!existing) await run.creds.storeVerified(d.id, copy.scope, copy.value);
  } catch {
    add(run, d, name, 'failed');
    return 'failed';
  }
  add(run, d, name, 'migrated');
  return { d, settingKey: d.settingKey, label: d.label, scope: copy.scope, value: copy.value };
}

async function migrateCredential(run: Run, d: CredentialDescriptor): Promise<Removable[]> {
  const ready: Removable[] = [];
  let anyFailed = false;
  for (const copy of run.config.inspect(d.settingKey)) {
    if (copy.scope !== 'user') run.rotationAdvised = true;
    if (copy.scope === 'folder') { add(run, d, scopeName('folder', copy.folder), 'ignored-folder-copy'); continue; }
    const scoped = copy as PlainTextCopy & { scope: StoredScope };
    const result = await migrateCopy(run, d, scoped);
    if (result === 'stale') await handleStale(run, d, scoped);
    else if (result === 'failed') anyFailed = true;
    else ready.push(result);
  }
  // A credential with a failed copy keeps all its plain text: the operator
  // may still depend on it until every copy is safely stored.
  if (anyFailed) { for (const r of ready) add(run, r, scopeName(r.scope), 'plaintext-kept'); return []; }
  return ready;
}

function orphanCopies(run: Run): Removable[] {
  const out: Removable[] = [];
  for (const settingKey of ORPHANED_SECRET_SETTINGS) {
    for (const copy of run.config.inspect(settingKey)) {
      if (copy.scope !== 'user') run.rotationAdvised = true;
      if (copy.scope === 'folder') { add(run, { label: settingKey, settingKey }, scopeName('folder', copy.folder), 'ignored-folder-copy'); continue; }
      out.push({ settingKey, label: settingKey, scope: copy.scope, value: copy.value });
    }
  }
  return out;
}

function summarize(migrated: Removable[], orphans: Removable[]): RemovalSummary {
  const uniq = (xs: string[]): string[] => [...new Set(xs)];
  return {
    credentials: uniq(migrated.map((r) => r.label)),
    fromWorkspace: uniq(migrated.filter((r) => r.scope === 'workspace').map((r) => r.label)),
    orphans: uniq(orphans.map((r) => r.settingKey)),
  };
}

export async function migrateCredentials(
  creds: IntegrationCredentials, config: ConfigurationInspector,
  prompts: MigrationPrompts, logger: CredentialLogger,
): Promise<MigrationReport> {
  const run: Run = { creds, config, prompts, lines: [], rotationAdvised: false, settingsSyncNote: false };
  const removable: Removable[] = [];
  for (const d of CREDENTIALS) removable.push(...await migrateCredential(run, d));
  const orphans = orphanCopies(run);
  const all = [...removable, ...orphans];
  const consent = all.length > 0 ? await prompts.confirmRemoval(summarize(removable, orphans)) : false;
  for (const r of all) {
    if (consent) await removeCopy(run, r, 'plaintext-removed');
    else add(run, r, scopeName(r.scope), 'plaintext-kept');
  }
  const ok = !run.lines.some((l) => l.outcome === 'failed' || l.outcome === 'removal-failed');
  logger.info('Integration credential migration finished', {
    outcomes: run.lines.map((l) => `${l.settingKey}@${l.scope}:${l.outcome}`),
  });
  return { lines: run.lines, rotationAdvised: run.rotationAdvised, settingsSyncNote: run.settingsSyncNote, ok };
}

const OUTCOME_TEXT: Record<MigrationOutcome, string> = {
  'migrated': 'moved to Secure Storage',
  'failed': 'NOT moved; Secure Storage did not accept or return it. The setting was left unchanged',
  'stale-plaintext': 'differs from the stored value; both were left as they are',
  'stale-discarded': 'plain-text copy removed; the stored value was kept',
  'stale-adopted': 'plain-text value stored (replacing the old one) and removed from settings',
  'plaintext-kept': 'plain-text copy left in settings',
  'plaintext-removed': 'plain-text copy removed from settings',
  'removal-failed': 'plain-text copy could NOT be removed; remove it by hand',
  'ignored-folder-copy': 'VS Code ignores folder copies of this setting; remove it from that folder\'s .vscode/settings.json by hand',
};

export const ROTATION_ADVICE =
  'A credential was found in workspace or folder settings, which may have been committed to Git or shared. ' +
  'Rotate it at the provider; moving it does not un-share it.';

export const SETTINGS_SYNC_NOTE =
  'Removing a user setting also removes it on other machines that use Settings Sync; set the credential there with "FailSafe: Set Integration Credential".';

/** The one removal question. Names the credentials that came from workspace settings. */
export function removalQuestion(s: RemovalSummary): string {
  const parts: string[] = [];
  if (s.credentials.length) parts.push(`Stored in Secure Storage and verified: ${s.credentials.join(', ')}.`);
  if (s.fromWorkspace.length) parts.push(`From this workspace's settings: ${s.fromWorkspace.join(', ')}.`);
  if (s.orphans.length) parts.push(`Not used by FailSafe: ${s.orphans.join(', ')}.`);
  return `${parts.join(' ')} Remove these plain-text copies from settings?`;
}

/** Plain-text report lines. Never contains a credential value. */
export function renderMigrationReport(report: MigrationReport): string[] {
  const out = report.lines.map((l) => `${l.label} (${l.scope}): ${OUTCOME_TEXT[l.outcome]}.`);
  if (report.rotationAdvised) out.push(ROTATION_ADVICE);
  if (report.settingsSyncNote) out.push(SETTINGS_SYNC_NOTE);
  return out;
}
