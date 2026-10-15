# FailSafe release verification (`rv`)

Post-release qualification for the platform-targeted FailSafe VSIXs (#521, Wave 0). One dependency-free Node CLI (Node 22.13 or later) with four subcommands. Each one writes a single evidence file in schema `failsafe.release-verification/v1` (see `evidence.schema.json`), and a report combines those files.

```
node tools/release-verification/rv.cjs inventory   --dir DIR --version V [--sums FILE --sums-source KIND:REF] [--artifact-kind local-dir|ci-artifact] --json OUT
node tools/release-verification/rv.cjs marketplace --version V --sums FILE --sums-source KIND:REF --download-dir DIR [--market vscode|openvsx|both] --json OUT
node tools/release-verification/rv.cjs lifecycle   --code DIR --root ROOT --from VSIX --to VSIX [--to-sha256 HEX] --json OUT
node tools/release-verification/rv.cjs report      --in FILE... --out DIR
```

## Two modes, never confused

The report works out its mode from the kinds of evidence it is given. It never takes the mode from a flag or from a field in an input file.

- **PRE-RELEASE REHEARSAL**: no marketplace evidence among the inputs. It covers local or CI artifacts only. The best status it can reach is `rehearsal-pass`, and `marketplaceVerified` is always false. The first line of `report.md` reads `# PRE-RELEASE REHEARSAL - NOT A MARKETPLACE VERIFICATION`.
- **MARKETPLACE VERIFICATION**: at least one marketplace evidence file among the inputs. Only this mode can reach `verified`.

## Exit codes (every subcommand)

| Code | Meaning |
|---|---|
| 0 | Pass: `verified` or `rehearsal-pass`. |
| 1 | Verification failed. A fail outranks an inconclusive result. |
| 2 | Usage error, malformed input or unsafe environment. Decided before any work. |
| 3 | Inconclusive or incomplete: not published yet, network error, unrecognized response shape, launch failure, or a required check missing. Never a pass. |

## What each subcommand checks

- **inventory**: per VSIX it checks:
  - the manifest identity (`MythologIQ.mythologiq-failsafe`, PackageManifest 2.0.0);
  - that Identity Version, `package.json` version and `--version` agree;
  - that `better-sqlite3` is declared;
  - the release native rule (`checkNativeBinary`): exactly one prebuild matching the target's PE, ELF or Mach-O architecture;
  - the sha256 against the approved set.

  The set as a whole must be exactly the eight `NATIVE_TARGETS`, with no universal build. Inventory does not use `validate-vsix.cjs`, which only accepts the source tree's own version.
- **marketplace**: checks the VS Code Marketplace (one `extensionquery` request with flags 147) and Open VSX (one request per target, plus the version root as a cross-check), each on its own.
  - Each marketplace must publish exactly the eight targets and no universal build.
  - Each download must match its approved line, and on the VS Code Marketplace also the `VsixSha256` property.
  - Inventory must pass on the downloaded bytes.
  - Only URLs returned by the marketplace APIs, on `open-vsx.org`, `marketplace.visualstudio.com` or `*.gallerycdn.vsassets.io`, are ever requested. Redirects are recorded. Files are written as `DIR/<marketplace>/mythologiq-failsafe-V-TARGET.vsix`.
  - On win32-x64 it then loads the SQLite binary from the downloaded win32-x64 VSIX using `FailSafe/extension/scripts/smoke-packaged-sqlite.cjs`. This runs only after that file's hash and inventory have passed.
- **lifecycle** (win32-x64 only): runs seven steps in an isolated profile.
  - S1: install `--from`.
  - S2: upgrade to `--to`.
  - S3: restart.
  - S4: force-kill, once the session's checkpoint has been observed as committed.
  - S5: restart after the kill.
  - S6: roll back to `--from`.
  - S7: re-upgrade to `--to`.

  What it asserts:
  - Each healthy session adds a `snapshot.created` row to `soa_ledger.db`, and the killed session S4 is included in this.
  - No table in any store loses rows.
  - All three databases pass `integrity_check`. They are checked on copies under `ROOT/out/db-copies` with `node:sqlite`, so the checker never loads the artifact's own `better-sqlite3`.
  - Degraded mode (`running in stub mode`, `JSONL fallback mode`, `Checkpoint persistence failed`) is logged exactly when the installed VSIX cannot load on this host.
- **report**: refuses (exit 2) inputs with mixed versions, more than one approved checksum set, more than one lifecycle file, or a schema error.
  - It re-checks the approved set's sha256 against its file, every download record against its approved line, and that the lifecycle ran on the bytes this report covers. Those bytes are the inventoried win32-x64 VSIX in a rehearsal, or the VS Code Marketplace win32-x64 download in a marketplace verification.
  - The required-check table for each mode is `requiredChecks()` in `lib/report.cjs`. Both marketplaces are named in it explicitly.
  - These checks are listed but never required: the packaged-binary load and the lifecycle for the seven non-win32-x64 targets (`NOT-RUN`, because Wave 0 has no runner for them), the operator-registry comparison, and residual processes.

## Preparing a disposable VS Code (lifecycle)

1. Download a VS Code win32-x64 archive, for example 1.141.1. Extract it outside every VS Code install location. `rv` refuses `%LOCALAPPDATA%\Programs\Microsoft VS Code`, `%ProgramFiles%\Microsoft VS Code`, `%ProgramFiles(x86)%\Microsoft VS Code`, the Insiders equivalents of all three, and any directory that contains one of them.
2. Remove the `win32VersionedUpdate` key from `<HEX10>\resources\app\product.json`. Otherwise the installed updater's `vscode-updating` mutex blocks the launch.
3. Pass a `--root` directory that does not exist yet, or is empty. `rv` creates the layout inside it and never deletes anything.

`rv` refuses to run if any process from the disposable directory is already running. It only ever signals processes whose ExecutablePath is inside that directory, and it re-checks each one by ExecutablePath and CreationDate immediately before killing it. Child processes outside the directory, such as `git.exe`, are reported and never signalled.

During the run, the spawned VS Code has `USERPROFILE`, `HOME`, `APPDATA` and `LOCALAPPDATA` pointed into `ROOT\home`. This keeps FailSafe's `~/.failsafe` state (server registry, marketplace cache, adapter config) away from yours. The positive proof that isolation worked is FailSafe's registry entry appearing under `ROOT\home\.failsafe\servers.json`.

## Rehearsal (before publication)

From `FailSafe/extension`, after `npm ci` and `npm run compile`:

```
node scripts/package-all-targets.cjs --out dist-vsix
node ../../tools/release-verification/rv.cjs inventory --dir dist-vsix --version 6.0.7 --sums dist-vsix/SHA256SUMS.txt --sums-source local:dist-vsix --json rv/inventory.json
node ../../tools/release-verification/rv.cjs lifecycle --code <disposable-vscode> --root <new-empty-dir> --from <published-previous.vsix> --to dist-vsix/mythologiq-failsafe-6.0.7-win32-x64.vsix --json rv/lifecycle.json
node ../../tools/release-verification/rv.cjs report --in rv/inventory.json rv/lifecycle.json --out rv/report
```

The best possible outcome is `rehearsal-pass`, which says nothing about what the marketplaces serve.

## Marketplace verification (after publication)

The approved checksum set is the `SHA256SUMS.txt` that the release run wrote into its `vsix-targets` artifact. That is the same set the production-gated publish jobs uploaded. There are two ways to supply it.

**v6.0.7 and later: from the GitHub Release (`release-asset:TAG`).** The release workflow attaches the eight target VSIXs and `SHA256SUMS.txt` to the GitHub Release. It does this only once both marketplaces serve those exact bytes, and the Release stays a draft until all nine files are attached. Download the public asset and pass the tag. `rv` fetches `https://github.com/MythologIQ-Labs-LLC/FailSafe/releases/download/<tag>/SHA256SUMS.txt` itself and requires it to be byte-identical to `--sums`. While the Release is still a draft that URL returns 404, so `rv` reports inconclusive (exit 3).

```
curl -fsSLO https://github.com/MythologIQ-Labs-LLC/FailSafe/releases/download/v6.0.7/SHA256SUMS.txt
node tools/release-verification/rv.cjs marketplace --version 6.0.7 --sums SHA256SUMS.txt --sums-source release-asset:v6.0.7 --download-dir rv/downloads --json rv/marketplace.json
```

**Any version, including v6.0.6 and earlier, which have no Release assets: from the release run (`run-artifact:RUN_ID`).**

```
gh run download <release-run-id> -n vsix-targets -D approved
node tools/release-verification/rv.cjs marketplace --version 6.0.7 --sums approved/SHA256SUMS.txt --sums-source run-artifact:<release-run-id> --download-dir rv/downloads --json rv/marketplace.json
```

Then, whichever source you used, run the lifecycle on the bytes the VS Code Marketplace actually serves, and build the report:

```
node tools/release-verification/rv.cjs lifecycle --code <disposable-vscode> --root <new-empty-dir> --from <previous.vsix> --to rv/downloads/vscode-marketplace/mythologiq-failsafe-6.0.7-win32-x64.vsix --to-sha256 <approved win32-x64 hash> --json rv/lifecycle.json
node tools/release-verification/rv.cjs report --in rv/marketplace.json rv/lifecycle.json --out rv/report
```

A `run-artifact` source is recorded as operator-attested; `rv` does not authenticate to GitHub. Open VSX can return 404 for a newly published version for about 40 minutes. `rv` reports that as inconclusive (exit 3); wait and run it again, and never re-publish because of it.

## Limitations

- The lifecycle runs on win32-x64 only.
- Persistence after the forced kill covers checkpoints committed before the kill. It does not cover a transaction that was in flight at the moment of the kill.
- Detection depends on the strings FailSafe logs today. A drift test fails if those strings change, and the checkpoint count catches a degraded session that logs nothing.
- Evidence files are not signed. The report re-checks the records it can, but it cannot detect a consistently forged set of files.
- Marketplace signatures are not cryptographically verified.

## Tests

The suites live in `FailSafe/extension/src/test/release-verification/*.test.cjs` and run with `npm run test:node`.
