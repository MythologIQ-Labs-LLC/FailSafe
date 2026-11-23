# Whisper STT browser vendor assets

Pinned source: `@xenova/transformers@2.17.2` official npm tarball, integrity SHA-512 pinned in `scripts/vendor-voice.cjs` from the previously accepted extension lockfile.

## Maintained files

- `transformers.min.js`
- `ort-wasm-simd.wasm`
- `ort-wasm-simd-threaded.wasm`

## Explicit update workflow

From `FailSafe/extension`:

```bash
npm run vendor:voice
```

This updates **both** Piper and Whisper source assets from pinned archives. The Whisper JS bundle is deterministically sanitized using the same two existing transformations as `scripts/bundle.cjs`, preserving its current browser/CSP packaging policy. Do not manually replace these files with an unverified archive or add native `onnxruntime-node` to ordinary core dependencies.

The browser downloads Whisper model data at runtime into IndexedDB; the voice pack itself is a separate optional companion, not part of the default VSIX. Changes to package versions, integrity pins, transformation rules, or shipped binaries require a source-bound audit, explicit asset hash comparison, and optional voice regression tests.

To validate the source without rewriting it, run `npm run verify:voice-pins` from `FailSafe/extension`. This downloads SHA-512-pinned package archives, applies the same two deterministic browser sanitizations, and fails on any missing or byte-different working-tree asset **or** committed `HEAD` Git blob. A PASS is upstream-source **byte parity**, not installed-host voice or publisher-signature qualification. Do not run it as an implicit prerequisite to ordinary offline `npm ci`.

See `docs/architecture/integrations/voice-pack.md`, #707 and #710.

## Repairing an invalid asset

`npm run bundle` refuses an empty, oversized (more than 75 MiB) or non-file asset with "Remove it, then run npm run vendor:voice". `vendor:voice` deliberately refuses to replace such an existing file: it hashes an existing asset only through a bounded read, so remove the file first and then re-vendor. The six assets are marked `-text` in `.gitattributes`, so Git never converts their line endings; a checkout made before that rule needs `git checkout HEAD -- src/roadmap/ui/vendor/piper src/roadmap/ui/vendor/whisper` once.
