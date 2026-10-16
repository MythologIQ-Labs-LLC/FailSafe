// Functional tests for SecurityScanner (FX380, FX386; v6.0.8 lane A T1 and T4a, #469/#468).

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SecurityScanner } from '../../roadmap/services/SecurityScanner';
import { EventBus } from '../../shared/EventBus';
import type { CommandRunnerResult } from '../../roadmap/services/MarketplaceTypes';

interface RunnerCall { command: string; args: string[]; cwd?: string; cwdExisted: boolean; cwdEntries: number; }

type Reply = CommandRunnerResult | undefined;

/**
 * A scanner stub that answers by meaning, not by spelling: `npx promptfoo …`
 * (the old form) and `promptfoo …` (the new form) reach the same handler, so
 * the T1 rows test verdict parsing whichever way the scanner is started.
 */
function scanStub(replies: { garakVersion?: Reply; garakScan?: Reply; pfVersion?: Reply; pfScan?: Reply; git?: Reply }) {
  const calls: RunnerCall[] = [];
  const runner = async (command: string, args: string[], cwd?: string): Promise<CommandRunnerResult> => {
    const cwdExisted = typeof cwd === 'string' && fs.existsSync(cwd);
    calls.push({ command, args, cwd, cwdExisted, cwdEntries: cwdExisted ? fs.readdirSync(cwd as string).length : -1 });
    let tool = command;
    let rest = args;
    if (command === 'npx' && args[0] === 'promptfoo') { tool = 'promptfoo'; rest = args.slice(1); }
    const version = rest[0] === '--version';
    const reply = tool === 'garak' ? (version ? replies.garakVersion : replies.garakScan)
      : tool === 'promptfoo' ? (version ? replies.pfVersion : replies.pfScan)
        : tool === 'git' ? replies.git : undefined;
    return reply ?? { code: 1, stdout: '', stderr: 'no stub' };
  };
  return { calls, runner };
}

const OK = { code: 0, stdout: 'ok', stderr: '' };
const garak = (code: number, stdout: string) => scanStub({ garakVersion: OK, garakScan: { code, stdout, stderr: '' } });
const promptfoo = (code: number, stdout: string) => scanStub({ pfVersion: OK, pfScan: { code, stdout, stderr: '' } });

async function scanG(code: number, stdout: string) {
  const { runner } = garak(code, stdout);
  const s = new SecurityScanner(new EventBus(), runner);
  await s.checkAvailability();
  return s.scanWithGarak(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-t1-')), () => {});
}
async function scanP(code: number, stdout: string) {
  const { runner } = promptfoo(code, stdout);
  const s = new SecurityScanner(new EventBus(), runner);
  await s.checkAvailability();
  return s.scanWithPromptfoo(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-t1-')), () => {});
}
function expectInconclusive(r: { passed: boolean; riskGrade: string; recommendedAction: string; findings: Array<{ category: string; description: string }> }, cause: RegExp) {
  assert.equal(r.passed, false, 'not a PASS');
  assert.equal(r.riskGrade, 'L3');
  assert.equal(r.recommendedAction, 'review');
  assert.ok(r.findings.some((f) => f.category === 'scanner' && cause.test(f.description)), `a scanner finding names the cause ${cause}`);
}

suite('SecurityScanner (FX380 + FX386)', () => {
  test('FX386 checkAvailability — both scanners absent → garak/promptfoo false', async () => {
    const { runner } = scanStub({});
    const s = new SecurityScanner(new EventBus(), runner);
    const r = await s.checkAvailability();
    assert.equal(r.garak, false);
    assert.equal(r.promptfoo, false);
    assert.match(r.lastChecked, /^\d{4}-\d{2}-\d{2}T/);
  });

  test('FX386 checkAvailability — both scanners present → garak/promptfoo true', async () => {
    const { runner } = scanStub({ garakVersion: OK, pfVersion: OK });
    const s = new SecurityScanner(new EventBus(), runner);
    const r = await s.checkAvailability();
    assert.equal(r.garak, true);
    assert.equal(r.promptfoo, true);
  });

  test('FX386 isGarakAvailable / isPromptfooAvailable mirror availability state', async () => {
    const { runner } = scanStub({ garakVersion: OK });
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability();
    assert.equal(s.isGarakAvailable(), true);
    assert.equal(s.isPromptfooAvailable(), false);
  });

  test('FX380 scanWithGarak — unavailable scanner returns L3 review recommendation', async () => {
    const { runner } = scanStub({});
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability();
    const r = await s.scanWithGarak('/path', () => {});
    assert.equal(r.scanner, 'garak');
    assert.equal(r.passed, false);
    assert.equal(r.riskGrade, 'L3');
    assert.equal(r.recommendedAction, 'review');
  });

  test('FX380 scanWithPromptfoo — unavailable returns L3 review', async () => {
    const { runner } = scanStub({});
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability();
    const r = await s.scanWithPromptfoo('/path', () => {});
    assert.equal(r.scanner, 'promptfoo');
    assert.equal(r.recommendedAction, 'review');
  });

  test('FX380 runFullScan — neither scanner available → L3 + manual review finding', async () => {
    const { runner } = scanStub({});
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability();
    const r = await s.runFullScan('/path', () => {});
    assert.equal(r.scanner, 'none');
    assert.equal(r.riskGrade, 'L3');
    assert.equal(r.recommendedAction, 'review');
    assert.match(r.findings[0].description, /No automated security scanners available/);
  });

  test('FX386 calculateRiskGrade — critical→L3; high→L2; >=3 medium→L2; otherwise L1', () => {
    const s = new SecurityScanner(new EventBus(), scanStub({}).runner);
    const calc = (s as any).calculateRiskGrade.bind(s);
    assert.equal(calc([{ severity: 'critical' }]), 'L3');
    assert.equal(calc([{ severity: 'high' }]), 'L2');
    assert.equal(calc([{ severity: 'medium' }, { severity: 'medium' }, { severity: 'medium' }]), 'L2');
    assert.equal(calc([{ severity: 'medium' }, { severity: 'medium' }]), 'L1');
    assert.equal(calc([]), 'L1');
  });

  test('FX380 runStaticAnalysis — empty grep result returns no findings', async () => {
    const { runner } = scanStub({ git: { code: 0, stdout: '', stderr: '' } });
    const s = new SecurityScanner(new EventBus(), runner);
    assert.deepEqual(await s.runStaticAnalysis('/path', () => {}), []);
  });

  test('FX380 runStaticAnalysis — detects api_key + eval patterns from grep', async () => {
    const { runner } = scanStub({
      git: { code: 0, stdout: 'src/foo.ts:10:const api_key = "sk-1234567890abcdef"\nsrc/bar.ts:20:eval(userInput)', stderr: '' },
    });
    const s = new SecurityScanner(new EventBus(), runner);
    const findings = await s.runStaticAnalysis('/path', () => {});
    assert.equal(findings.length, 2);
    assert.ok(findings.some((f) => f.category === 'secrets'));
    assert.ok(findings.some((f) => f.category === 'code-execution'));
  });
});

suite('SecurityScanner verdicts fail closed (#469, T1)', () => {
  test('T1 (a) Garak exit 0 with {"results":{}} is inconclusive, not PASS', async () => {
    expectInconclusive(await scanG(0, '{"results":{}}'), /no completed probes|no parseable/i);
  });
  test('T1 (b) Garak exit 0 with no JSON is inconclusive', async () => {
    expectInconclusive(await scanG(0, 'garak finished'), /no parseable/i);
  });
  test('T1 (c) Garak exit 1 with a clean one-probe result is inconclusive', async () => {
    expectInconclusive(await scanG(1, '{"results":{"p1":{"name":"x","fail_rate":0}}}'), /exited with code 1/i);
  });
  test('T1 (d) Garak fail_rate given as a string is inconclusive', async () => {
    expectInconclusive(await scanG(0, '{"results":{"p1":{"name":"x","fail_rate":"0"}}}'), /no valid fail_rate/i);
  });
  test('T1 (e) Garak one probe at 0 is PASS L1 approve (positive control)', async () => {
    const r = await scanG(0, '{"results":{"p1":{"name":"x","fail_rate":0}}}');
    assert.equal(r.passed, true);
    assert.equal(r.riskGrade, 'L1');
    assert.equal(r.recommendedAction, 'approve');
  });
  test('T1 (f) Garak probe at 0.6 is not passed, high finding, reject', async () => {
    const r = await scanG(0, '{"results":{"p1":{"name":"injection","fail_rate":0.6}}}');
    assert.equal(r.passed, false);
    assert.equal(r.findings.length, 1);
    assert.equal(r.findings[0].severity, 'high');
    assert.equal(r.recommendedAction, 'reject');
  });
  test('T1 (g) Promptfoo exit 1 with a passing result is inconclusive', async () => {
    expectInconclusive(await scanP(1, '{"results":[{"pass":true}]}'), /exited with code 1/i);
  });
  test('T1 (h) Promptfoo {"results":[]} is inconclusive', async () => {
    expectInconclusive(await scanP(0, '{"results":[]}'), /no completed tests|no parseable/i);
  });
  test('T1 (i) Promptfoo entry without a pass field is inconclusive', async () => {
    expectInconclusive(await scanP(0, '{"results":[{"description":"x"}]}'), /no explicit verdict/i);
  });
  test('T1 (j) Promptfoo one entry with pass true is PASS (positive control)', async () => {
    const r = await scanP(0, '{"results":[{"pass":true}]}');
    assert.equal(r.passed, true);
    assert.equal(r.recommendedAction, 'approve');
  });
  test('T1 (j2) Promptfoo failing test is recorded with its severity', async () => {
    const r = await scanP(0, '{"results":[{"pass":false,"severity":"high","category":"redteam","description":"jailbreak"}]}');
    assert.equal(r.passed, false);
    assert.equal(r.findings[0].severity, 'high');
    assert.match(r.findings[0].description, /jailbreak/);
  });
  test('T1 (k) combined: one PASS child and one inconclusive child is L3 review', async () => {
    const { runner } = scanStub({
      garakVersion: OK, pfVersion: OK,
      garakScan: { code: 0, stdout: '{"results":{"p1":{"name":"x","fail_rate":0}}}', stderr: '' },
      pfScan: { code: 1, stdout: '{"results":[{"pass":true}]}', stderr: '' },
    });
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability();
    const r = await s.runFullScan(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-t1-')), () => {});
    assert.equal(r.passed, false);
    assert.equal(r.riskGrade, 'L3');
    assert.equal(r.recommendedAction, 'review');
  });
  test('T1 (l) runFullScan with both children PASS is still inconclusive: the scanners never read the item', async () => {
    const { runner } = scanStub({
      garakVersion: OK, pfVersion: OK,
      garakScan: { code: 0, stdout: '{"results":{"p1":{"name":"x","fail_rate":0}}}', stderr: '' },
      pfScan: { code: 0, stdout: '{"results":[{"pass":true}]}', stderr: '' },
    });
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability();
    const r = await s.runFullScan(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-t1-')), () => {});
    expectInconclusive(r, /did not read the item/i);
    assert.equal(r.scanner, 'both');
    assert.ok(r.garakOutput && r.promptfooOutput, 'both children\'s raw output is kept');
  });
});

suite('SecurityScanner isolation (#468, T4a)', () => {
  test('T4a (a) every scan runs from an existing empty temp folder that is not the install path and is removed after', async () => {
    const install = fs.mkdtempSync(path.join(os.tmpdir(), 'fs-t4a-install-'));
    fs.writeFileSync(path.join(install, 'promptfooconfig.yaml'), 'x: 1\n');
    const { calls, runner } = scanStub({
      garakVersion: OK, pfVersion: OK,
      garakScan: { code: 0, stdout: '{"results":{"p1":{"name":"x","fail_rate":0}}}', stderr: '' },
      pfScan: { code: 0, stdout: '{"results":[{"pass":true}]}', stderr: '' },
    });
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability();
    await s.scanWithGarak(install, () => {});
    await s.scanWithPromptfoo(install, () => {});
    const scans = calls.filter((c) => !c.args.includes('--version'));
    assert.equal(scans.length, 2);
    const tmp = fs.realpathSync.native(os.tmpdir());
    for (const c of scans) {
      assert.ok(c.cwd, 'a cwd is given');
      const cwd = c.cwd as string;
      assert.equal(c.cwdExisted, true, 'the cwd existed during the call');
      assert.equal(c.cwdEntries, 0, 'the cwd was empty');
      assert.notEqual(path.resolve(cwd), path.resolve(install));
      assert.ok(!path.resolve(cwd).startsWith(path.resolve(install) + path.sep), 'not inside the install path');
      assert.ok(fs.realpathSync.native(path.dirname(cwd)) === tmp, 'directly under the OS temp folder');
      assert.equal(fs.existsSync(cwd), false, 'removed afterwards');
    }
  });
  test('T4a (b) promptfoo is started directly (no npx) with redteam run --output json', async () => {
    const { calls, runner } = scanStub({ pfVersion: OK, pfScan: { code: 0, stdout: '{"results":[{"pass":true}]}', stderr: '' } });
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability();
    await s.scanWithPromptfoo(fs.mkdtempSync(path.join(os.tmpdir(), 'fs-t4a-')), () => {});
    assert.equal(calls.filter((c) => c.command === 'npx').length, 0, 'npx is never used');
    const scan = calls.find((c) => c.command === 'promptfoo' && c.args[0] !== '--version');
    assert.ok(scan, 'promptfoo was started');
    assert.deepEqual(scan!.args, ['redteam', 'run', '--output', 'json']);
  });
  test('T4a (c) checkAvailability runs garak --version and promptfoo --version, each from an empty temp folder', async () => {
    const { calls, runner } = scanStub({ garakVersion: OK, pfVersion: OK });
    const s = new SecurityScanner(new EventBus(), runner);
    await s.checkAvailability();
    const v = calls.filter((c) => c.args.includes('--version'));
    assert.deepEqual(v.map((c) => `${c.command} ${c.args.join(' ')}`).sort(), ['garak --version', 'promptfoo --version']);
    for (const c of v) {
      assert.equal(c.cwdExisted, true);
      assert.equal(c.cwdEntries, 0);
      assert.equal(fs.existsSync(c.cwd as string), false);
    }
  });
});
