// Phase 4 helper: render the "Upstream" row + version-floor warning for the
// Bicameral Settings card. Pure function so it tests cleanly without JSDOM
// boilerplate; bicameral-card.js / bicameral-settings-card.js import the
// compiled .js and inject into their respective DOM trees.
//
// Plan: docs/plan-qor-bicameral-cluster-high.md Phase 4 (FX534).

import type { UpstreamSnapshot } from './types';
import { compareSemver } from './semver';

export interface UpstreamRowOpts {
  snapshot: UpstreamSnapshot | null;
  installedVersion: string | null;
  minVersion: string;     // e.g. '0.14.0'
  maxVersion: string;     // exclusive ceiling, e.g. '0.16.0'
}

export interface UpstreamRowRender {
  /** Empty when snapshot is null (the card hides the row entirely). */
  upstream: string;
  /** Empty when no warning applies. */
  warning: string;
}

const escapeHtml = (s: string): string => s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export function renderUpstreamRow(opts: UpstreamRowOpts): UpstreamRowRender {
  if (!opts.snapshot) return { upstream: '', warning: '' };
  const s = opts.snapshot;
  const version = s.latestVersion ?? 'unknown';
  const released = s.latestReleasedAt
    ? new Date(s.latestReleasedAt).toISOString().slice(0, 10)
    : 'unknown';
  const issues = s.openIssueCount ?? 0;
  const upstream = `<div class="cc-row" data-bicameral-upstream>`
    + `<span class="cc-label">Upstream</span>`
    + `<span class="cc-value">v${escapeHtml(version)} (${escapeHtml(released)}) · `
    + `${issues} open issue${issues === 1 ? '' : 's'}</span>`
    + `</div>`;
  let warning = '';
  if (opts.installedVersion) {
    if (compareSemver(opts.installedVersion, opts.minVersion) < 0) {
      warning = `<div class="cc-warning" data-bicameral-floor-warning>`
        + `Installed v${escapeHtml(opts.installedVersion)} is below the floor v${escapeHtml(opts.minVersion)}. `
        + `Re-install to pick up the supported range.</div>`;
    } else if (compareSemver(opts.installedVersion, opts.maxVersion) >= 0) {
      warning = `<div class="cc-warning" data-bicameral-ceiling-warning>`
        + `Installed v${escapeHtml(opts.installedVersion)} is above the tested ceiling v${escapeHtml(opts.maxVersion)} (exclusive). `
        + `Behavior may diverge from FailSafe's tested surface.</div>`;
    }
  }
  return { upstream, warning };
}

