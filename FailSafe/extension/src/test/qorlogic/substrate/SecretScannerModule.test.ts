import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SecretScannerModule } from '../../../qorlogic/substrate/SecretScannerModule';
import { QorScriptInvoker, type InvokeResult } from '../../../qorlogic/substrate/QorScriptInvoker';
import {
  PythonInterpreterResolver,
  type RunCommand,
} from '../../../qorlogic/PythonInterpreterResolver';

/**
 * FX711 — SecretScannerModule
 * 5 cases: empty findings / findings present / parse error / subprocess error /
 * staged vs full args.
 */

function fakeInvoker(result: InvokeResult): { invoker: QorScriptInvoker; calls: { module: string; args: string[]; cwd?: string }[] } {
  const cfg = { get: () => undefined };
  const run: RunCommand = async () => ({ stdout: '', stderr: '', code: 0 });
  const resolver = new PythonInterpreterResolver(cfg, null, run);
  (resolver as unknown as { cached: unknown }).cached = {
    ok: true, command: 'python3', args: [], version: '3.12.0', source: 'user-setting',
  };
  const invoker = new QorScriptInvoker(resolver);
  const calls: { module: string; args: string[]; cwd?: string }[] = [];
  (invoker as unknown as { invoke: (o: { module: string; args: string[]; cwd?: string }) => Promise<InvokeResult> }).invoke = async (opts) => {
    calls.push({ module: opts.module, args: [...opts.args], cwd: opts.cwd });
    return result;
  };
  return { invoker, calls };
}

function mkTmpWs(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-secret-scanner-'));
}

suite('SecretScannerModule (FX711)', () => {
  test('empty findings: outPath absent (exit 0, no JSON written) → 0 findings, ok=true', async () => {
    const ws = mkTmpWs();
    try {
      const { invoker } = fakeInvoker({ ok: true, code: 0, stdout: '', stderr: '', durationMs: 5 });
      const mod = new SecretScannerModule(invoker, ws);
      const result = await mod.run();
      assert.equal(result.ok, true);
      assert.equal(result.findings.length, 0);
      assert.equal(result.summary.count, 0);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });

  test('findings present: gitleaks v8 JSON parsed → SubstrateFinding[]', async () => {
    const ws = mkTmpWs();
    try {
      fs.mkdirSync(path.join(ws, 'dist'), { recursive: true });
      const findings = [
        { RuleID: 'aws-access-key', Description: 'AWS Access Key', File: 'src/config.ts', StartLine: 12, Match: 'AKIA...' },
        { RuleID: 'generic-api', Description: 'Generic API Key', File: 'src/secret.ts', StartLine: 3, Match: '...' },
      ];
      fs.writeFileSync(path.join(ws, 'dist', 'secrets.findings.json'), JSON.stringify(findings));
      const { invoker } = fakeInvoker({ ok: false, code: 1, stdout: '', stderr: '', durationMs: 10 });
      const mod = new SecretScannerModule(invoker, ws);
      const result = await mod.run();
      assert.equal(result.findings.length, 2);
      assert.equal(result.findings[0].module, 'secret_scanner');
      assert.equal(result.findings[0].rule, 'aws-access-key');
      assert.equal(result.findings[0].location?.file, 'src/config.ts');
      assert.equal(result.findings[0].location?.line, 12);
      assert.equal(result.summary.count, 2);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });

  test('parse error: malformed JSON → error.kind=parse-error, ok=false', async () => {
    const ws = mkTmpWs();
    try {
      fs.mkdirSync(path.join(ws, 'dist'), { recursive: true });
      fs.writeFileSync(path.join(ws, 'dist', 'secrets.findings.json'), 'not json {{{');
      const { invoker } = fakeInvoker({ ok: false, code: 1, stdout: '', stderr: '', durationMs: 5 });
      const mod = new SecretScannerModule(invoker, ws);
      const result = await mod.run();
      assert.equal(result.ok, false);
      assert.equal(result.error?.kind, 'parse-error');
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });

  test('subprocess spawn error (exit 2 / spawn-error kind from invoker) → typed error result, no throw', async () => {
    const ws = mkTmpWs();
    try {
      const { invoker } = fakeInvoker({
        ok: false, code: 2, stdout: '', stderr: 'bad',
        durationMs: 5, error: { kind: 'spawn-error', message: 'cannot spawn python' },
      });
      const mod = new SecretScannerModule(invoker, ws);
      const result = await mod.run();
      assert.equal(result.ok, false);
      assert.equal(result.error?.kind, 'spawn-error');
      assert.equal(result.findings.length, 0);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });

  test('stagedOnly=true (default) sends --staged; stagedOnly=false omits it', async () => {
    const ws = mkTmpWs();
    try {
      const { invoker, calls } = fakeInvoker({ ok: true, code: 0, stdout: '', stderr: '', durationMs: 1 });
      const mod = new SecretScannerModule(invoker, ws);
      await mod.run();
      assert.ok(calls[0].args.includes('--staged'));
      await mod.run({ stagedOnly: false });
      assert.equal(calls[1].args.includes('--staged'), false);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });
});
