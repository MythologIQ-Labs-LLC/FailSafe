// #514 (FX960): createOperatorConfirmer shows one modal VS Code dialog at a
// time and approves only on the approve label; sanitizeDialogText keeps
// request text from reshaping the dialog.

import { strict as assert } from 'assert';
import {
  createOperatorConfirmer, isConfirmationOpen, sanitizeDialogText, confirmationFailure,
  l3DecisionRequest, l3BatchRequest, ratifyRequest, rollbackRequest,
  hooksDisableRequest, panicStopRequest, LOOPBACK_FOOTER, REASON_LIMIT,
  deliveryReviewRequest, escapeDialogPath, REWORK_PATH_CHUNK, type DeliveryReviewFacts,
  type ConfirmationWindow, type OperatorActionRequest,
} from '../../extension/operatorConfirmation';
import type { ReworkEntry } from '../../governance/types/IntentTypes';
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

// #532 B344 (plan-b344 LD5, red-first): the rework section of the delivery-review dialog.
suite('#532 B344 delivery review dialog: rework section', () => {
  const V = 'b'.repeat(40);
  const R = 'c'.repeat(40);
  const P = 'a'.repeat(40);
  const rework = (vetoEntryId: number, shared: Array<{ path: string; vetoStatus: 'A' | 'M' | 'D' | 'T'; reworkStatus: 'A' | 'M' | 'D' | 'T' }>,
    onlyInVeto: Array<{ path: string; status: 'A' | 'M' | 'D' | 'T' }> = [], onlyInRework: Array<{ path: string; status: 'A' | 'M' | 'D' | 'T' }> = []): ReworkEntry => ({
    vetoEntryId, vetoEntryHash: 'h'.repeat(64), vetoCommit: V, reworkCommit: R, relation: 'amended',
    evidence: { vetoParent: P, reworkParent: P, vetoDiffId: '1'.repeat(64), reworkDiffId: '2'.repeat(64),
      vetoPathCount: shared.length + onlyInVeto.length, reworkPathCount: shared.length + onlyInRework.length, shared, onlyInVeto, onlyInRework },
  });
  const item = (id: number, kind = 'veto') => ({
    kind, id, hash: `h${id}`, label: `item ${id}`, verdict: kind === 'veto' ? 'VETO' : null, commitSha: kind === 'veto' ? V : null,
    commitTrusted: kind === 'veto', timestamp: 't', note: null,
  });
  const facts = (superseded: ReturnType<typeof item>[], reworks: ReworkEntry[]): DeliveryReviewFacts => ({
    intent: { id: '11111111-1111-4111-8111-111111111111', purpose: 'Deliver' }, verdict: 'PASS',
    commit: { sha: R, subject: 'rework', tree: 'd'.repeat(40), branch: 'main' }, linked: [{ commitSha: R }],
    binding: { evidenceDigest: 'e'.repeat(64), evidenceCount: 1 }, superseded, note: '', reviewerDid: 'did:myth:overseer:local', reworks,
  });

  test('D1: the rework section comes first, lists every path with its status, and escapes unsafe characters exactly', () => {
    const r = rework(7,
      [{ path: 'a\nb.ts', vetoStatus: 'M', reworkStatus: 'M' }, { path: '\u202Eevil.ts', vetoStatus: 'A', reworkStatus: 'M' }],
      [{ path: 'x\\y.ts', status: 'D' }],
      [{ path: 'z\u2028\u200D\u2029\u{E0041}.ts', status: 'A' }, { path: 'kind.ts', status: 'T' }]);
    const d = deliveryReviewRequest(facts([item(7)], [r]), 'op_1', 'console').detail;
    const rw = d.indexOf('Superseded by rework');
    assert.ok(rw >= 0 && rw < d.indexOf('Supersedes ('), 'the rework section comes before the supersedes list');
    for (const shown of ['M/M a\\u{000A}b.ts', 'A/M \\u{202E}evil.ts', 'D x\\\\y.ts', 'A z\\u{2028}\\u{200D}\\u{2029}\\u{E0041}.ts', 'T kind.ts']) {
      assert.ok(d.includes(shown), `${JSON.stringify(shown)} in ${d}`);
    }
    assert.ok(!/\u2028|\u2029|\u200D|\u202E|\u{E0041}/u.test(d), 'no raw unsafe character reaches the dialog');
    assert.equal(escapeDialogPath('a\u{E0041}\\'), 'a\\u{E0041}\\\\');
    assert.equal(escapeDialogPath('plain/path.ts'), 'plain/path.ts');
    assert.ok(d.includes(`superseded by rework ${R}`) && d.includes('amended'));
  });

  test('D1b (written after the implementation, for the "path list sliced" mutation): every list of an amended rework is shown in full', () => {
    const names = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}.ts`);
    const r = rework(9,
      names('s', 5).map((p) => ({ path: p, vetoStatus: 'M' as const, reworkStatus: 'M' as const })),
      names('v', 4).map((p) => ({ path: p, status: 'D' as const })),
      names('r', 4).map((p) => ({ path: p, status: 'A' as const })));
    const d = deliveryReviewRequest(facts([item(9)], [r]), 'op_1b', 'console').detail;
    const section = d.slice(d.indexOf('Superseded by rework'), d.indexOf('Supersedes ('));
    for (const shown of [...names('s', 5).map((p) => `M/M ${p}`), ...names('v', 4).map((p) => `D ${p}`), ...names('r', 4).map((p) => `A ${p}`)]) {
      assert.ok(section.includes(shown), `${shown} in ${section}`);
    }
  });

  test('D2: with 25 superseded items and the rework last, the rework section is complete; only the rest is under "and N more"', () => {
    const items = [...Array.from({ length: 24 }, (_, i) => item(i + 1, 'unverifiable-row')), item(25)];
    const d = deliveryReviewRequest(facts(items, [rework(25, [{ path: 'only.ts', vetoStatus: 'M', reworkStatus: 'M' }])]), 'op_2', 'console').detail;
    const section = d.slice(d.indexOf('Superseded by rework'), d.indexOf('Supersedes ('));
    assert.match(section, /VETO #25/);
    assert.ok(section.includes('M/M only.ts'));
    assert.match(d, /and 5 more/);
  });

  test('D2b: a reworked VETO in the legacy list says "superseded by rework", never "an ancestor"', () => {
    const items = [item(1, 'unverifiable-row'), item(2, 'unverifiable-row'), item(3)];
    const d = deliveryReviewRequest(facts(items, [rework(3, [{ path: 'a.ts', vetoStatus: 'M', reworkStatus: 'M' }])]), 'op_3', 'console').detail;
    const legacy = d.slice(d.indexOf('Supersedes ('));
    const line = legacy.split('\n').find((l) => l.includes('veto #3'))!;
    assert.match(line, /superseded by rework/);
    assert.doesNotMatch(line, /an ancestor of the reviewed commit/);
  });

  // #532 B344 D4 fold (owner ruling 2026-10-21, red-first): the native dialog wraps only at spaces and
  // cuts a longer unbroken run with an ellipsis, so every shown path is split into chunks of at most
  // REWORK_PATH_CHUNK characters, after a '/' where possible, each continuation on its own line after
  // the marker.
  const sectionOf = (d: string) => d.slice(d.indexOf('Superseded by rework'), d.indexOf('Supersedes ('));
  const longPath = (n: number) => {
    let p = '';
    for (let i = 0; p.length < n; i++) p += `dir${String(i).padStart(2, '0')}abcdefghij/`;
    return p.slice(0, n - 3) + '.ts';
  };
  /** The shown text of each path, rebuilt from its line and the continuation lines after it. */
  const rebuilt = (section: string): string[] => {
    const out: string[] = [];
    for (const line of section.split('\n')) {
      const path = /^ {4}(?:[AMDT-]\/[AMDT-]|[AMDT]) (.*)$/.exec(line);
      const cont = /^ {6}\\> (.*)$/.exec(line);
      if (path) out.push(path[1]);
      else if (cont) out[out.length - 1] += cont[1];
    }
    return out;
  };

  test(`D4 fold (red-first): a 90- and a 300-character path are shown in chunks of at most REWORK_PATH_CHUNK (${REWORK_PATH_CHUNK}), after a "/" where possible, with no unbroken run over it`, () => {
    for (const n of [90, 300]) {
      const p = longPath(n);
      assert.equal(p.length, n);
      const d = deliveryReviewRequest(facts([item(5)], [rework(5, [{ path: p, vetoStatus: 'M', reworkStatus: 'M' }], [], [{ path: `x/${p}`, status: 'A' }])]), 'op_d4', 'console').detail;
      const lines = sectionOf(d).split('\n');
      // The path lines and their continuations; the other section lines hold fixed-width server values.
      const pathLines = lines.filter((l) => /^ {4}(M\/M|A) /.test(l));
      const continuations = lines.filter((l) => /^ {6}\\> /.test(l));
      assert.equal(pathLines.length, 2);
      for (const line of [...pathLines, ...continuations]) {
        const shown = line.replace(/^ {4}(M\/M|A) | {6}\\> /, '');
        assert.ok(shown.length <= REWORK_PATH_CHUNK, `a chunk of ${shown.length} in ${JSON.stringify(line)}`);
        for (const run of line.split(' ')) assert.ok(run.length <= REWORK_PATH_CHUNK, `a run of ${run.length} in ${JSON.stringify(line)}`);
      }
      assert.ok(continuations.length >= 2 * (Math.ceil(n / REWORK_PATH_CHUNK) - 1), `${n}: ${continuations.length} continuation lines`);
      for (const line of pathLines) assert.ok(line.endsWith('/'), `the first chunk breaks after a "/": ${JSON.stringify(line)}`);
      assert.deepEqual(rebuilt(sectionOf(d)), [p, `x/${p}`], 'each path is shown exactly, nothing cut or collapsed');
    }
  });

  test('D4 fold (red-first): a path holding the marker, a newline or spaces cannot forge a continuation line', () => {
    const forged = ['a\\> b.ts', `long/${'n'.repeat(70)}\n      \\> evil.ts`, `${' '.repeat(6)}\\> c.ts`, `q/${'\\'.repeat(40)}>${'\\'.repeat(40)}.ts`];
    const d = deliveryReviewRequest(facts([item(6)], [rework(6, forged.map((path) => ({ path, vetoStatus: 'M' as const, reworkStatus: 'M' as const })))]), 'op_d4b', 'console').detail;
    const section = sectionOf(d);
    assert.deepEqual(rebuilt(section), forged.map(escapeDialogPath), 'each path rebuilds to its escaped text');
    // In escaped text every backslash is half of "\\" or starts "\u{", so "\>" after a space or at a
    // line start is only ever the marker. The section's first line is its fixed legend, which names
    // the marker, so it is left out of the count.
    const markers = [...section.split('\n').slice(1).join('\n').matchAll(/(?:^|[^\\])\\>/gm)].length;
    const continuations = section.split('\n').filter((l) => /^ {6}\\> /.test(l)).length;
    assert.equal(markers, continuations, 'every marker starts a continuation line the chunker wrote');
    assert.ok(continuations >= 2, 'the long paths do continue');
    assert.doesNotMatch(section, /^ {6}\\> evil\.ts$/m, 'the newline in a path never starts a line');
  });

  test('D4 fold (written after the implementation, for the 40-character chunk): a path of M and W runs, the widest Latin capitals, is shown in chunks of at most 40', () => {
    const paths = [`${'M'.repeat(100)}/${'W'.repeat(90)}.ts`, 'MW'.repeat(70)];
    const d = deliveryReviewRequest(facts([item(10)], [rework(10, paths.map((path) => ({ path, vetoStatus: 'M' as const, reworkStatus: 'M' as const })))]), 'op_d4d', 'console').detail;
    const section = sectionOf(d);
    assert.equal(REWORK_PATH_CHUNK, 40);
    assert.deepEqual(rebuilt(section), paths);
    const chunks = section.split('\n').map((l) => /^ {4}M\/M (.*)$/.exec(l)?.[1] ?? /^ {6}\\> (.*)$/.exec(l)?.[1]).filter((c): c is string => c !== undefined);
    assert.ok(chunks.length >= 9, `${chunks.length} chunks`);
    for (const c of chunks) assert.ok(c.length <= 40, `a chunk of ${c.length}: ${c}`);
  });

  test('D4 fold (written after the implementation, for the escape-split mutation): a chunk never ends or starts inside an escape', () => {
    // 'xy' puts the escapes off the REWORK_PATH_CHUNK grid, so a split by character would cut one.
    const paths = [`xy${'\u{E0041}'.repeat(20)}.ts`, `z${'\\'.repeat(70)}.ts`];
    const d = deliveryReviewRequest(facts([item(8)], [rework(8, paths.map((path) => ({ path, vetoStatus: 'M' as const, reworkStatus: 'M' as const })))]), 'op_d4c', 'console').detail;
    const section = sectionOf(d);
    assert.deepEqual(rebuilt(section), paths.map(escapeDialogPath));
    const chunks = section.split('\n').map((l) => /^ {4}M\/M (.*)$/.exec(l)?.[1] ?? /^ {6}\\> (.*)$/.exec(l)?.[1]).filter((c): c is string => c !== undefined);
    assert.ok(chunks.length >= 6, `${chunks.length} chunks`);
    for (const c of chunks) {
      assert.equal(c.replace(/\\\\|\\u\{[0-9A-F]+\}/g, '').includes('\\'), false, `a whole number of escapes in ${JSON.stringify(c)}`);
      assert.ok(c.length <= REWORK_PATH_CHUNK);
    }
  });

  test('the VETO wording names declared rework (review fold, red-first for the wording: it never says git "shows" an amendment)', () => {
    const d = deliveryReviewRequest({ ...facts([], []), verdict: 'VETO' }, 'op_4', 'console').detail;
    assert.match(d, /a PASS on a declared rework with this commit's diff \(rebased\), or with its parent and more than half of its non-bookkeeping paths \(amended\)/);
    assert.doesNotMatch(d, /git shows/);
  });

  // #532 B344 review fold (owner ruling 2026-10-21, red-first): bookkeeping files are listed in the
  // dialog as such, apart from the counted lists, and the legend states the rule without claiming git
  // "shows" an amendment.
  test('D5 (red-first): an amended rework lists bookkeeping files apart, as not counted, and the legend states the rule', () => {
    const r = rework(11,
      [{ path: 'CHANGELOG.md', vetoStatus: 'M', reworkStatus: 'M' }, { path: 'a.ts', vetoStatus: 'M', reworkStatus: 'M' }],
      [{ path: 'docs/BACKLOG.md', status: 'M' }],
      [{ path: 'FailSafe/extension/package-lock.json', status: 'M' }, { path: 'b.ts', status: 'A' }]);
    const section = sectionOf(deliveryReviewRequest(facts([item(11)], [r]), 'op_d5', 'console').detail);
    const lines = section.split('\n');
    const at = (text: string) => lines.indexOf(text);
    const book = at('  Bookkeeping files, not counted (3), status in the vetoed commit/the rework (- where unchanged):');
    assert.ok(book > 0, section);
    for (const counted of ['  Shared (1), status in the vetoed commit/the rework:', '    M/M a.ts', '  Only in the vetoed commit (0):', '  Only in the rework (1):', '    A b.ts']) {
      assert.ok(at(counted) > 0 && at(counted) < book, `${JSON.stringify(counted)} before the bookkeeping list:\n${section}`);
    }
    for (const listed of ['    M/M CHANGELOG.md', '    M/- docs/BACKLOG.md', '    -/M FailSafe/extension/package-lock.json']) {
      assert.ok(at(listed) > book, `${JSON.stringify(listed)} in the bookkeeping list:\n${section}`);
    }
    assert.doesNotMatch(lines[0], /git shows/);
    assert.match(lines[0], /identical diff \(rebased\)/);
    assert.match(lines[0], /more than half of the vetoed commit's non-bookkeeping paths/);
    assert.match(lines[0], /bookkeeping files are listed but not counted/);
  });

  test('D6 (red-first): a space other than U+0020, and a U+0020 at either end of a path or of a chunk, is shown escaped', () => {
    assert.equal(escapeDialogPath('a b.ts'), 'a\\u{00A0}b.ts');
    assert.equal(escapeDialogPath('a　b c'), 'a\\u{3000}b\\u{2007}c');
    assert.equal(escapeDialogPath('x.ts '), 'x.ts\\u{0020}');
    assert.equal(escapeDialogPath(' x.ts'), '\\u{0020}x.ts');
    assert.equal(escapeDialogPath('my dir/a b.ts'), 'my dir/a b.ts', 'an inner U+0020 stays a space');
    const p = `${'a'.repeat(REWORK_PATH_CHUNK - 1)} ${'b'.repeat(10)}`;
    const section = sectionOf(deliveryReviewRequest(facts([item(12)], [rework(12, [{ path: p, vetoStatus: 'M', reworkStatus: 'M' }])]), 'op_d6', 'console').detail);
    assert.deepEqual(rebuilt(section), [escapeDialogPath(p)]);
    const chunks = section.split('\n').map((l) => /^ {4}M\/M (.*)$/.exec(l)?.[1] ?? /^ {6}\\> (.*)$/.exec(l)?.[1]).filter((c): c is string => c !== undefined);
    assert.ok(chunks.length >= 2);
    for (const c of chunks) assert.ok(!c.startsWith(' ') && !c.endsWith(' '), `a chunk with an edge space: ${JSON.stringify(c)}`);
  });
});
