import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as crypto from 'crypto';
import {
  GovernanceWebhook,
  buildWebhookRequest,
  signWebhookBody,
  SIGNATURE_HEADER,
  type WebhookConfig,
  type WebhookTransport,
} from '../../governance/GovernanceWebhook';

/** Captures every transport invocation; resolves success without touching a socket. */
function captureTransport() {
  const calls: Array<{ options: { hostname: string; port: string | number; path: string; headers: Record<string, string | number> }; body: string }> = [];
  const transport: WebhookTransport = (options, body) => {
    calls.push({ options, body });
    return Promise.resolve({ success: true, statusCode: 200 });
  };
  return { calls, transport };
}

const TS = '2026-08-20T00:00:00.000Z';
const SECRET = 'NOTAREALSECRET';

const config = (over: Partial<WebhookConfig> = {}): WebhookConfig => ({
  url: 'https://example.com/hook',
  events: ['*'],
  payloadFields: ['verdict'],
  ...over,
});

describe('GovernanceWebhook – authenticated integrity (F-4)', () => {
  it('signs the exact body with HMAC-SHA256 when a secret is configured', () => {
    const req = buildWebhookRequest(config({ secret: SECRET }), 'veto', { verdict: 'VETO' }, TS);
    const expected =
      'sha256=' + crypto.createHmac('sha256', SECRET).update(req.body, 'utf8').digest('hex');
    assert.strictEqual(req.headers[SIGNATURE_HEADER], expected);
  });

  it('a receiver recomputing over the transmitted body accepts the signature', () => {
    const req = buildWebhookRequest(config({ secret: SECRET }), 'veto', { verdict: 'VETO' }, TS);
    assert.strictEqual(signWebhookBody(SECRET, req.body), req.headers[SIGNATURE_HEADER]);
  });

  it('a tampered body no longer verifies against the transmitted signature', () => {
    const req = buildWebhookRequest(config({ secret: SECRET }), 'veto', { verdict: 'VETO' }, TS);
    const tampered = req.body.replace('VETO', 'PASS');
    assert.notStrictEqual(tampered, req.body);
    assert.notStrictEqual(signWebhookBody(SECRET, tampered), req.headers[SIGNATURE_HEADER]);
  });

  it('a wrong secret does not verify', () => {
    const req = buildWebhookRequest(config({ secret: SECRET }), 'veto', { verdict: 'VETO' }, TS);
    assert.notStrictEqual(signWebhookBody('OTHERSECRET', req.body), req.headers[SIGNATURE_HEADER]);
  });

  it('omits the signature header entirely when no secret is configured', () => {
    const req = buildWebhookRequest(config(), 'veto', { verdict: 'VETO' }, TS);
    assert.ok(!(SIGNATURE_HEADER in req.headers));
  });

  it('treats an empty-string secret as absent rather than signing with it', () => {
    const req = buildWebhookRequest(config({ secret: '' }), 'veto', { verdict: 'VETO' }, TS);
    assert.ok(!(SIGNATURE_HEADER in req.headers));
  });

  it('never places the secret itself in any header', () => {
    const req = buildWebhookRequest(config({ secret: SECRET }), 'veto', { verdict: 'VETO' }, TS);
    assert.ok(!JSON.stringify(req.headers).includes(SECRET));
    assert.ok(!req.body.includes(SECRET));
  });
});

describe('GovernanceWebhook – payload allowlist (F-4)', () => {
  it('transmits only declared fields and drops undeclared ones', () => {
    const req = buildWebhookRequest(
      config({ payloadFields: ['verdict'] }),
      'veto',
      { verdict: 'VETO', apiToken: 'NOTAREALTOKEN', absPath: '/home/user/secret' },
      TS,
    );
    const sent = JSON.parse(req.body).payload;
    assert.deepStrictEqual(sent, { verdict: 'VETO' });
    assert.ok(!req.body.includes('NOTAREALTOKEN'));
    assert.ok(!req.body.includes('/home/user/secret'));
  });

  it('omits declared fields the payload does not carry rather than sending undefined', () => {
    const req = buildWebhookRequest(
      config({ payloadFields: ['verdict', 'reason'] }),
      'veto',
      { verdict: 'VETO' },
      TS,
    );
    assert.deepStrictEqual(JSON.parse(req.body).payload, { verdict: 'VETO' });
  });

  it('does not leak inherited prototype properties as if they were payload fields', () => {
    const parented = Object.create({ verdict: 'INHERITED' }) as Record<string, unknown>;
    const req = buildWebhookRequest(config({ payloadFields: ['verdict'] }), 'veto', parented, TS);
    assert.deepStrictEqual(JSON.parse(req.body).payload, {});
  });

  it('rejects registration without an explicit allowlist', () => {
    const webhook = new GovernanceWebhook();
    const bare = { url: 'https://example.com/hook', events: ['*'] } as unknown as WebhookConfig;
    assert.throws(() => webhook.register(bare), /payloadFields/);
  });

  it('rejects an empty allowlist', () => {
    const webhook = new GovernanceWebhook();
    assert.throws(() => webhook.register(config({ payloadFields: [] })), /payloadFields/);
  });
});

describe('GovernanceWebhook – query-string fidelity (F-4)', () => {
  it('preserves the query string on the request path', () => {
    const req = buildWebhookRequest(
      config({ url: 'https://example.com/hook?tenant=acme&token=abc' }),
      'veto',
      { verdict: 'VETO' },
      TS,
    );
    assert.strictEqual(req.path, '/hook?tenant=acme&token=abc');
  });

  it('leaves the path unchanged when there is no query string', () => {
    const req = buildWebhookRequest(config(), 'veto', { verdict: 'VETO' }, TS);
    assert.strictEqual(req.path, '/hook');
  });
});

describe('GovernanceWebhook – diagnostics redaction (F-4)', () => {
  it('never returns the shared secret from getRegistered()', () => {
    const webhook = new GovernanceWebhook();
    webhook.register(config({ secret: SECRET }));
    const listed = webhook.getRegistered();
    assert.ok(!JSON.stringify(listed).includes(SECRET));
    assert.strictEqual(listed[0].hasSecret, true);
  });

  it('reports hasSecret false when none is configured', () => {
    const webhook = new GovernanceWebhook();
    webhook.register(config());
    assert.strictEqual(webhook.getRegistered()[0].hasSecret, false);
  });

  it('does not hand out a live reference that can bypass register() validation', () => {
    const webhook = new GovernanceWebhook();
    webhook.register(config());
    const listed = webhook.getRegistered();
    listed[0].url = 'https://127.0.0.1/hook';
    listed[0].events.push('other');
    assert.strictEqual(webhook.getRegistered()[0].url, 'https://example.com/hook');
    assert.deepStrictEqual(webhook.getRegistered()[0].events, ['*']);
  });

  it('does not let the caller mutate a stored config through the object it registered', () => {
    const webhook = new GovernanceWebhook();
    const original = config();
    webhook.register(original);
    original.url = 'https://127.0.0.1/hook';
    original.payloadFields.push('everything');
    assert.strictEqual(webhook.getRegistered()[0].url, 'https://example.com/hook');
    assert.deepStrictEqual(webhook.getRegistered()[0].payloadFields, ['verdict']);
  });
});

describe('GovernanceWebhook – transport wiring + byte bound (#350 / FX919)', () => {
  it('transmits EXACTLY the builder contract: path, signature header, and body byte-identical', async () => {
    const { calls, transport } = captureTransport();
    const hook = new GovernanceWebhook(transport);
    hook.register({
      url: 'https://example.com/hook/path?tenant=t1&mode=live',
      events: ['*'], payloadFields: ['verdict'], secret: 'NOTAREALSECRET',
    });
    const results = await hook.dispatch('veto', { verdict: 'VETO' });
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].success, true);
    assert.strictEqual(calls.length, 1);
    const sent = calls[0];
    // Byte-identity mechanism (audit #565 F3): extract the timestamp from the
    // transmitted body and recompute the builder output with it — the signature
    // covers the body, so extraction is legitimate; structural comparison is
    // deliberately NOT used (it would not catch a send() that rebuilds parts).
    const ts = JSON.parse(sent.body).timestamp as string;
    const expected = buildWebhookRequest(
      { url: 'https://example.com/hook/path?tenant=t1&mode=live', events: ['*'], payloadFields: ['verdict'], secret: 'NOTAREALSECRET' },
      'veto', { verdict: 'VETO' }, ts,
    );
    assert.strictEqual(sent.body, expected.body, 'transmitted body must be the builder body, byte-identical');
    assert.strictEqual(sent.options.path, expected.path, 'transmitted path must preserve the query string');
    assert.strictEqual(sent.options.headers[SIGNATURE_HEADER], expected.headers[SIGNATURE_HEADER],
      'transmitted signature must be the builder signature over the transmitted bytes');
    // Single parse (audit #565 F2/F6): hostname/port come from the builder's
    // one url.URL parse — hostname verbatim, port defaulted by the builder.
    assert.strictEqual(sent.options.hostname, expected.hostname);
    assert.strictEqual(sent.options.port, expected.port);
    assert.strictEqual(expected.port, 443);
  });

  it('oversized payload resolves the per-target failure — dispatch never rejects, siblings isolated', async () => {
    const { calls, transport } = captureTransport();
    const hook = new GovernanceWebhook(transport);
    // Sibling-isolation mechanism (audit #566 N3): per-target divergence via
    // differing allowlists — target A declares the huge key, target B does not.
    hook.register({
      url: 'https://oversized.invalid/hook', events: ['*'],
      payloadFields: ['verdict', 'blob'], secret: 'NOTAREALSECRET', maxPayloadBytes: 1024,
    });
    hook.register({
      url: 'https://small.example.com/hook', events: ['*'], payloadFields: ['verdict'],
    });
    const results = await hook.dispatch('veto', { verdict: 'VETO', blob: 'x'.repeat(4096) });
    assert.strictEqual(results.length, 2, 'dispatch must resolve BOTH per-target results (never rejects)');
    const failed = results.find(r => !r.success);
    const ok = results.find(r => r.success);
    assert.ok(failed && /maxPayloadBytes|exceeds/i.test(failed.error ?? ''),
      `oversized target must fail-closed naming the bound; got ${JSON.stringify(results)}`);
    assert.ok(ok, 'the in-bounds sibling must still transmit and succeed');
    // "No signature for the oversized target" is carried structurally by
    // calls.length === 1: its transport call never exists, so no header of
    // any kind was ever produced for it.
    assert.strictEqual(calls.length, 1, 'transport must never be invoked for the oversized target');
    assert.strictEqual(calls[0].options.hostname, 'small.example.com');
  });

  it('a body at exactly the cap passes', () => {
    const probe = buildWebhookRequest(
      { url: 'https://example.com/hook', events: ['*'], payloadFields: ['verdict'] },
      'veto', { verdict: 'V' }, '2026-08-20T00:00:00.000Z',
    );
    const exact = Buffer.byteLength(probe.body);
    const req = buildWebhookRequest(
      { url: 'https://example.com/hook', events: ['*'], payloadFields: ['verdict'], maxPayloadBytes: exact },
      'veto', { verdict: 'V' }, '2026-08-20T00:00:00.000Z',
    );
    assert.strictEqual(Buffer.byteLength(req.body), exact);
  });

  it('non-positive maxPayloadBytes falls back to the default in the builder (single source of truth)', () => {
    // audit #566 N1: direct builder callers bypass register(); a negative cap
    // must not make every body oversized.
    const req = buildWebhookRequest(
      { url: 'https://example.com/hook', events: ['*'], payloadFields: ['verdict'], maxPayloadBytes: -1 },
      'veto', { verdict: 'VETO' }, '2026-08-20T00:00:00.000Z',
    );
    assert.ok(req.body.includes('VETO'), 'negative cap must mean default, not reject-everything');
  });

  it('builder returns the url.URL hostname VERBATIM (brackets preserved for IPv6 literals)', () => {
    // Deliberate coupling (audit #565 F2): normalizing brackets would make the
    // deliberately-unfixed #347 bracketed-private-IPv6 SSRF residual reachable.
    const req = buildWebhookRequest(
      { url: 'https://[2001:db8::1]:8443/hook', events: ['*'], payloadFields: ['verdict'] },
      'veto', { verdict: 'VETO' }, '2026-08-20T00:00:00.000Z',
    );
    assert.strictEqual(req.hostname, '[2001:db8::1]');
    assert.strictEqual(req.port, '8443');
  });
});
