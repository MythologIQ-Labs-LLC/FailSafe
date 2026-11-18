# Prospective FailSafe 6.1.0 plan: separate browser voice vendoring from core npm install (#707)

**Status:** UNQUALIFIED DRAFT IMPLEMENTATION CANDIDATE, not a native /qor-plan, /qor-audit PASS, /qor-implement, /qor-substantiate, seal, or merge GO.
**Source:** main 0c0e30e042f628455c2a7f4d1287b5efd9d3ecfc, Node extension manifest at FailSafe/extension/package.json (v6.0.13), lockfile blob 358848b5ff56d44ebd2ca0c492a5eeadf0a30e56.
**Owner decision:** FailSafe is a governance extension, not a native inference runtime. Keep optional browser Whisper/Piper features, remove their native ONNX toolchain from ordinary npm ci.
**Change:** v6.1.0 feature/build pipeline; no 6.0.x tag/bump/publication. Confirm Step 7.5/9.5.5 handling against #705/#709 before native sealing.
**Review:** Proposed L3 for supply-chain/build tooling and voice artifact provenance. Solo-owner adversarial reviewer acceptable, exact head evidence required.

## Write set and boundaries
- Remove root devDependencies `piper-tts-web` and `@xenova/transformers`, prune only their unreferenced lockfile graph.
- Leave core runtime deps including better-sqlite3 and protected workflows untouched.
- Maintain a separate explicit `vendor:voice` operation that obtains *pinned, integrity-verified original npm tarballs* without installing transitive native ONNX modules. Source fixed to approved npm registry URLs + SHA-512 from original locked package records.
- Preserve `vendor:piper` command functionality by routing it to the isolated Piper extraction; fail closed for missing browser assets in `bundle.cjs` and avoid silent false success.
- Do not change optional voice activation/consent, installer trust boundary (#710), security remediation #695, or Qor-logic frozen pins.

## Falsification/acceptance
1. Clean npm ci using committed lock on Windows, Linux and macOS; assert no native onnxruntime-node installation, no omitted better-sqlite3 N-API binary, no lifecycle script bypass.
2. npm package/lock must be in sync; dependency graph excludes native ONNX from root and no accidental module removal affecting other builds.
3. Voice re-vendor must verify exact tarball digest and only approved source members, write atomically; reject wrong hash, redirect, unexpected archive, missing or oversized file; show reproducible same-version asset hashes.
4. All existing voice browser/packaging tests pass, voice package still contains the required six browser assets, and installed-host optional voice feature works.
5. Native plan/audit PASS, full prepush, adversarial source review, exact-head PR CI, owner GO before merge. Reconcile lockfile overlap with #695 security remediation; neither may overwrite the other's accepted dependencies.
6. Preserve v6.0.13 and release readiness NO-GO until all 6.1 gates complete.

## Risk note
A lockfile-only removal without reliable vendor maintenance would regress upkeep. The decoupling is qualified only when both core clean install AND explicit pinned voice re-vendor tests genuinely pass. Keep draft otherwise.
