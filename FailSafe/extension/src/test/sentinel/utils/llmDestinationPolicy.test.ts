// #538 lane A (B273, plan-538a LD1): the pure destination policy and the
// shared address classes. Absorbs the endpoint cases the removed
// LLMClient.isValidEndpoint tests covered; the old "public URLs are allowed"
// assertion is gone because it encoded the defect.

import { strict as assert } from 'assert';
import {
  decideLlmDestination, parseLlmEndpoint, resolveSentinelEndpoint,
} from '../../../sentinel/utils/llmDestinationPolicy';
import { FORBIDDEN_REMOTE, isForbiddenRemoteAddress, isLoopbackAddress, isLoopbackHostName, LOOPBACK } from '../../../shared/net/addressPolicy';

const SOURCES = ['workspace-file', 'workspace-setting', 'user-setting', 'default', undefined] as const;

suite('#538 LLM destination policy (B273 LD1)', () => {
  test('only http and https, no credentials, no query, no fragment, no garbage', () => {
    for (const raw of ['ftp://example.com:21', 'file:///etc/passwd', 'http://u:p@127.0.0.1:11434', 'http://u@127.0.0.1:11434',
      'http://127.0.0.1:11434?x=1', 'http://127.0.0.1:11434#f', 'not a valid url', 'ht!tp://example.com', '', 42, null, undefined]) {
      assert.equal(parseLlmEndpoint(raw).ok, false, String(raw));
    }
    assert.equal(parseLlmEndpoint('http://127.0.0.1:11434').ok, true);
    assert.equal(parseLlmEndpoint('https://llm.example.com').ok, true);
  });

  test('the canonical origin always carries the port, lower-case', () => {
    const origin = (raw: string) => {
      const r = parseLlmEndpoint(raw);
      assert.ok(r.ok, raw);
      return r.target.origin;
    };
    assert.equal(origin('https://LLM.Example.com'), 'https://llm.example.com:443');
    assert.equal(origin('https://llm.example.com:443/'), 'https://llm.example.com:443');
    assert.equal(origin('http://llm.example.com'), 'http://llm.example.com:80');
    assert.equal(origin('http://[::1]:11434'), 'http://[::1]:11434');
  });

  test('a path prefix is kept for /api/tags and /api/generate; the request host has no brackets', () => {
    const r = parseLlmEndpoint('http://[::1]:11434/ollama/');
    assert.ok(r.ok);
    assert.equal(r.target.basePath, '/ollama');
    assert.equal(r.target.hostname, '::1');
    assert.equal(r.target.port, 11434);
    const plain = parseLlmEndpoint('http://localhost:11434');
    assert.ok(plain.ok);
    assert.equal(plain.target.basePath, '');
  });

  test('loopback names and literals', () => {
    for (const h of ['localhost', 'LOCALHOST', '127.0.0.1', '127.255.0.1', '[::1]', '::1', '[::ffff:7f00:1]']) {
      assert.equal(isLoopbackHostName(h), true, h);
    }
    for (const h of ['localhost.example', 'mylocalhost', 'example.com', '10.0.0.1', '[::2]', '0.0.0.0']) {
      assert.equal(isLoopbackHostName(h), false, h);
    }
    // WHATWG URL normalizes numeric and mapped forms before the check.
    for (const raw of ['http://2130706433:1', 'http://0x7f.1:1', 'http://[::ffff:127.0.0.1]:1']) {
      const d = decideLlmDestination(raw, 'workspace-file');
      assert.equal(d.kind, 'loopback', raw);
    }
  });

  test('every source x {loopback, remote name, forbidden literal, public literal}', () => {
    for (const source of SOURCES) {
      assert.equal(decideLlmDestination('http://localhost:11434', source).kind, 'loopback', String(source));
      assert.equal(decideLlmDestination('http://127.0.0.2:11434', source).kind, 'loopback', String(source));
      assert.equal(decideLlmDestination('http://192.168.1.5:11434', source).kind, 'refused', String(source));
      assert.equal(decideLlmDestination('http://[fe80::1]:11434', source).kind, 'refused', String(source));
      const expected = source === 'user-setting' ? 'needs-authorization' : 'refused';
      assert.equal(decideLlmDestination('https://llm.example.com', source).kind, expected, String(source));
      assert.equal(decideLlmDestination('https://203.0.113.7', source).kind, expected, String(source));
    }
    assert.equal(decideLlmDestination('https://llm.example.com', 'something-else').kind, 'refused');
  });

  test('resolveSentinelEndpoint: value and source come from the same layer, in VS Code precedence', () => {
    const inspected = { defaultValue: 'http://localhost:11434', globalValue: 'https://user.example', workspaceValue: 'http://ws.example', workspaceFolderValue: 'http://folder.example' };
    assert.deepEqual(resolveSentinelEndpoint('http://yaml.example', inspected), { value: 'http://yaml.example', source: 'workspace-file' });
    assert.deepEqual(resolveSentinelEndpoint(undefined, inspected), { value: 'http://folder.example', source: 'workspace-setting' });
    assert.deepEqual(resolveSentinelEndpoint(undefined, { ...inspected, workspaceFolderValue: undefined }), { value: 'http://ws.example', source: 'workspace-setting' });
    assert.deepEqual(resolveSentinelEndpoint(undefined, { defaultValue: 'http://localhost:11434', globalValue: 'https://user.example' }), { value: 'https://user.example', source: 'user-setting' });
    assert.deepEqual(resolveSentinelEndpoint(undefined, { defaultValue: 'http://localhost:11434' }), { value: 'http://localhost:11434', source: 'default' });
    assert.deepEqual(resolveSentinelEndpoint(undefined, undefined), { value: 'http://localhost:11434', source: 'default' });
    // null counts as absent, as `??` does in ConfigManager.
    assert.deepEqual(resolveSentinelEndpoint(null, { defaultValue: 'http://localhost:11434', globalValue: 'https://user.example' }), { value: 'https://user.example', source: 'user-setting' });
    // A non-string yaml value is a refused workspace-file endpoint, never a fall-through to the user setting.
    assert.deepEqual(resolveSentinelEndpoint(11434, inspected), { value: '', source: 'workspace-file' });
    assert.equal(decideLlmDestination('', 'workspace-file').kind, 'refused');
  });

  test('address classes: IPv4-mapped IPv6 matches IPv4 rules (checked, not assumed), and the translation ranges are forbidden', () => {
    assert.equal(LOOPBACK.check('::ffff:7f00:1', 'ipv6'), true);
    assert.equal(FORBIDDEN_REMOTE.check('::ffff:a00:1', 'ipv6'), true);
    for (const a of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(isLoopbackAddress(a), true, a);
    for (const a of ['10.0.0.1', '203.0.113.7', '::2']) assert.equal(isLoopbackAddress(a), false, a);
    for (const a of ['0.0.0.0', '10.1.2.3', '100.64.0.1', '127.0.0.1', '169.254.1.1', '172.16.0.1', '192.168.0.42', '224.0.0.1',
      '240.0.0.1', '255.255.255.255', '::', '::1', '::a00:1', '::ffff:0:a00:1', '64:ff9b::a00:1', '64:ff9b:1::1', '2002:a00:1::1',
      'fc00::1', 'fd12::1', 'fe80::1', 'fe80::1%13', 'fec0::1', 'ff02::1', 'not-an-address']) {
      assert.equal(isForbiddenRemoteAddress(a), true, a);
    }
    for (const a of ['203.0.113.7', '8.8.8.8', '2606:4700::1111']) assert.equal(isForbiddenRemoteAddress(a), false, a);
  });
});
