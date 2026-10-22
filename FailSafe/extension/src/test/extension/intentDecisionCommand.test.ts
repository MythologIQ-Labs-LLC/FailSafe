// B340 (plan-b340-enforce-approval LD1, LD4, LD6): failsafe.intent.decide and failsafe.intent.seal.
//
// The palette flow asks for the verdict and a note; arguments are shown "as requested" with the
// command-call footer; a note over the limit is refused before any dialog. The dialog states the
// scope the approval grants: the entry count, the first 20 entries, "and N more", and a warning for
// every entry (shown or not) that resolves to the workspace root or outside it. The chat
// participant shows the effective status and routes /seal to the seal command instead of sealing.
// The note is recorded exactly as the dialog shows it (review fold; those two rows were written
// after the implementation).

import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { FailSafeChatParticipant } from '../../genesis/chat/FailSafeChatParticipant';
import { close, decide, deps, harness, requireCommands, type Harness } from '../governance/intentDecisionHarness';
import { rawRows } from '../qorelogic/ledgerTestKit';

/* eslint-disable @typescript-eslint/no-explicit-any */
suite('B340 failsafe.intent.decide / failsafe.intent.seal commands', () => {
  let h: Harness | undefined;
  teardown(() => { close(h); h = undefined; });

  test('palette flow: the verdict and note are "your pick", and the dialog states what the approval means', async () => {
    h = await harness();
    const r = await decide(h, 'PASS', { note: 'looks right' });
    assert.equal(r.outcome, 'recorded', r.detail);
    assert.equal(h.confirm.requests.length, 1);
    const req = h.confirm.requests[0];
    assert.match(req.detail, /Verdict \(your pick\): PASS/);
    assert.match(req.detail, /Note \(your pick\): looks right/);
    assert.match(req.detail, /Approved for implementation/);
    assert.match(req.detail, /No audit evidence is bound to this intent; your confirmation is the approval/);
    assert.match(req.detail, /does not identify who/);
    assert.match(req.detail, new RegExp(h.intent.id));
    assert.doesNotMatch(req.detail, /Requested by a command call/);
  });

  test('a palette dismissal writes nothing and shows no dialog', async () => {
    h = await harness();
    const m = requireCommands();
    const before = rawRows(h.ledger).length;
    const r = await m.runIntentDecisionCommand({ ...deps(h), ui: { pickVerdict: async () => undefined, inputNote: async () => '', info: () => undefined } });
    assert.equal(r.outcome, 'dismissed');
    assert.equal(h.confirm.requests.length, 0);
    assert.equal(rawRows(h.ledger).length, before);
  });

  test('arguments are shown as requested; a note over 500 characters is refused before any dialog', async () => {
    h = await harness();
    const m = requireCommands();
    const tooLong = await m.runIntentDecisionCommand(deps(h), { verdict: 'PASS', note: 'x'.repeat(501) });
    assert.equal(tooLong.outcome, 'invalid');
    assert.equal(h.confirm.requests.length, 0);
    const bad = await m.runIntentDecisionCommand(deps(h), { verdict: 'SEALED' });
    assert.equal(bad.outcome, 'invalid', 'only PASS or VETO can be requested');
    h.confirm.answer = 'declined';
    await m.runIntentDecisionCommand(deps(h), { verdict: 'VETO', note: 'n' });
    assert.match(h.confirm.requests[0].detail, /Verdict \(as requested\): VETO/);
    assert.match(h.confirm.requests[0].detail, /Requested by a command call/);
  });

  test('scope lines: count, the first 20, "and N more", and warnings over every entry ("." at position 25, outside entries)', async () => {
    const files = Array.from({ length: 30 }, (_, i) => `src/f${i + 1}.ts`);
    files[24] = '.';
    files[2] = '../outside.ts';
    h = await harness({ files });
    h.confirm.answer = 'declined';
    await decide(h, 'PASS');
    const detail = h.confirm.requests[0].detail;
    assert.match(detail, /Scope \(30 entries\)/);
    assert.match(detail, /and 10 more/);
    assert.doesNotMatch(detail, /src\/f30\.ts/, 'entries after the first 20 are not listed');
    assert.match(detail, /entry 25 "\." covers the whole workspace/);
    assert.match(detail, /entry 3 "\.\.\/outside\.ts" is outside the workspace/);
  });

  // Review fold (reviewB340 item 3), written after the implementation: not red-first evidence.
  test('note at the 500-character limit: shown whole in the dialog and recorded exactly as shown; surrounding spaces are trimmed in both', async () => {
    h = await harness();
    const note = `${'a'.repeat(499)}z`;
    const r = await decide(h, 'PASS', { note: `  ${note}  ` });
    assert.equal(r.outcome, 'recorded', r.detail);
    const shown = /^Note \(your pick\): (.*)$/m.exec(h.confirm.requests[0].detail)?.[1];
    assert.equal(shown, note, 'the dialog shows the whole note');
    const row = rawRows(h.ledger).filter((x) => x.event_type === 'INTENT_DECIDED').pop();
    assert.ok(row, 'a decision row was written');
    assert.equal(JSON.parse(String(row.payload)).note, shown, 'the recorded note is the note the dialog showed');
  });

  // Review fold (reviewB340 item 3), written after the implementation: not red-first evidence.
  test('a note with a control, format (bidi) or line-separator character is refused with note-unshowable before any dialog; nothing is written', async () => {
    h = await harness();
    const m = requireCommands();
    const before = rawRows(h.ledger).length;
    const chars = ['\n', '\t', '\u0007', '\u0085', '\u061c', '\u200b', '\u200e', '\u202e', '\u2066', '\u2028', '\u2029', '\ud800', '\ue000'];
    for (const c of chars) {
      const r: any = await m.runIntentDecisionCommand(deps(h), { verdict: 'PASS', note: `ok${c}ok` });
      assert.equal(r.outcome, 'invalid', `U+${c.charCodeAt(0).toString(16)}: ${r.detail}`);
      assert.match(r.detail, /\(note-unshowable\)/);
    }
    const palette = await decide(h, 'VETO', { note: 'looks \u202eright' });
    assert.equal(palette.outcome, 'invalid', palette.detail);
    assert.match(palette.detail, /\(note-unshowable\)/);
    assert.equal(h.confirm.requests.length, 0, 'no dialog was shown');
    assert.equal(rawRows(h.ledger).length, before, 'nothing was written');
  });

  test('chat: /intent and /status show the effective status; /seal renders the seal command button and never seals', async () => {
    let sealed = 0;
    const file = { id: 'i-1', purpose: 'X', type: 'feature', status: 'PASS', scope: { riskGrade: 'L1', files: [] } };
    const svc: any = {
      getActiveIntent: async () => file,
      getEnforcedActiveIntent: async () => ({ ...file, status: 'PULSE', statusReason: 'not approved' }),
      sealIntent: async () => { sealed++; },
    };
    const sentinel: any = { getStatus: () => ({ running: true, mode: 'observe', filesWatched: 0, queueDepth: 0 }) };
    const qor: any = { getTrustEngine: () => ({ getAllAgents: async () => [] }) };
    const participant: any = new FailSafeChatParticipant(svc, sentinel, qor);
    const run = async (command: string) => {
      const chunks: string[] = [];
      const buttons: Array<{ command: string }> = [];
      const stream: any = {
        markdown: (v: string | vscode.MarkdownString) => { chunks.push(typeof v === 'string' ? v : v.value); },
        button: (b: { command: string }) => { buttons.push(b); },
        progress: () => undefined, reference: () => undefined, anchor: () => undefined, filetree: () => undefined, push: () => undefined,
      };
      await participant.handleRequest({ command, prompt: '', references: [], toolReferences: [] }, {}, stream, { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => undefined }) });
      return { text: chunks.join(''), buttons };
    };
    assert.match((await run('intent')).text, /\*\*Status\*\*: PULSE/);
    assert.match((await run('status')).text, /\*\*Status\*\*: PULSE/);
    const s = await run('seal');
    assert.equal(sealed, 0, '/seal does not seal');
    assert.ok(s.buttons.some((b) => b.command === 'failsafe.intent.seal'), `buttons: ${JSON.stringify(s.buttons)}`);
  });
});
