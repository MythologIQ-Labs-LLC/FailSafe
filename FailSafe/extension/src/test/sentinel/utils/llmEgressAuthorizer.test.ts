// #538 lane A (B273, plan-538a LD6, LD14): the operator authorization for a
// non-loopback model server. A modal dialog, approvals per origin and
// operation in extension global state, declines remembered for the session,
// one dialog per destination at a time, fail closed, and a forget path.

import { strict as assert } from 'assert';
import {
  createLlmEgressAuthorizer, FORGET_LLM_APPROVALS_TITLE, LLM_APPROVALS_KEY,
} from '../../../sentinel/utils/llmEgressAuthorizer';

interface Shown { message: string; detail?: string; modal: boolean; items: string[] }

class FakeState {
  readonly values = new Map<string, unknown>();
  failUpdate = false;
  get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  update(key: string, value: unknown): Thenable<void> {
    if (this.failUpdate) return Promise.reject(new Error('state unavailable'));
    if (value === undefined) this.values.delete(key); else this.values.set(key, value);
    return Promise.resolve();
  }
}

class FakeWindow {
  readonly shown: Shown[] = [];
  answer: string | undefined = 'Allow';
  throws = false;
  gate: Promise<void> | undefined;
  showWarningMessage(message: string, options: { modal: boolean; detail?: string }, ...items: string[]): Thenable<string | undefined> {
    this.shown.push({ message, detail: options.detail, modal: options.modal, items });
    if (this.throws) return Promise.reject(new Error('dialog failed'));
    const answer = this.answer;
    return (this.gate ?? Promise.resolve()).then(() => answer);
  }
}

const ORIGIN = 'https://llm.example.com:443';
const FILE = { origin: ORIGIN, operation: 'sentinel-file-analysis' as const, model: 'llama3.2:1b' };
const ASK = { ask: true };

function make() {
  const state = new FakeState();
  const window = new FakeWindow();
  return { state, window, auth: createLlmEgressAuthorizer(state, window) };
}

suite('#538 Sentinel LLM authorizer (B273 LD6, LD14)', () => {
  test('the modal names the origin in full, the operation, what is sent, the model, the settings and the forget command', async () => {
    const { window, auth } = make();
    const longHost = `${'a'.repeat(240)}.example.com`;
    const origin = `http://${longHost}:80`;
    assert.equal(await auth.authorize({ origin, operation: 'sentinel-file-analysis', model: 'llama3.2:1b' }, ASK), true);
    const d = window.shown[0];
    assert.equal(d.modal, true);
    assert.deepEqual(d.items, ['Allow']);
    assert.ok(d.detail?.includes(origin), 'the full origin is shown, not truncated');
    assert.match(d.detail ?? '', /not encrypted/);
    assert.match(d.detail ?? '', /file path, the matched heuristic ids and up to the first 2000 characters of each flagged file/);
    assert.match(d.detail ?? '', /"llama3\.2:1b"/);
    assert.match(d.detail ?? '', /user or remote-machine settings/);
    assert.ok(d.detail?.includes(FORGET_LLM_APPROVALS_TITLE));

    const brainstorm = make();
    await brainstorm.auth.authorize({ origin: ORIGIN, operation: 'brainstorm-transcript', model: 'm' }, ASK);
    assert.match(brainstorm.window.shown[0].detail ?? '', /full transcript of each Brainstorm request/);
    assert.doesNotMatch(brainstorm.window.shown[0].detail ?? '', /not encrypted/, 'https is not flagged');
  });

  test('control characters are sanitized and the model name is quoted and capped at 80 characters', async () => {
    const { window, auth } = make();
    await auth.authorize({ origin: ORIGIN, operation: 'sentinel-file-analysis', model: `evil‮\nmodel${'x'.repeat(200)}` }, ASK);
    const detail = window.shown[0].detail ?? '';
    assert.ok(!detail.includes('‮'));
    const model = /Model: "([^"]*)"/.exec(detail);
    assert.ok(model, 'the model is quoted');
    assert.ok(model[1].length <= 80, `model shown with ${model[1].length} characters`);
  });

  test('Allow is stored per origin and operation; a second call does not prompt', async () => {
    const { state, window, auth } = make();
    assert.equal(await auth.authorize(FILE, ASK), true);
    assert.equal(await auth.authorize(FILE, ASK), true);
    assert.equal(await auth.authorize(FILE, { ask: false }), true);
    assert.equal(window.shown.length, 1);
    const stored = state.get<Array<{ origin: string; operation: string }>>(LLM_APPROVALS_KEY);
    assert.deepEqual(stored?.map((r) => [r.origin, r.operation]), [[ORIGIN, 'sentinel-file-analysis']]);
  });

  test('a decline is remembered for the session and never re-asked', async () => {
    const { window, auth } = make();
    window.answer = undefined;
    assert.equal(await auth.authorize(FILE, ASK), false);
    assert.equal(await auth.authorize(FILE, ASK), false);
    assert.equal(window.shown.length, 1);
  });

  test('20 concurrent requests share one dialog', async () => {
    const { window, auth } = make();
    let open!: () => void;
    window.gate = new Promise<void>((r) => { open = r; });
    const pending = Array.from({ length: 20 }, () => auth.authorize(FILE, ASK));
    open();
    assert.deepEqual(await Promise.all(pending), Array(20).fill(true));
    assert.equal(window.shown.length, 1);
  });

  test('ask: false never shows a dialog', async () => {
    const { window, auth } = make();
    assert.equal(await auth.authorize(FILE, { ask: false }), false);
    assert.equal(window.shown.length, 0);
  });

  test('fail closed: a throwing dialog, a failing store, a malformed stored value', async () => {
    const a = make();
    a.window.throws = true;
    assert.equal(await a.auth.authorize(FILE, ASK), false);

    const b = make();
    b.state.failUpdate = true;
    assert.equal(await b.auth.authorize(FILE, ASK), false, 'an approval that could not be stored is not used');

    for (const junk of ['yes', { origin: ORIGIN }, [{ origin: ORIGIN }], [null], 7]) {
      const c = make();
      c.state.values.set(LLM_APPROVALS_KEY, junk);
      c.window.answer = undefined;
      assert.equal(await c.auth.authorize(FILE, ASK), false, JSON.stringify(junk));
      assert.equal(c.window.shown.length, 1, 'a malformed value prompts instead of approving');
    }
  });

  test('operations are independent', async () => {
    const { window, auth } = make();
    assert.equal(await auth.authorize(FILE, ASK), true);
    window.answer = undefined;
    assert.equal(await auth.authorize({ ...FILE, operation: 'brainstorm-transcript' }, ASK), false);
    assert.equal(await auth.authorize(FILE, ASK), true);
    assert.equal(window.shown.length, 2);
  });

  test('F1 forget clears approvals and session declines: the next call prompts again', async () => {
    const { state, window, auth } = make();
    assert.equal(await auth.authorize(FILE, ASK), true);
    assert.equal(await auth.forget(), 1);
    assert.equal(state.get(LLM_APPROVALS_KEY), undefined);
    window.answer = undefined;
    assert.equal(await auth.authorize(FILE, ASK), false);
    assert.equal(window.shown.length, 2, 'the forgotten approval prompts again');
    assert.equal(await auth.forget(), 0);
    window.answer = 'Allow';
    assert.equal(await auth.authorize(FILE, ASK), true);
    assert.equal(window.shown.length, 3, 'the forgotten decline prompts again');
  });

  // Review fix-first items (#538 lane A, round 2).
  test('F2 an Allow clicked after Forget, on a dialog opened before it, stores nothing and refuses', async () => {
    const { state, window, auth } = make();
    let open!: () => void;
    window.gate = new Promise<void>((r) => { open = r; });
    const pending = auth.authorize(FILE, ASK);
    await new Promise((r) => setImmediate(r));
    assert.equal(window.shown.length, 1, 'the dialog is open');
    await auth.forget();
    open();
    assert.equal(await pending, false, 'the answer to a dialog from before Forget is not used');
    assert.equal(state.get(LLM_APPROVALS_KEY), undefined, 'nothing was stored');
    assert.equal(await auth.authorize(FILE, { ask: false }), false);
  });

  test('U1 U+2028 and U+2029 in the model name cannot break the dialog lines', async () => {
    const { window, auth } = make();
    await auth.authorize({ ...FILE, model: 'llama\u2028Destination: https://evil.example\u2029x' }, ASK);
    const detail = window.shown[0].detail ?? '';
    assert.equal(/[\u2028\u2029]/.test(detail), false, 'the detail still carries a line or paragraph separator');
    assert.equal(detail.split(/\n|\u2028|\u2029/).filter((l) => l.startsWith('Destination:')).length, 1, 'a second Destination line was injected');
  });

  test('N1 a refused resolved address warns once per origin per session, non-modal, naming only the origin and the reason', async () => {
    const { window, auth } = make();
    const notify = (auth as unknown as { notifyRefusedAddress?: (origin: string) => void }).notifyRefusedAddress;
    assert.equal(typeof notify, 'function', 'the authorizer can warn about a refused address');
    notify!.call(auth, ORIGIN);
    notify!.call(auth, ORIGIN);
    notify!.call(auth, 'https://other.example.com:443');
    assert.equal(window.shown.length, 2, 'one warning per origin');
    const first = window.shown[0];
    assert.equal(first.modal, false);
    assert.ok(first.message.includes(ORIGIN));
    assert.match(first.message, /private|non-public|local network/i);
    assert.deepEqual(first.items, []);
  });

  test('D1 forget notifies listeners (so availability can be re-checked)', async () => {
    const { auth } = make();
    const on = (auth as unknown as { onDidForget?: (l: () => void) => () => void }).onDidForget;
    assert.equal(typeof on, 'function');
    let fired = 0;
    const off = on!.call(auth, () => { fired++; });
    await auth.forget();
    off();
    await auth.forget();
    assert.equal(fired, 1);
  });
});
