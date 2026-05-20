// Voice-pack activation wiring tests.
// Plan: docs/plan-qor-voice-substrate-extraction.md Phase 3.
// Mirrors the bicameral-activation.test.ts shape; exercises
// wireVoicePack(context, consoleServer) against a fake ConsoleServer surface
// and observes its mutations without booting a real extension host.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { wireVoicePack } from '../../extension/bootstrapVoicePack';

interface ServerCalls {
  setVoicePackPath: Array<string | null>;
  broadcasts: Array<Record<string, unknown>>;
}

function fakeServer(): { server: any; calls: ServerCalls } {
  const calls: ServerCalls = { setVoicePackPath: [], broadcasts: [] };
  const server = {
    setVoicePackPath(p: string | null) { calls.setVoicePackPath.push(p); },
    broadcastEvent(d: Record<string, unknown>) { calls.broadcasts.push(d); },
  };
  return { server, calls };
}

function fakeContext(globalStoragePath: string): vscode.ExtensionContext {
  return {
    subscriptions: [] as { dispose: () => void }[],
    globalStorageUri: { fsPath: globalStoragePath } as vscode.Uri,
  } as unknown as vscode.ExtensionContext;
}

function mkTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

suite('bootstrapVoicePack — wireVoicePack', () => {

  test('wireVoicePack with no pack installed sets voicePackPath to null', async () => {
    const globalStoragePath = mkTempDir('failsafe-voice-pack-activate-absent-');
    try {
      const { server, calls } = fakeServer();
      await wireVoicePack(fakeContext(globalStoragePath), server, '5.2.0');
      assert.strictEqual(calls.setVoicePackPath.length, 1, 'one initial set');
      assert.strictEqual(calls.setVoicePackPath[0], null, 'null when pack absent');
    } finally {
      fs.rmSync(globalStoragePath, { recursive: true, force: true });
    }
  });

  test('wireVoicePack is lazy — does NOT trigger install at activation', async () => {
    const globalStoragePath = mkTempDir('failsafe-voice-pack-activate-lazy-');
    let installCalled = false;
    (globalThis as { fetch?: unknown }).fetch = async () => {
      installCalled = true;
      return { ok: true, status: 200, url: '', headers: { get: () => null }, body: null } as any;
    };
    try {
      const { server } = fakeServer();
      await wireVoicePack(fakeContext(globalStoragePath), server, '5.2.0');
      assert.strictEqual(installCalled, false, 'wireVoicePack must not download at activation');
    } finally {
      delete (globalThis as { fetch?: unknown }).fetch;
      fs.rmSync(globalStoragePath, { recursive: true, force: true });
    }
  });

  test('wireVoicePack with installed pack sets voicePackPath to the directory', async () => {
    const globalStoragePath = mkTempDir('failsafe-voice-pack-activate-installed-');
    const packDir = path.join(globalStoragePath, 'voice-pack');
    fs.mkdirSync(packDir, { recursive: true });
    // Create a minimal valid manifest + 1 file matching sha256
    const { createHash } = require('crypto');
    const content = 'piper-payload';
    const filePath = path.join(packDir, 'piper.min.js');
    fs.writeFileSync(filePath, content, 'utf8');
    const sha = createHash('sha256').update(content).digest('hex');
    fs.writeFileSync(path.join(packDir, 'voice-pack.manifest.json'), JSON.stringify({
      version: '5.2.0',
      builtAt: new Date().toISOString(),
      expectedFiles: ['piper.min.js'],
      sha256: { 'piper.min.js': sha },
    }), 'utf8');

    try {
      const { server, calls } = fakeServer();
      await wireVoicePack(fakeContext(globalStoragePath), server, '5.2.0');
      assert.strictEqual(calls.setVoicePackPath[0], packDir, 'sets to pack dir when installed');
    } finally {
      fs.rmSync(globalStoragePath, { recursive: true, force: true });
    }
  });

  test('wireVoicePack ignores stale/corrupt pack — sets path to null so /vendor falls back', async () => {
    const globalStoragePath = mkTempDir('failsafe-voice-pack-activate-stale-');
    const packDir = path.join(globalStoragePath, 'voice-pack');
    fs.mkdirSync(packDir, { recursive: true });
    fs.writeFileSync(path.join(packDir, 'voice-pack.manifest.json'), JSON.stringify({
      version: '5.1.0', // < 5.2.0 required minimum
      builtAt: new Date().toISOString(),
      expectedFiles: [],
      sha256: {},
    }), 'utf8');

    try {
      const { server, calls } = fakeServer();
      await wireVoicePack(fakeContext(globalStoragePath), server, '5.2.0');
      // Stale pack: voicePackPath should be null so the /vendor route falls
      // back to the default uiDir mount; UI surfaces the "Update voice pack"
      // affordance via /api/integrations/voice-pack/status.
      assert.strictEqual(calls.setVoicePackPath[0], null, 'null for stale pack');
    } finally {
      fs.rmSync(globalStoragePath, { recursive: true, force: true });
    }
  });
});
