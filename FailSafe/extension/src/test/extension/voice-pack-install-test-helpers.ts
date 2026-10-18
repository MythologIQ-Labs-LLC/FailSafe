import { strict as assert } from "assert";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface FetchHandler {
  url: string | RegExp; status?: number; body?: Uint8Array | string;
  /** Served as the `Location` header (#538). */
  location?: string;
  /** Fakes a response URL without a redirect, as a fetch wrapper might. */
  finalUrl?: string; throws?: Error;
  /** Response type override, e.g. 'opaqueredirect' (#538). */
  type?: string;
}
export interface FetchStubOptions {
  /** Follow 3xx inside the stub even when the caller asked for manual mode (#538). */
  ignoreManual?: boolean;
}
export interface ExtractControl { shouldFail: boolean }
export interface InstallFixture {
  globalStoragePath: string; extractControl: ExtractControl;
  restoreSpawn: () => void; spawnCount: () => number;
}

/** The platform fetch, captured once so unstubFetch can put it back (#538). */
const ORIGINAL_FETCH = (globalThis as { fetch?: unknown }).fetch;
const HAD_FETCH = Object.prototype.hasOwnProperty.call(globalThis, "fetch");
const PLATFORM_REDIRECT_LIMIT = 20;

export function buildFixturePackTar(): Uint8Array {
  return new TextEncoder().encode("FAKE-TAR-PAYLOAD");
}

export function sha256OfBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
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
    type: handler.type ?? "basic",
    url: handler.finalUrl ?? requestedUrl,
    headers: {
      get: (name: string) => (name.toLowerCase() === "location" ? handler.location ?? null : null),
    },
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    body: new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(bytes); controller.close(); },
    }),
  };
}

/**
 * Stub `fetch`. Like a platform fetch, it follows 3xx itself unless the caller
 * asked for `redirect: 'manual'` (or `ignoreManual` models a fetch that ignores
 * it); every hop it requests is recorded in `calls`.
 */
export function installFetchStub(handlers: FetchHandler[], options: FetchStubOptions = {}) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const find = (requested: string) => handlers.find((item) => typeof item.url === "string"
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

/** The fetch this module captured at load (for the restore assertion). */
export function originalFetch(): unknown {
  return ORIGINAL_FETCH;
}

function fakeChild(exitCode: number) {
  const handlers: Record<string, Array<(value: number) => void>> = {};
  const child = {
    on(event: string, fn: (value: number) => void) {
      (handlers[event] ??= []).push(fn); return child;
    },
    stdout: { on: () => child.stdout }, stderr: { on: () => child.stderr }, kill() {},
  };
  setImmediate(() => handlers.close?.forEach((fn) => fn(exitCode)));
  return child;
}

function installSpawnStub(control: ExtractControl, extracted: Record<string, string>, counter: { n: number }) {
  const childProcess = require("child_process");
  const original = childProcess.spawn;
  childProcess.spawn = (command: string, args: string[], options?: { cwd?: string }) => {
    if (command !== "tar" || !args.includes("-xzf")) return original(command, args, options);
    counter.n++;
    const archive = args[args.indexOf("-xzf") + 1];
    assert.equal(args.includes("--force-local"), false);
    assert.equal(/[/\\]/.test(archive), false);
    assert.ok(options?.cwd && fs.existsSync(path.join(options.cwd, archive)));
    const staging = args[args.indexOf("-C") + 1];
    if (!control.shouldFail) writeExtractedFiles(staging, extracted);
    return fakeChild(control.shouldFail ? 1 : 0);
  };
  return () => { childProcess.spawn = original; };
}

function writeExtractedFiles(staging: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(staging, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

export function makeInstallFixture(): InstallFixture {
  const globalStoragePath = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-voice-pack-"));
  const extractControl = { shouldFail: false };
  const manifest = JSON.stringify({
    version: "5.2.0", builtAt: "2026-05-18T00:00:00Z",
    expectedFiles: ["piper/piper.min.js"],
    sha256: { "piper/piper.min.js": sha256OfBytes(new TextEncoder().encode("piper-payload")) },
  });
  const counter = { n: 0 };
  const restoreSpawn = installSpawnStub(extractControl, {
    "piper/piper.min.js": "piper-payload", "voice-pack.manifest.json": manifest,
  }, counter);
  return { globalStoragePath, extractControl, restoreSpawn, spawnCount: () => counter.n };
}
