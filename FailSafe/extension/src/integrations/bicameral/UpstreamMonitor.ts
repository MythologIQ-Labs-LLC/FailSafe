// UpstreamMonitor — periodic-poll service surfacing Bicameral upstream
// release + open-issue counts to the Integrations Settings card.
// Plan: docs/plan-qor-bicameral-cluster-high.md Phase 4.
//
// Safety posture:
// - Anchored host (https://api.github.com only)
// - Regex-allowlist on owner/repo slug (no URL injection)
// - Unauthenticated GitHub REST (60 req/hour quota; default 24h poll = 2 req/day)
// - Fail-closed on invalid config: snapshot.error set, no fetch issued

import type { Logger } from '../../shared/Logger';
import type { UpstreamSnapshot } from './types';

interface ConfigProviderLike {
  getNumber?(key: string, defaultValue: number): number;
  getString?(key: string, defaultValue: string): string;
  /** Some ConfigManagers expose getConfig() returning the merged tree. */
  getConfig?(): unknown;
}

export interface UpstreamMonitorDeps {
  httpFetch: typeof fetch;
  configProvider: ConfigProviderLike;
  logger: Logger;
}

export class UpstreamMonitor {
  // Allowlist: GitHub `owner/repo` slug pattern. No slashes within segments,
  // no URL-injection vectors, no scheme override.
  private static readonly REPO_SLUG_RE = /^[\w.-]+\/[\w.-]+$/;
  private static readonly DEFAULT_POLL_MS = 86_400_000; // 24h
  private static readonly DEFAULT_REPO = 'BicameralAI/bicameral-mcp';

  private snapshot: UpstreamSnapshot | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly deps: UpstreamMonitorDeps) {}

  start(): void {
    const interval = this.readNumber('failsafe.integrations.bicameral.upstreamPollMs', UpstreamMonitor.DEFAULT_POLL_MS);
    void this.poll();
    this.timer = setInterval(() => void this.poll(), interval);
  }

  getSnapshot(): UpstreamSnapshot | null {
    return this.snapshot;
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    const repo = this.readString('failsafe.integrations.bicameral.upstreamRepoUrl', UpstreamMonitor.DEFAULT_REPO);
    if (!UpstreamMonitor.REPO_SLUG_RE.test(repo)) {
      this.snapshot = this.errorSnapshot(`Invalid upstreamRepoUrl: ${JSON.stringify(repo)} (expected owner/repo slug)`);
      this.deps.logger.warn('UpstreamMonitor blocked invalid repo slug', { repo });
      return;
    }
    try {
      const [releaseRes, issuesRes] = await Promise.all([
        this.deps.httpFetch(`https://api.github.com/repos/${repo}/releases/latest`),
        this.deps.httpFetch(`https://api.github.com/search/issues?q=repo:${repo}+is:open`),
      ]);
      if (!releaseRes.ok || !issuesRes.ok) {
        throw new Error(`upstream fetch returned ${releaseRes.status}/${issuesRes.status}`);
      }
      const release = await releaseRes.json() as { tag_name?: unknown; published_at?: unknown };
      const issues = await issuesRes.json() as { total_count?: unknown };
      this.snapshot = {
        latestVersion: typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : null,
        latestReleasedAt: typeof release.published_at === 'string' ? release.published_at : null,
        openIssueCount: typeof issues.total_count === 'number' ? issues.total_count : null,
        openPrCount: null,
        fetchedAt: new Date().toISOString(),
      };
    } catch (err) {
      this.snapshot = this.errorSnapshot(err instanceof Error ? err.message : String(err));
      this.deps.logger.warn('UpstreamMonitor poll failed', { error: this.snapshot.error });
    }
  }

  private errorSnapshot(error: string): UpstreamSnapshot {
    return {
      latestVersion: null,
      latestReleasedAt: null,
      openIssueCount: null,
      openPrCount: null,
      fetchedAt: new Date().toISOString(),
      error,
    };
  }

  private readNumber(key: string, defaultValue: number): number {
    if (typeof this.deps.configProvider.getNumber === 'function') {
      return this.deps.configProvider.getNumber(key, defaultValue);
    }
    return defaultValue;
  }

  private readString(key: string, defaultValue: string): string {
    if (typeof this.deps.configProvider.getString === 'function') {
      return this.deps.configProvider.getString(key, defaultValue);
    }
    return defaultValue;
  }
}
