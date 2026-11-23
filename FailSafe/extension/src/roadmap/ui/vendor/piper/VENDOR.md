# Piper TTS browser vendor assets

Pinned source: `piper-tts-web@1.1.2` from the official npm package tarball. The original SHA-512 integrity digest is embedded in `scripts/vendor-voice-source.cjs`, based on the previously accepted extension lockfile.

## Maintained files

- `piper.min.js` (renamed from `package/dist/piper-tts-web.js`)
- `piper_phonemize.wasm`
- `piper_phonemize.data`

## Explicit update workflow

From `FailSafe/extension`:

```bash
npm run vendor:piper
```

This is a maintainer action, **not** a dependency of `npm ci` or ordinary governance builds. The command fetches the pinned npm archive, verifies SHA-512, reads only three named members to stdout without extracting arbitrary paths, and writes browser assets through a recoverable file update. A downloaded package or generated file is not automatically an accepted upgrade: version/integrity changes need their own governed review and regression evidence.

Voice models are downloaded by the browser at runtime into IndexedDB, not stored in these vendor files. The base FailSafe VSIX excludes the heavy voice pack; it remains an operator-installed companion.

## Non-mutating upstream parity check

`npm run verify:voice-pins` downloads both upstream npm tarballs, rejects any SHA-512 mismatch, extracts only the pinned six browser members, applies the same deterministic Whisper sanitization as normal vendoring and compares bytes against all six working-tree files **and** the same six immutable `HEAD` Git blobs. The command does **not** change committed vendor files; a mismatch or missing file exits nonzero. This is a release-source integrity check, not a claim that runtime microphone/Piper/Whisper behavior was installed-host tested. Run it explicitly in an allowed network environment and record the actual result.

For broader Voice Pack provenance, installer and release requirements see `docs/architecture/integrations/voice-pack.md`, #707 and #710.

## Repairing an invalid asset

`npm run bundle` refuses an empty, oversized (more than 75 MiB) or non-file asset with "Remove it, then run npm run vendor:voice". `vendor:voice` deliberately refuses to replace such an existing file: it hashes an existing asset only through a bounded read, so remove the file first and then re-vendor. The six assets are marked `-text` in `.gitattributes`, so Git never converts their line endings; a checkout made before that rule needs `git checkout HEAD -- src/roadmap/ui/vendor/piper src/roadmap/ui/vendor/whisper` once.
