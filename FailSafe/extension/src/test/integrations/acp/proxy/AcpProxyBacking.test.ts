// Functional tests for the ACP proxy's vscode-free backing primitives (GH #172
// Part 2): the runtime-mode mirror contract, the file-backed config/intent
// providers, and the JSONL ledger sink. Temp-dir fs; no engine, no SDK → headless.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { readRuntimeMode, writeRuntimeMode, runtimeModePath } from '../../../../integrations/acp/proxy/backing/runtimeMode';
import { FileConfigProvider } from '../../../../integrations/acp/proxy/backing/FileConfigProvider';
import { FileIntentProvider } from '../../../../integrations/acp/proxy/backing/FileIntentProvider';
import { FileLedgerSink } from '../../../../integrations/acp/proxy/backing/FileLedgerSink';

function tmp(): string { return fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-acp-backing-')); }

suite('integrations/acp/proxy backing — runtime-mode mirror', () => {
  test('write → read round-trips each mode', () => {
    const ws = tmp();
    try {
      for (const m of ['observe', 'assist', 'enforce'] as const) {
        writeRuntimeMode(ws, m);
        assert.equal(readRuntimeMode(ws), m);
      }
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('missing mirror → "enforce" (fail-closed default — a degraded mirror never silently grants; LD-3)', () => {
    const ws = tmp();
    try { assert.equal(readRuntimeMode(ws), 'enforce'); }
    finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('malformed JSON or invalid mode value → "enforce" (fail-closed)', () => {
    const ws = tmp();
    try {
      fs.mkdirSync(path.dirname(runtimeModePath(ws)), { recursive: true });
      fs.writeFileSync(runtimeModePath(ws), '{ not json', 'utf8');
      assert.equal(readRuntimeMode(ws), 'enforce');
      fs.writeFileSync(runtimeModePath(ws), JSON.stringify({ mode: 'YOLO' }), 'utf8');
      assert.equal(readRuntimeMode(ws), 'enforce');
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });
});

suite('integrations/acp/proxy backing — FileConfigProvider', () => {
  test('getConfig().governance.mode reflects the mirror', () => {
    const ws = tmp();
    try {
      writeRuntimeMode(ws, 'enforce');
      const cfg = new FileConfigProvider(ws).getConfig();
      assert.equal(cfg.governance?.mode, 'enforce');
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('absent mirror → enforce through the provider (fail-closed; LD-3)', () => {
    const ws = tmp();
    try { assert.equal(new FileConfigProvider(ws).getConfig().governance?.mode, 'enforce'); }
    finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('path getters are workspace-rooted', () => {
    const p = new FileConfigProvider('/w');
    assert.equal(p.getWorkspaceRoot(), '/w');
    assert.equal(p.getFailSafeDir(), path.join('/w', '.failsafe'));
    assert.equal(typeof p.onConfigChange(() => {}), 'function');
  });
});

suite('integrations/acp/proxy backing — FileIntentProvider (read-only)', () => {
  test('no active intent file → null', async () => {
    const ws = tmp();
    try { assert.equal(await new FileIntentProvider(ws).getActiveIntent(), null); }
    finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('malformed active intent → null (defensive, never crashes the proxy)', async () => {
    const ws = tmp();
    try {
      const dir = path.join(ws, '.failsafe', 'manifest');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'active_intent.json'), '{ broken', 'utf8');
      assert.equal(await new FileIntentProvider(ws).getActiveIntent(), null);
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('createIntent REJECTS — the proxy never fabricates governance state', async () => {
    // Use a real temp workspace: FileIntentProvider's IntentStore mkdirs
    // `.failsafe/manifest` at construction, which EACCES-fails on a non-writable
    // root path (e.g. `/w` on the Linux CI runner).
    const ws = tmp();
    try {
      await assert.rejects(() => new FileIntentProvider(ws).createIntent(), /read-only/);
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });
});

suite('integrations/acp/proxy backing — FileLedgerSink', () => {
  test('appends one JSONL line per record, preserving fields', () => {
    const ws = tmp();
    try {
      const sink = new FileLedgerSink(ws);
      sink.record({ kind: 'intent', verdict: 'BLOCK', effectiveMode: 'enforce', enforcing: true, blocked: true, rationale: 'r' });
      sink.record({ kind: 'permission', verdict: 'ALLOW', effectiveMode: 'observe', enforcing: false, blocked: false });
      const file = path.join(ws, '.failsafe', 'governance', 'acp-ledger.jsonl');
      const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
      assert.equal(lines.length, 2);
      const first = JSON.parse(lines[0]);
      assert.equal(first.verdict, 'BLOCK');
      assert.equal(first.blocked, true);
      assert.ok(typeof first.ts === 'string', 'each record is timestamped');
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });

  test('a record carries NO file content (privacy) — only governance metadata keys', () => {
    const ws = tmp();
    try {
      const sink = new FileLedgerSink(ws);
      sink.record({ kind: 'intent', verdict: 'BLOCK', effectiveMode: 'enforce', enforcing: true, blocked: true, target: '/etc/passwd' });
      const file = path.join(ws, '.failsafe', 'governance', 'acp-ledger.jsonl');
      const rec = JSON.parse(fs.readFileSync(file, 'utf8').trim());
      assert.deepEqual(
        Object.keys(rec).sort(),
        ['blocked', 'effectiveMode', 'enforcing', 'kind', 'target', 'ts', 'verdict'],
        'no content/payload key may appear in the trail',
      );
    } finally { fs.rmSync(ws, { recursive: true, force: true }); }
  });
});
