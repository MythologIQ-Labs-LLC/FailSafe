# Plan: Pre-merge ledger fork guard (FX932)

**iteration**: 5

**change_class**: feature

**doc_tier**: standard

**originating_remediation**: `.qor/gates/2026-08-23T1722-ledgerc/remediate.json` (proposal R3)

**terms_introduced**:
- term: Ledger fork
  home: `.failsafe/governance/RESEARCH_BRIEF_ledger-entry-allocation-concurrency-2026-08-23.md`
- term: Baseline residual
  home: `FailSafe/extension/scripts/check-ledger-fork.cjs`
- term: Field-recovery coverage
  home: `FailSafe/extension/scripts/check-ledger-fork.cjs`

**boundaries**:
- limitations: Detects structural forks only (duplicate entry numbers, unattested duplicate `previous_hash`). It does not verify chain arithmetic — the upstream qor-logic package's ledger_hash module (installed, outside this repo) owns that. It DOES own field extraction, because extraction is not math (iteration-1 B1).
- non_goals: Entry-number gaps. Gaps `[158, 298]` and upstream `KNOWN_ENTRY_GAPS {510, 532}` are WARN-level upstream and must not fail this guard.
- exclusions: No edit, monkey-patch, or vendoring of the upstream qor-logic ledger_hash module — it lives in the installed package, a different workspace. Upstream defects U1/U2/U3/U4 are surfaced in `.qor/gates/2026-08-23T1722-ledgerc/remediate.json`, not fixed here.

---

## Resolution of iteration-1 VETO findings

Audit report: `.agent/staging/AUDIT_REPORT.md`; verdict artifact `.qor/gates/2026-08-23T1722-ledgerc/audit-iter1.json`. Five blocking, four non-blocking.

| # | Finding | Resolved by |
|---|---|---|
| B1 | `**Previous Hash**` extraction dialect unspecified; baseline was an artifact of the parser | **LD2** locks the dialect; **LD3** makes field-recovery coverage an asserted quantity |
| B2 | LD5 named 15 of 16 groups while Phase 2 declared 16 | **LD7** — 16 measured, **15** enter the baseline, 1 cleared by attestation; Phase 2 says 15 |
| B3 | Falsifier triple not runnable — `--repo-root` resolves to `<root>/docs/META_LEDGER.md` | **LD8** adds `--file <path>` |
| B4 | Zero-inspected, count-4, and CLI-level partial attestation had no reachable check | **LD10** + three new declared fixtures |
| B5 | Fixture trim unspecified; `clean.md` had no inspected-count pin | **LD9** pins the trim boundary and the expected counts |
| N1 | LD6 cited a `test:citation-parity` CI pattern that does not exist | Claim removed; LD12 cites only the verified job name |
| N2 | LD9's evidence cited the discovery filter, not the exit-code lines | Evidence line corrected to the lines that carry the claim |
| N3 | FEATURE_INDEX token grepped FX929 for a plan registering FX932 | Token now greps `FX001`, a stable long-lived row rather than a semantically misleading sibling |
| N4 | "both dialects return 614" had no ongoing check | Declared test asserts dialect agreement on the live artifact |

### Iteration-2 VETO findings

| # | Finding | Resolved by |
|---|---|---|
| B6 | `UNCLASSIFIED_BASELINE` scope undeclared; one reading made `clean.md`/`repaired.md` exit non-zero against their declared 0 | **LD3 Scope** — live-mode pins vs fixture-mode empty requirement, stated explicitly |
| B7 | `empty.md` and `partial-attest.md` had no reason pin despite being the sole CLI falsifiers for LD10 and LD6 | Phase 2 pins all four failing fixtures; `partial-attest.md` construction fully specified |
| N5 | LD3 presented a tautological identity as the falsifier | Already corrected before the re-audit landed: identity demoted, four counts pinned independently, degraded-classifier test declared |
| N6 | `sentinel` pinned by count only; LD2 named one of three live surface forms | `SENTINEL_BASELINE` membership pin; all three forms enumerated (60 + 2 + 1) |
| N7 | The pinned-64 "falsifier" would exercise a copy, not the module | Test removed; the module-level full-hex-run assertion is the real falsifier |
| N8 | Inspected counts pinned but never stated | Stated: 7 / 9 / 9 / 11, derived from the LD9 boundary |
| N9 | "all derived from the real artifact" false for two fixtures | Reworded; the two synthetic fixtures are marked synthetic |

### Iteration-3 VETO findings

| # | Finding | Resolved by |
|---|---|---|
| B8 | Scope exempted only the two pins the review had named; `recovered`/`labels` left mode-ambiguous | **RULE S** — stated as a rule and enumerated exhaustively, not patched per cited pin. **RULE R** fixes `main` as accumulating, closing the B7 preemption contingency |
| N10 | The degraded-classifier test would have stubbed a copy — the shape N7 removed | `coverage(text, classifier = classifyPreviousHash)`; the stub now drives the module's own counting path |
| N11 | D4 and the SG-035 note still named the tautological identity as the mechanism | Both reworded to name the pins |
| N12 | D4 omitted the coverage pins, SENTINEL_BASELINE, reason pins and Scope | D4 rewritten to carry all of them |
| N13 | `forked.md`'s two `#597` bodies had no cited source; derived fixtures called "the real tail" | Sourced to the two PR branches; fixtures relabelled verbatim / tail-derived / synthetic |
| N14 | Resolution table said "table header"; the token greps `FX001` | Row corrected |

### Iteration-4 VETO findings

| # | Finding | Resolved by |
|---|---|---|
| B9 | `--repo-root` — the mode CI runs — had no productive test; RULE S's live-mode column and the coverage pins' *enforcement* were asserted and unfalsified | Two declared live-mode cases: a verbatim ledger copy exits 0; a one-sentinel-line mutation (`sentinel` 63->62, `recovered` 528->529) exits non-zero naming the failed pin. Present since iteration 2, when `--file` correctly moved fixture testing off `--repo-root` and left it uncovered |
| N15 | `classifyPreviousHash`'s return shape unspecified; the stub presumed a bare string while the value was needed for grouping | Shape stated as `{form, value}`; the stub returns the same shape |
| N16 | The pinned-64 removal justification went stale once the classifier became injectable | Removal kept, reason replaced with the one that still holds |
| N17 | D2 listed a bare `coverage`, contradicting Phase 1's injectable signature | D2 carries the parameter and the return shape as contract |
| N18 | RULE S's taxonomy sorted *quantities*, but mode-scoping follows the *assertion*: `inspected` fit two kinds, and the partition identity and dialect-agreement checks fit none — so the forward constraint could not be discharged, and a future `attestedGroupCount` would have reconstituted B8 | RULE S reworded to classify assertions by **where the expected value comes from** — live artifact / input under test / literal / relation. The missing symmetric live pin `inspected == 614` is now declared |

---

## Open Questions

**None blocking.**

---

## Why this exists

There is no post-merge remedy. `RECONCILED_ENTRIES_RE` is number-keyed, so the Entry #447 precedent — which cleared #397/#401, two entries with *distinct* numbers and a shared `previous_hash` — cannot disambiguate two entries both numbered #597. An attestation line can only say `#597`; it names both or neither. Detection must happen before merge or it cannot happen at all.

And the upstream gate does not detect it: `verify_post_anchor()` returns exit 0, `post-anchor clean`, on a ledger carrying two different Entry #597s, printing `OK Entry #597` twice.

---

## Locked Decisions

**LD1 — Heading dialect: fence-stripping.** The guard strips fenced code blocks before matching `### Entry #N:`, following `ledger_fragment._ENTRY_NUM_RE`, not `ledger_hash.ENTRY_RE`. Measured: both dialects return **614** headings and an identical duplicate set today, so the difference is currently zero; stripping forecloses a future phantom-duplicate class when an entry quotes a heading inside a fence. A declared test asserts the two dialects continue to agree on the live artifact (N4).

> `git show HEAD:FailSafe/extension/scripts/check-governance-canaries.cjs | grep -nE 'if \(inFence\) continue;' -> 43:    if (inFence) continue;`

**LD2 — `**Previous Hash**` extraction dialect is locked explicitly, and the hex run is NOT pinned to 64.** Iteration 1 assumed one form and left the length implicit. Measured on the live artifact, 595 label lines span three forms:

| form | count |
|---|---|
| backtick-wrapped — ``**Previous Hash**: `<hexrun>` `` | 272 |
| inline bare — `**Previous Hash**: <hexrun>` | 256 |
| sentinel — three surface forms, see LD3 | 63 |
| unclassified — non-hex, see LD3 | 4 |

Inline run lengths are `{2:1, 4:1, 6:1, 8:1, 62:1, 63:6, 64:225, 65:3, 66:19, 67:2}`. **Pinning the run to exactly 64 collapses all 16 duplicate groups to 0** — both above-cutoff groups are 66-hex (`[248,258]`, `[259,262]`), and `[259,262]` spans two forms (#259 inline, #262 backtick). The guard therefore matches the *full* hex run at whatever length it occurs, and treats the sentinel set as a named non-hash class rather than a parse failure.

**LD3 — Field-recovery coverage is pinned per bucket. The partition identity is NOT the falsifier.**

The guard reports four counts, measured on the live artifact:

```
labels = 595    recovered = 528    sentinel = 63    unclassified = 4
```

**The identity `labels == recovered + sentinel + unclassified` is a tautology and proves nothing.** Whenever the classifier assigns every label line to exactly one bucket, it holds by construction. Verified by running a deliberately degraded classifier that returns `sentinel` for every line: it reports `{labels:595, recovered:0, sentinel:595, unclassified:0}` and **satisfies the identity**. Stating it as the falsifier would be the exact defect this cycle remediates — a check asserted to prove something it cannot fail. It is retained only as a cheap internal-consistency check on the classifier's totality.

**The falsifier is the four pinned counts**, each asserted independently:

```
recovered    == 528
sentinel     == 63
unclassified == {122, 123, 124, 125}   (set, not count)
labels       == 595
```

The degraded classifier above dies on `recovered == 528` and `sentinel == 63`. A parser recognising only 496 of 595 fields dies on `recovered`. A parser that silently widens the sentinel pattern to absorb unknowns dies on `sentinel`. Without these pins, iteration 1's `PREV_HASH_BASELINE` was a snapshot of the guard's own output, and `live == baseline` would have gone green on any parser however bad — the circular-baseline defect (ledger #595).

**Scope — which pins apply to which input (closes B6).** `UNCLASSIFIED_BASELINE` and `SENTINEL_BASELINE` are derived from the live artifact and can never hold on a fixture tail. Iteration 2 left this undeclared, which made `main` exit non-zero on `clean.md` under one reading while the plan declared exit 0. Resolved explicitly:

**RULE S — every assertion whose expected value is derived from the live artifact is live-mode only.** Iterations 2 and 3 each scoped the pins that a review had named and left the unnamed ones ambiguous. Stating the rule and enumerating exhaustively against it is what stops the next unnamed instance. Seven quantities carry assertions, and there are no others:

| quantity | assertions attached | `--repo-root` | `--file` |
|---|---|---|---|
| `labels` | live pin `== 595` | asserted | not run |
| `recovered` | live pin `== 528` | asserted | not run |
| `sentinel` | live pin `== SENTINEL_BASELINE` (63) | asserted | not run |
| `unclassified` | live pin `== UNCLASSIFIED_BASELINE` | asserted | replaced by `unclassified` **empty** |
| `DUPLICATE_NUMBER_BASELINE` | subtraction baseline **and** a live equality pin (LD5) | subtracted; equality pin asserted | subtracted; equality pin not run |
| `PREV_HASH_BASELINE` | subtraction baseline **and** a live equality pin (LD5) | subtracted; equality pin asserted | subtracted; equality pin not run |
| `inspected` | live pin `== 614` **and** fixture pins 7 / 9 / 9 / 11 | `== 614` asserted; zero-floor applies | `== 614` not run; fixture pin asserted; zero-floor applies |

`inspected` is listed because RULE S is a completeness claim and `main` reports it: omitting it would leave exactly the kind of unnamed quantity this rule exists to prevent.

**RULE S classifies assertions, not quantities.** An earlier draft of this rule sorted *quantities* into kinds, and that taxonomy was ill-formed: `inspected` is a per-input measurement **and** carries pinned expected values (7 / 9 / 9 / 11), so it fit two kinds at once — while `labels` on a fixture is equally "whatever the input holds", so the stated justification did not distinguish them either. The thing that actually determines mode-scoping is not the quantity, it is **where the assertion's expected value came from**:

- **Expected value derived from the live artifact** -> the assertion is **live-mode only**. Today: `labels == 595`, `recovered == 528`, `sentinel == SENTINEL_BASELINE`, `unclassified == UNCLASSIFIED_BASELINE`, and `inspected == 614`.
- **Expected value derived from the input under test** -> the assertion runs **in that input's mode**. Today: the fixture pins `inspected` 7 / 9 / 9 / 11, each fixture's expected exit code, and all four reason pins (`597`/`2`, `204`/`4`, `inspected 0`, `9001`/`9002`).
- **Literal, derived from nothing** -> runs in **both** modes. Today: LD10's `inspected == 0` floor, and the exit-2 usage errors.
- **Relations between two computations**, rather than a value compared to an expectation, are outside the scope of mode carve-outs entirely and run wherever both sides are available. Today: the partition identity (a relation between buckets) and the dialect-agreement check (a relation between two parsers).
- **Literals that hold in only one mode** are scoped to that mode and named explicitly. Today: `unclassified` **empty**, which is a literal (`{}`, derived from nothing) yet must NOT run in live mode, where `unclassified` is legitimately `{122,123,124,125}`. A literal is not automatically both-modes; this is the one class the plain three-way split could not express.

Under this phrasing `inspected` stops being anomalous — its zero-floor is a literal running everywhere, its 7 / 9 / 9 / 11 pins are input-derived and run in fixture mode, and its `== 614` pin is live-derived and runs only under `--repo-root`. Nothing fits two classes and nothing fits none. The classes are five, not four: the fifth exists because `unclassified` empty is a literal that is nonetheless mode-restricted, which the other four cannot express.

**Forward constraint.** Any future assertion added to `main` must be classified by *where its expected value comes from* — live artifact, input under test, literal, or relation — before it ships. Classifying the quantity instead is what let B8 through: a future `attestedGroupCount` is a per-input measurement *and* has a live value worth pinning (exactly one `**Reconciled Entries**` line exists), and under the quantity taxonomy either answer was defensible, with the wrong one leaving a live-derived pin running in fixture mode — B8 reconstituted by the rule written to prevent it.

In fixture mode the **only** coverage condition is `unclassified` empty; an unclassified line in a fixture is an authoring error. A 7-entry fixture cannot report 528 recovered or 595 labels, which is exactly why all four — not the two that happened to be cited in review — must be carved out.

**RULE R — every declared non-zero exit pins its reason, and `main` accumulates rather than fails fast.** All violations are collected and printed before a single exit, so no pinned reason can be preempted by an unrelated one firing first. Without accumulation, a reason pin proves nothing about *why* the guard failed.

`SENTINEL_BASELINE` is a membership set, not a bare count, so a parser cannot absorb unknowns into the sentinel bucket and stay green (N6). Its three live surface forms, measured:

| sentinel form | count |
|---|---|
| backticked — ``` `pending-runtime-tooling` ``` | 60 |
| bare, un-backticked — `pending-runtime-tooling` (entries #322, #323) | 2 |
| `GENESIS (no predecessor)` | 1 |
| **total** | **63** |

A classifier requiring backticks recovers 60 and fails the pin. Iteration 2's LD2 named only the backticked form and would have specified exactly that bug.

`UNCLASSIFIED_BASELINE = {122, 123, 124, 125}` — four consecutive pre-anchor entries whose `previous_hash` is not hexadecimal at all, e.g. Entry #122 carries `f1g2h3i4j5k6l7m8n9o0p1q2r3s4t5u6v7w8x9y0z1a2b3c4d5e6f7g8h9i0j1k2` (letters through `z`). Enumerated, not tolerated by a rule; a fifth such entry is a new finding. Surfaced upstream as U4 — `is_placeholder_pattern` cannot evaluate a non-hex value, so these sit outside its reach.

**LD4 — Number baseline keyed on exact counts.** `DUPLICATE_NUMBER_BASELINE` is `{number: exact_count}`. A bare set would let a *third* `### Entry #204:` land silently because 204 is "already allowed"; keyed on count, the third occurrence is a new finding. Measured: `{113:2, 204:3, 205:3, 218:2, 222:2, 223:2, 224:2, 225:2, 226:2, 227:2, 228:2, 229:2, 230:2, 232:2, 233:2, 234:2, 235:2, 236:2}` — 18 numbers, 20 surplus entries.

**LD5 — Both baselines are asserted EQUAL to live, against the real artifact.** A declared test derives the violation sets from the real `docs/META_LEDGER.md` — never a fixture — and asserts equality with the constants. Adding `597: 2` to silence a new collision makes live differ from baseline and the assertion names the surplus key. The coordinated-edit escape (change artifact and constant together) is disclosed, not claimed away: it is deliberate friction, not a wall. An ordinary Entry #597 append adds no duplicate number and a unique `previous_hash`, so neither derived set changes and the assertion does not spuriously fail.

**LD6 — Attestation clears a group before baseline comparison.** A group is cleared only when a RECONCILIATION entry names **all** its members on a `**Reconciled Entries**:` line. Exactly one such line exists in the entire artifact, naming `#397, #401`. Partial naming does not clear.

> `git show HEAD:docs/META_LEDGER.md | grep -nE '^\*\*Reconciled Entries\*\*' -> 24264:**Reconciled Entries**: #397, #401`

Clearing before comparison means a later legitimate attestation shrinks live, trips LD5, and forces a deliberate baseline update.

**LD7 — 16 groups measured; 15 enter the baseline; 1 is cleared by attestation.** Iteration 1 claimed all 16 entered and named 15. Corrected:

- *Placeholder-era pre-anchor* (10) — `[10,32,42] [13,75] [14,43,330] [16,26,44] [17,27] [18,28,40] [22,25,80] [23,78,84] [33,77] [79,228]`.
- *Self-duplicated legacy numbers* (3) — `[113,113] [204,204,204] [205,205]`.
- *Above-cutoff and unattested* (2) — `[248,258]` and `[259,262]`, both 66-hex. These are why "attestation OR entry ≤ 207" is the wrong rule: both sit above the 207 cutoff with no attestation, so that rule alone reddens `main` on day one.
- *Attested, therefore NOT in the baseline* (1) — `[397,401]`, cleared by Entry #447 per LD6.

`PREV_HASH_BASELINE` holds **15** groups.

**LD8 — Two input modes: `--repo-root <dir>` and `--file <path>`.** Iteration 1 declared only `--repo-root` while asserting three exit codes from three sibling fixture files — unrunnable, because the cited sibling resolves `path.resolve(args.repoRoot, 'docs/META_LEDGER.md')`. `--repo-root` keeps the CI shape; `--file` addresses a fixture directly. Exactly one of the two is required; supplying both or neither exits 2.

> `git show HEAD:FailSafe/extension/scripts/check-governance-canaries.cjs | grep -nE "argv\[i\] === '--repo-root'" -> 13:    if (argv[i] === '--repo-root') out.repoRoot = argv[++i];`

**LD9 — The fixture trim is specified, and every passing fixture pins its inspected count.** Fixtures are the contiguous tail of the real artifact from the `### Entry #590:` heading to end of file, verbatim — a stated boundary, not "a trimmed excerpt". That tail contains no baseline member (the lowest baseline number is #113), so live-minus-baseline is well defined on it. Each passing fixture asserts an exact expected `inspected` count, so a parser recognising 2 of N entries fails instead of passing green.

**LD10 — Zero inspected is a failure, and an empty fixture reaches it.** The guard exits non-zero when `inspected == 0`. A declared `empty.md` fixture drives `main` to that state through the CLI; the pure-function case alone was iteration 1's unreachable half. A checker that recognises nothing must not be indistinguishable from one that found nothing wrong.

> `git show HEAD:FailSafe/extension/scripts/run-node-tests.cjs | grep -nE 'no .test.cjs suites found' -> 21:  console.log("[test:node] no .test.cjs suites found — nothing to run.");`

That sibling exits 0 in exactly this situation — the shape this guard must not copy.

**LD11 — No ledger entry is allocated by this cycle.** Allocating `#598` now would presume PR #432 merges first; if the operator resequences, `#598` is wrong and this cycle would author into a contested band, reproducing the defect it exists to prevent. Held until #432 merges. Gate artifacts under `.qor/gates/` are JSON, not ledger entries, so nothing is blocked.

**LD12 — R4 (Entry ID enforcement) is DEFERRED, not dropped.** The `qor-substantiate` skill's Phase-76 wiring section requires an `**Entry ID**` line on each new SESSION SEAL entry; entries #585–#596 carry zero, while Entry #447 carries one (`ebf5fc119e7f`) — a lapsed mitigation. Different failure mode from a fork, and its forward-only cutoff depends on which entry becomes the boundary, which depends on PR #432. Follow-up with its own FX id; remediation R4 stays `advisory_pending_enforcer`.

---

## Phase 1: Detector module + falsifier fixtures

### Unit Tests

| Test | Op | Verification command + result | Token |
|---|---|---|---|
| `FailSafe/extension/src/test/scripts/checkLedgerFork.test.cjs` | NEW | `ls FailSafe/extension/src/test/scripts/checkLedgerFork.test.cjs` -> no such file | NEW-VERIFIED |

Behaviours asserted (written red before green):

- `findDuplicateNumbers` on text sharing `#597` returns `{597: 2}`; on distinct numbers returns `{}`.
- `findDuplicateNumbers` ignores a `### Entry #999:` heading inside a fenced block and counts one outside it (LD1).
- `classifyPreviousHash(line)` returns `{form, value}` — `form` one of `backtick` / `inline` / `sentinel` / `unclassified`, `value` the **full** hex run for the two hash forms and `null` for the other two. Asserted for one line of each measured form, and for a 66-character value it returns the whole 66 characters, not a 64-character prefix (LD2, the assertion that fails under a pinned-64 parser).
- `coverage(text, classifier)` on the real artifact, called with the default `classifyPreviousHash`, returns `{labels: 595, recovered: 528, sentinel: 63, unclassified: 4}` — each of the four pinned independently (LD3).
- **The degraded-classifier test, injected into the real `coverage`**: `coverage(realText, () => ({ form: "sentinel", value: null }))` — the stub returns the same `{form, value}` shape the real classifier does, so `coverage` buckets it exactly as it buckets a genuine sentinel — returns `{595, 0, 595, 0}` — satisfying the partition identity while failing `recovered === 528` and `sentinel === 63`. Because `coverage` takes the classifier as its second parameter (defaulting to `classifyPreviousHash`), the stub drives the module's own counting path rather than a copy of it, which is what made iteration 3's version worthless. A `coverage` that silently dropped label lines also fails here, since `labels` is counted independently of the classifier's return.
- `coverage` on a text whose `**Previous Hash**` lines are all 66-hex reports `unclassified: 0` under the locked dialect. (Iteration 2 also declared a "pinned-64 variant of the classifier" test; it stays REMOVED, but the original reason no longer holds — now that `coverage` takes an injectable classifier, a pinned-64 variant *could* be injected exactly as the sentinel stub is. It is removed on the correct ground instead: injecting a pinned-64 classifier into `coverage` would exercise `coverage`'s counting, not `classifyPreviousHash`'s correctness, and the falsifier for that already lives in the full-hex-run assertion above, applied to the real classifier.)
- `groupByPreviousHash` returns member entry numbers for a shared value, omits singletons, and groups `#259` (inline) with `#262` (backtick) — one group across two forms.
- `attestedGroups` clears `[397,401]` given `**Reconciled Entries**: #397, #401`, and does **not** clear it when the line names only `#397`.
- `inspect` returns `inspected: 0` for empty input.

### Affected Files

| Path | Op | Verification command + result | Token |
|---|---|---|---|
| `FailSafe/extension/scripts/check-ledger-fork.cjs` | NEW | `ls FailSafe/extension/scripts/check-ledger-fork.cjs` -> no such file | NEW-VERIFIED |
| `FailSafe/extension/src/test/fixtures/ledger-fork/clean.md` | NEW | `ls FailSafe/extension/src/test/fixtures/ledger-fork/clean.md` -> no such file | NEW-VERIFIED |
| `FailSafe/extension/src/test/fixtures/ledger-fork/forked.md` | NEW | `ls FailSafe/extension/src/test/fixtures/ledger-fork/forked.md` -> no such file | NEW-VERIFIED |
| `FailSafe/extension/src/test/fixtures/ledger-fork/repaired.md` | NEW | `ls FailSafe/extension/src/test/fixtures/ledger-fork/repaired.md` -> no such file | NEW-VERIFIED |
| `FailSafe/extension/src/test/fixtures/ledger-fork/empty.md` | NEW | `ls FailSafe/extension/src/test/fixtures/ledger-fork/empty.md` -> no such file | NEW-VERIFIED |
| `FailSafe/extension/src/test/fixtures/ledger-fork/dup204x4.md` | NEW | `ls FailSafe/extension/src/test/fixtures/ledger-fork/dup204x4.md` -> no such file | NEW-VERIFIED |
| `FailSafe/extension/src/test/fixtures/ledger-fork/partial-attest.md` | NEW | `ls FailSafe/extension/src/test/fixtures/ledger-fork/partial-attest.md` -> no such file | NEW-VERIFIED |

`check-ledger-fork.cjs` exports `stripFences`, `classifyPreviousHash`, `coverage(text, classifier = classifyPreviousHash)`, `findDuplicateNumbers`, `groupByPreviousHash`, `attestedGroups`, `inspect`, `main`, so the test requires the script directly per the `metaLedgerRepair.test.cjs` precedent.

> `git show HEAD:FailSafe/extension/src/test/scripts/metaLedgerRepair.test.cjs | grep -nE 'require\("node:test"\)' -> 3:const test = require("node:test");`

Fixture contents. `clean.md` is the real tail **verbatim** per LD9; `forked.md`, `repaired.md` and `dup204x4.md` are **tail-derived** (the tail plus appended bodies or headings); `empty.md` and `partial-attest.md` are **synthetic** by necessity.

- `clean.md` — the tail verbatim. Guard passes; test pins the exact inspected count.
- `forked.md` — **tail-derived.** The tail plus both competing `#597` bodies, taken from the two open PR branches that produced the collision: `origin/fix/233-read-ledger-once` and `origin/fix/430-qorlogic-stale-install-upgrade`, which carry one `### Entry #597:` each (`main` carries none). Guard fails naming `597` and count `2`. This is the artifact upstream's `verify_post_anchor()` calls `post-anchor clean`.
- `repaired.md` — the tail with `#597`/`#598` remediated. Guard passes; inspected count pinned.
- `empty.md` — no entries (LD10).
- `dup204x4.md` — the tail plus four `### Entry #204:` headings, exceeding the baseline count of 3 (LD4's falsifier).
- `partial-attest.md` — **synthetic.** Entries `#9001` and `#9002` (deliberately outside every baseline, so the group cannot be baseline-cleared) sharing `previous_hash` `7f3a9b2e5d8c…2a5f` (64 hex; absent from the artifact, and verified NOT to match upstream's `is_placeholder_pattern`, so the fixture cannot be mistaken for fabricated hex), plus a RECONCILIATION entry whose `**Reconciled Entries**:` line names only `#9001`. LD6's only CLI-level falsifier.

---

## Phase 2: Baselines, CLI, and the anti-widening assertion

### Unit Tests

| Test | Op | Verification command + result | Token |
|---|---|---|---|
| `FailSafe/extension/src/test/scripts/checkLedgerFork.test.cjs` | NEW | `ls FailSafe/extension/src/test/scripts/checkLedgerFork.test.cjs` -> no such file | NEW-VERIFIED |

Behaviours asserted (extending the Phase 1 suite, red before green):

- **Falsifier set**, each via `main(['--file', <fixture>])` (LD8): `clean.md` exits 0, `forked.md` non-zero, `repaired.md` exits 0, `empty.md` non-zero, `dup204x4.md` non-zero, `partial-attest.md` non-zero.
- **Every failing fixture pins its reason**, so none can fail for an unrelated cause (closes B7): `forked.md` names `597` and count `2`; `dup204x4.md` names `204` and count `4`; `empty.md` names `inspected 0`; `partial-attest.md` names `9001`/`9002` and reports the attestation as incomplete. Iteration 2 pinned only the first two, leaving the sole CLI-level falsifiers for LD6 and LD10 able to pass green while broken.
- Inspected counts are pinned to stated numbers, not to whatever the guard emits (closes N8): `clean.md` **7**, `repaired.md` **9**, `forked.md` **9**, `dup204x4.md` **11**. Derived externally from the LD9 boundary (`### Entry #590:` through EOF is 7 headings), not from a guard run.
- **Anti-widening**: the duplicate-number set and the 15-group `previous_hash` set derived from the real `docs/META_LEDGER.md` **equal** `DUPLICATE_NUMBER_BASELINE` and `PREV_HASH_BASELINE` (LD5).
- **Coverage pins** hold on the real artifact: `recovered === 528`, `sentinel === 63`, `labels === 595`, and `unclassified` equals `UNCLASSIFIED_BASELINE` `{122,123,124,125}` as a set (LD3).
- Both heading dialects agree on the live artifact's entry count (N4).
- `main` with both `--repo-root` and `--file`, and with neither, exits 2 (LD8).
- **Live-mode path, exercised end-to-end (closes B9).** `--repo-root` is the mode CI runs (`npm run governance:ledger-fork`), and until now no declared test invoked it productively — only the usage-error case above, which exits before doing any work. Two cases:
  - `main(['--repo-root', <tmp containing a verbatim copy of docs/META_LEDGER.md at docs/META_LEDGER.md>])` **exits 0** and asserts `inspected == 614` — the live pin symmetric to the four coverage pins, whose absence was the symptom that exposed the quantity-taxonomy defect (N18). The sibling precedent resolves `path.resolve(repoRoot, 'docs/META_LEDGER.md')`, so a temp directory with that one file is a valid repo root.
  - **The falsifier RULE S's live column previously lacked**: the same copy with **one** sentinel line mutated — a single `` `pending-runtime-tooling` `` value replaced by `7f3a9b2e5d8c1a4f6b0e3d7c2a5f8b1e4d6c9a3f7b2e5d8c1a4f6b0e3d7c2a5f`, the same value `partial-attest.md` uses: 64 hex, verified absent from the artifact, and `is_placeholder_pattern` False across all five heuristics, so the mutation cannot raise an incidental prev-hash group violation (closes N20) — shifts `sentinel` 63 -> 62 and `recovered` 528 -> 529. `main(['--repo-root', <that dir>])` **exits non-zero and names the coverage pin that failed**. This is the assertion that an implementation which computes the four coverage counts but never wires them into the exit code cannot pass.

  Without these two, every coverage pin was verified only as a value returned by `coverage()`, never as something that gates an exit code, and the entire apparatus built across iterations 2-4 to fix B1's circularity was asserted to work and checked nowhere.

### Affected Files

| Path | Op | Verification command + result | Token |
|---|---|---|---|
| `FailSafe/extension/package.json` | MODIFIED | `grep "test:node" FailSafe/extension/package.json` -> match | MODIFIED-VERIFIED |
| `.github/workflows/repo-standards-enforcement.yml` | MODIFIED | `grep "standards:" .github/workflows/repo-standards-enforcement.yml` -> match | MODIFIED-VERIFIED |
| `docs/FEATURE_INDEX.md` | MODIFIED | `grep "FX001" docs/FEATURE_INDEX.md` -> match | MODIFIED-VERIFIED |

`check-ledger-fork.cjs` is created in Phase 1 and extended here with `DUPLICATE_NUMBER_BASELINE` (18 keys), `PREV_HASH_BASELINE` (15 groups), `UNCLASSIFIED_BASELINE` (4 entries, live mode only), `SENTINEL_BASELINE` (63 across 3 forms, live mode only), and `main`'s reporting shape: prints `inspected N entries` plus the four coverage counts, exits 1 listing violations beyond baseline, 0 otherwise, 2 on usage error.

`package.json` gains `"governance:ledger-fork": "node ./scripts/check-ledger-fork.cjs --repo-root ../.."`.

> `git show HEAD:FailSafe/extension/package.json | grep -nE '"test:node"' -> 751:    "test:node": "node ./scripts/run-node-tests.cjs",`

`repo-standards-enforcement.yml` gains a `Ledger fork guard` step in the `standards` job — verified to exist as a job; no claim is made about which other npm scripts that job runs.

> `git show HEAD:.github/workflows/repo-standards-enforcement.yml | grep -nE '^  standards:' -> 25:  standards:`

`docs/FEATURE_INDEX.md` registers `FX932`.

### Changes

Baselines are frozen data, not logic. `main` computes coverage, applies the mode-scoped pins per LD3, computes live violations, subtracts the number and `previous_hash` baselines, prints all counts, and exits 0 / 1 / 2.

---

## Feature Inventory Touches

| entry_id | operation | test_path | test_descriptor |
|---|---|---|---|
| FX932 | NEW | `FailSafe/extension/src/test/scripts/checkLedgerFork.test.cjs` | `check-ledger-fork --file <path>` exits non-zero on a ledger containing two different `### Entry #597:` headings and exits 0 on the same ledger with one renumbered to `#598` |

Survives the SG-035 question: if `findDuplicateNumbers` silently returned `{}`, the `forked.md` case would exit 0 and the assertion fails. If the `previous_hash` parser silently degraded, the coverage **pins** fail — the identity would not, being a tautology (LD3).

---

## Definition of Done

### Deliverable: pre-merge ledger fork guard (FX932)

- **D1**: A PR introducing a duplicate `### Entry #N:` heading, or an unattested duplicate `**Previous Hash**` beyond the enumerated baseline, fails CI before merge — the only point at which a remedy exists.
- **D2**: `FailSafe/extension/scripts/check-ledger-fork.cjs` exporting `stripFences`, `classifyPreviousHash(line) -> {form, value}`, `coverage(text, classifier = classifyPreviousHash)`, `findDuplicateNumbers`, `groupByPreviousHash`, `attestedGroups`, `inspect`, `main`; `main(argv) -> 0 | 1 | 2`; accepts exactly one of `--repo-root` / `--file`. The `coverage` parameter and the `classifyPreviousHash` return shape are part of the export contract, not incidental — a single-argument `coverage` or a bare-string classifier breaks the injected degraded-classifier test.
- **D3**: `FX932` in `docs/FEATURE_INDEX.md`; `Ledger fork guard` step in the `standards` job; ledger entry **held** per LD11; remediation R3's `closure_enforcer` becomes this test path.
- **D4**: `checkLedgerFork.test.cjs` — all six fixtures produce their declared exit codes via `--file`; **all four** failing fixtures pin their reason per RULE R (`597`/`2`, `204`/`4`, `inspected 0`, `9001`/`9002` incomplete attestation); inspected counts pinned at `clean` 7, `repaired` 9, `forked` 9, `dup204x4` 11; the **four coverage pins** (`labels` 595, `recovered` 528, `sentinel == SENTINEL_BASELINE`, `unclassified == UNCLASSIFIED_BASELINE`) and both baseline-equality assertions hold against the real `docs/META_LEDGER.md`; the injected degraded-classifier case fails `recovered`/`sentinel` while satisfying the identity; RULE S mode-scoping is demonstrated in BOTH columns — `clean.md` exits 0 under `--file` (pins do not run), and under `--repo-root` a verbatim ledger copy exits 0 while a one-sentinel-line mutation exits non-zero naming the failed pin (pins do run and gate the exit code).

### Deliverable: Entry ID enforcement (R4)

- **D4.d**: Waived per LD12 — different failure mode, and its forward-only cutoff depends on PR #432's merge. **Follow-up phase**: separate cycle with its own FX id, after #432 merges.

---

## CI Commands

- `npm run governance:ledger-fork` — the guard against the live artifact; exits 0 on a clean ledger, 1 on a fork.
- `npm run test:node` — runs `checkLedgerFork.test.cjs` (auto-discovered).
- `npm run lint` — matches the `standards` job's lint step.
- `npm run test:all` — full suite, matching the `Full Test Suite (test:all)` PR gate.
