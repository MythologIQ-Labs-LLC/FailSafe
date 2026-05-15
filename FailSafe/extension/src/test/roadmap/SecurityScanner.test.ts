// Functional tests for SecurityScanner (FX380, FX386).

import { strict as assert } from 'assert';
import { SecurityScanner } from '../../roadmap/services/SecurityScanner';
import { EventBus } from '../../shared/EventBus';
import type { CommandRunnerResult } from '../../roadmap/services/MarketplaceTypes';

interface RunnerCall { command: string; args: string[]; cwd?: string; }

function makeRunner(responses: Record<string, CommandRunnerResult | { exec: (call: RunnerCall) => CommandRunnerResult }>): { calls: RunnerCall[]; runner: any } {
  const calls: RunnerCall[] = [];
  const runner = async (command: string, args: string[], cwd?: string): Promise<CommandRunnerResult> => {
    const call = { command, args, cwd };
    calls.push(call);
    const key = `${command} ${args[0] ?? ''}`;
    const entry = responses[key] ?? responses[command];
    if (!entry) return { code: 1, stdout: '', stderr: 'no stub' };
    if ('exec' in entry) return entry.exec(call);
    return entry;
  };
  return { calls, runner };
}

suite('SecurityScanner (FX380 + FX386)', () => {
  test('FX386 checkAvailability — both scanners absent → garak/promptfoo false', async () => {
    const { runner } = makeRunner({});
    const s = new SecurityScanner(new EventBus(), runner);
    const r = await s.checkAvailability();
    assert.equal(r.garak, false);
    assert.equal(r.promptfoo, false);
    assert.match(r.lastChecked, /^\d{4}-\d{2}-\d{2}T/);
  });

  test('FX386 checkAvailability — both scanners present → garak/promptfoo true', async () => {
    const { runner } = makeRunner({
      garak: { code: 0, stdout: 'garak v1.0', stderr: '' },
      npx: { code: 0, stdout: 'promptfoo 0.50', stderr: '' },
    });
    const s = new SecurityScanner(new EventBus(), runner);
    const r = await s.checkAvailability();
    assert.equal(r.garak, true);
    assert.equal(r.promptfoo, true);
  });

  test('FX386 isGarakAvailable / isPromptfooAvailable mirror availability state', async () => {
    const { runner } = makeRunner({ garak: { code: 0, stdout: '', stderr: '' } });
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability();
    assert.equal(s.isGarakAvailable(), true);
    assert.equal(s.isPromptfooAvailable(), false);
  });

  test('FX380 scanWithGarak — unavailable scanner returns L3 review recommendation', async () => {
    const { runner } = makeRunner({});
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability(); // garak unavailable
    const r = await s.scanWithGarak('/path', () => {});
    assert.equal(r.scanner, 'garak');
    assert.equal(r.passed, false);
    assert.equal(r.riskGrade, 'L3');
    assert.equal(r.recommendedAction, 'review');
  });

  test('FX380 scanWithGarak — clean JSON output → passed=true + L1', async () => {
    const { runner } = makeRunner({
      garak: { code: 0, stdout: '', stderr: '' }, // for checkAvailability
      'garak --model_type': {
        code: 0,
        stdout: '{"results":{}}',
        stderr: '',
      },
    });
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability();
    const r = await s.scanWithGarak('/path', () => {});
    assert.equal(r.passed, true);
    assert.equal(r.riskGrade, 'L1');
    assert.equal(r.recommendedAction, 'approve');
  });

  test('FX380 scanWithGarak — high fail_rate → L3 with high-severity finding', async () => {
    const { runner } = makeRunner({
      garak: { code: 0, stdout: '', stderr: '' },
      'garak --model_type': {
        code: 0,
        stdout: '{"results":{"p1":{"name":"injection","fail_rate":0.6}}}',
        stderr: '',
      },
    });
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability();
    const r = await s.scanWithGarak('/path', () => {});
    assert.equal(r.passed, false);
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].severity, 'high');
    assert.equal(r.recommendedAction, 'reject');
  });

  test('FX380 scanWithPromptfoo — unavailable returns L3 review', async () => {
    const { runner } = makeRunner({});
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability();
    const r = await s.scanWithPromptfoo('/path', () => {});
    assert.equal(r.scanner, 'promptfoo');
    assert.equal(r.recommendedAction, 'review');
  });

  test('FX380 scanWithPromptfoo — failing test → recorded with severity', async () => {
    const { runner } = makeRunner({
      garak: { code: 1, stdout: '', stderr: '' },
      npx: { code: 0, stdout: '', stderr: '' }, // checkAvailability for promptfoo
      'npx promptfoo': {
        code: 0,
        stdout: '{"results":[{"pass":false,"severity":"high","category":"redteam","description":"jailbreak"}]}',
        stderr: '',
      },
    });
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability();
    const r = await s.scanWithPromptfoo('/path', () => {});
    assert.equal(r.passed, false);
    assert.equal(r.findings[0].severity, 'high');
    assert.match(r.findings[0].description, /jailbreak/);
  });

  test('FX380 runFullScan — neither scanner available → L3 + manual review finding', async () => {
    const { runner } = makeRunner({});
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability();
    const r = await s.runFullScan('/path', () => {});
    assert.equal(r.scanner, 'none');
    assert.equal(r.riskGrade, 'L3');
    assert.equal(r.recommendedAction, 'review');
    assert.match(r.findings[0].description, /No automated security scanners available/);
  });

  test('FX380 runFullScan — both scanners pass → combined "both" + approve', async () => {
    const { runner } = makeRunner({
      garak: { code: 0, stdout: '', stderr: '' },
      npx: { code: 0, stdout: '', stderr: '' },
      'garak --model_type': { code: 0, stdout: '{"results":{}}', stderr: '' },
      'npx promptfoo': { code: 0, stdout: '{"results":[]}', stderr: '' },
    });
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability();
    const r = await s.runFullScan('/path', () => {});
    assert.equal(r.scanner, 'both');
    assert.equal(r.passed, true);
    assert.equal(r.recommendedAction, 'approve');
  });

  test('FX386 calculateRiskGrade — critical→L3; high→L2; >=3 medium→L2; otherwise L1', () => {
    const { runner } = makeRunner({});
    const s = new SecurityScanner(new EventBus(), runner);
    const calc = (s as any).calculateRiskGrade.bind(s);
    assert.equal(calc([{ severity: 'critical' }]), 'L3');
    assert.equal(calc([{ severity: 'high' }]), 'L2');
    assert.equal(calc([
      { severity: 'medium' }, { severity: 'medium' }, { severity: 'medium' },
    ]), 'L2');
    assert.equal(calc([{ severity: 'medium' }, { severity: 'medium' }]), 'L1');
    assert.equal(calc([]), 'L1');
  });

  test('FX380 runStaticAnalysis — empty grep result returns no findings', async () => {
    const { runner } = makeRunner({ git: { code: 0, stdout: '', stderr: '' } });
    const s = new SecurityScanner(new EventBus(), runner);
    const findings = await s.runStaticAnalysis('/path', () => {});
    assert.deepEqual(findings, []);
  });

  test('FX380 runStaticAnalysis — detects api_key + eval patterns from grep', async () => {
    const { runner } = makeRunner({
      git: {
        code: 0,
        stdout: 'src/foo.ts:10:const api_key = "sk-1234567890abcdef"\nsrc/bar.ts:20:eval(userInput)',
        stderr: '',
      },
    });
    const s = new SecurityScanner(new EventBus(), runner);
    const findings = await s.runStaticAnalysis('/path', () => {});
    assert.equal(findings.length, 2);
    assert.ok(findings.some(f => f.category === 'secrets'));
    assert.ok(findings.some(f => f.category === 'code-execution'));
  });
});
