import { beforeEach, describe, it } from 'mocha';
import * as assert from 'assert';
import { GovernanceWebhook } from '../../governance/GovernanceWebhook';

describe('GovernanceWebhook', () => {
  let webhook: GovernanceWebhook;

  beforeEach(() => {
    webhook = new GovernanceWebhook();
  });

  describe('register – SSRF private IP rejection', () => {
    const rejects = (label: string, ip: string) => {
      it(`rejects ${label} (${ip})`, () => {
        assert.throws(
          () => webhook.register({ url: `https://${ip}/hook`, events: ['*'], payloadFields: ['verdict'] }),
          /Invalid webhook URL/,
        );
      });
    };

    const accepts = (label: string, host: string) => {
      it(`accepts ${label} (${host})`, () => {
        const authority = host.includes(':') ? `[${host}]` : host;
        assert.doesNotThrow(
          () => webhook.register({ url: `https://${authority}/hook`, events: ['*'], payloadFields: ['verdict'] }),
        );
      });
    };

    // IPv4 private ranges
    rejects('IPv4 loopback', '127.0.0.1');
    rejects('IPv4 all-interfaces', '0.0.0.0');
    rejects('IPv4 10.x', '10.0.0.1');
    rejects('IPv4 172.16.x', '172.16.0.1');
    rejects('IPv4 172.31.x', '172.31.255.1');
    rejects('IPv4 192.168.x', '192.168.1.1');
    rejects('IPv4 link-local', '169.254.1.1');

    // IPv4 public
    accepts('IPv4 public DNS', '8.8.8.8');
    accepts('IPv4 172.15 (not private)', '172.15.0.1');
    accepts('IPv4 172.32 (not private)', '172.32.0.1');

    // IPv6 private ranges
    rejects('IPv6 loopback', '::1');
    rejects('IPv6 ULA fc00', 'fc00::1');
    rejects('IPv6 ULA fd', 'fd12::1');
    rejects('IPv6 link-local', 'fe80::1');
    rejects('IPv6 mapped IPv4', '::ffff:10.0.0.1');

    // IPv6 public
    accepts('IPv6 global unicast', '2001:db8::1');

    // Non-IP hostname (not detected as private)
    accepts('hostname', 'example.com');
  });

  describe('register – protocol enforcement', () => {
    it('rejects HTTP URLs', () => {
      assert.throws(
        () => webhook.register({ url: 'http://example.com/hook', events: ['*'], payloadFields: ['verdict'] }),
        /Invalid webhook URL/,
      );
    });
  });
});
