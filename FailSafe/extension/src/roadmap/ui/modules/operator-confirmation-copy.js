// FailSafe Command Center — operator confirmation copy (#538).
// Console install requests wait for a modal VS Code dialog. These helpers give every
// caller the same pending line and the same reason when nothing ran. Callers keep their
// own fetch (a literal, same-origin target) and pass its promise to settleGated.

export const CONFIRM_PENDING_TEXT = 'Confirm in the VS Code dialog…';

/**
 * Why a gated request did nothing, from the server's `confirmation` field; otherwise the
 * server's own error text (request-guard refusals, ledger failure, install errors).
 * @param {number} status HTTP status
 * @param {object} body parsed response body
 * @param {string} noun past participle for "nothing was …" (installed, uninstalled, opened)
 */
export function gatedFailureMessage(status, body, noun = 'run') {
  const c = body && body.confirmation;
  if (c === 'declined') return `Not confirmed in VS Code; nothing was ${noun}.`;
  if (c === 'busy') return `Another confirmation is open in VS Code; nothing was ${noun}.`;
  if (c === 'expired') return `The VS Code confirmation expired; nothing was ${noun}. Try again.`;
  if (c === 'unwired') return `Operator confirmation is unavailable; nothing was ${noun}.`;
  return (body && body.error) || `Request failed (${status})`;
}

/** Request options for a JSON POST (the server refuses any other content type). */
export function jsonPost(payload = {}) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) };
}

/** Await a fetch promise; never throws. Resolves `{ ok, status, body }` (status 0 on a network error). */
export async function settleGated(request) {
  try {
    const res = await request;
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok && body?.ok !== false && body?.status !== 'error', status: res.status, body };
  } catch (err) {
    return { ok: false, status: 0, body: { error: String(err) } };
  }
}
