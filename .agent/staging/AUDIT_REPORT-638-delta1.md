# AUDIT REPORT: #638 G4 witness, bounded delta 1 (after PASS #931)

**Delta verdict: ACCEPT.** PASS #931 (report sha256 `f7cb4f69de5444681655a394f6e809b033f6c6827054798975c86d61dab2bd47`, audited at `41d39e2e`, recorded as `20255f25`) **extends to `6022d7ef0bf125917cba2a669830eb3dbaede492`**.
**Risk grade:** L3 (unchanged). The delta itself is test-helper only.
**Judge:** independent QoreLogic Judge, 2026-11-10. Read-only; no key created, no TSA contacted. `AUDIT_REPORT-638.md` was not modified (sha256 still `f7cb4f69…`).

## 1. Scope of the delta

- `git diff 20255f25 6022d7ef --stat`: one file, `FailSafe/extension/src/test/scripts/g4TestPki.cjs`, +41 −5. Commits `3010aab3`, `492e0b65`, `6022d7ef`.
- `git diff 41d39e2e 20255f25` restricted to `FailSafe/extension/scripts`, `tools/g4`, the G4 tests and helpers, the two G4 docs and `.gitattributes`: **empty**. The audited verifier, CLIs, PowerShell scripts, policy files, tests and docs are byte-identical to what PASS #931 covered.
- `git ls-tree -r HEAD .qor/session` lists only `current`; `git log --all -- .qor/session/keys` is empty.

## 2. The new helper

`createTestSigner` now builds the signer certificate with `openssl req -new` (CSR), `openssl ca -selfsign -startdate/-enddate -batch`, then `openssl x509 -outform DER`. `selfSignCaConfig` writes a throwaway `ca` database under the caller's temp directory.

Judge probe (`g4-pki-probe.cjs`, OpenSSL 3.5.7, temp directories only):

| Case | Result |
|---|---|
| Expired window (notBefore now−2d, notAfter now−1h) | notBefore and notAfter equal the requested instants to the second |
| Not-yet-valid window (now+1d .. now+2d) | exact to the second |
| Default window | now−1h .. now+1d |
| Output | DER; P-256; self-issued; `basicConstraints critical CA:FALSE`; `keyUsage critical Digital Signature` |
| Signing | 64-byte P1363 signature verifies against the certificate |
| Path containing spaces, `$HOME`, `$dir`, `#` and `'` | works; no variable expansion, no comment truncation |
| Cleanup | temp tree removed; nothing persistent |

Config quoting: path separators are normalized to `/`, backslashes are escaped before double quotes, values are double-quoted, and CR, LF and NUL are refused. Inside double quotes OpenSSL's config parser does not expand `$` or treat `#` as a comment, and the probe confirms it. The key name is test-supplied only (`A`, `B`, `E`, `F`, `K`, `tpm-shape`).

The private key is still an ephemeral in-memory key written only to the temp directory as `*.test-only.key.pem`, as before.

## 3. Mutation sensitivity (Judge's own runner, fresh LF clone of `6022d7ef`, six suites, 65 tests)

**37 of 38 caught.** Every mutant caught at iteration 2 is still caught:
- prefix (M01, M02, M02b, M03), ledger digest (M26), commit ancestry (M25), sequence (M24);
- registry (M04 to M09), including both checkpoint anchors;
- imprint and TSA trust (M10, M11, M12, M29, M30);
- signature (M13), **key window (M14, killed by both the expired and the not-yet-valid tests)**, pinned key (M15), key reset (M16), revocation (M17);
- chain link (M18), time skew (M19), time order (M20), gap statement (M21), genesis (M22, M31), hash algorithm (M23);
- trusted head (M27), fail-open (M28), and the remediation checks (M33 to M37).

**Survivor:** M32, the token `granted` check. This is the known survivor from iteration 2; there is no new one.

## 4. Suites, razor, lint

- Six G4 suites: 65/65 pass.
- OpenSSL absent (`G4_OPENSSL=/nonexistent`): 59 skipped with the stated reason, 6 pass, 0 fail.
- `g4-verify-checkpoint.cjs` on this repository: `BLOCKED TSA_POLICY_UNSELECTED`, exit 2.
- Razor on `g4TestPki.cjs`: 125 lines; longest function `createLocalTsa` 28 lines; `selfSignCaConfig` 25 and `createTestSigner` 23; depth 3 or less. Pass.
- eslint on the file: 0 problems.
- `npm run test:node` (one run): 1063 tests, 1044 pass, **1 fail**, 18 skipped. The failure is the known timing-sensitive `ArchitectureLinks.test.cjs:199` ("event loop lag 121 ms"), outside the delta. Re-run in isolation three times: 12/12 pass each time. No G4 test failed. I did not obtain a clean full run.

## Blocking

None.

## Non-blocking

- **D1.** `tsaConfig` (unchanged, already audited) still writes `dir = <path>` unquoted, unlike the new `selfSignCaConfig`. A temp path containing `#` or `$` would break the local test TSA (a test failure, not a pass). Quote it the same way for consistency.
- **D2.** The `ArchitectureLinks` event-loop-lag test flaked under load in the full run. It is pre-existing and unrelated to #638.
- The iteration-2 items N-a to N-d stand unchanged.

## Commands relied on

```
git diff 20255f25 6022d7ef --stat
git diff 41d39e2e 20255f25 --stat -- FailSafe/extension/scripts tools/g4 <G4 tests> <G4 docs> .gitattributes   -> empty
git ls-tree -r HEAD .qor/session; git log --all -- .qor/session/keys
node <scratch>/g4-pki-probe.cjs FailSafe/extension
node <scratch>/g4mut-run4.cjs <LF clone of 6022d7ef>      -> 37 caught, M32 survived
node --test src/test/scripts/g4*.test.cjs                 -> 65/65
G4_OPENSSL=/nonexistent node --test src/test/scripts/g4*.test.cjs -> 59 skipped, 0 fail
node razor.cjs FailSafe/extension …/g4TestPki.cjs; npx eslint …/g4TestPki.cjs
npm run test:node                                         -> 1063 / 1044 pass / 1 fail (ArchitectureLinks lag) / 18 skip
node --test src/test/governance/architecture/ArchitectureLinks.test.cjs (x3) -> 12/12 each
```
