/**
 * addressPolicy - which network addresses an outbound request may reach (#538).
 *
 * Two classes: `loopback` (this machine only) and `public` (anywhere except
 * this machine, private networks, link-local, unspecified, multicast and the
 * IPv6 forms that embed or translate an IPv4 address). `guardedLookup` is
 * passed as a request's `lookup`, so every address a name resolves to is
 * checked before Node connects; Node does not call `lookup` for an IP
 * literal, so callers classify literals themselves. Pure apart from the
 * injected resolver; no `vscode` import.
 */

import * as dns from 'dns';
import * as net from 'net';
import type { LookupAddress } from 'dns';

export type AddressClass = 'loopback' | 'public';

/** Error code of a refused resolution; the request never connects. */
export const ADDRESS_REFUSED = 'EFAILSAFEADDRESS';

function blockList(v4: Array<[string, number]>, v6: Array<[string, number]>): net.BlockList {
  const list = new net.BlockList();
  for (const [a, p] of v4) list.addSubnet(a, p, 'ipv4');
  for (const [a, p] of v6) list.addSubnet(a, p, 'ipv6');
  return list;
}

export const LOOPBACK = blockList([['127.0.0.0', 8]], [['::1', 128]]);

export const FORBIDDEN_REMOTE = blockList(
  [
    ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
    ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 4], ['240.0.0.0', 4],
  ],
  [
    ['::', 128], ['::1', 128],
    ['::', 96], // IPv4-compatible
    ['::ffff:0:0:0', 96], // SIIT IPv4-translated
    ['64:ff9b::', 96], ['64:ff9b:1::', 48], // NAT64
    ['2002::', 16], // 6to4
    ['fc00::', 7], ['fe80::', 10], ['fec0::', 10], ['ff00::', 8],
  ],
);

/** An address without IPv6 brackets or zone id, with its family; undefined when not an IP. */
function parsed(address: string): { ip: string; family: 'ipv4' | 'ipv6' } | undefined {
  const ip = address.replace(/^\[|\]$/g, '').replace(/%.*$/, '');
  const v = net.isIP(ip);
  return v === 4 ? { ip, family: 'ipv4' } : v === 6 ? { ip, family: 'ipv6' } : undefined;
}

export function isLoopbackAddress(address: string): boolean {
  const p = parsed(address);
  try { return !!p && LOOPBACK.check(p.ip, p.family); } catch { return false; }
}

/** True for every address a `public` destination may not reach, and for anything that is not an IP. */
export function isForbiddenRemoteAddress(address: string): boolean {
  const p = parsed(address);
  try { return !p || FORBIDDEN_REMOTE.check(p.ip, p.family); } catch { return true; }
}

export function addressAllowed(address: string, cls: AddressClass): boolean {
  return cls === 'loopback' ? isLoopbackAddress(address) : !isForbiddenRemoteAddress(address);
}

/** A URL hostname without IPv6 brackets. */
export function bareHost(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '');
}

/** `localhost` or a loopback IP literal (bracketed or not). WHATWG URL has already normalized numeric forms. */
export function isLoopbackHostName(hostname: string): boolean {
  const host = bareHost(hostname).toLowerCase();
  return host === 'localhost' || (net.isIP(host) !== 0 && isLoopbackAddress(host));
}

export type ResolveFn = (
  hostname: string,
  options: { all: true; family?: number },
  callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

const systemResolve: ResolveFn = (hostname, options, callback) => dns.lookup(hostname, options, callback);

export function refusedAddressError(hostname: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`Destination refused: ${hostname} resolves to an address this request may not reach`), { code: ADDRESS_REFUSED });
}

/**
 * A `lookup` for http(s).request that resolves every address and refuses the
 * whole answer when any address is outside `cls` (or there is none).
 */
export function guardedLookup(cls: AddressClass, resolve: ResolveFn = systemResolve): net.LookupFunction {
  return ((hostname: string, options: dns.LookupOptions, callback: (...args: unknown[]) => void) => {
    const family = typeof options?.family === 'number' ? options.family : undefined;
    resolve(hostname, family ? { all: true, family } : { all: true }, (err, addresses) => {
      if (err) { callback(err); return; }
      const list = Array.isArray(addresses) ? addresses : [];
      if (list.length === 0 || list.some((a) => !addressAllowed(a.address, cls))) {
        callback(refusedAddressError(hostname));
        return;
      }
      if (options?.all) callback(null, list);
      else callback(null, list[0].address, list[0].family);
    });
  }) as unknown as net.LookupFunction;
}
