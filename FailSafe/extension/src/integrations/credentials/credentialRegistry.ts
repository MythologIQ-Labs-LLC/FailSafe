/**
 * credentialRegistry - which integration settings hold a credential, and the
 * Secret Storage key each one is kept under (#482, FX962).
 *
 * The seven settings are window-scoped (package.json declares no scope), so
 * VS Code applies only their user and workspace values; folder values are
 * ignored. A stored credential therefore has two scopes: user, and the
 * current workspace (keyed by a hash of the workspace identity).
 */

import * as crypto from 'crypto';

export type CredentialId =
  | 'sentry.token' | 'jira.apiToken' | 'linear.apiKey' | 'github.token'
  | 'continue.apiKey' | 'slack.webhookUrl' | 'teams.webhookUrl';

export interface CredentialDescriptor {
  id: CredentialId;
  /** Full setting key, e.g. failsafe.integrations.linear.apiKey. */
  settingKey: string;
  /** What the value is, for prompts and reports. */
  label: string;
  /** The provider name used in messages. */
  provider: string;
}

export const CREDENTIALS: readonly CredentialDescriptor[] = Object.freeze([
  { id: 'sentry.token', settingKey: 'failsafe.integrations.sentry.token', label: 'Sentry auth token', provider: 'Sentry' },
  { id: 'jira.apiToken', settingKey: 'failsafe.integrations.jira.apiToken', label: 'Jira API token', provider: 'Jira' },
  { id: 'linear.apiKey', settingKey: 'failsafe.integrations.linear.apiKey', label: 'Linear API key', provider: 'Linear' },
  { id: 'github.token', settingKey: 'failsafe.integrations.github.token', label: 'GitHub token', provider: 'GitHub' },
  { id: 'continue.apiKey', settingKey: 'failsafe.integrations.continue.apiKey', label: 'Continue API key', provider: 'Continue' },
  { id: 'slack.webhookUrl', settingKey: 'failsafe.integrations.slack.webhookUrl', label: 'Slack webhook URL', provider: 'Slack' },
  { id: 'teams.webhookUrl', settingKey: 'failsafe.integrations.teams.webhookUrl', label: 'Microsoft Teams webhook URL', provider: 'Microsoft Teams' },
].map((d) => Object.freeze(d as CredentialDescriptor)));

/** Plain-text settings FailSafe never reads; migration only offers to remove them. */
export const ORPHANED_SECRET_SETTINGS: readonly string[] = Object.freeze(['failsafe.qorelogic.externalRuntime.apiKey']);

export const SET_COMMAND_TITLE = 'FailSafe: Set Integration Credential';

export function descriptor(id: CredentialId): CredentialDescriptor {
  const d = CREDENTIALS.find((c) => c.id === id);
  if (!d) throw new Error(`Unknown integration credential: ${id}`);
  return d;
}

export function descriptorForSetting(settingKey: string): CredentialDescriptor | undefined {
  return CREDENTIALS.find((c) => c.settingKey === settingKey);
}

/** Where a stored credential lives. */
export type StoredScope = 'user' | 'workspace';

/** Where a plain-text copy was found. Folder copies are never applied by VS Code. */
export interface PlainTextCopy {
  scope: StoredScope | 'folder';
  value: string;
  /** Folder path, for folder copies only. */
  folder?: string;
}

const KEY_PREFIX = 'failsafe.credential.v1';

export function isCredentialKey(key: string): boolean {
  return key.startsWith(`${KEY_PREFIX}:`);
}

export function workspaceHash(identity: string): string {
  return crypto.createHash('sha256').update(identity, 'utf8').digest('hex').slice(0, 16);
}

/** The Secret Storage key, or undefined for a workspace scope with no workspace open. */
export function secretKey(id: CredentialId, scope: StoredScope, workspaceIdentity: string | undefined): string | undefined {
  if (scope === 'user') return `${KEY_PREFIX}:${id}`;
  return workspaceIdentity ? `${KEY_PREFIX}:${id}:workspace:${workspaceHash(workspaceIdentity)}` : undefined;
}

export function scopeName(scope: StoredScope | 'folder', folder?: string): string {
  if (scope === 'user') return 'User';
  if (scope === 'workspace') return 'Workspace';
  return folder ? `Folder ${folder}` : 'Folder';
}
