import { strict as assert } from "assert";
import { createHash } from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface FetchHandler {
  url: string | RegExp; status?: number; body?: Uint8Array | string;
  finalUrl?: string; throws?: Error;
}
export interface ExtractControl { shouldFail: boolean }
export interface InstallFixture {
  globalStoragePath: string; extractControl: ExtractControl;
  restoreSpawn: () => void;
}

export function buildFixturePackTar(): Uint8Array {
  return new TextEncoder().encode("FAKE-TAR-PAYLOAD");
}

export function sha256OfBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function mockResponse(handler: FetchHandler, requestedUrl: string) {
  const body = handler.body ?? new Uint8Array(0);
  const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
  const status = handler.status ?? 200;
  return {
    ok: status >= 200 && status < 300, status,
    url: handler.finalUrl ?? requestedUrl,
    headers: { get: () => null },
    text: async () => new TextDecoder().decode(bytes),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    body: new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(bytes); controller.close(); },
    }),
  };
}

export function installFetchStub(handlers: FetchHandler[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  (globalThis as { fetch?: unknown }).fetch = async (url: string, init?: RequestInit) => {
    const requested = String(url);
    calls.push({ url: requested, init });
    const handler = handlers.find((item) => typeof item.url === "string"
      ? requested === item.url : item.url.test(requested));
    if (!handler) return mockResponse({ url: requested, status: 404 }, requested);
    if (handler.throws) throw handler.throws;
    return mockResponse(handler, requested);
  };
  return { calls };
}

export function unstubFetch(): void {
  delete (globalThis as { fetch?: unknown }).fetch;
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

function installSpawnStub(control: ExtractControl, extracted: Record<string, string>) {
  const childProcess = require("child_process");
  const original = childProcess.spawn;
  childProcess.spawn = (command: string, args: string[], options?: { cwd?: string }) => {
    if (command !== "tar" || !args.includes("-xzf")) return original(command, args, options);
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
  const restoreSpawn = installSpawnStub(extractControl, {
    "piper/piper.min.js": "piper-payload", "voice-pack.manifest.json": manifest,
  });
  return { globalStoragePath, extractControl, restoreSpawn };
}
