// #477/#479/#480 review delta (D3, D4), source checks: the integration evidence
// wiring runs right after Sentinel inside its own try/catch that only logs, and
// both it and main.ts take the governance mode from the enforcement engine.
// Activation itself (a built dist) is the lead's integration check.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// out/test/extension -> extension root
const SRC = path.resolve(__dirname, '..', '..', '..', 'src', 'extension');

function source(file: string): string {
  return fs.readFileSync(path.join(SRC, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

suite('integration evidence wiring placement and governance mode (#477 delta D3, D4, source)', () => {
  const main = source('main.ts');
  const call = main.indexOf('wireIntegrationEvidence(context, {');

  test('D3 the call sits after bootstrapSentinel and before bootstrapGenesis', () => {
    const sentinel = main.indexOf('const sentinel = await bootstrapSentinel');
    const genesis = main.indexOf('genesisManager = await bootstrapGenesis');
    assert.ok(sentinel >= 0 && genesis >= 0 && call >= 0, 'anchors found');
    assert.ok(sentinel < call && call < genesis, `order: sentinel ${sentinel} < call ${call} < genesis ${genesis}`);
  });

  test('D3 the call is inside its own try whose catch logs and never throws', () => {
    const tryAt = main.lastIndexOf('try {', call);
    assert.ok(tryAt >= 0 && call - tryAt < 200, 'a try opens right before the call');
    const catchAt = main.indexOf('} catch', call);
    assert.ok(catchAt > call, 'a catch follows the call');
    const body = main.slice(catchAt, main.indexOf('\n    }', catchAt) + 6);
    assert.match(body, /logger\.(error|warn)\(/);
    assert.ok(!/\bthrow\b/.test(body), `the catch must not rethrow: ${body}`);
  });

  test('D4 main.ts passes the enforcement engine getter', () => {
    const args = main.slice(call, main.indexOf('});', call));
    assert.match(args, /governanceMode:\s*\(\)\s*=>\s*gov\.enforcementEngine\.getGovernanceMode\(\)/);
  });

  test('D4 the wiring does not read the raw governance.mode setting', () => {
    assert.ok(!/governance\.mode/.test(source('integrationEvidenceWiring.ts')));
  });
});
