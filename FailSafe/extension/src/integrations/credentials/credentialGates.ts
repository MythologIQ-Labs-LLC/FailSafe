/**
 * credentialGates - how an integration obtains its credential (#482, FX965).
 *
 * Every consumer goes through requireCredential / providerConnection, so no
 * integration reads a credential setting. A plain-text copy is never used:
 * the integration is not called and the operator is asked to move it. For
 * GitHub, Sentry and Jira the endpoint comes from the same call, so a user
 * credential is never sent to an endpoint that workspace settings chose.
 */

import { descriptor, SET_COMMAND_TITLE, type CredentialId, type StoredScope } from './credentialRegistry';
import type { IntegrationCredentials } from './IntegrationCredentials';

export const MOVE_ACTION = 'Move to Secure Storage';

export interface CredentialUi {
  warn(message: string, ...actions: string[]): PromiseLike<string | undefined> | void;
  /** Runs the migration flow when the operator picks MOVE_ACTION. */
  moveToSecureStorage?(): void;
}

export const moveMessage = (provider: string): string =>
  `The ${provider} credential is still in plain-text settings. Move it to Secure Storage to use it.`;

export const unavailableMessage = (provider: string): string =>
  `Secure Storage is unavailable; ${provider} was not called.`;

export const endpointRefusalMessage = (provider: string): string =>
  `This workspace's settings set the ${provider} endpoint, but the credential is your user-level one. ` +
  'FailSafe will not send it there. Set a Workspace credential for this workspace, or move the endpoint setting to User settings.';

export const setCommandHint = (label: string): string => `Run "${SET_COMMAND_TITLE}" to store the ${label}.`;

export const disabledMessage = (feature: string, enabledKey: string, label: string): string =>
  `${feature} is disabled. Enable \`${enabledKey}\`, then run "${SET_COMMAND_TITLE}" to store the ${label}.`;

type Evaluation =
  | { kind: 'value'; value: string; scope: StoredScope }
  | { kind: 'plaintext' | 'unavailable' | 'none' };

function evaluate(creds: IntegrationCredentials, id: CredentialId): Evaluation {
  const r = creds.resolve(id);
  if (r.unavailable) return { kind: 'unavailable' };
  // A workspace plain-text copy outranks a user secret in VS Code; using the
  // user secret would act under a credential the workspace did not intend.
  if (r.value && r.scope === 'user' && r.plaintextScopes.includes('workspace')) return { kind: 'plaintext' };
  if (r.value && r.scope) return { kind: 'value', value: r.value, scope: r.scope };
  return { kind: r.plaintextPending ? 'plaintext' : 'none' };
}

function tell(ui: CredentialUi, message: string, offerMove: boolean): void {
  const answer = offerMove ? ui.warn(message, MOVE_ACTION) : ui.warn(message);
  if (offerMove && answer && typeof answer.then === 'function') {
    void Promise.resolve(answer).then((choice) => { if (choice === MOVE_ACTION) ui.moveToSecureStorage?.(); });
  }
}

/** Tell the operator why there is no usable credential. */
function explain(e: Evaluation, id: CredentialId, ui: CredentialUi, notConfigured: string | undefined): void {
  const provider = descriptor(id).provider;
  if (e.kind === 'plaintext') tell(ui, moveMessage(provider), true);
  else if (e.kind === 'unavailable') tell(ui, unavailableMessage(provider), false);
  else if (e.kind === 'none' && notConfigured) tell(ui, notConfigured, false);
}

/** The stored credential, or undefined after telling the operator why not. */
export function requireCredential(
  creds: IntegrationCredentials, id: CredentialId, ui: CredentialUi, notConfigured: string,
): string | undefined {
  const e = evaluate(creds, id);
  if (e.kind === 'value') return e.value;
  explain(e, id, ui, notConfigured);
  return undefined;
}

/**
 * For a credential the provider can run without (Continue): no credential at
 * all is fine; a plain-text copy or unreadable storage is not.
 */
export function optionalCredential(
  creds: IntegrationCredentials, id: CredentialId, ui: CredentialUi,
): { ok: boolean; value?: string } {
  const e = evaluate(creds, id);
  if (e.kind === 'value') return { ok: true, value: e.value };
  if (e.kind === 'none') return { ok: true };
  explain(e, id, ui, undefined);
  return { ok: false };
}

/** The governed-commit PR step's token. Without one the commit is still made; only the PR step is skipped. */
export function governedCommitToken(creds: IntegrationCredentials, ui: CredentialUi): string | undefined {
  const e = evaluate(creds, 'github.token');
  if (e.kind === 'value') return e.value;
  explain(e, 'github.token', ui, undefined);
  return undefined;
}

// ---- endpoint trust (LD7) ----

export type EndpointScope = 'default' | 'user' | 'workspace';

export interface EndpointReader {
  /** The effective value of an endpoint setting and the scope it came from. */
  endpoint(settingKey: string): { value?: string; scope: EndpointScope };
}

export type EndpointProvider = 'github' | 'sentry' | 'jira';

export const ENDPOINTS: Readonly<Record<EndpointProvider, { credential: CredentialId; setting: string }>> = Object.freeze({
  github: { credential: 'github.token', setting: 'failsafe.integrations.github.apiBaseUrl' },
  sentry: { credential: 'sentry.token', setting: 'failsafe.integrations.sentry.apiBaseUrl' },
  jira: { credential: 'jira.apiToken', setting: 'failsafe.integrations.jira.baseUrl' },
});

export interface Connection { credential: string; endpoint?: string }

type ConnectionCheck = { ok: true; connection: Connection } | { ok: false; refusedEndpoint: boolean; e: Evaluation };

function checkConnection(creds: IntegrationCredentials, endpoints: EndpointReader, provider: EndpointProvider): ConnectionCheck {
  const { credential, setting } = ENDPOINTS[provider];
  const e = evaluate(creds, credential);
  if (e.kind !== 'value') return { ok: false, refusedEndpoint: false, e };
  const ep = endpoints.endpoint(setting);
  const endpoint = ep.value?.trim() || undefined;
  if (endpoint && ep.scope === 'workspace' && e.scope === 'user') return { ok: false, refusedEndpoint: true, e };
  return { ok: true, connection: { credential: e.value, endpoint } };
}

/** The credential and the endpoint it may be sent to, or undefined after telling the operator why not. */
export function providerConnection(
  creds: IntegrationCredentials, endpoints: EndpointReader, provider: EndpointProvider,
  ui: CredentialUi, notConfigured: string,
): Connection | undefined {
  const c = checkConnection(creds, endpoints, provider);
  if (c.ok) return c.connection;
  const id = ENDPOINTS[provider].credential;
  if (c.refusedEndpoint) tell(ui, endpointRefusalMessage(descriptor(id).provider), false);
  else explain(c.e, id, ui, notConfigured);
  return undefined;
}

// ---- catalog snapshot ----

const PROVIDER_BY_CREDENTIAL = new Map<string, EndpointProvider>(
  (Object.keys(ENDPOINTS) as EndpointProvider[]).map((p) => [descriptor(ENDPOINTS[p].credential).settingKey, p]),
);

function credentialForSetting(settingKey: string): CredentialId | undefined {
  const m = /^failsafe\.integrations\.(.+)$/.exec(settingKey);
  const id = m?.[1] as CredentialId | undefined;
  try { return id && descriptor(id).settingKey === settingKey ? id : undefined; } catch { return undefined; }
}

/**
 * Booleans only: a credential key is configured when the command would use
 * it; every other key is on (true) or non-empty (string).
 */
export function buildCredentialSnapshot(
  creds: IntegrationCredentials, endpoints: EndpointReader,
  readSetting: (key: string) => unknown, keys: readonly string[],
): Record<string, boolean> {
  const snapshot: Record<string, boolean> = {};
  for (const key of keys) {
    const id = credentialForSetting(key);
    const provider = PROVIDER_BY_CREDENTIAL.get(key);
    if (provider) snapshot[key] = checkConnection(creds, endpoints, provider).ok;
    else if (id) snapshot[key] = evaluate(creds, id).kind === 'value';
    else {
      const value = readSetting(key);
      snapshot[key] = value === true ? true : typeof value === 'string' ? value.trim().length > 0 : false;
    }
  }
  return snapshot;
}

// ---- notifiers ----

export type NotifierChannel = 'Slack' | 'Teams';

const NOTIFIER_CREDENTIAL: Record<NotifierChannel, CredentialId> = { Slack: 'slack.webhookUrl', Teams: 'teams.webhookUrl' };

/**
 * The notifier's config. A disabled channel never consults credentials. An
 * enabled channel without a usable webhook skips delivery and warns once.
 */
export function notifierConfig(
  creds: IntegrationCredentials, channel: NotifierChannel, enabled: boolean,
  ui: CredentialUi, warned: Set<string>,
): { enabled: boolean; webhookUrl?: string } {
  if (!enabled) return { enabled: false };
  const id = NOTIFIER_CREDENTIAL[channel];
  const e = evaluate(creds, id);
  if (e.kind === 'value') return { enabled: true, webhookUrl: e.value };
  if (!warned.has(channel)) {
    warned.add(channel);
    explain(e, id, ui, `${channel} notifications are enabled but no webhook is stored. ${setCommandHint(descriptor(id).label)}`);
  }
  return { enabled: true };
}

/** The once-per-channel warning when a webhook post fails. */
export function notifyFailureText(channel: NotifierChannel, reason: string): string {
  return `FailSafe governance alerts are not reaching ${channel} (${reason}). ` +
    `Check the webhook with "${SET_COMMAND_TITLE}"; see the FailSafe output channel for details.`;
}
