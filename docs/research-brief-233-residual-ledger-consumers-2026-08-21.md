# Research Brief — #233 residual META_LEDGER consumers

**Date**: 2026-08-21
**Analyst**: The Qor-logic Analyst
**Target**: The remaining raw `docs/META_LEDGER.md` consumers in `FailSafe/extension/src`, as candidates for migration onto the versioned consumer adapter (`readMetaLedgerArtifact`)
**Scope**: Per-site read/parse behavior, current silent-degrade posture, and whether the adapter's `ok | unavailable | malformed | unsupported | stale` ladder maps cleanly
**Prior art (both merged 2026-08-21)**: PR #405 (`TrackerRoute.projectGovernanceManifest`, `substrate-command` seal auto-hook), PR #407 (`governance-sidecar`, shared `classifyRead` ladder), and earlier PR #328 (console routes)

---

## Executive Summary

**The framing that opened this cycle was wrong, and the correction is the main finding.** The premise — "five raw consumers remain; migrate each onto the adapter" — does not survive contact with the source. Of the five named sites, **two are not consumers at all**, **one must not be migrated** (a deliberate bounded read that the adapter would regress 60×), and **one is shape-mismatched**. Only **one** is a clean migration candidate, and even it carries a user-visible behavioral change.

Meanwhile the investigation surfaced a **larger, measured defect that was not on the list at all**: a single `WorkspaceArtifactBuilder.build()` reads and parses the 1.75 MB ledger **five times** — 8.7 MB of I/O, ~477 ms cold / ~120 ms warm — and **two of those five reads are calls to the adapter itself**. This runs on `buildHubSnapshot()`, which sits on the `CommitCheckRoute` enforce-mode blocking path, with no caching.

The correct next slice is **de-duplication of ledger reads**, not adapter migration. Adapter migration is now mostly *done*; the residual is that nothing shares the result.

---

## Findings

### F1 — `GovernancePhaseTracker.ts` is not a consumer (NOT A CANDIDATE)

- **Location**: `src/roadmap/services/GovernancePhaseTracker.ts`
- **Verified**: the file has **zero imports** — no `fs`, no `path`, no I/O of any kind. `grep -nE "^import|require\(|fs\.|readFileSync|existsSync"` returns nothing.
- Its exports (`parseMetaLedger(content)`, `buildGovernanceState(content)`, `getCurrentPhase`, `getActiveAlerts`) are **pure functions over text**.
- Sole production caller: `ConsoleServerHub.ts:83`.
- The only mention of `META_LEDGER.md` is a doc comment at line 4.

**Conclusion**: it appeared in the candidate list purely because of a comment string. It is already the correct shape — a pure text seam. **Nothing to migrate.**

### F2 — `ConsoleLifecycleService.ts:98` is watch/path-only (NOT A CANDIDATE)

- **Location**: `src/roadmap/services/ConsoleLifecycleService.ts:97-120` (`watchMetaLedger`)
- Behavior: `existsSync(ledgerPath)` → register a 1500 ms-debounced watcher (`WorkspaceMutationBus` when wired, `fs.watch` fallback) → `broadcastLedgerChange()`.
- **It never reads or parses the file.** The path is a watch target.

**Conclusion**: routing this through the adapter would mean a full 1.75 MB read + parse *just to decide whether to install a watcher*. Actively harmful. **Not a candidate.**

### F3 — `ConsoleServerHub.ts:79` is a deliberate bounded read (MUST NOT MIGRATE AS-IS)

- **Location**: `src/roadmap/ConsoleServerHub.ts:65-95` (`readLedgerTail`, `buildGovernancePhase`)
- Behavior: reads only the **last 4096 bytes** via `openSync`/`readSync`, and carries an explicit `complete: boolean`. When the read was a partial tail, it **deletes `state.evidenceState`** — because a tail slice can land between two entries and look empty without the file being corrupt (comment at `:57-62`).
- **Measured**: bounded tail = **0.4 ms/call**; full `readMetaLedgerArtifact` = **24.0 ms/call**. The bound is **60× cheaper** and is load-bearing.

Two independent blockers to naive migration:

1. **Performance.** `readMetaLedgerArtifact` reads and parses the whole file. On the hub path this is a 60× regression — squarely against #244's large-repository objective.
2. **Semantics.** `classifyMetaLedgerText` (added by #407) classifies *non-empty-text-that-parses-to-zero-entries* as `malformed`. That is **exactly** the false-positive the `complete` flag exists to suppress. Applying the adapter ladder to a tail slice would reintroduce the bug the current code deliberately guards.

**Conclusion**: this site needs a *bounded-read-aware* adapter seam (a tail variant that can express "parsed empty, but the read was partial, so this is not evidence of corruption"), or explicit documented exclusion. It is **not** a like-for-like migration.

### F4 — `SystemStateReader.ts:41` is shape-mismatched (WEAK CANDIDATE)

- **Location**: `src/roadmap/services/SystemStateReader.ts:41-48` (`readChainStatusFromLedger`)
- Behavior: reads the ledger **only** to run one regex, `CHAIN_STATUS_RE = /^##\s+Chain\s+Status:\s+(.+?)\s*$/m`. It does not parse entries.
- Silent-degrade: absent → `null`; unreadable → `null` (via `readSafe`'s bare `catch`). Genuinely indistinguishable — this *is* a real #233-class silent degrade.
- **Mismatch**: the adapter returns `ArtifactEnvelope<MetaLedgerEntry[]>` — parsed *entries*. `## Chain Status:` is a **document-level header**, not an entry field, and is not represented anywhere in `MetaLedgerEntry` (`{n, title, phase, version?, tag?, date?, decision?, chainHash?, verdict?, riskGrade?}`).

**Conclusion**: migrating requires either extending the envelope with document-level metadata, or exposing a classified *raw-text* accessor. Fixing the silent degrade here is worthwhile but is **not** a drop-in.

### F5 — `MetaLedgerReader.ts` is the one clean candidate, with a behavioral catch

- **Location**: `src/roadmap/services/MetaLedgerReader.ts:69-77` (`parseEntries`), path at `:90`
- Behavior: full `readFileSync` + **its own** regex parser. Silent-degrade: absent → `[]`, read throw → `[]` (both cached).
- **The catch — two different classification axes:**

| | canonical `MetaLedgerEntry` (adapter) | `LedgerEntry` (MetaLedgerReader) |
|---|---|---|
| shape | `{n, title, phase, …}` | `{number, kind, title, rawHeading}` |
| classifier | the `**Phase**:` **field** | **keyword scan of the heading text** |
| vocabulary | `GATE`, `SUBSTANTIATE`, `DELIVER`, … | `GATE TRIBUNAL`, `SUBSTANTIATION`, `SESSION SEAL`, `DELIVER`, … |

These disagree on real data. Entry #590's heading is `GATE - PR … batch merge substantiation`; its `**Phase**` is `GATE`. `MetaLedgerReader` scans for the literal `"GATE TRIBUNAL"`, does not match, and classifies it `OTHER`. Entry #589 is the mirror case: heading says `SUBSTANTIATE`, `**Phase**` says `GATE`.

`summarize()` derives `sessionsCompleted`, `plansStarted`, and `sessionsInFlight` from `kind`. Swapping the parser **changes user-visible Console metrics**.

**Conclusion**: a genuine candidate, but it is a **behavior change requiring a decision on which taxonomy is correct**, not a refactor. That decision belongs in `/qor-plan`, and the two taxonomies disagreeing is arguably its own defect.

### F6 — MEASURED: five full ledger reads per `build()`, two of them the adapter (NOT ON THE LIST)

Instrumented `fs.readFileSync`/`statSync`/`openSync` and ran the real `WorkspaceArtifactBuilder.build()` against this repo:

```
full readFileSync(META_LEDGER): 5
total bytes read:               8,715,735
wall time:                      477ms   (cold; ~120ms warm at 24.0ms/read)
ledger size:                    1,751,562 bytes
```

Attributed by stack:

| # | Call site |
|---|---|
| 1 | `readMetaLedgerArtifact` ← `WorkspaceArtifactBuilder.build` (`:79`, the adapter gate) |
| 2 | `WorkspaceArtifactBuilder.readGovernanceState` (`:103-110`, **raw** `fs.readFileSync` + `parseMetaLedger`) |
| 3 | `MetaLedgerReader.parseEntries` ← `summarize` (F5) |
| 4 | `SystemStateReader.readChainStatusFromLedger` ← `readSafe` (F4) |
| 5 | `readMetaLedgerArtifact` ← `buildConsumerDiagnostics` (`diagnostics.ts:40`) |

Three things this makes plain:

- **Read #2 is a raw consumer that was not on the candidate list.** The enumeration that opened this cycle was not merely over-inclusive — it also **missed a real site**, inside the very file that performs the adapter gating.
- **Reads #1 and #5 are both the adapter.** The gate result is computed, used for a boolean, and thrown away; `buildConsumerDiagnostics` then recomputes it. Adapter adoption did not reduce I/O — **it added a read.**
- **No caching.** `HubSnapshotService.buildHubSnapshot()` (`:191`) constructs a fresh `WorkspaceArtifactBuilder` every call, and also calls `buildGovernancePhase` (`:180`) for a 6th (cheap) touch. Callers include `GET /api/hub`, the WebSocket init, `FeatureStatusRoute`, and **`CommitCheckRoute:33`** — the enforce-mode commit-blocking path.

---

## Blueprint Alignment

| Claim | Actual finding | Status |
|---|---|---|
| "Five raw `META_LEDGER.md` consumers remain" (ledger #590; my report to the operator) | 1 clean candidate (F5), 1 shape-mismatched (F4), 1 must-not-migrate (F3), 2 not consumers (F1, F2) | **DRIFT — my own claim was wrong** |
| The candidate list is complete | `WorkspaceArtifactBuilder.readGovernanceState` (`:103`) is a raw consumer that was never listed | **DRIFT — enumeration incomplete** |
| #233 closes by migrating remaining consumers onto the adapter | Adapter migration is largely done; the live defect is that no one **shares** the result — 5 reads/build, 2 of them the adapter | **DRIFT — wrong remedy** |
| PR #407: "`ConsoleServerHub.ts:79`, `ConsoleLifecycleService.ts:98`, `MetaLedgerReader.ts:90`, `SystemStateReader.ts:41` all still read `docs/META_LEDGER.md` directly" | Literally true as a string-level statement, but 2 of the 4 are not parses (F1/F2 class), so it reads as more actionable than it is | **PARTIAL — accurate but misleading** |
| Adapter ladder maps cleanly to every site | `## Chain Status:` is document-level, absent from `MetaLedgerEntry` (F4); tail reads need partial-read semantics the ladder cannot express (F3) | **DRIFT** |

**Provenance note on the wrong claim.** The "five consumers" list came from a `grep -l "META_LEDGER.md"` filtered by hand — a *file-mentions-the-string* search presented as a *file-parses-the-artifact* finding. It was reported to the operator and written into ledger #590 without opening the files. F1 (a doc comment) and F2 (a watch path) are exactly what that method cannot distinguish, and F6 read #2 is exactly what it misses when the string appears in a file already assumed migrated.

---

## Recommendations

1. **[HIGH] Retarget the slice from "migrate consumers" to "read the ledger once per snapshot."** Thread one `ArtifactEnvelope<MetaLedgerEntry[]>` through `WorkspaceArtifactBuilder.build()` and into `buildConsumerDiagnostics`. Eliminates reads #1/#2/#5 outright. Measured upside ~96 ms/snapshot warm, on the commit-check blocking path. This closes more of #233's *actual* intent (one versioned consumption boundary) than any remaining migration, and serves #244.
2. **[HIGH] Migrate `WorkspaceArtifactBuilder.readGovernanceState` (`:103`)** — the unlisted raw consumer — as part of (1), since it is in the same function.
3. **[MED] Decide the `kind` vs `phase` taxonomy before touching `MetaLedgerReader` (F5).** The two classifiers disagree on live entries (#589, #590). Surface the metric delta explicitly; do not let it ride in as an invisible side effect of a refactor.
4. **[MED] Give `SystemStateReader` (F4) a classified raw-text seam** rather than forcing the entry-array envelope. `## Chain Status:` is document-level metadata; consider whether the envelope should carry it.
5. **[LOW] Leave `ConsoleServerHub` (F3) on its bounded tail read** and document *why* in `#233`'s acceptance boundary, so a future sweep does not "finish the migration" and silently regress it 60×. If it must be classified, build a tail-aware seam that can express partial-read-not-corrupt.
6. **[DO NOT] Touch F1 and F2.** Record them as non-consumers so they stop reappearing in `grep`-derived candidate lists.
7. **[PROCESS] Correct the record.** Ledger #590 and the operator report both state "five raw consumers." Both overstate. This brief is the correction; the next ledger entry should reference it rather than silently restating a smaller number.

---

## Updated Knowledge

For `docs/SHADOW_GENOME.md` — candidate pattern, adjacent to `API_ASSUMPTION_DRIFT`:

> **GREP_LIST_AS_FINDING.** A `grep -l` over a *filename string* was reported as an enumeration of *consumers of that artifact*, then written into the Merkle ledger as fact. Of five sites, two did not consume the artifact (one mentioned it only in a doc comment; one used it as a watch path), and the same method missed a real consumer inside a file already assumed migrated. **The string-mention set and the semantic-consumer set are different sets.** A candidate list is not a finding until each site has been opened and its behavior read. Cost here was low because research ran before planning — the same list had already reached the operator and the ledger, where it was not free.

Second, for the #233 acceptance boundary:

> Adapter *adoption* and reduced *coupling* are not the same thing. `WorkspaceArtifactBuilder` routes through `readMetaLedgerArtifact` and is more expensive than before it did — the envelope is computed twice and discarded once. A migration that adds a read while satisfying the "goes through the adapter" test satisfies the letter of #233 and misses its intent.

---

_Research complete. Findings are advisory — implementation decisions remain with the Governor._
