// Shared fixtures for the #532 part B delivery suites: a temp `git init` workspace with a
// managed architecture index registering docs/architecture/RUNTIME.md, one commit, and an
// imported intent (tracker-style provenance) in a real IntentService.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { IntentService } from '../../../governance/IntentService';
import { SessionManager } from '../../../governance/SessionManager';
import type { Intent } from '../../../governance/types/IntentTypes';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { removeTempTree } = require('../../../../src/test/shared/removeTempTree.cjs') as { removeTempTree: (dir: string) => void };

export const RUNTIME_ROW = 'runtime';
export const RUNTIME_DOC = 'docs/architecture/RUNTIME.md';
const HEADER = '| id | domain | doc | status | owner | supersedes | related | governance_ref | contract | verification | updated_by |';

export const INDEX_TEXT = ['# Architecture Index', '', '## Registry', '', HEADER, '|---|---|---|---|---|---|---|---|---|---|---|',
  '| architecture-navigation | architecture navigation | [Architecture Index](ARCHITECTURE_INDEX.md) | canonical | manual | - | - | - | unknown | unknown | manual |',
  '| runtime | runtime | [Runtime](architecture/RUNTIME.md) | canonical | manual | - | - | - | unknown | unknown | manual |',
  '', '```architecture-normative', 'docs/architecture/**/*.md', 'docs/ARCHITECTURE*.md', '```', '',
  '```architecture-legacy', 'docs/archive/**', '```', ''].join('\n');

export function git(root: string, ...args: string[]): string {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return String(r.stdout).trim();
}

export function commitAll(root: string, message: string): string {
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=FailSafe-Test', '-c', 'user.email=test@failsafe.invalid', '-c', 'commit.gpgsign=false',
    '-c', 'core.hooksPath=', 'commit', '-q', '--allow-empty', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

export interface DeliveryWorkspace {
  root: string;
  head: string;
  cleanup: () => void;
}

/** A temp repository with the index, RUNTIME.md and one commit. `.failsafe/` is ignored so intent files never show as changes. */
export function deliveryWorkspace(prefix = 'failsafe-delivery-'): DeliveryWorkspace {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  git(root, 'init', '-q');
  fs.mkdirSync(path.join(root, 'docs', 'architecture'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'ARCHITECTURE_INDEX.md'), INDEX_TEXT);
  fs.writeFileSync(path.join(root, ...RUNTIME_DOC.split('/')), '# Runtime\n\nHow the runtime is composed.\n');
  fs.writeFileSync(path.join(root, '.gitignore'), '.failsafe/\n');
  const head = commitAll(root, 'seed architecture index');
  return { root, head, cleanup: () => removeTempTree(root) };
}

export const TRACKER_PROVENANCE = {
  source: 'jira', key: 'PROJ-7', externalRef: 'jira:PROJ-7', url: 'https://acme.atlassian.net/browse/PROJ-7',
  fetchedAt: '2026-10-17T00:00:00.000Z', sourceUpdatedAt: null, contentSha256: 'c'.repeat(64),
  mappedFields: ['purpose', 'type', 'tags', 'externalRef'],
};

export function intentService(root: string): IntentService {
  return new IntentService(root, new SessionManager(root));
}

/** An imported intent (CREATED entry with tracker-style provenance), as the tracker import writes it. */
export async function importedIntent(service: IntentService, purpose = 'PROJ-7 — Deliver the runtime'): Promise<Intent> {
  return service.createIntent({
    type: 'feature', purpose, scope: { files: [], modules: [], riskGrade: 'L1' },
    metadata: { author: 'user', tags: ['jira'], externalRef: 'jira:PROJ-7' }, provenance: { ...TRACKER_PROVENANCE },
  });
}
