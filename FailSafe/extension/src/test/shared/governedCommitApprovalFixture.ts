/**
 * Test-only content-bound approval fixtures for mocked Git transport tests.
 * No production module imports this. Real Git approval/security tests remain
 * authoritative for filesystem behavior and negative content-race coverage.
 */
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { GitRunner } from '../../extension/governedCommit';

const ok = (stdout = '') => ({ code: 0, stdout, stderr: '' });
const refused = () => ({ code: 1, stdout: '', stderr: 'fixture file unavailable' });

export function createApprovalFixture(files: string[]) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-approval-fixture-'));
  const names = new Set(files);
  for (const name of names) {
    const absolute = path.join(workspaceRoot, name);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, 'selected file fixture\n');
  }
  const contentId = (name: string): string | null => {
    if (!names.has(name)) return null;
    try {
      const bytes = fs.readFileSync(path.join(workspaceRoot, name));
      return crypto.createHash('sha1').update(Buffer.concat([
        Buffer.from('blob ' + bytes.length + '\0'), bytes,
      ])).digest('hex');
    } catch { return null; }
  };
  const selected = (args: string[]): string[] => {
    const separator = args.indexOf('--');
    return separator < 0 ? [] : args.slice(separator + 1)
      .filter(item => item.startsWith(':(literal)'))
      .map(item => item.slice(':(literal)'.length));
  };
  const wrap = (delegate: GitRunner): GitRunner => async (args, cwd) => {
    if (cwd !== workspaceRoot) return delegate(args, cwd);
    if (args[0] === 'rev-parse' && args.includes('--is-inside-work-tree')) return ok('true');
    if (args[0] === 'rev-parse' && args.includes('--show-prefix')) return ok('');
    if (args.includes('status') && args.includes('--porcelain=v1') && args.includes('-z')) {
      const paths = selected(args);
      if (paths.some(name => contentId(name) === null)) return refused();
      return ok(paths.map(name => ' M ' + name + '\0').join(''));
    }
    if (args[0] === 'hash-object' && args.includes('--no-filters')) {
      const id = contentId(args[args.length - 1]);
      return id ? ok(id) : refused();
    }
    if (args[0] === 'ls-files' && args.includes('--stage') && args.includes('-z')) {
      const paths = selected(args);
      if (paths.some(name => contentId(name) === null)) return refused();
      return ok(paths.map(name =>
        '100644 ' + contentId(name) + ' 0\t' + name + '\0').join(''));
    }
    return delegate(args, cwd);
  };
  return { workspaceRoot, wrap, cleanup: () => fs.rmSync(workspaceRoot, { recursive: true, force: true }) };
}
