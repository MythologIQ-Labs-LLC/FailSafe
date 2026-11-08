'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// #475: structural defense in depth, NOT OS-sandbox behavioral attestation.
const src = path.resolve(__dirname, '../../../');
const read = (file) => fs.readFileSync(path.join(src, file), 'utf8');
const aider = read('integrations/agent-cli/aider-wrapper.ts');
const cont = read('integrations/agent-cli/continue-wrapper.ts');
const core = read('integrations/agent-cli/agent-cli-core.ts');
const contract = read('integrations/agent-cli/agent-containment.ts');
const command = read('extension/agent-cli-command.ts');
const catalog = read('integrations/catalog/integration-catalog.ts');

for (const [label, text, detector, binary] of [
  ['aider', aider, 'detectAider', 'aider'],
  ['continue', cont, 'detectContinue', 'cn'],
]) {
  test(`#475 ${label}: containment absence refuses before any version probe or worktree execution`, () => {
    const guard = text.indexOf('const sandboxRun = deps.runInSandbox;');
    const block = text.indexOf('if (!sandboxRun)', guard);
    const detect = text.indexOf(`${detector}(sandboxRun,`, block);
    const isolate = text.indexOf('runIsolated(opts.cwd', detect);
    assert.ok(guard >= 0 && guard < block && block < detect && detect < isolate);
    assert.match(text.slice(block, detect), /blockedOutcome\(/);
    assert.doesNotMatch(text, new RegExp(`${detector}\\(deps\\.run,`));
    assert.match(text.slice(isolate), /run: sandboxRun/);
    assert.match(text, new RegExp(`blockedOutcome\\('${label}'`));
    assert.match(text.slice(block, detect), /OS-enforced agent containment is unavailable/);
  });
}

test('#475 production containment cannot be toggled by workspace configuration', () => {
  assert.match(contract, /export const AGENT_OS_CONTAINMENT_AVAILABLE = false;/);
  assert.match(core, /export \{ AGENT_OS_CONTAINMENT_AVAILABLE \} from '\.\/agent-containment';/);
  assert.equal((command.match(/if \(!AGENT_OS_CONTAINMENT_AVAILABLE\)/g) || []).length, 2);
  const continueStart = command.indexOf("registerCommand('failsafe.continue.run'");
  const aiderStart = command.indexOf("registerCommand('failsafe.aider.run'");
  assert.ok(continueStart > 0 && aiderStart > continueStart);
  const continueBody = command.slice(continueStart, aiderStart);
  const aiderBody = command.slice(aiderStart);
  for (const body of [continueBody, aiderBody]) {
    const guard = body.indexOf('if (!AGENT_OS_CONTAINMENT_AVAILABLE)');
    const prompt = body.indexOf('showInputBox(');
    assert.ok(guard >= 0 && guard < prompt, 'must refuse before prompt collection');
    assert.match(body, /No process was started/);
  }
  assert.ok(continueBody.indexOf('if (!AGENT_OS_CONTAINMENT_AVAILABLE)') < continueBody.indexOf('optionalCredential('),
    'must refuse before credentials are read');
  assert.doesNotMatch(command, /runInSandbox\s*:/);
});

test('#475 integration catalog reports unavailable, not a contained-process promise', () => {
  const summaries = catalog.match(/summary: '.*?OS process containment.*?',/g) || [];
  assert.equal(summaries.length, 2);
  assert.equal((catalog.match(/Enabling (?:Continue|Aider) does not enable CLI execution/g) || []).length, 2);
});
