/**
 * sentry-settings — the import options from `failsafe.integrations.sentry.*`
 * (#478, LD9). Pure over an injected reader, so the defaults and bounds are
 * testable without VS Code. The token and API base URL never come from the
 * reader: they arrive together from providerConnection (#482), so a user
 * token is never sent to a workspace-chosen endpoint.
 */

import type { SentryOptions } from './sentry-client';
import type { IntegrationCredentials } from '../credentials/IntegrationCredentials';
import {
  providerConnection, setCommandHint,
  type Connection, type CredentialUi, type EndpointReader,
} from '../credentials/credentialGates';

export const DEFAULT_QUERY = 'is:unresolved';
export const DEFAULT_RELEASE_LOOKUPS = 50;
export const MAX_RELEASE_LOOKUPS = 200;

export type SettingReader = (key: string, fallback: unknown) => unknown;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function lookupCap(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) return DEFAULT_RELEASE_LOOKUPS;
  return Math.max(0, Math.min(MAX_RELEASE_LOOKUPS, v));
}

export function readSentrySettings(read: SettingReader, connection: Connection | undefined): SentryOptions {
  const get = (name: string, fallback: unknown): unknown => read(`integrations.sentry.${name}`, fallback);
  return {
    enabled: get('enabled', false) === true,
    token: connection?.credential.trim() ?? '',
    org: text(get('org', '')),
    project: text(get('project', '')),
    environment: text(get('environment', '')) || undefined,
    apiBaseUrl: connection?.endpoint?.trim() || undefined,
    query: text(get('query', DEFAULT_QUERY)) || DEFAULT_QUERY,
    maxReleaseLookups: lookupCap(get('maxReleaseLookups', DEFAULT_RELEASE_LOOKUPS)),
  };
}

/**
 * The import options, or undefined when the operator has been told why the
 * import cannot run. A disabled import still returns options, so the import
 * reports "disabled" as before without consulting credentials.
 */
export function resolveSentryOptions(
  read: SettingReader, creds: IntegrationCredentials, endpoints: EndpointReader, ui: CredentialUi,
): SentryOptions | undefined {
  if (read('integrations.sentry.enabled', false) !== true) return readSentrySettings(read, undefined);
  const notConfigured = `Sentry import has no auth token. ${setCommandHint('Sentry auth token')}`;
  const conn = providerConnection(creds, endpoints, 'sentry', ui, notConfigured);
  return conn ? readSentrySettings(read, conn) : undefined;
}
