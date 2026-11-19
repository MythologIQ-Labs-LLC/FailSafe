# Piper TTS browser vendor assets

Pinned source: `piper-tts-web@1.1.2` from the official npm package tarball. The original SHA-512 integrity digest is embedded in `scripts/vendor-voice.cjs`, based on the previously accepted extension lockfile.

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

For broader Voice Pack provenance, installer and release requirements see `docs/architecture/integrations/voice-pack.md`, #707 and #710.
