// FX491 — voice-pack-detector functional tests.
// Plan: docs/plan-qor-voice-substrate-extraction.md Phase 1.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';

import { probeVoicePackState } from '../../voice-pack/voice-pack-detector';
import type { VoicePackManifest } from '../../voice-pack/types';

function mkTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sha256OfFile(p: string): string {
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

interface FixtureOptions {
  manifestVersion: string;
  files: Array<{ rel: string; content: string }>;
  omitManifest?: boolean;
  corruptOneFile?: boolean;
  /** Override manifest contents AFTER files written (used for sha256 desync tests). */
  manifestOverride?: VoicePackManifest;
}

function writePackFixture(globalStoragePath: string, opts: FixtureOptions): VoicePackManifest {
  const packDir = path.join(globalStoragePath, 'voice-pack');
  fs.mkdirSync(packDir, { recursive: true });

  const sha256: Record<string, string> = {};
  for (const f of opts.files) {
    const abs = path.join(packDir, f.rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.content, 'utf8');
    sha256[f.rel] = sha256OfFile(abs);
  }

  if (opts.corruptOneFile && opts.files.length > 0) {
    const first = path.join(packDir, opts.files[0].rel);
    fs.writeFileSync(first, 'CORRUPTED PAYLOAD', 'utf8');
  }

  const manifest: VoicePackManifest = opts.manifestOverride ?? {
    version: opts.manifestVersion,
    builtAt: new Date().toISOString(),
    expectedFiles: opts.files.map((f) => f.rel),
    sha256,
  };

  if (!opts.omitManifest) {
    fs.writeFileSync(
      path.join(packDir, 'voice-pack.manifest.json'),
      JSON.stringify(manifest, null, 2),
      'utf8',
    );
  }
  return manifest;
}

suite('voice-pack-detector — probeVoicePackState', () => {
  let globalStoragePath: string;

  setup(() => {
    globalStoragePath = mkTempDir('failsafe-voice-pack-detector-');
  });

  teardown(() => {
    fs.rmSync(globalStoragePath, { recursive: true, force: true });
  });

  test('returns absent when voice-pack/ directory is missing', async () => {
    const result = await probeVoicePackState(globalStoragePath, '5.2.0');
    assert.strictEqual(result.state, 'absent');
    assert.strictEqual(result.version, undefined);
  });

  test('returns installed with version + manifestPath when manifest + files valid', async () => {
    writePackFixture(globalStoragePath, {
      manifestVersion: '5.2.0',
      files: [
        { rel: 'piper/piper.min.js', content: 'piper-stub' },
        { rel: 'whisper/transformers.min.js', content: 'transformers-stub' },
      ],
    });
    const result = await probeVoicePackState(globalStoragePath, '5.2.0');
    assert.strictEqual(result.state, 'installed');
    assert.strictEqual(result.version, '5.2.0');
    assert.ok(result.manifestPath?.endsWith('voice-pack.manifest.json'));
  });

  test('returns stale when manifest version < required minimum', async () => {
    writePackFixture(globalStoragePath, {
      manifestVersion: '5.1.0',
      files: [{ rel: 'piper/piper.min.js', content: 'old-stub' }],
    });
    const result = await probeVoicePackState(globalStoragePath, '5.2.0');
    assert.strictEqual(result.state, 'stale');
    assert.strictEqual(result.version, '5.1.0');
  });

  test('returns corrupt when manifest exists but a referenced file fails sha256', async () => {
    writePackFixture(globalStoragePath, {
      manifestVersion: '5.2.0',
      files: [
        { rel: 'piper/piper.min.js', content: 'expected-payload' },
        { rel: 'whisper/transformers.min.js', content: 'whisper-stub' },
      ],
      corruptOneFile: true,
    });
    const result = await probeVoicePackState(globalStoragePath, '5.2.0');
    assert.strictEqual(result.state, 'corrupt');
    assert.ok(
      result.missingFiles && result.missingFiles.length >= 1,
      'missingFiles should list the desync',
    );
  });

  test('rejects path traversal in globalStoragePath argument', async () => {
    await assert.rejects(
      () => probeVoicePackState('/etc/passwd/../etc/passwd', '5.2.0'),
      /unsafe globalStoragePath|path traversal/i,
    );
  });
});
