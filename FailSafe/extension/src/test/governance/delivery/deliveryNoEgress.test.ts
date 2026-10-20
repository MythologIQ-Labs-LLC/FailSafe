// #532 part B (plan-532b LD1/LD10): nothing leaves the machine.
//
// Across candidates, link (both edges), unlink and assess on a real temp repository and a real
// IntentService, stubs on globalThis.fetch, http.request/get, https.request/get, net.connect /
// createConnection and every child_process function count zero calls. Git runs only through the
// injected runner, whose subcommands are recorded and must all be in the LD4 allowlist; the
// runner's own process spawns are attributed to it and excluded from the child_process count.
// The one git read outside the LD4 list is the architecture discovery's file listing (LD3 reuses
// discoverArchitectureIndex), accepted only with its exact argv.
// A tampered LINKED entry (chain recomputed) whose target is `--output=x` never reaches git.
// plan-532c: the sweep also covers the governed-commit link offer (B286) and the hub checkpoint
// HEAD read (B284, which reads from disk and spawns nothing); the ledger is asked only for the
// intent id (the checkpoint SHA match is retired, B285).

import { strict as assert } from 'assert';
import * as path from 'path';
import { makeArchitectureGit, type ArchitectureGit } from '../../../governance/architecture/ArchitectureIndexDiscovery';
import { IntentHistoryLog } from '../../../governance/IntentHistoryLog';
import { DELIVERY_GIT_SUBCOMMANDS } from '../../../governance/delivery/deliveryGit';
import {
  assessIntentDelivery, deliveryCandidates, prepareDeliveryEdge, writeDeliveryEdge, type DeliveryContext,
} from '../../../governance/delivery/deliveryService';
import { deliveryWorkspace, importedIntent, intentService, RUNTIME_ROW, type DeliveryWorkspace } from './deliveryFixtures';
import { offerCommittedUnderLink } from '../../../extension/governedCommitLink';
import { readWorkspaceHead } from '../../../roadmap/services/workspaceHead';

// Module objects (not `import * as` copies), so the stubs replace what the code calls.
/* eslint-disable @typescript-eslint/no-var-requires */
const http = require('http') as Record<string, unknown>;
const https = require('https') as Record<string, unknown>;
const net = require('net') as Record<string, unknown>;
const childProcess = require('child_process') as Record<string, unknown>;
/* eslint-enable @typescript-eslint/no-var-requires */

const DISCOVERY_ARGV = JSON.stringify(['ls-files', '-z', '-co', '--exclude-standard']);
const allowed = (a: string[]): boolean => DELIVERY_GIT_SUBCOMMANDS.has(a[0]) || JSON.stringify(a) === DISCOVERY_ARGV;

const CP_FUNCTIONS = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'];

// The extension host is shared with VS Code's own extensions (the built-in git extension spawns git
// while it scans workspace folders), so a call is counted only when FailSafe code is on its stack:
// a frame under this extension's out/ other than this stub. Foreign calls are tallied separately.
const OUT_DIR = path.resolve(__dirname, '..', '..', '..').toLowerCase();
const fromFailSafe = (stack: string): boolean =>
  stack.split('\n').slice(2).some((frame) => frame.toLowerCase().includes(OUT_DIR));

interface Stubs {
  counts: Record<string, number>; stacks: Record<string, string[]>; foreign: number;
  restore: () => void; inRunner: { value: boolean };
}

function installStubs(): Stubs {
  const stubs: Stubs = { counts: {}, stacks: {}, foreign: 0, inRunner: { value: false }, restore: () => undefined };
  const restores: Array<() => void> = [];
  const patch = (obj: Record<string, unknown>, key: string, label: string, countWhen: () => boolean = () => true): void => {
    // Another suite may have removed the global (the voice-pack helpers delete globalThis.fetch on
    // restore), so a missing original is still stubbed: the call is counted, then fails as it would.
    const had = Object.prototype.hasOwnProperty.call(obj, key);
    const original = obj[key] as ((...a: unknown[]) => unknown) | undefined;
    stubs.counts[label] = 0;
    stubs.stacks[label] = [];
    obj[key] = function (this: unknown, ...a: unknown[]) {
      const stack = String(new Error('call').stack);
      if (!fromFailSafe(stack)) stubs.foreign += 1;
      else if (countWhen()) { stubs.counts[label] += 1; stubs.stacks[label].push(stack); }
      if (typeof original !== 'function') {
        const missing = new TypeError(`${label} is not defined`);
        if (label === 'fetch') return Promise.reject(missing);
        throw missing;
      }
      return original.apply(this, a);
    };
    restores.push(() => { if (had) obj[key] = original; else delete obj[key]; });
  };
  patch(globalThis as unknown as Record<string, unknown>, 'fetch', 'fetch');
  patch(http, 'request', 'http.request'); patch(http, 'get', 'http.get');
  patch(https, 'request', 'https.request'); patch(https, 'get', 'https.get');
  patch(net, 'connect', 'net.connect'); patch(net, 'createConnection', 'net.createConnection');
  for (const fn of CP_FUNCTIONS) patch(childProcess, fn, `child_process.${fn}`, () => !stubs.inRunner.value);
  stubs.restore = () => { for (const r of restores.reverse()) r(); };
  return stubs;
}

suite('delivery: no egress (#532 LD1)', () => {
  let ws: DeliveryWorkspace;
  setup(() => { ws = deliveryWorkspace('failsafe-delivery-egress-'); });
  teardown(() => ws.cleanup());

  test('candidates, link, unlink and assess make no network call and run git only through the runner', async function () {
    this.timeout(30000);
    const service = intentService(ws.root);
    const intent = await importedIntent(service);
    const subcommands: string[][] = [];
    const real = makeArchitectureGit();
    let stubs: Stubs | null = null;
    const runner: ArchitectureGit = (root, args) => {
      subcommands.push([...args]);
      if (stubs) stubs.inRunner.value = true;
      try { return real(root, args); } finally { if (stubs) stubs.inRunner.value = false; }
    };
    const ledgerQueries: string[] = [];
    const ctx: DeliveryContext = {
      workspaceRoot: ws.root, intents: service, git: runner,
      ledger: { isAvailable: () => true, findEntriesContaining: async (v: string) => { ledgerQueries.push(v); return []; } },
    };
    stubs = installStubs();
    let view;
    try {
      const candidates = deliveryCandidates(ctx);
      assert.equal(candidates.commits.state, 'ok');
      const prepared = await prepareDeliveryEdge(ctx, 'link', { intentId: intent.id, edge: 'implements', target: RUNTIME_ROW });
      assert.equal(prepared.ok, true, JSON.stringify(prepared));
      assert.deepEqual(await writeDeliveryEdge(ctx, prepared as Extract<typeof prepared, { ok: true }>, 'user'), { ok: true });
      const offered = await offerCommittedUnderLink(ctx, async () => 'approved',
        { commitSha: ws.head, action: 'organize', requestedPaths: ['docs'] });
      assert.equal(offered.outcome, 'linked', offered.detail);
      assert.equal(readWorkspaceHead(ws.root), ws.head, 'the hub checkpoint HEAD read');
      view = await assessIntentDelivery(ctx, intent.id);
      const unlink = await prepareDeliveryEdge(ctx, 'unlink', { intentId: intent.id, edge: 'implements', target: RUNTIME_ROW });
      assert.equal(unlink.ok, true, JSON.stringify(unlink));
      await writeDeliveryEdge(ctx, unlink as Extract<typeof unlink, { ok: true }>, 'user');
      await assessIntentDelivery(ctx, intent.id);
    } catch (e) {
      stubs.restore();
      throw e;
    }
    const flow = { ...stubs.counts };
    // Falsifier: the stubs do count a call FailSafe code makes outside the runner.
    try {
      makeArchitectureGit()(ws.root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
      await (globalThis.fetch as (u: string) => Promise<unknown>)('x-invalid://probe').catch(() => undefined);
    } finally {
      stubs.restore();
    }
    assert.equal(stubs.counts['child_process.spawnSync'] - flow['child_process.spawnSync'], 1, 'the stub counts a FailSafe spawnSync');
    assert.equal(stubs.counts.fetch - flow.fetch, 1, 'the stub counts a FailSafe fetch');
    assert.equal(view.integrity, 'valid');
    assert.equal((view as { found: boolean }).found, true);
    for (const [label, n] of Object.entries(flow)) {
      assert.equal(n, 0, `${label} was called ${n} time(s):\n${stubs.stacks[label].join('\n---\n')}`);
    }
    console.log(`  no-egress: ${subcommands.length} git call(s) through the runner; ${stubs.foreign} foreign call(s) from other extensions ignored`);
    assert.ok(subcommands.length > 0, 'git ran through the injected runner');
    for (const a of subcommands) assert.ok(allowed(a), `git ${a.join(' ')} is not in the LD4 allowlist`);
    assert.ok(subcommands.some((a) => a[0] === 'cat-file'), 'the commit edge was re-checked through the runner');
    assert.deepEqual([...new Set(ledgerQueries)], [intent.id], 'the ledger is asked only for the intent id (B285: no SHA match)');
  });

  test('a tampered LINKED entry (chain recomputed) whose target is --output=x is missing and never reaches git', async () => {
    const service = intentService(ws.root);
    const intent = await importedIntent(service);
    await new IntentHistoryLog(path.join(ws.root, '.failsafe', 'manifest')).appendEntry({
      intentId: intent.id, timestamp: new Date().toISOString(), event: 'LINKED', actor: 'agent',
      details: { edge: 'committed-under', target: '--output=x', provenance: { sha: '--output=x', tree: 'x', branch: null } },
    });
    const calls: string[][] = [];
    const real = makeArchitectureGit();
    const ctx: DeliveryContext = {
      workspaceRoot: ws.root, intents: service, ledger: null,
      git: (root, args) => { calls.push([...args]); return real(root, args); },
    };
    const view = await assessIntentDelivery(ctx, intent.id);
    assert.equal(view.integrity, 'valid', 'the recomputed chain verifies');
    const code = (view as Extract<typeof view, { found: true }>).assessment.steps.find((s) => s.key === 'code');
    assert.equal(code?.status, 'missing');
    assert.equal(calls.flat().some((a) => a.includes('--output')), false, `git was called with the tampered target: ${JSON.stringify(calls)}`);
  });
});
