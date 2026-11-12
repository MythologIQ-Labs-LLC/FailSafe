# AUDIT REPORT (iteration 8, bounded confirmation check after VETO #945): PR #653 / issue #652, Statewright website-first handoff

- **Auditor role:** independent Judge (/qor-audit). I wrote none of the change, none of its remediations and none of the earlier audits.
- **Date:** 2026-11-11
- **Exact source audited:** `b395693d174e837a7c053f4193a376d1c0a7f9ae`. This is `git rev-parse HEAD` in `C:\dev\mythologiq\FailSafe-653`, branch `feat/652-statewright-website-handoff`. It equals the PR's `headRefOid`. The PR is draft and open.
- **Base:** `origin/main` = `9f16548d83116e2d8ee7f9010545963c06e5c93a`.
- **Fix under confirmation:** `git diff e475ca8f..HEAD`. It changes `statewright-handoff.test.ts`, adds `no-network.cjs`, changes `set3.cjs` to `set7.cjs`, plan iteration 8, the evidence file and gate files. The ledger is unchanged.
- **Environment:** Windows 11, Node 22.23.4, Playwright Chromium.
  - Work was done in one detached worktree and seven `git archive` exports of HEAD, all under `C:\Users\krkna\AppData\Local\Temp\a653i8-W1Iuq2`.
  - The audited worktree was not built in or mutated.
- **Network safety:** no request reached `statewright.ai`.
  - My own preload (`guard8.cjs`) refused and logged every non-loopback `dns.lookup`, `dns.resolve*` and socket `connect`, in every Node process I started.
  - My Playwright config mapped every host to 127.0.0.1 and sent unrouted traffic to a dead local proxy.
  - Exception: the committed evidence scripts were run unmodified. They use the repository's config, whose spec maps the provider host to 127.0.0.1. My preload was still loaded underneath the committed guard in those runs.
  - The guard probe in criterion D3 used only `192.0.2.1` (TEST-NET-1) and the name `statewright.ai`, with my guard underneath.

## Scope statement

**This is a bounded confirmation check, not an open-ended audit.** It checks the acceptance criteria the owner defined:

- D and F: did the fix close #945's failing criteria?
- O1: is the new style-composition test effective?
- A, B, C, E, G and H: do they still hold as #945 found them?

I ran no new mutant campaign. Apart from the auditors' own definitions, I ran these probes:

- the D1 to D4 network probes;
- one O1 vacuity probe;
- a re-run of the pin-off subset for A and B.

## Verdict: PASS

All criteria hold. I found no present security or product defect. The observations below are for the owner and do not change the verdict.

| Criterion | Status | Evidence (details below) |
|---|---|---|
| **D1.** jsdom stubs on the Node globals and on the window, restored | **PASS** | `setupDom` installs recording `WebSocket`, `EventSource`, `XMLHttpRequest` and `fetch` on both `global` and `dom.window`. A mocha root-hook probe compared the six network globals before and after each of the 39 tests: none changed. |
| **D2.** #945's X12 makes zero attempts from `statewright-handoff.test.js`, and that suite fails | **PASS** | Under my guard, X12 (`if (window.WebSocket) { new window.WebSocket('wss://statewright.ai/live?w=…') }`): `statewright-handoff.test.js` had 12 failing and **0 attempts**; `-source.test.js` had 2 failing and 0 attempts; `integration-catalog-renderer.test.js` had 0 failing and **9 attempts** (`connect statewright.ai`), all refused by my guard. X12w and X12x each made 0 attempts from the handoff file and 8 from the catalog file. The plan's statement about the catalog file is true and complete (see D2 below). |
| **D3.** Committed `no-network.cjs` refuses before sending, allows loopback, counts | **PASS (observation O1)** | 22 of 22 probes against `statewright.ai` and `192.0.2.1` were refused and counted, and nothing reached my guard underneath. The probes were `dns.lookup` (with and without `all`), `dns.promises.lookup`, `net.connect` in three forms, `tls.connect`, `http.get`, `https.get`, `fetch` and `WebSocket`. Loopback works (`localhost` lookup, `net.connect`, `fetch` to a local HTTP server). The baselines of `set7`, `set6` and `set4` reported `"refused":0`. Gap: some DNS resolver APIs and UDP are not covered (O1). |
| **D4.** Playwright host mapping in every test of the spec | **PASS** | The spec's single top-level `test.use` (line 12) is unchanged since `e9ff78bd`. A disposable copy of the spec with a CDP `afterEach` showed `--host-resolver-rules=MAP statewright.ai 127.0.0.1, MAP *.statewright.ai 127.0.0.1` in all 10 tests. |
| **F.** Records true | **PASS (observation O2)** | `git diff e475ca8f HEAD -- docs/META_LEDGER.md` is empty. `verify-ledger --post-anchor` prints OK for #938 to #945 and exits 0. #945's content hash `29a804f9…` equals the LF sha256 of the iter7 report, and its text is true. Plan iteration 8 and the evidence file make no material false claim (see F below). The committed `set7`, `set6` and `set4` reproduce **36 of 36** evidence rows (33 mutants and 3 baselines) character for character, including X12w, X12x, E01, E02 and the refused counts 8, 8, 0 and 0. |
| **O1.** Style-composition test effective, not vacuous | **PASS** | E01 and E02 are killed: in committed set 7 `jsdom FAIL`; in my lane 6 jsdom failures each. No false refusal: 24 of 24 jsdom tests pass at HEAD in 10 runs. The extracted constants are 2094 and 597 characters, and `STATEWRIGHT_STYLES` equals the module export. With `constantText` forced to return `''`, all 6 `stylesInstalled` tests fail. |
| **A.** Card box in the readability frames, effective without the pin | **PASS** | With the pin test excluded: V14 fails readability in 5 of 5 views, W02 5, V39 5, V16 2. All 15 Playwright tests pass at HEAD. |
| **B.** Fifth audit's closed list holds | **PASS** | Digest `b1c2787e…` is unchanged. With the pin on, V38, V25, V19, V20 and V21 are killed by the pin alone, as specified. Z02, Z09, Z34 and Z35 fail Playwright with the pin on and with it off (5, 3, 2 and 2 views). |
| **C.** W01 to W03 killed | **PASS** | W01: 1/6/0/pass. W02: 1/6/0/FAIL 5. W03: 2/6/0/FAIL 6 (source/jsdom/catalog/Playwright). With the pin off, W01 and W02 are still killed by jsdom (6 each). |
| **E.** No regression | **PASS** | 184 of the auditors' mutants re-run, plus W01 to W03 and E01 to E03: 171 of 184 killed, the same 13 survivors as #945, **none moved from killed to survived**. All 6 W and E probes are killed. |
| **G.** Hygiene | **PASS (local); CI see below** | Byte identity holds and the razor holds. Mocha: 10 runs, 39 of 39 passing each time. Playwright: 2 × 75 under `--repeat-each=5`, once at 80 % CPU and once at 51 %, no failure. Guards are green apart from the known `bundleDeps` artefact. The completed CI failure is not caused by the change. |
| **H.** Shipped source | **PASS** | Both files are byte-identical to `dd766c15` (`8a15f1ae`, `fda005ad`). I re-read both, and the five-line renderer diff against `main`. No defect against the scope or any required negative. |

## Blocking findings

None.

## Criterion details

### D1: jsdom stubs

- `setupDom` adds `XMLHttpRequest` to the saved-and-restored names.
- It installs `channel('WebSocket')`, `channel('EventSource')`, a recording `Xhr` constructor and a recording `fetch` on `dom.window` as well as on `global`. `Xhr.open` records the URL and `send` does nothing. No stub calls a real implementation, except that `fetch` calls the test's own `fetchImpl` for the catalog.
- My probe (`globals-probe.cjs`, mocha `--require` root hooks) snapshotted `WebSocket`, `EventSource`, `XMLHttpRequest`, `fetch`, `window` and `document` before and after every test in the three files. There were 39 tests and 0 changes.
- After the run, `WebSocket` and `fetch` are Node's own functions again.
- `EventSource` and `XMLHttpRequest` remain as own properties whose value is `undefined`. This is harmless and was already noted at #945.

### D2: X12 under my guard, per file

| Mutant | `statewright-handoff.test.js` | `-source.test.js` | `integration-catalog-renderer.test.js` |
|---|---|---|---|
| none (HEAD) | 24 pass, 0 attempts | 6 pass, 0 attempts | 9 pass, 0 attempts |
| X12 (#945 / second auditor) | **12 fail, 0 attempts** | 2 fail, 0 attempts | 0 fail, **9 attempts** (all `connect statewright.ai`, refused) |
| X12w (set 7) | 6 fail, 0 attempts | 2 fail, 0 attempts | 0 fail, 8 attempts (refused) |
| X12x (set 7) | 6 fail, 0 attempts | 2 fail, 0 attempts | 0 fail, 8 attempts (refused) |

The plan's iteration-8 text says three things about the catalog file:

1. It is identical to `main` and has no stubs. True: its blob is `b2b261cc` at both commits.
2. It makes attempts under the window-socket and window-request mutants, and they are refused. True: 8 each.
3. The ordinary commands (`npm test`, `npm run test:node`, CI) do not load the guard, so the guard matters only for mutation runs. True: no script, workflow or package file outside `.agent/staging/mutation-653/` references `no-network.cjs`, and unmutated HEAD makes no attempt.

Together these say what the criterion asks: that file's attempts under such mutants are refused only by the external guard during mutation runs. The count depends on the mutant: X12 as #945 defined it makes 9 attempts from that file, and the plan's "eight" refers to X12w and X12x, which is correct. In the full regression lane, X12 was the only one of 190 mutants that made any attempt (9).

### D3: committed guard probe

- **Setup.** `NODE_OPTIONS="--require guard8.cjs --require <worktree>/.agent/staging/mutation-653/no-network.cjs"`, with forward-slash paths as the runners use. The worktree copy is LF-equal to the HEAD blob (sha256 `8fd8ac00…`). The committed guard is loaded second, so it wraps mine, and anything it passes through reaches my logging guard.
- **Refused and counted, nothing reached my guard (22 probes):**
  - `dns.lookup`, `dns.lookup {all}` and `dns.promises.lookup`;
  - `net.connect(port, host)`, `net.connect({host})` and `new net.Socket().connect(...)`;
  - `tls.connect`, `http.get`, `https.get`, `fetch` and Node's `WebSocket`.

  Each ran for both `statewright.ai` and `192.0.2.1`, and `NO_NETWORK_LOG` recorded one line per attempt. The `connect` path destroys the socket without calling the real `connect`, so nothing is sent.
- **Loopback allowed.** `localhost` resolves to `::1`. `net.connect` to `127.0.0.1` and to `localhost` reaches a local listener. `fetch` to `127.0.0.1` and to `localhost` on a local HTTP server returns 200. Nothing is logged for loopback.
- **Runner baselines.** Committed `set7`, `set6` and `set4` each printed `baseline {…,"refused":0}` and exited 0. During those runs my guard underneath logged no attempt at all.
- **Not covered by the committed guard (O1).**
  - `dns.resolveTxt`, `dns.resolveAny` and other `dns.resolve*` beyond `resolve`, `resolve4` and `resolve6`;
  - `dns.promises.resolve4`;
  - `new dns.Resolver().resolve4` and `new dns.promises.Resolver().resolve4`;
  - `dgram` UDP sends.

  In my probe each of these went past the committed guard and was refused by mine.

### D4: Playwright mapping

All 10 tests in `statewright-handoff.spec.ts` ran in a browser whose command line contained the spec's mapping (`probe-d4.jsonl`). The spec is unchanged since `e9ff78bd`. There is no `test.describe` or second `test.use` that could override it.

### F: records

- **Ledger.**
  - `python -I -m qor.cli verify-ledger --post-anchor`, run read-only from the worktree root, printed `OK Entry #938` to `OK Entry #945: chain hash verified (post-anchor)`, then `post-anchor clean (boundary=#382)`, and exited 0.
  - `git diff e475ca8f HEAD -- docs/META_LEDGER.md` is empty, so #938 to #945 are unaltered.
- **Entry #945 is true.** Its content hash equals the LF sha256 of `AUDIT_REPORT-653-iter7-confirmation.md`, at HEAD and in the working tree. I checked its Decision against that report:
  - six of eight passed, and D failed together with part of F;
  - 27 external lookups during mocha, which my per-file numbers support: 9 from the catalog file, and 18 from the handoff file before the fix;
  - the two false sentences;
  - the remediation;
  - O1 (`+=` and `append`);
  - CI 12 of 13 with the browser-install failure.
- **Plan iteration 8, read sentence by sentence.**
  - **True:**
    - the iteration-7 bullet "Network guard (first attempt)", now correctly stating that the jsdom claim was false;
    - D, the stubs on both the globals and the window: confirmed by D1 and D2;
    - "A mutant that opens a socket or a request through `window` now fails the jsdom suite": X12, X12w and X12x;
    - "the runner prints the number of refused attempts … The unmutated baseline makes none";
    - "What the guard shows" (D2);
    - the style-composition paragraph (O1);
    - the Records bullet;
    - "The shipped files are still byte-identical to `dd766c15`".
  - **Overstated, not material (O1):** "It refuses every DNS lookup and connection to a host other than this machine, before anything is sent". It does refuse every lookup and TCP or TLS connection through the paths any page API, `fetch`, `ws` or `http` uses. It does not refuse the other `dns.resolve*` calls, `Resolver` instances or UDP.
  - **Imprecise, not material (O2):** "loaded into every test process". It is loaded into every Node test process, but not into the Chromium browser, which is covered only by the provider host mapping.
  - Neither sentence misstates anything about the provider, and both are disproved only by deliberate edits outside the criteria. That matches #945's treatment of its own "overstated" sentence.
  - **Not verified, not treated as false:** the installed-host table, which comes from outside the repository.
- **Evidence file.**
  - The Network paragraph is true for every run it records, subject to O1 and O2 above.
  - "The only mutants that made attempts are X12w and X12x, eight each; all came from the existing catalog test": reproduced exactly.
  - The totals (69 mutants, 69 killed) match the sets.
  - Rows reproduced with the committed scripts unmodified: set 7, 11 of 11 lines; set 6, 10 of 10; set 4, 15 of 15. That is 33 mutant rows and 3 baselines, all character for character, and each script exited 0.
  - I did not re-run sets 3 and 5 with the committed scripts this time. #945 reproduced set 5, 10 of 10 rows. The set-3 rows' mutants are among the auditors' definitions re-run under E.

### O1: style composition

- **The test.** `stylesInstalled` renders each of the six states and requires all of the following:
  - exactly one `<style>`, with id `cc-intcat-style`;
  - its `textContent` equals `constantText(renderer,'STYLE') + constantText(handoff,'STATEWRIGHT_STYLES')`;
  - zero `link` and `[style]` elements.
- **Kills.** E01 and E02 are killed by jsdom: 6 failures each in my lane; `jsdom FAIL` in committed set 7. W01, W02, W03 and E03 now also fail jsdom.
- **Extraction is correct.**
  - Neither literal contains `${` or a backslash, so the raw source text equals the runtime value.
  - Extracted lengths are 2094 and 597.
  - The extracted `STATEWRIGHT_STYLES` is `===` the module's export.
  - The test reads `src/`, which is the copy the compiled test imports, so a mutant in `src/` is what is compared.
- **Not vacuous.** I patched the compiled `constantText` in a disposable export to `return ""`: all 6 `stylesInstalled` tests failed, with a diff showing the installed sheet. When `indexOf` misses, the slice is not empty but wrong, so that case fails too.
- **No false refusal.** 24 of 24 jsdom tests pass at HEAD in 10 of 10 runs.

### A, B, C (pin on, then off)

"Pin off" means `--grep "the catalog style sheet is the reviewed one" --invert`, exactly as #945 did it. This does not exclude the new jsdom composition test.

| ID | Pin on: source/jsdom/catalog/Playwright | Pin off: mocha source/jsdom, Playwright | Playwright failures |
|---|---|---|---|
| V14 | 1/0/0/FAIL 5 | 0/0, FAIL 5 | readability 5 of 5 |
| W02 | 1/6/0/FAIL 5 | 0/6, FAIL 5 | readability 5 of 5 |
| V39 | 1/0/0/FAIL 5 | 0/0, FAIL 5 | readability 5 |
| V16 | 1/0/0/FAIL 2 | 0/0, FAIL 2 | readability 2 |
| W01 | 1/6/0/pass | 0/6, pass | none (killed by jsdom composition) |
| E03 | 0/6/0/FAIL 5 | 0/6, FAIL 5 | readability 5 |
| V38, V25, V19, V20, V21 | 1/0/0/pass each | not re-run (pin is their only control, as at #942, #944 and #945) | none |
| Z02, Z09, Z34, Z35 | 1/0/0/FAIL 5, 3, 2, 2 | 0/0, FAIL 5, 3, 2, 2 | readability |
| W03 | 2/6/0/FAIL 6 | not re-run | |

## Regression table

**Method.**

- Runner: `run8.cjs` is #945's `run7.cjs` (sha256 `6694f6ec…`), changed only to load my `guard8.cjs`, use my `pw8.config.ts`, and record refused attempts per mutant.
- Definitions were copied unmodified from #945's directory. Their hashes match #945's and the sixth reviewer's: `defs-audit2-muts.cjs` `48d3dacb…`, `defs-audit3-mutants.cjs` `4a8132cf…`, `z.cjs` `ff2ed950…`, `p.cjs` `f3cefd85…`, and `w7.cjs` `e50e9a79…` for W and E.
- Each mutant was applied alone to one of six exports of HEAD. Each run did `copy-ui-js`, then the three mocha files, then both Playwright specs with 3 workers.
- Each mutant's per-suite counts and failing-test set were compared with #945's raw `results-*.jsonl`, read from its directory (`compare8.cjs`).

| Set | Run | Killed now | Killed at #945 | Survivors now |
|---|---|---|---|---|
| M01 to M22 | 22 | 22 | 22 | none |
| X01 to X32 | 32 | 30 | 30 | X15, X16 |
| Y01 to Y53 | 51 | 45 | 45 | Y21, Y25, Y26, Y28, Y30, Y41 |
| Z01 to Z36 | 36 | 31 | 31 | Z17, Z19, Z23, Z26, Z30 |
| V01 to V42, A08 | 43 | 43 | 43 | none |
| **Total** | **184** | **171** | **171** | **13 (same list as #945)** |
| W01 to W03, E01 to E03 | 6 | 6 | 4 (E01, E02 survived) | none |

- **Killed to survived: none.** **Survived to killed:** E01 and E02 (the O1 fix). No mutant was a no-op and none errored.
- **Rows that changed without a change of kill status:**

| ID | At #945 (source/jsdom/catalog) | Now | Cause |
|---|---|---|---|
| M02, M03, M05 | 2/12/0 | 2/18/0 | the new composition test also fails |
| X12, X13 | 2/0/0 | 2/12/0 | the window stubs now record the opening; X12's catalog attempts are 9, refused |
| Z27, Z28 | 1/0/0 | 1/6/0 | composition test. Z27 is no longer killed by the pin alone |
| V35 | 0/0/0 (killed in Playwright) | 0/6/0 | composition test |
| Y20 | Playwright `IC+R5` | `R5` | #945's extra older-spec failure was a load artefact, as #945 said; it did not recur |

- **Killed by the pin alone (no other test fails):** V02, V04, V09, V10, V11, V12, V13, V15, V19, V20, V21, V22, V25, V26, V28, V29, V30, V31, V36, V37, V38, A08, Y44, Z06, Z07, Z11, Z15, Z16, Z33. This is #945's list minus Z27.
- **Network attempts across all 190 mutants:** only X12 made any (9, all refused, all from the catalog file).
- The survivors keep the classes the earlier auditors gave them:
  - cosmetic: X15 and X16;
  - obfuscated: Y21, Y26 and Y28;
  - plain deliberate: Y30 and Y41;
  - out of scope: Y25 and Z23;
  - plain, boundary: Z17 and Z30;
  - no rule broken: Z19;
  - legitimate edit: Z26.

## G: hygiene

- **Byte identity** (`git rev-parse <rev>:<path>`):
  - `integration-catalog-renderer.js`: `8a15f1ae` at HEAD and at `dd766c15`.
  - `statewright-handoff.js`: `fda005ad` at both.
  - `integration-catalog-renderer.test.ts`: `b2b261cc` at HEAD and at `origin/main`.
  - `integrations-catalog.spec.ts`: `2a75d9fa` at both.
- **Razor.** Measured from HEAD blobs with the TypeScript parser, on every code file added or modified against `origin/main`. Non-code files (changelogs, plan, evidence, ledger, gate JSON) are out of the razor's scope. Control nesting is counted per function.

| File | Lines | Longest function | Control nesting |
|---|---|---|---|
| `no-network.cjs` | 43 | `guardedConnect` 10 | 1 |
| `set3.cjs` to `set7.cjs` | 80, 68, 64, 63, 64 | `run` 9 | 3 |
| `integration-catalog-renderer.js` | 245 | `render` 38 | 2 |
| `statewright-handoff.js` | 28 | none | 0 |
| `statewright-handoff-source.test.ts` | 98 | suite callback 36 | 0 |
| `statewright-handoff.test.ts` | 179 | `setupDom` 25 | 1 |
| `statewright-handoff.spec.ts` | 213 | "other controls" callback 30 | 1 |

  No breach.
- **Flake.**
  - Mocha, three files: 5 runs at 80 % CPU (6 mutation lanes plus the committed scripts, and the other process's VS Code and Chrome), then 5 at 51 %. 39 passing every time.
  - Playwright, both specs, `--repeat-each=5 --workers=4`: 75 passed in 2.0 min under load, and 75 passed in 1.7 min after the lanes had finished.
  - My guard recorded no network attempt in any of these runs.
- **Guards.**

| Command | Result |
|---|---|
| `node --test src/test/docs/integration-contracts.test.cjs src/test/docs/integration-claims.test.cjs` (git worktree) | 101 pass, 0 fail |
| `npm run lint` | exit 0, 0 errors, 136 warnings |
| `node scripts/validate-vsix.cjs --source-only` | PASS, v6.0.12 |
| `npm run test:runner-coverage` | PASS, 752 test files |
| `npm run test:citation-parity` (git worktree) | exit 0, 35 tracked plans |
| `npm run test:node` (git worktree) | 1066 pass, 2 fail, 18 skipped. Both failures are `bundled dependencies (C2 T5)`, the known junction-worktree artefact. `ArchitectureLinks` "bounded I/O … event loop stays responsive" passes locally (see CI) |
| `npm run compile` | exit 0 in all 8 trees |

## CI

- `gh pr view 653`: `headRefOid` is `b395693d174e837a7c053f4193a376d1c0a7f9ae`, and the PR is draft and open.
- `gh run list --commit b395693d`: every run carries that `headSha`, attempt 1, and all are completed.
- `gh pr checks 653`: **CI is complete. 12 pass, 1 fail.**
  - The failing check is "Full Test Suite (test:all)", run `43065636290`.
  - This time `test:all` really ran. Lint, runner coverage, citation parity and `npm test` (vscode-test: 6169 passing and 15 pending, then 17 passing) all passed.
  - `test:node` then failed one test: `not ok 105 - describe: bounded I/O - no git, no sync fs, no child process; the event loop stays responsive (5,000 rows, a pathological cell)` in `src/test/governance/architecture/ArchitectureLinks.test.cjs:199`, with the error `event loop lag 112 ms`.
  - Because the suite stopped there, `test:ui` (Playwright) did not run in CI.
- **This failure is not caused by the change.**
  - The PR touches no file outside two changelogs, the two shipped UI modules, the three Statewright test files and governance records. `ArchitectureLinks` and its subject are untouched.
  - The assertion is a wall-clock event-loop-lag threshold on a shared runner.
  - The same test passes locally on HEAD.
- So it is not blocking under G. It is a timing flake of a test on `main` (observation O3). I triggered nothing, and my `gh` requests were read-only.

## Observations for the owner (not part of the verdict)

- **O1 (class: plain deliberate). The committed guard does not cover every resolver API or UDP.**
  - What passes through: `dns.resolveTxt`, `dns.resolveAny` and the other `dns.resolve*` except `resolve`, `resolve4` and `resolve6`; `dns.promises.resolve*`; `dns.Resolver` and `dns.promises.Resolver` instances; `dgram` sends. Each would send a DNS query or UDP datagram to the configured resolver.
  - Why it matters little: no browser API, and neither jsdom nor `ws`, `http` or `fetch`, uses these paths. Only a mutant that deliberately imports `node:dns` or `node:dgram` into browser code could use them.
  - Suggested fix: either patch every `resolve*` and `reverse` function on `dns`, `dns.promises` and both `Resolver` prototypes, and `dgram.Socket.prototype.send`, or narrow the plan and evidence wording "refuses every DNS lookup" to "every `dns.lookup` and TCP/TLS connection".
- **O2 (class: cosmetic). "Every test process" means every Node test process.** The Playwright browser does not load the guard. For the provider host it is covered by the spec's mapping, but a mutant browser request to a different public host would not be refused during a committed-script run. The committed scripts use the repository's config. My runs added an all-hosts mapping and a dead proxy, which is an option for the scripts too.
- **O3 (class: inherited from `main`). CI flake in `ArchitectureLinks` bounded-I/O timing.** The 100 ms event-loop-lag threshold failed at 112 ms on the hosted runner. `test:ui` therefore did not run in CI for this SHA. Under the owner's budget rules one re-run is allowed; I triggered nothing.
- **O4. Z27 and Z28 are now refused by the jsdom composition test as well.** Z27 (swapping the order of the two sheets) is equivalent today. This is the intended cost.
- **O5. Inherited or carried, unchanged since #945:**
  - the card title is unreadable in Pegasus, as for every catalog card;
  - layout below about 525 px;
  - the pill is not measured;
  - frames are border boxes with a 1 px tolerance;
  - the no-scroll rule;
  - no CSP or Referrer-Policy on the Console server;
  - `integration-catalog-renderer.test.ts` has no stubs of its own (as the plan now states).

## Tests and guards run

| What | Result |
|---|---|
| D1 root-hook probe, 39 tests | 0 global changes |
| D2 X12, X12w and X12x per file under `guard8` | table in D2 |
| D3 committed-guard probe (22 non-loopback probes plus loopback) and the resolver/UDP probe under `guard8b` | criterion D3, O1 |
| D4 CDP command line for 10 tests | mapping present in all |
| O1 vacuity patch | 6 of 6 composition tests fail |
| 184 auditors' mutants plus W01 to W03 and E01 to E03, pin on, both specs | regression table |
| Pin off: V14, V16, V39, W01, W02, E03, Z02, Z09, Z34, Z35 | criteria A, B and C |
| Committed `set7.cjs`, `set6.cjs`, `set4.cjs`, unmodified, my guard underneath | 36 of 36 rows reproduced, exit 0, no attempt reached my guard |
| Flake runs, guards, ledger verification | criteria G and F |

## Not verified

- `test:ui` in CI on this SHA (O3). Locally both Playwright specs pass, 150 of 150 over two repeated runs.
- `npm test` (vscode-test) locally. In CI it passed on this SHA.
- Behaviour with Linux or macOS fonts.
- The installed-host table and the real destination `https://statewright.ai/runs`. No request was made to the host.
- Reproduction of the set-3 and set-5 rows with the committed scripts in this check. #945 reproduced set 5, and the set-3 mutants' behaviour is covered by the auditors' definitions under E.
- Why the 13 carried survivors behave as they do in a real browser. I rely on the earlier audits' probes.

## State left behind

- `git status --short` in `C:\dev\mythologiq\FailSafe-653` shows only this report. HEAD is unchanged. No other report, the correction file, the evidence file and the installed-host files are untouched.
- I added one detached worktree and seven exports under `C:\Users\krkna\AppData\Local\Temp\a653i8-W1Iuq2`. I removed them after unlinking their `node_modules` junctions. The junction target was not touched.
- My scripts, logs and results remain in `C:\Users\krkna\AppData\Local\Temp\a653i8-W1Iuq2`:
  - scripts: `guard8.cjs`, `guard8b.cjs`, `globals-probe.cjs`, `probe-d2.cjs`, `probe-d3.cjs`, `run8.cjs`, `compare8.cjs`, `razor2.cjs`, `pw8.config.ts`;
  - results: `results-*.jsonl`, `probe-d2.json`, `probe-d4.jsonl`, `compare8.out`;
  - logs: `committed-set*.log`, `lane*.log`, `nopin*.log`, `flake-*.log`, `mocha5-*.log`, `guard-*.log`, `ledger.log`, `ci-failed.log`.
- I wrote nothing to the earlier reviewers' directories. I did not touch `C:\dev\mythologiq\FailSafe-653b` and killed no process I did not start.
- Playwright's disposable `failsafe-playwright-home-*` directories from my runs remain in the system temp folder.
- Nothing was committed, pushed or posted. No workflow was triggered or re-run.
