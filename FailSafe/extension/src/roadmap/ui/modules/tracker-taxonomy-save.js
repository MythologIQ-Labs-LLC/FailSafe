/**
 * Workspace › Taxonomy — the Save request and the meaning of its answer (B331).
 *
 * postTaxonomy sends one Save with the editor's fingerprint and gives up after
 * `timeoutMs` (the outcome is then unknown: the server may or may not have written).
 * saveVerdict turns an outcome into what the editor must do; it never touches the DOM.
 */

import { isPlainObject, list } from './tracker-taxonomy-drift.js';

/** One POST: { kind: 'response', res, data } | { kind: 'timeout' } | { kind: 'network' }. */
export async function postTaxonomy(config, fingerprint, timeoutMs) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => { ac?.abort(); resolve({ kind: 'timeout' }); }, timeoutMs);
  });
  const request = (async () => {
    try {
      const res = await fetch('/api/v1/tracker/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, fingerprint }),
        signal: ac?.signal,
      });
      let data = null;
      try { data = await res.json(); } catch { data = null; }
      return { kind: 'response', res, data };
    } catch {
      return { kind: ac?.signal.aborted ? 'timeout' : 'network' };
    }
  })();
  try { return await Promise.race([request, timeout]); } finally { clearTimeout(timer); }
}

/**
 * What a Save outcome means:
 *   { adopt: true, fingerprint, drift, status }  the file was written (fully, or the
 *                                                taxonomy without its directive record)
 *   { conflict: 'disk', status }                 409 changed-on-disk
 *   { status }                                   anything else: nothing moves
 */
export function saveVerdict(outcome, currentDrift) {
  if (outcome.kind === 'timeout') {
    return { status: 'Save outcome unknown: the Console did not answer in time. Your edits are kept; reload the Console to see whether the file was saved.' };
  }
  if (outcome.kind === 'network') return { status: 'Save failed (is the Console server running?)' };
  const { res, data } = outcome;
  const detail = isPlainObject(data) && data.detail ? ` (${data.detail})` : '';
  if (isPlainObject(data) && data.error === 'directive-write-failed' && typeof data.fingerprint === 'string') {
    return { adopt: true, fingerprint: data.fingerprint, drift: currentDrift, status: `Saved docs/roadmap/tracker-config.yaml, but the governed directive record could not be written${detail}.` };
  }
  if (res.status === 409 || (isPlainObject(data) && data.error === 'changed-on-disk')) {
    return { conflict: 'disk', status: `Not saved: the taxonomy file changed on disk since this view loaded it${detail}. Your edits are kept; use "Discard my edits and reload from disk", or Reload the Console.` };
  }
  if (!res.ok || !isPlainObject(data) || data.ok !== true) {
    return { status: `Error: ${(isPlainObject(data) && data.error) || `save failed (HTTP ${res.status})`}${detail}` };
  }
  return {
    adopt: true,
    fingerprint: typeof data.fingerprint === 'string' ? data.fingerprint : null,
    drift: isPlainObject(data.drift) ? data.drift : null,
    status: `Saved → ${list(data.written).join(', ')}`,
  };
}
