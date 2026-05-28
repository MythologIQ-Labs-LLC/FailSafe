import { strict as assert } from 'assert';
import { SubstrateRunner, type SubstrateModule } from '../../../qorlogic/substrate/SubstrateRunner';
import type { ModuleResult, SubstrateFinding } from '../../../qorlogic/substrate/types';

/**
 * FX714 — SubstrateRunner
 * 5 cases: runs all modules / per-module error captured + others continue /
 * total-findings aggregation / event emitted with 2-positional-arg shape /
 * no event bus = no throw.
 *
 * CRITICAL (v2-D1+D2 tightened): event-emission case MUST assert that
 * `eventBus.emit` is called with TWO positional args:
 *   emit('substrate.run.complete', payload)
 * — NOT a single-object form.
 */

function passModule(name: string, count: number): SubstrateModule {
  const findings: SubstrateFinding[] = [];
  for (let i = 0; i < count; i += 1) {
    findings.push({ module: name, severity: 'warn', rule: 'r', message: `m${i}` });
  }
  return {
    name,
    async run(): Promise<ModuleResult> {
      return {
        module: name,
        ok: true,
        findings,
        summary: { count, bySeverity: { info: 0, warn: count, high: 0 } },
        durationMs: 1,
      };
    },
  };
}

function throwingModule(name: string): SubstrateModule {
  return {
    name,
    async run(): Promise<ModuleResult> {
      throw new Error('module exploded');
    },
  };
}

interface EmitCall { args: unknown[] }

function makeFakeBus(): { emit: (...args: unknown[]) => void; calls: EmitCall[] } {
  const calls: EmitCall[] = [];
  return {
    emit: (...args: unknown[]) => { calls.push({ args: [...args] }); },
    calls,
  };
}

suite('SubstrateRunner (FX714)', () => {
  test('runs all 3 modules in order, aggregates results', async () => {
    const runner = new SubstrateRunner([
      passModule('m1', 1),
      passModule('m2', 0),
      passModule('m3', 2),
    ]);
    const report = await runner.runAll();
    assert.equal(report.moduleResults.length, 3);
    assert.deepEqual(report.moduleResults.map((r) => r.module), ['m1', 'm2', 'm3']);
  });

  test('per-module throw captured as error result; subsequent modules still execute', async () => {
    const runner = new SubstrateRunner([
      passModule('m1', 1),
      throwingModule('m2'),
      passModule('m3', 3),
    ]);
    const report = await runner.runAll();
    assert.equal(report.moduleResults.length, 3);
    assert.equal(report.moduleResults[1].ok, false);
    assert.equal(report.moduleResults[1].error?.kind, 'other');
    assert.match(report.moduleResults[1].error!.message, /module exploded/);
    assert.equal(report.moduleResults[2].findings.length, 3);
  });

  test('totalFindings aggregates across all modules', async () => {
    const runner = new SubstrateRunner([
      passModule('m1', 2),
      passModule('m2', 3),
      passModule('m3', 1),
    ]);
    const report = await runner.runAll();
    assert.equal(report.totalFindings, 6);
  });

  test('event emitted as TWO positional args: ("substrate.run.complete", payload)', async () => {
    const bus = makeFakeBus();
    // SubstrateRunner expects EventBus shape; we cast our fake to it.
    const runner = new SubstrateRunner(
      [passModule('m1', 1), passModule('m2', 2)],
      bus as unknown as import('../../../shared/EventBus').EventBus,
    );
    await runner.runAll();
    assert.equal(bus.calls.length, 1, 'exactly one emit per runAll');
    assert.equal(bus.calls[0].args.length, 2, 'emit must be called with TWO positional args (not single object)');
    assert.equal(bus.calls[0].args[0], 'substrate.run.complete');
    const payload = bus.calls[0].args[1] as { totalFindings: number; modules: { name: string; count: number; ok: boolean }[] };
    assert.equal(payload.totalFindings, 3);
    assert.equal(payload.modules.length, 2);
    assert.equal(payload.modules[0].name, 'm1');
    assert.equal(payload.modules[0].count, 1);
    assert.equal(payload.modules[0].ok, true);
  });

  test('no event bus → runAll completes without throw and returns report', async () => {
    const runner = new SubstrateRunner([passModule('m1', 1)]);
    const report = await runner.runAll();
    assert.equal(report.totalFindings, 1);
  });
});
