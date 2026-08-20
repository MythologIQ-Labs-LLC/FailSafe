import { describe, it } from 'mocha';
import * as assert from 'assert';
import * as crypto from 'crypto';
import {
  GovernanceWebhook,
  buildWebhookRequest,
  signWebhookBody,
  SIGNATURE_HEADER,
  type WebhookConfig,
} from '../../governance/GovernanceWebhook';

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
