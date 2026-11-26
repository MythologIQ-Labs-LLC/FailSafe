# #696 red/green and clone-depth matrix under Node 22 (2026-11-26)

**Runtime**: Node **v22.23.5** win-x64 from `%TEMP%\failsafe-695-node22\node-v22.23.5-win-x64\node.exe` (pre-existing on this host from the #695 work; the historical #696 plan bound Node 22.23.5). Provenance re-verified for this run: `node-v22.23.5-win-x64.zip` sha256 `4a191082e9706866830379d577d2cc8a50c776fcd9436a8d061b063ed0d9a0e3` equals the entry in `https://nodejs.org/dist/v22.23.5/SHASUMS256.txt`; the extracted `node.exe` sha256 `247e9693d316da9857e44990e5e11709f596f18112251b8026ec6eed80bdf38a` equals `node.exe` inside that zip. Not installed globally; PATH unchanged.

**Host**: Windows 11 Pro 10.0.26300, OpenSSL 3.5.7. Clones made with `git -c core.longpaths=true clone --no-local` into the session scratchpad.

**Command** (in each checkout's `FailSafe/extension`): `node --test --test-reporter=tap src/test/scripts/g4Witness.test.cjs`

| Checkout | Revision | History | Result |
|---|---|---|---|
| fresh full clone | `main@0550c413` | 2111 commits (`g4-000001` resolvable) | **RED**: 10 tests, 9 pass, 1 fail ("the CLI never reports PASS for the real repository, which has no witness yet") |
| fresh full clone | candidate `e32bb62f` | full | **GREEN**: 11 tests, 11 pass |
| depth-1 clone | `8dce7f54` (tree `981740d6`, identical to `main@0550c413`'s tree) | 1 commit (witness not resolvable) | 10 tests, 10 pass: the stale assertion passes only because the shallow checkout cannot resolve the witness (the defect's clone-depth dependence) |
| depth-1 clone | candidate `e32bb62f` | 1 commit | **GREEN**: 11 tests, 11 pass |

The same red/green was also observed on this host under Node v24.19.0 (main 9/1; candidate 11/11).

Conclusion: main's result depends on clone depth; the candidate's result does not (11/11 in full and depth-1 clones). Other operating systems are covered by the exact-head CI run on Linux (depth-1 checkout), recorded at substantiation.
