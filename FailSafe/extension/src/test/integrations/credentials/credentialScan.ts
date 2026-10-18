// FX965 source scan (#482): finds code that reads an integration credential
// or credential endpoint from settings instead of going through
// credentialGates. Shared by credentialConsumers.test.ts and the red run
// against the pre-change tree.

import * as fs from 'fs';
import * as path from 'path';

const SECRET_NAMES = '(?:token|apiKey|apiToken|webhookUrl|apiBaseUrl|baseUrl)';
const QUALIFIED = new RegExp(`\\bget\\s*(?:<[^>]*>)?\\s*\\(\\s*['"\`](?:failsafe\\.)?integrations\\.\\w+\\.${SECRET_NAMES}['"\`]`, 'g');
const BARE = new RegExp(`\\bget\\s*(?:<[^>]*>)?\\s*\\(\\s*['"\`]${SECRET_NAMES}['"\`]`, 'g');

/** The LD2 consumers and the gate each must use. */
export const CONSUMERS: Readonly<Record<string, RegExp>> = Object.freeze({
  'extension/main.ts': /\bnotifierConfig\(/,
  'extension/github-checks-command.ts': /\bproviderConnection\(/,
  'extension/jira-command.ts': /\bproviderConnection\(/,
  'extension/linear-command.ts': /\brequireCredential\(/,
  'extension/agent-cli-command.ts': /\boptionalCredential\(/,
  'extension/bootstrapServers.ts': /\bgovernedCommitPrStep\(\s*governedCommitConnection\(/,
  'integrations/sentry/sentry-settings.ts': /\bproviderConnection\(/,
});

const EXCLUDED = [path.join('integrations', 'credentials'), 'test'];

function walk(dir: string, rel = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? path.join(rel, entry.name) : entry.name;
    if (EXCLUDED.includes(r)) continue;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), r));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(r);
  }
  return out;
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

/** Every violation as "<file>:<line>: <reason>". Empty means clean. */
export function findCredentialReads(srcRoot: string): string[] {
  const found: string[] = [];
  for (const rel of walk(srcRoot)) {
    const text = fs.readFileSync(path.join(srcRoot, rel), 'utf8');
    const posix = rel.split(path.sep).join('/');
    const patterns = posix in CONSUMERS ? [QUALIFIED, BARE] : [QUALIFIED];
    for (const re of patterns) {
      for (const m of text.matchAll(re)) found.push(`${posix}:${lineOf(text, m.index ?? 0)}: reads ${m[0]}`);
    }
  }
  const servers = path.join(srcRoot, 'extension', 'bootstrapServers.ts');
  if (fs.existsSync(servers)) {
    const text = fs.readFileSync(servers, 'utf8');
    const loop = /for\s*\(\s*const\s+key\s+of\s+catalogConfigKeys\(\)\s*\)/.exec(text);
    if (loop) found.push(`extension/bootstrapServers.ts:${lineOf(text, loop.index)}: builds the catalog snapshot from raw settings`);
    if (!/\bbuildCredentialSnapshot\(/.test(text)) found.push('extension/bootstrapServers.ts: does not use buildCredentialSnapshot');
    // #538: the governed-commit PR step takes its token and endpoint only from governedCommitPrStep.
    const flow = /runGovernedCommitFlow\([\s\S]*?\n\s*\}\);/.exec(text);
    if (flow && /^\s*(?:token|apiBaseUrl|post)\s*[:,]/m.test(flow[0])) {
      found.push(`extension/bootstrapServers.ts:${lineOf(text, flow.index)}: passes the PR token, endpoint or transport outside governedCommitPrStep`);
    }
  }
  for (const [rel, gate] of Object.entries(CONSUMERS)) {
    const file = path.join(srcRoot, ...rel.split('/'));
    if (!fs.existsSync(file) || !gate.test(fs.readFileSync(file, 'utf8'))) found.push(`${rel}: does not use ${gate.source.replace(/\\b|\\\(/g, '')}`);
  }
  return found;
}
