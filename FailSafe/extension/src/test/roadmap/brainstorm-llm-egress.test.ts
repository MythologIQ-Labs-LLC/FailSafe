// #538 lane A (B273, plan-538a LD11 B1-B3): the Brainstorm sender. A voice
// transcript never reaches a destination the policy refuses; Brainstorm then
// takes its existing fallback (a VS Code language model, or "No LLM
// available", which queues the transcript). B1 and B2 ran red against main,
// which posted the transcript to any endpoint that answered the probe.

import { strict as assert } from 'assert';
import { createBrainstormService } from '../../roadmap/services/ConsoleServerSupport';
import type { BrainstormService } from '../../roadmap/services/BrainstormService';
import type { IConfigProvider } from '../../core/interfaces/IConfigProvider';
import {
  configProvider, reachableHostNameEndpoint, startCountingServer, type CountingServer,
} from '../sentinel/utils/llmEgressHarness';

const TRANSCRIPT = 'We should ship the SECRET_TRANSCRIPT_MARKER feature next week.';

/** createBrainstormService with an authorizer, compiled against main's one-parameter signature. */
function brainstorm(config: IConfigProvider, authorizer?: unknown): BrainstormService {
  return (createBrainstormService as unknown as (c: IConfigProvider, a?: unknown) => BrainstormService)(config, authorizer);
}

suite('#538 Brainstorm transcript egress (B273)', () => {
  let server: CountingServer | undefined;
  teardown(async () => { await server?.close(); server = undefined; });

  for (const source of ['workspace-file', 'user-setting'] as const) {
    test(`${source === 'workspace-file' ? 'B1' : 'B2'} ${source} on a non-loopback host${source === 'user-setting' ? ' without an authorizer' : ''}: the transcript never reaches it`, async () => {
      server = await startCountingServer('::');
      const endpoint = await reachableHostNameEndpoint(server);
      const result = await brainstorm(configProvider({ endpoint, source })).processTranscript(TRANSCRIPT);
      assert.equal(server.count(), 0, `the refused host received ${server.count()} request(s)`);
      assert.ok(!server.received.some((r) => r.body.includes('SECRET_TRANSCRIPT_MARKER')));
      assert.ok(result.extraction || result.queued, 'the existing fallback path ran');
    });
  }

  test('B3 the default loopback endpoint still receives the transcript, once', async () => {
    server = await startCountingServer('127.0.0.1', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.end(req.url.endsWith('/api/generate')
        ? JSON.stringify({ response: '{"nodes":[],"edges":[]}', total_duration: 1 })
        : '{"models":[]}');
    });
    const result = await brainstorm(configProvider({ endpoint: `http://127.0.0.1:${server.port}`, source: 'default' })).processTranscript(TRANSCRIPT);
    const generates = server.received.filter((r) => r.url === '/api/generate');
    assert.equal(generates.length, 1);
    assert.ok(generates[0].body.includes('SECRET_TRANSCRIPT_MARKER'));
    assert.ok(result.extraction, 'the loopback model answered');
  });
});
