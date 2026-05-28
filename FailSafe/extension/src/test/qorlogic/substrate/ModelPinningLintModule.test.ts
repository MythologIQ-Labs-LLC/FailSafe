import { strict as assert } from 'assert';
import { ModelPinningLintModule } from '../../../qorlogic/substrate/ModelPinningLintModule';
import { QorScriptInvoker, type InvokeResult } from '../../../qorlogic/substrate/QorScriptInvoker';
import {
  PythonInterpreterResolver,
  type RunCommand,
} from '../../../qorlogic/PythonInterpreterResolver';

/**
 * FX713 — ModelPinningLintModule
 * 3 cases: successful no-op / subprocess error captured / note text matches.
 *
 * Module always returns 0 findings (FailSafe stores skills at `.claude/skills/`;
 * upstream walks `qor/skills/`). The summary.note documents this so the
 * 0-finding baseline doesn't read as a silent lint break.
 */

function fakeInvoker(result: InvokeResult): { invoker: QorScriptInvoker; calls: { module: string; args: string[] }[] } {
  const cfg = { get: () => undefined };
  const run: RunCommand = async () => ({ stdout: '', stderr: '', code: 0 });
  const resolver = new PythonInterpreterResolver(cfg, null, run);
  (resolver as unknown as { cached: unknown }).cached = {
    ok: true, command: 'python3', args: [], version: '3.12.0', source: 'user-setting',
  };
  const invoker = new QorScriptInvoker(resolver);
  const calls: { module: string; args: string[] }[] = [];
  (invoker as unknown as { invoke: (o: { module: string; args: string[] }) => Promise<InvokeResult> }).invoke = async (opts) => {
    calls.push({ module: opts.module, args: [...opts.args] });
    return result;
  };
  return { invoker, calls };
}

suite('ModelPinningLintModule (FX713)', () => {
  test('successful no-op: 0 findings, ok=true, --repo-root forwarded', async () => {
    const { invoker, calls } = fakeInvoker({ ok: true, code: 0, stdout: '', stderr: '', durationMs: 4 });
    const mod = new ModelPinningLintModule(invoker, '/ws');
    const r = await mod.run();
    assert.equal(r.ok, true);
    assert.equal(r.findings.length, 0);
    assert.equal(r.summary.count, 0);
    assert.ok(calls[0].args.includes('--repo-root'));
    assert.ok(calls[0].args.includes('/ws'));
  });

  test('subprocess error captured: ok=false, error preserved, findings still empty', async () => {
    const { invoker } = fakeInvoker({
      ok: false, code: 1, stdout: '', stderr: 'boom',
      durationMs: 3, error: { kind: 'spawn-error', message: 'cannot spawn' },
    });
    const mod = new ModelPinningLintModule(invoker, '/ws');
    const r = await mod.run();
    assert.equal(r.ok, false);
    assert.equal(r.error?.kind, 'spawn-error');
    assert.equal(r.findings.length, 0);
  });

  test('summary.note documents expected silent-no-op behavior', async () => {
    const { invoker } = fakeInvoker({ ok: true, code: 0, stdout: '', stderr: '', durationMs: 1 });
    const mod = new ModelPinningLintModule(invoker, '/ws');
    const r = await mod.run();
    assert.match(r.summary.note ?? '', /qor\/skills/);
    assert.match(r.summary.note ?? '', /\.claude\/skills/);
  });
});
