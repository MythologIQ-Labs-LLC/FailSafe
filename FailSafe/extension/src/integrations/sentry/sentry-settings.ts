/**
 * sentry-settings — the import options from `failsafe.integrations.sentry.*`
 * (#478, LD9). Pure over an injected reader, so the defaults and bounds are
 * testable without VS Code.
 */

import type { SentryOptions } from './sentry-client';

export const DEFAULT_QUERY = 'is:unresolved';
export const DEFAULT_RELEASE_LOOKUPS = 50;
export const MAX_RELEASE_LOOKUPS = 200;

export type SettingReader = (key: string, fallback: unknown) => unknown;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function lookupCap(v: unknown): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) return DEFAULT_RELEASE_LOOKUPS;
  return Math.max(0, Math.min(MAX_RELEASE_LOOKUPS, v));
}

export function readSentrySettings(read: SettingReader): SentryOptions {
  const get = (name: string, fallback: unknown): unknown => read(`integrations.sentry.${name}`, fallback);
  return {
    enabled: get('enabled', false) === true,
    token: text(get('token', '')),
    org: text(get('org', '')),
    project: text(get('project', '')),
    environment: text(get('environment', '')) || undefined,
    apiBaseUrl: text(get('apiBaseUrl', '')) || undefined,
    query: text(get('query', DEFAULT_QUERY)) || DEFAULT_QUERY,
    maxReleaseLookups: lookupCap(get('maxReleaseLookups', DEFAULT_RELEASE_LOOKUPS)),
  };
}
