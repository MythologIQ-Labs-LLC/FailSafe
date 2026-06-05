// Tracker manifest source gatherer (GH #174). The I/O half of the generator:
// resolves the GitHub repo slug, fetches merged PRs via the `gh` CLI, and reads
// the CHANGELOG. Degrade-safe — any missing tool/file yields empty signal, and
// the pure generator (manifest-generator.ts) handles a thin or empty input.
//
// Network egress happens ONLY here, only when the operator runs the command, and
// only over the operator's existing `gh` auth (read-only PR metadata). No token
// is read, logged, or persisted by FailSafe.

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { ManifestSources, GeneratorPr } from './manifest-generator';
import type { BicameralMcpClient, BicameralFeatureBrief } from '../../integrations/bicameral';

/** owner/repo from the origin remote, or '' if not a GitHub repo. */
export function resolveRepoSlug(workspaceRoot: string): string {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], {
      cwd: workspaceRoot, encoding: 'utf-8', timeout: 4000,
    }).trim();
    const m = /github\.com[:/]+([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(url);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

/** Merged PRs via `gh pr list` (read-only metadata). Empty on any failure. */
export function fetchMergedPrs(repo: string): GeneratorPr[] {
  try {
    const out = execFileSync('gh', [
      'pr', 'list', '-R', repo, '--state', 'merged', '--limit', '300',
      '--json', 'number,title,mergedAt',
    ], { encoding: 'utf-8', timeout: 20000, maxBuffer: 16 * 1024 * 1024 });
    const arr = JSON.parse(out) as Array<{ number: number; title: string; mergedAt?: string }>;
    return arr
      .filter((p) => Number.isFinite(p.number) && typeof p.title === 'string')
      .map((p) => ({ number: p.number, title: p.title, mergedAt: p.mergedAt }));
  } catch {
    return [];
  }
}

function readChangelog(workspaceRoot: string): string {
  try {
    return fs.readFileSync(path.join(workspaceRoot, 'CHANGELOG.md'), 'utf-8');
  } catch {
    return '';
  }
}

/** Gather every available source for the generator. */
export function gatherManifestSources(workspaceRoot: string): ManifestSources {
  const repo = resolveRepoSlug(workspaceRoot);
  return {
    repo,
    prs: repo ? fetchMergedPrs(repo) : [],
    changelog: readChangelog(workspaceRoot),
  };
}

/**
 * Layer 3 (GH #174): the optional Bicameral-MCP enrichment signal. When the
 * Bicameral integration is connected, ingest the repo into its decision graph and
 * return the feature-area briefs (features + governed decisions). Degrade-safe —
 * no client / not connected / any tool error → [] (the generator falls back to
 * the git + CHANGELOG layers). Only the local Bicameral daemon is contacted.
 */
export async function gatherBicameralBriefs(
  client: BicameralMcpClient | null,
  workspaceRoot: string,
): Promise<BicameralFeatureBrief[]> {
  if (!client) return [];
  try {
    await client.ingest({ repoPath: workspaceRoot });
    return await client.history();
  } catch {
    return [];
  }
}
