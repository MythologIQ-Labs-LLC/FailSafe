// #538 lane A (B273, plan-538a LD11 A1): the Sentinel sender. In an LLM mode a
// workspace-chosen non-loopback endpoint receives neither the start probe nor
// the file content; the verdict is still produced, without an LLM evaluation.
// Ran red against main, which probed and then posted the file.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import { allowAll, configProvider, reachableHostNameEndpoint, startCountingServer, type CountingServer } from './utils/llmEgressHarness';
import { fileEvent, makeArbiter } from './arbiterHarness';

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
});
