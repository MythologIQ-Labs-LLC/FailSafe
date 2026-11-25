/**
 * Governed commit push-target binding (#476).
 *
 * Git's fetch remote is NOT its effective push URL: remote.origin.pushurl and
 * url.*.pushInsteadOf may redirect outgoing writes without changing the
 * displayed origin. Validate both before asking for approval and before push.
 * This is a preflight, not a guarantee against a concurrent Git-config race.
 */
import { bindGitRemote, type GitRepoIdentity } from '../integrations/github-checks/github-checks-map';
import { apiBaseFor } from '../integrations/github-checks/github-host-affinity';
import type { GitRunner } from './governedCommit';

export type PushBinding =
  | { ok: true; pushUrl: string; identity: GitRepoIdentity; apiOrigin: string }
  | { ok: false; error: string };

/** Read exactly one bound effective push URL, never guess a target from origin. */
export async function inspectPushBinding(
  git: GitRunner, cwd: string, remoteUrl: string, apiBaseUrl?: string,
): Promise<PushBinding> {
  const api = apiBaseFor(apiBaseUrl);
  if (!api.ok) return { ok: false, error: 'GitHub API destination is invalid' };
  const custom = Boolean(apiBaseUrl?.trim());
  const fetchId = bindGitRemote(remoteUrl, api.base.apiHost, custom);
  if (!fetchId) return { ok: false, error: 'Git fetch remote is not bound to the GitHub API destination' };

  let push;
  try { push = await git(['remote', 'get-url', '--push', '--all', 'origin'], cwd); }
  catch { return { ok: false, error: 'Git push destination cannot be read' }; }
  if (push.code !== 0) return { ok: false, error: 'Git push destination cannot be read' };
  const urls = push.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (urls.length !== 1) return { ok: false, error: 'Git must resolve exactly one push destination' };
  const pushId = bindGitRemote(urls[0], api.base.apiHost, custom);
  if (!pushId || pushId.host !== fetchId.host ||
      pushId.owner.toLowerCase() !== fetchId.owner.toLowerCase() ||
      pushId.repo.toLowerCase() !== fetchId.repo.toLowerCase()) {
    return { ok: false, error: 'Git push destination differs from the authorized repository' };
  }
  return { ok: true, pushUrl: urls[0], identity: fetchId, apiOrigin: api.base.origin };
}
