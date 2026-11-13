# FailSafe v6.0.13 post-publication record (2026-11-13 UTC)

## Release binding

| Item | Value |
|---|---|
| Tag | `v6.0.13`, annotated, object `62a28fc12679a816d8a3307a280d6aa0b8421140` |
| Release commit M | `26c1161adc440c00ee29c6b053bb5953d27e8a38` (parents `23e254d9` previous main, `a7839b75` qualified head H) |
| `M^{tree}` = `H^{tree}` | `89dee954c82e4159763e12ad3246ef1c76b02fa3` |
| `FailSafe/extension` subtree | `6263c6d041643e1d84e0ee0fd3cab2c146327b41`, equal to the sealed commit S `589b5157` |
| Seal | ledger Entry #968 (`SESSION SEAL`), seal record commit R `9defb9510ffd91e405ffb108d34f33594fc36e8c` |
| Rule suite for the push to `main` | `5085534132`, `23e254d9 -> 26c1161a`, `result=pass` |
| Release run | `43337880053`. All five jobs succeeded: SemVer gate, Build & Test, Publish to VS Code Marketplace, Publish to Open VSX, Create GitHub Release. The `production` environment was approved by the owner (Knapp-Kevin). |
| GitHub Release | https://github.com/MythologIQ-Labs-LLC/FailSafe/releases/tag/v6.0.13, published 2026-11-13T01:09:48Z, not a draft or prerelease |
| Published `SHA256SUMS.txt` | sha256 `b9f8d9355fe10fa6f94446139d4de3580b935f96b5945d62c5825c91fa4f4dc0`, copied unchanged beside this record |

## Published artifacts (SHA-256, from the published `SHA256SUMS.txt`, re-verified by download)

| File | SHA-256 |
|---|---|
| mythologiq-failsafe-6.0.13-win32-x64.vsix | `84d64b9144421d0ea8f959ecedda536b58dca310f06f04e781020724b638a6fd` |
| mythologiq-failsafe-6.0.13-win32-arm64.vsix | `486c145b67a320b02e518225c66e020ecd14fec2a04ba229bee462d2217bf709` |
| mythologiq-failsafe-6.0.13-linux-x64.vsix | `d6b24ba1b6372b42cd2c71e5fd7f588e09c93761e6f83962a0527c4bacdf3c85` |
| mythologiq-failsafe-6.0.13-linux-arm64.vsix | `b926d794d0854a5230e36d839f61bb4170da525acd14c0216e36077081c4ddfc` |
| mythologiq-failsafe-6.0.13-alpine-x64.vsix | `c8c8d147364317b507476da13a5c2db5e83259f9adb060b5d84f34000b04575d` |
| mythologiq-failsafe-6.0.13-alpine-arm64.vsix | `76259e28125be027522286fa856c328301a9122908a0402125b262e24c0c4d26` |
| mythologiq-failsafe-6.0.13-darwin-x64.vsix | `f2d4b135b0a4ceb444390f8ac80e3b12e766567796bc4680c56ca11cb0de107f` |
| mythologiq-failsafe-6.0.13-darwin-arm64.vsix | `d077ac7e32fd10b6fbefa39fe232c5ec225dec61404543346a574c63af95ba05` |
| FailSafe-v6.0.13-Release-Notes.pdf | `1b179d725f37e113fa35b9f3d804326636cd27fcc2ca345dfb26c46e06b30c80` |

## Verification performed on the owner workstation

- **Downloaded set:** `gh release download v6.0.13`, then `sha256sum -c SHA256SUMS.txt`: all 9 files OK.
- **Each VSIX:**
  - `extension/package.json` version is `6.0.13`;
  - the packaged `readme.md` holds `## What's New in v6.0.13` and `**Current Release**: v6.0.13 (2026-11-13)`;
  - exactly the `better-sqlite3` prebuild of its own target is present (`linuxmusl-*` for alpine).
- **Marketplaces:** `verify-release-provenance.cjs --version 6.0.13 --sums <published SHA256SUMS.txt> --vscode --openvsx`, run independently from this host, reported 16 of 16 `[PASS]`. Every target on the VS Code Marketplace and on Open VSX is byte-identical to the published set. The release run's own step reported the same 16 PASS lines and `[PASS] release v6.0.13: published; 10 files verified`.
- **Provenance:** binding is by this exact-bytes comparison and the release run. The repository does not create GitHub artifact attestations (`gh attestation verify` finds none), and none is claimed.

## G4 witness (first G4-witnessed release)

| Item | Value |
|---|---|
| Owner key | TPM `FailSafe-G4-Ledger-Witness`, ECDSA P-256, non-exportable |
| Public certificate | `tools/g4/keys/a50c00715e7275a86fad338c80ceacd161da02bdf2b75c60b1082eb518265d8b.cer` |
| Certificate fingerprint (SHA-256, DER) | `a50c00715e7275a86fad338c80ceacd161da02bdf2b75c60b1082eb518265d8b` |
| Genesis checkpoint | `g4-000001`, attesting R `9defb951`, committed in K `a7839b75` |
| Trusted head | `g4-000001:8089c1827434dda60d6ed485e708fce755b8b17e3976c5fbbe1b722dcb14edc4` |
| Timestamp | FreeTSA public service, 2026-11-13T00:01:49Z. Pinned root DER SHA-256 `a6379e7cecc05faa3cbf076013d745e327bbbaa38c0b9af22469d4701d18aabc`; archived CRL valid until 2027-09-18 |

**Release verification.** `g4-verify-checkpoint.cjs --release` was run on fresh full clones of H and of M. Both returned `mode: release`, `ok g4-000001 commit 9defb9510ffd ...`, and `PASS OK` with no limitation.

**Trust rule.** The owner holds the fingerprint and the trusted head in an independent offline record. They are published here for reference only. A verifier must take both values from an independent source, never from this repository alone.

## Open items carried forward (not release defects)

- **#669:** the native qualification workflow still pins the retired `macos-14` runner. The darwin-arm64 load was qualified by supplementary run `43336186066` on `macos-15-arm64` for the identical extension subtree. The original job on H stays recorded as cancelled, not passed.
- **#660, #505, #476, #475 and #463:** disclosed in CHANGELOG `[6.0.13]` Known Limitations.
- **#674:** docs follow-up for the READMEs. It is not part of the packaged release.
- **#673:** the Statewright demo reel.
