import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import { gzipSync } from "zlib";

export interface FetchHandler {
  url: string | RegExp; status?: number; body?: Uint8Array | string;
  location?: string; finalUrl?: string; throws?: Error; type?: string;
}
export interface FetchStubOptions { ignoreManual?: boolean }
export interface InstallFixture {
  globalStoragePath: string;
  restoreSpawn: () => void; spawnCount: () => number;
}
export interface TarFixtureEntry {
  name: string; body?: Uint8Array | string; type?: '0' | '1' | '2' | '5';
}
const ORIGINAL_FETCH = (globalThis as { fetch?: unknown }).fetch;
const HAD_FETCH = Object.prototype.hasOwnProperty.call(globalThis, "fetch");
const PLATFORM_REDIRECT_LIMIT = 20;
const REQUIRED = [
  "piper/piper.min.js", "piper/piper_phonemize.wasm",
  "piper/piper_phonemize.data", "whisper/transformers.min.js",
  "whisper/ort-wasm-simd.wasm", "whisper/ort-wasm-simd-threaded.wasm",
];

export function sha256OfBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function octal(out: Buffer, pos: number, width: number, n: number): void {
  out.write(n.toString(8).padStart(width - 1, '0') + '\0', pos, width, 'ascii');
}
/** Produce actual gzip-compressed USTAR records, including adversarial members. */
export function buildFixtureTar(entries: TarFixtureEntry[]): Uint8Array {
  const chunks: Buffer[] = [];
  for (const entry of entries) {
    const data = typeof entry.body === 'string' ? Buffer.from(entry.body)
      : Buffer.from(entry.body ?? new Uint8Array(0));
    const h = Buffer.alloc(512);
    h.write(entry.name, 0, 100, 'utf8');
    octal(h, 100, 8, 0o644);
    octal(h, 108, 8, 0);
    octal(h, 116, 8, 0);
    octal(h, 124, 12, data.length);
    octal(h, 136, 12, 0);
    h.fill(32, 148, 156);
    h[156] = (entry.type ?? '0').charCodeAt(0);
    h.write('ustar', 257, 5, 'ascii');
    h.write('00', 263, 2, 'ascii');
    const sum = [...h].reduce((n, b) => n + b, 0);
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'ascii');
    chunks.push(h);
    if (data.length) chunks.push(data);
    const padding = (512 - data.length % 512) % 512;
    if (padding) chunks.push(Buffer.alloc(padding));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks), { level: 1 });
}
export function buildFixturePackTar(): Uint8Array {
  const assets = REQUIRED.map(name => ({ name, body: 'fixture:' + name }));
  const sha256 = Object.fromEntries(assets.map(a => [a.name, sha256OfBytes(Buffer.from(a.body))]));
  const manifest = { version: '5.2.0', builtAt: '2026-05-18T00:00:00Z',
    expectedFiles: REQUIRED, sha256 };
  return buildFixtureTar([
    { name: 'piper/', type: '5' }, { name: 'whisper/', type: '5' },
    ...assets, { name: 'voice-pack.manifest.json', body: JSON.stringify(manifest) },
  ]);
}
function isRedirect(status: number): boolean {
  return [301, 302, 303, 307, 308].includes(status);
}
function mockResponse(handler: FetchHandler, requestedUrl: string, redirected = false) {
  const body = handler.body ?? new Uint8Array(0);
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const status = handler.status ?? 200;
  return {
    ok: status >= 200 && status < 300, status, redirected,
    type: handler.type ?? "basic", url: handler.finalUrl ?? requestedUrl,
    headers: { get: (name: string) => name.toLowerCase() === "location" ? handler.location ?? null : null },
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    body: new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(bytes); controller.close(); },
    }),
  };
}
export function installFetchStub(handlers: FetchHandler[], options: FetchStubOptions = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const find = (requested: string) => handlers.find(item => typeof item.url === "string"
    ? requested === item.url : item.url.test(requested));
  const requestOne = (requested: string, init?: RequestInit) => {
    calls.push({ url: requested, init });
    const handler = find(requested) ?? { url: requested, status: 404 };
    if (handler.throws) throw handler.throws;
    return handler;
  };
  (globalThis as { fetch?: unknown }).fetch = async (url: string, init?: RequestInit) => {
    let current = String(url);
    let handler = requestOne(current, init);
    const follow = init?.redirect !== "manual" || options.ignoreManual === true;
    let hops = 0;
    while (follow && isRedirect(handler.status ?? 200) && handler.location) {
      if (++hops > PLATFORM_REDIRECT_LIMIT) throw new TypeError("fetch failed: redirect count exceeded");
      current = new URL(handler.location, current).toString();
      handler = requestOne(current, init);
    }
    return mockResponse(handler, current, hops > 0);
  };
  return { calls };
}
export function unstubFetch(): void {
  if (HAD_FETCH) (globalThis as { fetch?: unknown }).fetch = ORIGINAL_FETCH;
  else delete (globalThis as { fetch?: unknown }).fetch;
}
export function originalFetch(): unknown { return ORIGINAL_FETCH; }
/** The extractor no longer launches tar, so no spawn interception is needed. */
export function makeInstallFixture(): InstallFixture {
  const globalStoragePath = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-voice-pack-"));
  return { globalStoragePath, restoreSpawn: () => {}, spawnCount: () => 0 };
}
