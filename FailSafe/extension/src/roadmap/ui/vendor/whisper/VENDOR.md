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

See `docs/architecture/integrations/voice-pack.md`, #707 and #710.
