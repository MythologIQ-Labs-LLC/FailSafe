// #514 (FX960): createOperatorConfirmer shows one modal VS Code dialog at a
// time and approves only on the approve label; sanitizeDialogText keeps
// request text from reshaping the dialog.

import { strict as assert } from 'assert';
import {
  createOperatorConfirmer, isConfirmationOpen, sanitizeDialogText, confirmationFailure,
  l3DecisionRequest, l3BatchRequest, ratifyRequest, rollbackRequest,
  hooksDisableRequest, panicStopRequest, LOOPBACK_FOOTER, REASON_LIMIT,
  type ConfirmationWindow, type OperatorActionRequest,
} from '../../extension/operatorConfirmation';
import type { L3ApprovalRequest } from '../../shared/types/l3-approval';

interface DialogCall { message: string; options: { modal: boolean; detail?: string }; items: string[]; }

function fakeWindow(answer: (call: DialogCall) => Promise<string | undefined>): { window: ConfirmationWindow; calls: DialogCall[] } {
  const calls: DialogCall[] = [];
  const window: ConfirmationWindow = {
    showWarningMessage: (message, options, ...items) => {
      const call = { message, options, items };
      calls.push(call);
      return answer(call);
    },
  };
  return { window, calls };
}

const REQUEST: OperatorActionRequest = { title: 'Do it?', detail: 'line 1\nline 2', approveLabel: 'Do it' };

/** #532 (plan-532c LD8a): the server-side rollback plan the dialog shows. */
const PLAN = {
  checkpointId: 'cp-1', target: 'a'.repeat(40), targetSubject: 'stable state', targetDate: '2026-10-14T00:00:00+00:00',
  workTree: 'C:/work/repo', branch: 'main', head: 'b'.repeat(40), leaving: 3,
};

function l3Item(overrides: Partial<L3ApprovalRequest> = {}): L3ApprovalRequest {
  return {
    id: 'q1', state: 'QUEUED', filePath: 'src/a.ts', riskGrade: 'L3', agentDid: 'did:agent:1',
    agentTrust: 0.5, sentinelSummary: 'touches auth', flags: ['secrets'], queuedAt: 't', slaDeadline: 't',
    ...overrides,
  };
}

suite('#514 operatorConfirmation (FX960)', () => {
  test('shows a modal warning with the built detail and the approve label', async () => {
    const { window, calls } = fakeWindow(async () => 'Do it');
    const confirm = createOperatorConfirmer(window);
    assert.equal(await confirm(REQUEST), 'approved');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].message, 'Do it?');
    assert.deepEqual(calls[0].options, { modal: true, detail: 'line 1\nline 2' });
    assert.deepEqual(calls[0].items, ['Do it']);
  });

  test('declines when the dialog is dismissed or another item is returned', async () => {
    for (const answer of [undefined, 'Cancel', 'do it', 'Do it ']) {
      const { window } = fakeWindow(async () => answer);
      assert.equal(await createOperatorConfirmer(window)(REQUEST), 'declined', `answer ${String(answer)}`);
    }
  });

  test('declines when the dialog throws', async () => {
    const { window } = fakeWindow(async () => { throw new Error('no window'); });
    assert.equal(await createOperatorConfirmer(window)(REQUEST), 'declined');
  });

  test('a second confirm while one is open resolves busy without a second dialog', async () => {
    let release: (v: string | undefined) => void = () => undefined;
    const { window, calls } = fakeWindow(() => new Promise((r) => { release = r; }));
    const confirm = createOperatorConfirmer(window);
    const first = confirm(REQUEST);
    assert.equal(await confirm(REQUEST), 'busy');
    assert.equal(calls.length, 1, 'no second dialog');
    release('Do it');
    assert.equal(await first, 'approved');
    // Once closed, a new confirmation opens a dialog again.
    const third = confirm(REQUEST);
    release(undefined);
    assert.equal(await third, 'declined');
    assert.equal(calls.length, 2);
  });

  // Lane D (plan-l3-routes-guard LD3): routes refuse busy before the architecture lookup.
  test('isConfirmationOpen reads the live open state: false before, true while open, false after it settles or throws', async () => {
    const isOpen = isConfirmationOpen;
    let release: (v: string | undefined) => void = () => undefined;
    const { window } = fakeWindow(() => new Promise((r) => { release = r; }));
    const confirm = createOperatorConfirmer(window);
    assert.equal(isOpen(confirm), false, 'before');
    const first = confirm(REQUEST);
    await Promise.resolve();
    assert.equal(isOpen(confirm), true, 'while open');
    release('Do it');
    await first;
    assert.equal(isOpen(confirm), false, 'after it settles');
    const throwing = createOperatorConfirmer(fakeWindow(async () => { throw new Error('no window'); }).window);
    await throwing(REQUEST);
    assert.equal(isOpen(throwing), false, 'after it throws');
    assert.equal(isOpen(async () => 'approved' as const), false, 'a plain function is never open');
    assert.equal(isOpen(undefined), false, 'no confirmer is never open');
  });

  test('sanitizeDialogText replaces control and bidi-override characters and caps length', () => {
    assert.equal(sanitizeDialogText('a\nb\rc\td\u0000e\u001bf\u0085g'), 'a b c d e f g');
    assert.equal(sanitizeDialogText('x‮y⁦z‏w؜v'), 'x y z w v');
    const long = sanitizeDialogText('r'.repeat(2000), REASON_LIMIT);
    assert.equal(long.length, REASON_LIMIT);
    assert.equal(sanitizeDialogText(long, REASON_LIMIT), long, 'idempotent on its own output');
    assert.equal(sanitizeDialogText(undefined), '');
    // #538: the Unicode line and paragraph separators cannot start a new dialog line.
    assert.equal(sanitizeDialogText('a\u2028b\u2029c'), 'a b c');
  });

  test('L3 request: title and approve label carry the verb; detail lists queue fields, sanitized, with the footer', () => {
    const item = l3Item({ filePath: 'src/a.ts\nRequested by the operator', kind: 'open-design-create-artifact' });
    const approve = l3DecisionRequest(item, 'APPROVED');
    assert.equal(approve.title, 'Approve this L3 item?');
    assert.equal(approve.approveLabel, 'Approve');
    for (const part of ['open-design-create-artifact', 'src/a.ts Requested by the operator', 'L3', 'did:agent:1', 'touches auth', 'secrets', 'Decision (as requested): Approve']) {
      assert.ok(approve.detail.includes(part), `detail has ${part}`);
    }
    assert.ok(approve.detail.endsWith(LOOPBACK_FOOTER));
    const reject = l3DecisionRequest(item, 'REJECTED');
    assert.equal(reject.title, 'Reject this L3 item?');
    assert.equal(reject.approveLabel, 'Reject');
  });

  test('batch, ratify, rollback, hooks-disable and panic-stop requests all end with the loopback footer', () => {
    const batch = l3BatchRequest([l3Item({ id: 'a', filePath: 'f1' }), l3Item({ id: 'b', filePath: 'f2', kind: 'k2' })], 'REJECTED');
    assert.match(batch.title, /^Reject all 2 queued L3 items\?$/);
    assert.ok(batch.detail.includes('f1') && batch.detail.includes('k2: f2'));
    const ratify = ratifyRequest('dec-1', 'ratify', 'because\nreasons');
    assert.ok(ratify.detail.includes('Decision id (as requested): dec-1'));
    assert.ok(ratify.detail.includes('Rationale (as requested): because reasons'));
    const rollback = rollbackRequest('cp-1', { checkpointId: 'cp-1', checkpointType: 'sprint.start', timestamp: '2026-10-14T00:00:00Z' }, 'oops', PLAN);
    assert.ok(rollback.detail.includes('sprint.start') && rollback.detail.includes('2026-10-14T00:00:00Z'));
    assert.ok(rollback.detail.includes('Reason (as requested): oops'));
    for (const r of [batch, ratify, rollback, hooksDisableRequest(), panicStopRequest()]) {
      assert.ok(r.detail.endsWith(LOOPBACK_FOOTER), r.title);
    }
  });

  test('confirmationFailure maps unwired/busy/declined to 503/429/409 with a confirmation field', () => {
    assert.deepEqual(
      [confirmationFailure('unwired'), confirmationFailure('busy'), confirmationFailure('declined')]
        .map((f) => [f.status, f.body.confirmation, f.body.ok]),
      [[503, 'unwired', false], [429, 'busy', false], [409, 'declined', false]],
    );
  });

  test('#532 B284 rollback dialog: work tree, branch, HEAD, target with subject and date, the count leaving, and what --keep does', () => {
    const r = rollbackRequest('cp-1', { checkpointId: 'cp-1', checkpointType: 'sprint.start', timestamp: '2026-10-14T00:00:00Z' }, 'oops', PLAN);
    for (const want of [
      'Work tree: C:/work/repo', 'Branch: main', `Current HEAD: ${'b'.repeat(40)}`,
      `Checkpoint commit: ${'a'.repeat(40)} stable state (2026-10-14T00:00:00+00:00)`, 'Commits leaving the branch: 3',
      'git reset --keep moves the branch to the checkpoint commit and updates the tracked files that differ between the two commits',
      'it stops without changing anything if one of those files has local changes',
      'The 3 commit(s) leaving the branch stay recoverable through git reflog for a limited time.',
      'Ignored files at paths the checkpoint commit tracks can be overwritten.',
      'Rollback is refused while there are uncommitted changes.',
    ]) assert.ok(r.detail.includes(want), `detail has "${want}":\n${r.detail}`);
    assert.ok(!r.detail.includes('Files changed since the checkpoint are reverted.'), 'the old sentence is gone');
    const detached = rollbackRequest('cp-1', {}, '', { ...PLAN, branch: null, targetSubject: 'x\u202Ey' });
    assert.ok(detached.detail.includes('Branch: none (detached HEAD)'));
    assert.ok(!detached.detail.includes('\u202E'), 'the subject is sanitized');
  });
});
