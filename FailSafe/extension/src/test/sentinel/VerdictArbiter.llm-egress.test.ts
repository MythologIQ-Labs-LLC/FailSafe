// #538 lane A (B273, plan-538a LD11 A1): the Sentinel sender. In an LLM mode a
// workspace-chosen non-loopback endpoint receives neither the start probe nor
// the file content; the verdict is still produced, without an LLM evaluation.
// Ran red against main, which probed and then posted the file.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import {
  allowAll, configProvider, reachableHostNameEndpoint, recordingHttp, startCountingServer, type CountingServer,
} from './utils/llmEgressHarness';
import { fileEvent, makeArbiter } from './arbiterHarness';
import { createLlmEgressAuthorizer } from '../../sentinel/utils/llmEgressAuthorizer';

suite('#538 VerdictArbiter LLM egress (B273)', () => {
  let server: CountingServer | undefined;
  teardown(async () => { await server?.close(); server = undefined; });

  test('A1 llm-assisted mode, workspace-file endpoint on a non-loopback host: no probe, no file content', async () => {
    server = await startCountingServer('::');
    const endpoint = await reachableHostNameEndpoint(server);
    const arbiter = makeArbiter(configProvider({ endpoint, source: 'workspace-file', mode: 'llm-assisted' }), { authorizer: allowAll() });
    await arbiter.checkLLMAvailability();
    const { event, dir } = fileEvent('const SECRET_FILE_CONTENT_MARKER = 1;\n');
    try {
      const verdict = await arbiter.evaluateEvent(event);
      assert.equal(server.count(), 0, `the workspace-chosen host received ${server.count()} request(s)`);
      assert.ok(verdict, 'a verdict is still produced');
      assert.equal((verdict as { llmEvaluation?: unknown }).llmEvaluation, undefined);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // Post-fix (audit S1): with a recording transport and an allow-all
  // authorizer, only the source label can refuse.
  test('S1-A1 workspace-file remote with an allow-all authorizer and a recording transport: no request, no authorization asked', async () => {
    const auth = allowAll();
    const rec = recordingHttp();
    const arbiter = makeArbiter(configProvider({ endpoint: 'https://llm.example.test', source: 'workspace-file', mode: 'llm-assisted' }), { authorizer: auth, http: rec.fn });
    await arbiter.checkLLMAvailability();
    const { event, dir } = fileEvent('const SECRET_FILE_CONTENT_MARKER = 1;\n');
    try {
      await arbiter.evaluateEvent(event);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(rec.calls.length, 0);
    assert.equal(auth.calls.length, 0);
  });

  test('A2 heuristic mode: a user-setting remote never prompts at start', async () => {
    const window = new GatedWindow();
    const authorizer = createLlmEgressAuthorizer(new MemoryState(), window);
    const arbiter = makeArbiter(configProvider({ endpoint: 'https://llm.example.test', source: 'user-setting', mode: 'heuristic' }), { authorizer, http: recordingHttp().fn });
    assert.equal(await arbiter.checkLLMAvailability(), false);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(window.shown, 0);
  });

  test('A3 llm-assisted: the start probe never waits for the dialog; Allow re-probes and restores the mode', async () => {
    const window = new GatedWindow();
    const authorizer = createLlmEgressAuthorizer(new MemoryState(), window);
    const rec = recordingHttp();
    const arbiter = makeArbiter(configProvider({ endpoint: 'https://llm.example.test', source: 'user-setting', mode: 'llm-assisted' }), { authorizer, http: rec.fn });
    const started = Date.now();
    assert.equal(await arbiter.checkLLMAvailability(), false);
    assert.ok(Date.now() - started < 500, 'checkLLMAvailability waited for the dialog');
    assert.equal(arbiter.getMode(), 'heuristic');
    assert.equal(rec.calls.length, 0);
    await waitFor(() => window.shown === 1);
    window.answer('Allow');
    await waitFor(() => rec.calls.length === 1 && arbiter.isLlmAvailable());
    assert.equal(rec.calls[0].path, '/api/tags');
    assert.equal(arbiter.getMode(), 'llm-assisted');
  });

  test('A4 Forget makes an approved remote unavailable again, without a new prompt', async () => {
    const window = new GatedWindow();
    const authorizer = createLlmEgressAuthorizer(new MemoryState(), window);
    const rec = recordingHttp();
    const arbiter = makeArbiter(configProvider({ endpoint: 'https://llm.example.test', source: 'user-setting', mode: 'llm-assisted' }), { authorizer, http: rec.fn });
    await arbiter.checkLLMAvailability();
    await waitFor(() => window.shown === 1);
    window.answer('Allow');
    await waitFor(() => arbiter.isLlmAvailable());
    await authorizer.forget();
    await waitFor(() => !arbiter.isLlmAvailable());
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(window.shown, 1, 'Forget does not raise a new dialog');
    assert.equal(arbiter.getMode(), 'heuristic');
  });
});

class MemoryState {
  private readonly values = new Map<string, unknown>();
  get<T>(key: string): T | undefined { return this.values.get(key) as T | undefined; }
  update(key: string, value: unknown): Thenable<void> { this.values.set(key, value); return Promise.resolve(); }
}

/** A dialog that stays open until the test answers it. */
class GatedWindow {
  shown = 0;
  private resolveAnswer: ((choice: string | undefined) => void) | undefined;
  showWarningMessage(): Thenable<string | undefined> {
    this.shown++;
    return new Promise((resolve) => { this.resolveAnswer = resolve; });
  }
  answer(choice: string | undefined): void { this.resolveAnswer?.(choice); }
}

async function waitFor(condition: () => boolean, ms = 2000): Promise<void> {
  const until = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > until) throw new Error('condition not reached in time');
    await new Promise((r) => setTimeout(r, 10));
  }
}
