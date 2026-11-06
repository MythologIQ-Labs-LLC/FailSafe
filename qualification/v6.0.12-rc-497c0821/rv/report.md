# PRE-RELEASE REHEARSAL - NOT A MARKETPLACE VERIFICATION

FailSafe 6.0.12: status **rehearsal-pass** (exit 0); marketplaceVerified: false.

This report covers local or CI artifacts. It says nothing about what the marketplaces serve.

Approved sums: local:dist-vsix/SHA256SUMS.txt (local; approved-sums check: pass), sha256 f9c53219bdcd42795d964caccae37509b34299d11a251474c6d9d3f9cdb5ad40

## Inputs

| File | Kind | Version | sha256 |
|---|---|---|---|
| C:\\dev\\mythologiq\\FailSafe-6012-qual\\logs\\n\\rv-inventory.json | inventory | 6.0.12 | c1431cc769f789e1c32b3a568ed274da294994324e8b710de499462cffe3226e |
| C:\\dev\\mythologiq\\FailSafe-6012-qual\\logs\\n\\rv-lifecycle.json | lifecycle | 6.0.12 | 3ff1077e041f8dd9d5660d3450fe1be625f13460310965edda5e0c53ee089ac3 |

## Failing checks

None.

## Required checks not passing

None.

## Required checks (62/62 pass)

| Check | Status | Detail |
|---|---|---|
| artifact/approved-sums/- | pass | local file (rehearsal only): dist-vsix/SHA256SUMS.txt |
| report/approved-sums-file/- | pass | C:\\dev\\mythologiq\\FailSafe-6012n\\FailSafe\\extension\\dist-vsix\\SHA256SUMS.txt matches the recorded sha256 |
| artifact/target-set/- | pass | exactly the 8 NATIVE_TARGETS |
| artifact/archive/win32-x64 | pass | 188 entries |
| artifact/manifest/win32-x64 | pass | MythologIQ.mythologiq-failsafe |
| artifact/version/win32-x64 | pass | manifest 6.0.12, package.json 6.0.12, expected 6.0.12 |
| artifact/sqlite-declared/win32-x64 | pass | better-sqlite3 declared |
| artifact/native-binary/win32-x64 | pass | one prebuild matching win32-x64 |
| artifact/sha256/win32-x64 | pass | equals approved line mythologiq-failsafe-6.0.12-win32-x64.vsix |
| artifact/archive/win32-arm64 | pass | 188 entries |
| artifact/manifest/win32-arm64 | pass | MythologIQ.mythologiq-failsafe |
| artifact/version/win32-arm64 | pass | manifest 6.0.12, package.json 6.0.12, expected 6.0.12 |
| artifact/sqlite-declared/win32-arm64 | pass | better-sqlite3 declared |
| artifact/native-binary/win32-arm64 | pass | one prebuild matching win32-arm64 |
| artifact/sha256/win32-arm64 | pass | equals approved line mythologiq-failsafe-6.0.12-win32-arm64.vsix |
| artifact/archive/linux-x64 | pass | 188 entries |
| artifact/manifest/linux-x64 | pass | MythologIQ.mythologiq-failsafe |
| artifact/version/linux-x64 | pass | manifest 6.0.12, package.json 6.0.12, expected 6.0.12 |
| artifact/sqlite-declared/linux-x64 | pass | better-sqlite3 declared |
| artifact/native-binary/linux-x64 | pass | one prebuild matching linux-x64 |
| artifact/sha256/linux-x64 | pass | equals approved line mythologiq-failsafe-6.0.12-linux-x64.vsix |
| artifact/archive/linux-arm64 | pass | 188 entries |
| artifact/manifest/linux-arm64 | pass | MythologIQ.mythologiq-failsafe |
| artifact/version/linux-arm64 | pass | manifest 6.0.12, package.json 6.0.12, expected 6.0.12 |
| artifact/sqlite-declared/linux-arm64 | pass | better-sqlite3 declared |
| artifact/native-binary/linux-arm64 | pass | one prebuild matching linux-arm64 |
| artifact/sha256/linux-arm64 | pass | equals approved line mythologiq-failsafe-6.0.12-linux-arm64.vsix |
| artifact/archive/alpine-x64 | pass | 188 entries |
| artifact/manifest/alpine-x64 | pass | MythologIQ.mythologiq-failsafe |
| artifact/version/alpine-x64 | pass | manifest 6.0.12, package.json 6.0.12, expected 6.0.12 |
| artifact/sqlite-declared/alpine-x64 | pass | better-sqlite3 declared |
| artifact/native-binary/alpine-x64 | pass | one prebuild matching alpine-x64 |
| artifact/sha256/alpine-x64 | pass | equals approved line mythologiq-failsafe-6.0.12-alpine-x64.vsix |
| artifact/archive/alpine-arm64 | pass | 188 entries |
| artifact/manifest/alpine-arm64 | pass | MythologIQ.mythologiq-failsafe |
| artifact/version/alpine-arm64 | pass | manifest 6.0.12, package.json 6.0.12, expected 6.0.12 |
| artifact/sqlite-declared/alpine-arm64 | pass | better-sqlite3 declared |
| artifact/native-binary/alpine-arm64 | pass | one prebuild matching alpine-arm64 |
| artifact/sha256/alpine-arm64 | pass | equals approved line mythologiq-failsafe-6.0.12-alpine-arm64.vsix |
| artifact/archive/darwin-x64 | pass | 188 entries |
| artifact/manifest/darwin-x64 | pass | MythologIQ.mythologiq-failsafe |
| artifact/version/darwin-x64 | pass | manifest 6.0.12, package.json 6.0.12, expected 6.0.12 |
| artifact/sqlite-declared/darwin-x64 | pass | better-sqlite3 declared |
| artifact/native-binary/darwin-x64 | pass | one prebuild matching darwin-x64 |
| artifact/sha256/darwin-x64 | pass | equals approved line mythologiq-failsafe-6.0.12-darwin-x64.vsix |
| artifact/archive/darwin-arm64 | pass | 188 entries |
| artifact/manifest/darwin-arm64 | pass | MythologIQ.mythologiq-failsafe |
| artifact/version/darwin-arm64 | pass | manifest 6.0.12, package.json 6.0.12, expected 6.0.12 |
| artifact/sqlite-declared/darwin-arm64 | pass | better-sqlite3 declared |
| artifact/native-binary/darwin-arm64 | pass | one prebuild matching darwin-arm64 |
| artifact/sha256/darwin-arm64 | pass | equals approved line mythologiq-failsafe-6.0.12-darwin-arm64.vsix |
| artifact/to-inventory/win32-x64 | pass | inventory passed before install |
| lifecycle/S1/win32-x64 | pass | healthy |
| lifecycle/S2/win32-x64 | pass | healthy |
| lifecycle/S3/win32-x64 | pass | healthy |
| lifecycle/S4/win32-x64 | pass | healthy; force-killed after commit-observed |
| lifecycle/S5/win32-x64 | pass | healthy |
| lifecycle/S6/win32-x64 | pass | healthy |
| lifecycle/S7/win32-x64 | pass | healthy |
| lifecycle/persistence/win32-x64 | pass | snapshot.created S1=1 S2=2 S3=3 S4=4 S5=5 S6=6 S7=7 |
| isolation/home-registry/- | pass | every healthy step registered in C:\\Users\\<user>\\AppData\\Local\\Temp\\fs6012n-life-FIsa\\home\\.failsafe\\servers.json (FailSafe's home resolved inside ROOT) |
| report/lifecycle-binding/- | pass | lifecycle ran on the inventoried win32-x64 VSIX |

## Informational (never required)

- isolation/operator-registry/- (pass): informational: no ROOT entry in the operator's registry (a live FailSafe prunes and rewrites it, so absence proves little)
- isolation/residual-processes/- (pass): none
- informational/host-load/win32-arm64 (not-run): no runner in Wave 0 (Phase 5 not approved)
- informational/lifecycle/win32-arm64 (not-run): no runner in Wave 0 (Phase 5 not approved)
- informational/host-load/linux-x64 (not-run): no runner in Wave 0 (Phase 5 not approved)
- informational/lifecycle/linux-x64 (not-run): no runner in Wave 0 (Phase 5 not approved)
- informational/host-load/linux-arm64 (not-run): no runner in Wave 0 (Phase 5 not approved)
- informational/lifecycle/linux-arm64 (not-run): no runner in Wave 0 (Phase 5 not approved)
- informational/host-load/alpine-x64 (not-run): no runner in Wave 0 (Phase 5 not approved)
- informational/lifecycle/alpine-x64 (not-run): no runner in Wave 0 (Phase 5 not approved)
- informational/host-load/alpine-arm64 (not-run): no runner in Wave 0 (Phase 5 not approved)
- informational/lifecycle/alpine-arm64 (not-run): no runner in Wave 0 (Phase 5 not approved)
- informational/host-load/darwin-x64 (not-run): no runner in Wave 0 (Phase 5 not approved)
- informational/lifecycle/darwin-x64 (not-run): no runner in Wave 0 (Phase 5 not approved)
- informational/host-load/darwin-arm64 (not-run): no runner in Wave 0 (Phase 5 not approved)
- informational/lifecycle/darwin-arm64 (not-run): no runner in Wave 0 (Phase 5 not approved)

