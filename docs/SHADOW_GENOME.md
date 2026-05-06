# QoreLogic Shadow Genome

> **Purpose**: Archive of failure modes and rejected patterns. Each entry is a learning opportunity to prevent repetition.

---

## Failure Entry #1

**Date**: 2026-02-05T16:30:00Z
**Verdict ID**: Entry #3 - GATE TRIBUNAL - Roadmap Visualization
**Failure Mode**: GHOST_PATH / GHOST_UI

### What Failed

Blueprint for Roadmap Visualization & Accountability Layer (plan-roadmap-visualization.md)

### Why It Failed

The blueprint defined UI elements (buttons, tabs) and method calls without specifying their handler implementations:

1. **"Request Approval" button** - No handler to connect to L3ApprovalPanel
2. **"Take Detour" button** - No method to execute phase skip
3. **`openRoadmap()` function** - Called in HTML but never defined
4. **View mode tabs** - No switching logic specified
5. **`findPhaseForArtifact()` method** - Called in GovernanceRouter but not defined

### Pattern to Avoid

**"Implied Handlers"**: Never assume a button or method call will "figure itself out" during implementation. Every interactive element in a blueprint MUST have:

- An explicit handler function name
- Either implementation code or a reference to existing functionality
- Clear input/output specification

### Remediation Required

Add the following to `plan-roadmap-visualization.md`:

1. `requestBlockerApproval(planId, blockerId)` method specification
2. `takeDetour(planId, currentPhaseId, detourPhaseId)` method specification
3. `failsafe.showRoadmap` command registration in main.ts
4. `setViewMode(mode)` method in RoadmapViewProvider
5. `findPhaseForArtifact(plan, path)` utility function

---

## Failure Entry #2

**Date**: 2026-02-05T03:15:00Z
**Verdict ID**: Entry #7 - GATE TRIBUNAL - Chat Participant
**Failure Mode**: COMPLEXITY_VIOLATION (Razor)

### What Failed

Implementation of `FailSafeChatParticipant.ts` for VSCode Chat slash commands

### Why It Failed

Line 143 contains a nested ternary operator:

```typescript
const stage = score < 0.5 ? "CBT" : score < 0.8 ? "KBT" : "IBT";
```

Section 4 Razor mandates **zero nested ternaries**. This pattern:

- Reduces readability
- Makes debugging difficult
- Violates "Simple Made Easy" principles

### Pattern to Avoid

**"Clever One-Liners"**: Never chain ternary operators. A single ternary is acceptable (`condition ? A : B`), but nested ternaries are always banned regardless of "cleverness" or brevity.

### Remediation Required

Replace with explicit control flow:

```typescript
function getTrustStage(score: number): string {
  if (score < 0.5) return "CBT";
  if (score < 0.8) return "KBT";
  return "IBT";
}
```

---

## Failure Entry #3

**Date**: 2026-02-05T04:30:00Z
**Verdict ID**: Entry #10 - GATE TRIBUNAL - v1.2.0 Navigator
**Failure Mode**: GHOST_PATH

### What Failed

Blueprint for UI Clarity & Discoverability Enhancement (plan-ui-clarity.md)

### Why It Failed

Phase 3 proposes a Quick Start Guide with a toggle button:

```html
<button class="guide-toggle" data-action="toggleGuide"></button>
```

The plan defines the button and the `getQuickStartHtml()` method, but does NOT specify adding a handler case to the webview `onDidReceiveMessage` switch statement. Current handlers in DojoViewProvider.ts (lines 57-69) only process: `auditFile`, `showL3Queue`, `trustProcess`.

Without a `toggleGuide` handler, button clicks would be silently ignored.

### Pattern to Avoid

**"Implied Message Handlers"**: When adding webview buttons with `data-action` attributes, ALWAYS specify the corresponding handler case in the plan. The pattern:

1. Define the button HTML
2. Define the state property (`guideExpanded`)
3. **Define the message handler case** ← This was missing

### Remediation Required

Add to plan-ui-clarity.md Phase 3:

```typescript
// Add to DojoViewProvider.ts onDidReceiveMessage handler:
case 'toggleGuide':
    this.guideExpanded = !this.guideExpanded;
    this.refresh();
    break;
```

---

## Failure Entry #4

**Date**: 2026-02-05T06:30:00Z
**Verdict ID**: Entry #14 - GATE TRIBUNAL - /ql-status Backlog Enhancement
**Failure Mode**: GHOST_PATH / ARCHITECTURAL_INCOHERENCE

### What Failed

Blueprint for `/ql-status` Backlog & Blocker Display Enhancement (plan-ql-status-enhancement.md)

### Why It Failed

The Command Integration table (lines 118-127) claims 5 commands will update `BACKLOG.md`:

- `/ql-plan` - Adds new items to Backlog
- `/ql-audit` - Adds Security/Dev Blockers
- `/ql-implement` - Marks completed items
- `/ql-substantiate` - Verifies blockers cleared
- `/ql-refactor` - May add Dev Blockers

However, the File Tree (lines 182-195) only specifies 3 modifications:

```
.claude/commands/
|-- ql-status.md (MODIFY)
|-- ql-bootstrap.md (MODIFY)
|-- ql-audit.md (MODIFY)
```

This creates Ghost Paths: the plan promises functionality that isn't architected.

### Pattern to Avoid

**"Aspirational Integration Tables"**: When specifying command integrations, EVERY command that reads or writes to a shared resource MUST be reflected in the File Tree with explicit (MODIFY) notation. Never list "commands that will update X" without corresponding file modifications in the architectural specification.

The rule: **Integration Table entries == File Tree modifications**

### Remediation Options

**Option A (Expand File Tree)**: Add missing commands:

```
.claude/commands/
|-- ql-status.md (MODIFY)
|-- ql-bootstrap.md (MODIFY - create BACKLOG.md)
|-- ql-audit.md (MODIFY - add blockers)
|-- ql-implement.md (MODIFY - mark complete)
|-- ql-substantiate.md (MODIFY - verify cleared)
|-- ql-refactor.md (MODIFY - add debt blockers)
|-- ql-plan.md (MODIFY - add backlog items)
```

**Option B (Narrow Scope)**: Reduce Command Integration to Phase A only:

- Remove `/ql-implement`, `/ql-substantiate`, `/ql-refactor`, `/ql-plan` from table
- Add note: "Additional command integrations deferred to Phase B"

---

_Shadow Genome initialized. Learn from failures. Do not repeat._

---

## Failure Entry #5

**Date**: 2026-02-05T22:29:11Z
**Verdict ID**: Entry #33 - GATE TRIBUNAL - v2.0.1 Tooltip + Docs Plan
**Failure Mode**: COMPLEXITY_VIOLATION (Razor)

### What Failed

Blueprint for v2.0.1 Cortex Stream Cleanup + Tooltip Coverage

### Why It Failed

The plan adds new scope to four webview files that already exceed Section 4 Razor limits (max 250 lines). Without decomposition, complexity and change risk increase while violating mandated file-size constraints.

### Pattern to Avoid

**"Incremental Adds to Oversized Files"**: Do not extend files that already violate Razor limits. Split and modularize before adding new behavior.

### Remediation Attempted

Not yet remediated.

---

## Failure Entry #6

**Date**: 2026-02-06T12:00:00Z
**Verdict ID**: Entry #41 - GATE TRIBUNAL - v3.1.0 Cumulative Roadmap
**Failure Mode**: GHOST_PATH / MISSING_DEPENDENCY

### What Failed

Blueprint for v3.1.0 Cumulative Roadmap - Visual Orchestration Layer (plan-v3.1.0-cumulative-roadmap.md)

### Why It Failed

The plan contains 5 violations - calling methods and using modules that don't exist:

1. **V1 (GHOST_PATH)**: `getSprint(id)` method called in RoadmapServer but not defined in PlanManager
2. **V2 (GHOST_PATH)**: `broadcast(data)` method called in RoadmapServer but never implemented
3. **V3 (GHOST_PATH)**: `appendSprintEvent()` method called in startSprint/archiveSprint but not defined
4. **V4 (GHOST_PATH)**: `path` module used in RoadmapServer.setupRoutes() but not imported
5. **V5 (MISSING_DEPENDENCY)**: `ws` package required for WebSocketServer but not in package.json

### Pattern to Avoid

**"Snippet Scaffolding"**: When writing code snippets in plans, ensure ALL method calls reference methods that either:

- Already exist in the codebase, OR
- Are explicitly defined earlier in the same plan

Never assume a method will "exist by the time we need it" unless it's explicitly specified.

**"Implicit Imports"**: When using Node.js modules in code snippets, always include the import statement. A snippet using `path.join()` without `import * as path from 'path'` is incomplete.

**"Phantom Dependencies"**: When referencing npm packages, verify they exist in package.json or explicitly add them to the plan's Dependencies section.

### Remediation Required

Add the following to `plan-v3.1.0-cumulative-roadmap.md`:

1. **Phase 1 - PlanManager.ts**: Add `getSprint(sprintId: string): Sprint | undefined` method
2. **Phase 2 - RoadmapServer.ts**: Add `private broadcast(data: object): void` method implementation
3. **Phase 1 - PlanManager.ts**: Add `private appendSprintEvent(type: string, payload: object): void` method
4. **Phase 2 - RoadmapServer.ts**: Add `import * as path from 'path';` at top of file
5. **Dependencies section**: Add `npm install ws @types/ws` or document ws dependency

---

_Shadow Genome updated. Ghost paths and phantom dependencies are implementation hazards._

---

## Failure Entry #7

**Date**: 2026-02-26T20:42:00-05:00
**Verdict ID**: Entry #66 - GATE TRIBUNAL - plan-v3.6.1-remaining-validation
**Failure Mode**: HALLUCINATION / COMPLEXITY_VIOLATION / SECURITY_STUB

### What Failed

Plan proposed wiring 7 TODO stubs to real services, but referenced 5 methods that do not exist (`LedgerManager.getLatestHash()`, `SentinelDaemon.getProcessedEventCount()`, `QoreLogicManager.getTrustScore()`, `SessionManager.isLocked()`, config key `failsafe.governance.overseerId`). Additionally, 5 of 7 target files already exceed the 250-line Section 4 Razor limit, and the plan proposed adding code without decomposition.

### Why It Failed

1. **Hallucinated APIs**: Plan described method calls without verifying they exist in the codebase. Methods were plausible names but fictional.
2. **Razor blindness**: Plan did not audit the current line counts of files it proposed to modify. `FailSafeApiServer.ts` is 521 lines with a 342-line method.
3. **Security under-prioritization**: LLM confidence self-assessment (VerdictArbiter) and hardcoded trust scores (GovernanceAdapter) were listed alongside cosmetic TODOs instead of being flagged as security-critical.
4. **Self-contradicting open questions**: Open Question #2 asked "direct or interface?" but the Changes section answered with direct concrete class injection.

### Pattern to Avoid

1. **Always verify method signatures against source before proposing calls**. Do not assume method names from context.
2. **Always check file line counts before proposing additions**. Files over 250 lines require decomposition BEFORE new code.
3. **Always list ALL affected files**, including files where new methods must be added and `package.json` for new config keys.
4. **Security findings must be explicitly categorized and prioritized**, not interleaved with cosmetic cleanup.
5. **Open questions must be resolved in the Changes section**, not left contradicted.

### Remediation Attempted

VETO issued. Plan must be revised to address all 19 violations before re-submission.

---

## Failure Entry #8

**Date**: 2026-02-26T21:35:00-05:00
**Verdict ID**: Entry #67 - GATE TRIBUNAL (RE-AUDIT) - plan-v3.6.1-audit-remediation
**Failure Mode**: COMPLEXITY_VIOLATION / HALLUCINATION

### What Failed

Remediated plan corrected 15 of 19 violations but introduced 2 new arithmetic errors in Razor estimates and 1 runtime-failing config access pattern.

### Why It Failed

1. **Razor arithmetic**: Breaking a method into sub-methods within the same file is INTERNAL REFACTORING, not extraction. It does not reduce line count — it adds method signatures. The plan assumed `evaluate()` decomposition would reduce GovernanceAdapter.ts from 295 to ~210 lines, but it only saves ~17 lines (dead code removal).
2. **Incomplete extraction scope**: VerdictArbiter plan extracted prompt/HTTP from `invokeLLM()` but did not move the closely related `isValidLLMEndpoint()` and `checkLLMAvailability()` methods, leaving the file marginal.
3. **Config API mismatch**: Plan accessed `getConfig()['governance']?.overseerId` but `FailSafeConfig` type has no `governance` property. The ConfigManager does not auto-expose arbitrary VS Code config sections.

### Pattern to Avoid

1. **Internal decomposition != extraction**. Splitting a 97-line method into 5 sub-methods in the same file adds ~5 method signatures (~25 lines) while removing 0 lines of logic. File size stays the same or grows.
2. **When extracting to a new module, move ALL logically related functions** — not just the one that is over the limit. `buildPrompt()`, `callEndpoint()`, `isValidEndpoint()`, and `checkAvailability()` are all LLM concerns.
3. **Always verify config access against the actual type definition**, not just the VS Code setting name. The setting namespace and the internal config object shape are different things.

### Remediation Attempted

VETO issued with 4 targeted corrections. No structural rework needed — the plan is architecturally sound and security-hardened.

---

## Failure Entry #9

**Date**: 2026-02-26T22:45:00-05:00
**Verdict ID**: Entry #68 - GATE TRIBUNAL (RE-AUDIT #2) - plan-v3.6.1-audit-remediation Rev 2
**Failure Mode**: COMPLEXITY_VIOLATION / ARITHMETIC_ERROR

### What Failed

Rev 2 of the remediated plan resolved all 4 Entry #67 violations but contained 3 new violations: grossly under-scoped CheckpointManager.ts extraction, dropped function-level decomposition for GovernanceAdapter.evaluate(), and unaddressed function-length violation in CheckpointManager.resume().

### Why It Failed

1. **CheckpointManager extraction arithmetic**: Plan claims ~180 residual after extracting types, DriftDetector, and ManifoldCalculator. Actual residual is ~405 lines. The plan accounted for what was EXTRACTED (~186 lines) but did not inventory what STAYS: load (24), create (20), seal (28), pause (38), resume (53), validate (18), captureSnapshot (26), save (16), archiveCheckpoint (24) = ~247 lines of methods alone, plus imports, class structure, and fields. Total far exceeds 250.

2. **File-size vs function-size confusion**: Entry #67 correctly identified that internal method decomposition does not reduce FILE line count. Rev 2 dropped the `evaluate()` decomposition to fix file-size arithmetic. But the 40-line FUNCTION limit is a separate, independent constraint. Removing the function decomposition to fix one constraint violated another. Both constraints must be satisfied simultaneously.

3. **Selective verification**: The plan verified arithmetic carefully for GovernanceAdapter.ts and VerdictArbiter.ts (which were the Entry #67 VETO targets) but applied rough estimates to CheckpointManager.ts and QoreLogicManager.ts without the same rigor.

### Pattern to Avoid

1. **Always inventory BOTH what is extracted AND what stays**. A file with 601 lines and 186 lines extracted does NOT have ~180 residual — it has ~415. Subtraction must include the overhead of new imports and delegation code.
2. **File-size and function-size are independent constraints**. Fixing one does not excuse violating the other. Internal decomposition (sub-methods in the same file) is required for function-size compliance EVEN THOUGH it does not help file-size compliance.
3. **Apply equal verification rigor to ALL files in the plan**, not just the ones flagged in the previous VETO. Selective verification creates blind spots.

### Remediation Attempted

VETO issued with 3 targeted corrections: (1) Extract CheckpointLifecycle.ts and CheckpointPersistence.ts from CheckpointManager, (2) Restore GovernanceAdapter.evaluate() internal decomposition for function-size compliance, (3) Decompose CheckpointManager.resume() within its extraction target.

---

## Failure Entry #10

**Date**: 2026-02-27T00:15:00-05:00
**Verdict ID**: Entry #69 - GATE TRIBUNAL (RE-AUDIT #3) - plan-v3.6.1-audit-remediation Rev 3
**Failure Mode**: GHOST_PATH / BOOTSTRAP_ORDER_VIOLATION

### What Failed

Plan places `ICheckpointMetrics` adapter construction in `bootstrapQoreLogic.ts`, referencing `sentinelDaemon.getStatus().eventsProcessed`. But `bootstrapQoreLogic()` executes at step 3 in the boot sequence, while `bootstrapSentinel()` executes at step 4. The `sentinelDaemon` variable does not exist when the adapter is created.

### Why It Failed

The plan correctly identified the composition root pattern (wiring dependencies at bootstrap files) and correctly chose `bootstrapQoreLogic.ts` as the file where QoreLogic-domain services are constructed. However, it did not verify that ALL dependencies referenced in the adapter are available in that bootstrap function's scope. `ledgerManager` IS available (created at step 3), but `sentinelDaemon` is NOT (created at step 4).

The boot order in `main.ts` is:

1. `bootstrapCore()` → CoreSubstrate
2. `bootstrapGovernance(context, core)` → GovernanceSubstrate
3. `bootstrapQoreLogic(context, core, gov)` → QoreLogicSubstrate ← adapter placed HERE
4. `bootstrapSentinel(context, core, qore)` → SentinelSubstrate ← sentinel created HERE
5. `bootstrapMCP(context, sentinel, qore, gov)`

### Pattern to Avoid

**"Assumed Scope Availability"**: When placing dependency wiring in a bootstrap function, verify that ALL referenced services are available at that point in the boot sequence. Cross-reference the `main.ts` boot order. A composition root that references a service from a later bootstrap step will fail at runtime.

The rule: **Before wiring an adapter in `bootstrapX.ts`, confirm every dependency is created at step X or earlier.**

### Remediation Required

Move the `ICheckpointMetrics` adapter creation to `main.ts`, after both `bootstrapQoreLogic()` (step 3) and `bootstrapSentinel()` (step 4) have completed. At that point, both `qore.ledgerManager` and `sentinel.sentinelDaemon` are in scope.

---

_Shadow Genome updated. Bootstrap order is a hard constraint — verify scope before wiring._

---

## Failure Entry #11

**Date**: 2026-02-27T10:00:00.000Z
**Verdict ID**: Entry #82 - GATE TRIBUNAL - Time-Travel Rollback v4.1.0
**Failure Mode**: SECURITY_GAP / GHOST_PATH / COMPLEXITY_VIOLATION

### What Failed

Blueprint for Time-Travel Rollback (plan-time-travel-rollback-v4.1.md) — 3-service orchestration for git revert, RAG purge, and ledger seal.

### Why It Failed

**Security (3 HIGH, 2 MEDIUM)**:

1. **Git flag injection (V1)**: `GitResetService.resetHard(targetHash)` passes `targetHash` directly to `spawn('git', ['reset', '--hard', targetHash])` with no format validation. A malicious hash like `--upload-pack=/usr/bin/malicious` bypasses `shell: false` protection because git interprets it as a flag, not a positional argument.

2. **Ledger seal failure unhandled (V2)**: After `git reset --hard` has already moved HEAD, a `recordRevertCheckpoint` failure (DB locked, disk full) leaves the workspace reverted with zero audit trail. The plan says "always attempted" but provides no catch/fallback.

3. **TOCTOU race (V3)**: Two non-atomic subprocess calls — `getStatus()` then `resetHard()` — with no re-verification between them. Auto-save, background builds, or other extensions can dirty the workspace in the gap. `git reset --hard` would silently discard those changes.

4. **Non-atomic JSONL write (V4)**: `fs.writeFileSync` in the JSONL purge path can truncate the file on process crash mid-write.

5. **Unsanitized actor/reason (V5)**: `actor` from `req.body` allows impersonation; `reason` has no length cap.

**Ghost UI**:

6. **Cancel button (V6)**: Plan lists "Cancel button" but provides no handler — no `postMessage`, no `dispose()`, no navigation.

7. **Unspecified endpoint (V7)**: `GET /api/checkpoints/:id` mentioned as needed but never specified with response schema or error handling.

**Razor**:

8. **SentinelRagStore.ts exceeds 250 lines (V8)**: Adding `purgeAfterTimestamp` pushes from 271 to ~295 lines with no extraction plan.

### Pattern to Avoid

1. **"Trusted Positional Arguments"**: Even with `shell: false`, git (and similar tools) interpret strings starting with `--` as flags. ALWAYS validate format of user-controlled arguments before passing to subprocess spawn. For git hashes: `/^[0-9a-f]{40}$/` (SHA-1) or `/^[0-9a-f]{64}$/` (SHA-256).

2. **"Fire and Forget Audit Trail"**: When an irreversible operation (like `git reset --hard`) has already executed, the audit recording step MUST have a fallback. If the primary ledger fails, write an emergency log to a predictable location.

3. **"Assumed Atomicity Between Subprocesses"**: Two sequential subprocess calls are NEVER atomic. If the first call checks a precondition and the second acts on it, always re-verify the precondition immediately before the action.

4. **"Direct writeFileSync for Rewrite"**: When rewriting a file by filtering its contents, use write-to-temp-then-rename to prevent data loss on crash.

5. **"Implied UI Handlers"**: (Repeat of Shadow Genome Entry #1, #3) — Every interactive element MUST have an explicit handler in the plan.

6. **"Mentioned But Unspecified Endpoints"**: If a plan references an API endpoint as "needed", it MUST include the full specification (method, path, request/response schema, error handling) or defer it explicitly.

### Remediation Required

8 specific fixes documented in `.agent/staging/AUDIT_REPORT.md`. All are remediable without architectural changes — the module boundaries, layering direction, and service isolation are sound.

---

_Shadow Genome updated. Subprocess argument validation and audit trail resilience are non-negotiable for L3 security operations._

---

## Failure Entry #12

**Date**: 2026-02-27T14:30:00Z
**Verdict ID**: Entry #87 - GATE TRIBUNAL - Governance Gaps Hard Guarantees
**Failure Mode**: SECURITY_STUB / TYPE_SAFETY_BYPASS

### What Failed

Blueprint for Governance Gaps Implementation (plan-governance-gaps.md)

### Why It Failed

The blueprint proposed type safety bypasses to work around dependency ordering:

1. **`null as any` for required dependency**: `new BreakGlassProtocol(null as any, eventBus)` passes null where LedgerManager is required. The class immediately calls `this.ledger.appendEntry()` in its `activate()` method — runtime bomb if called before injection.

2. **Private field mutation via type escape**: `(breakGlass as any).ledger = ledger` circumvents TypeScript's `private readonly` protection, creating a backdoor for future mutation bugs.

3. **Temporal coupling without guard**: No mechanism prevents `activate()` from being called during the window between BreakGlassProtocol creation and ledger injection.

### Pattern to Avoid

**"Deferred Dependency via Type Escape"**: Never use `null as any` to satisfy a required constructor parameter with intent to inject later. Options:

1. **Create after dependency exists** (simplest): Move instantiation to where the dependency is available
2. **Factory pattern**: Return a promise that resolves when ready
3. **Explicit guard method**: `isReady(): boolean` that throws if preconditions aren't met
4. **Optional dependency**: Make the parameter optional with `| null` and handle null case in methods

Never mutate `private readonly` fields via `as any` cast. If a field needs to be set after construction, declare it as `private` (not readonly) with a proper setter method.

### Remediation Required

Keep BreakGlassProtocol instantiation in bootstrapQoreLogic.ts (existing uncommitted code) — the "fix" in the plan was actually worse than the original.

---

## Failure Entry #13

**Date**: 2026-02-27T14:30:00Z
**Verdict ID**: Entry #87 - GATE TRIBUNAL - Governance Gaps Hard Guarantees
**Failure Mode**: GHOST_PATH

### What Failed

Blueprint for VerdictReplayEngine (plan-governance-gaps.md, Phase 2)

### Why It Failed

The `replay()` method specification contains only numbered comments:

```typescript
async replay(entryId: number): Promise<ReplayResult> {
  // 1. Load ledger entry
  // 2. Extract payload...
  // ... (8 comment steps)
}
```

This is a TODO list disguised as code. It cannot be verified for:

- Razor compliance (function length, nesting depth)
- Error handling completeness
- Type safety
- Edge case coverage

### Pattern to Avoid

**"Comment-Driven Specification"**: Numbered comments describing what code SHOULD do are not implementation. A plan must include either:

1. **Actual TypeScript code** with real variable names, function calls, and control flow
2. **Detailed pseudocode** with types, error handling, and explicit control structures
3. **Explicit deferral** with "Implementation TBD" and separate planning ticket

Never present `// 1. Do X // 2. Do Y` as a function specification — it will pass superficial review but fail audit.

### Remediation Required

Provide actual VerdictReplayEngine.replay() implementation with:

- Variable declarations with types
- Actual ledger.getEntry() / policyEngine method calls
- Error handling for missing entries, hash mismatches, file not found
- Return statement construction

---

_Shadow Genome updated. Type escape hatches and comment-only specifications are prohibited in L3 governance code._

---

## Failure Entry #14

**Date**: 2026-02-27T15:45:00Z
**Verdict ID**: Entry #88 - GATE TRIBUNAL - Governance Gaps v2
**Failure Mode**: RAZOR_VIOLATION

### What Failed

Blueprint v2 for Governance Gaps (plan-governance-gaps-v2.md) — function length limits

### Why It Failed

Two functions exceeded the 40-line limit:

1. **BreakGlassProtocol.activate()**: ~50 lines
   - Large object literal for BreakGlassRecord construction (~12 lines)
   - Large object literal for ledger payload (~10 lines)
   - Combined with validation and event emission, exceeds limit

2. **VerdictReplayEngine.replay()**: ~77 lines
   - Sequential verification steps each add 10-15 lines
   - Policy hash check, artifact hash check, risk reclassification, verdict comparison
   - No extraction of logical sub-operations

### Pattern to Avoid

**"Inline Everything"**: When a function performs multiple distinct sub-operations (validate → construct → record → emit), each with non-trivial logic, the combined length can exceed limits even though each operation is simple.

**Signs of needed extraction**:

- Large object literals (>8 lines) → Extract builder function
- Sequential independent checks → Extract checker functions
- Repeated similar operations → Extract parameterized helper

### Remediation Required

Extract private helper methods:

- `buildActivationRecord()` — constructs BreakGlassRecord
- `recordActivation()` — writes to ledger
- `checkPolicyHash()` — verifies policy consistency
- `checkArtifactHash()` — verifies file content
- `compareVerdicts()` — determines match/divergence

Each helper should be ≤20 lines, making the main functions ~15-20 lines of orchestration.

---

_Shadow Genome updated. Even well-designed functions can exceed Razor limits when they combine multiple operations without extraction._

---

## Failure Entry #15

**Date**: 2026-02-27T21:00:00Z
**Verdict ID**: Entry #92 (META_LEDGER)
**Failure Mode**: GHOST_PATH

### What Failed

Plan v4.2.0 "The Answer" declared 7 browser-served route components (HomeRoute, RunDetailRoute, WorkflowsRoute, SkillsRoute, GenomeRoute, ReportsRoute, SettingsRoute) in ConsoleShell with zero implementation detail. Additionally, B60 "Undo Last Attempt" appeared in the phase summary table but had no specification anywhere in the plan.

### Why It Failed

Declaring route references in a Map without specifying data sources, rendering contracts, or interaction handlers creates ghost paths — UI elements that exist in code but connect to nothing. The plan treated route declaration as sufficient specification.

### Pattern to Avoid

When a plan references N components, all N must have: (1) data source, (2) rendering contract, (3) interaction handlers. A Map entry is a declaration, not a specification. If a component is not ready for specification, it must be deferred, not silently included.

### Remediation Attempted

Pending — Governor must specify all 7 routes or reduce scope.

---

## Failure Entry #16

**Date**: 2026-02-27T21:00:00Z
**Verdict ID**: Entry #92 (META_LEDGER)
**Failure Mode**: ORPHAN

### What Failed

12 new files across Phases 5 and 7 of plan v4.2.0 had no entry point wiring — no main.ts registration, no bootstrapQoreLogic.ts instantiation, no command contributions. Files would compile but never execute.

### Why It Failed

The plan specified class implementations but not activation paths. Each class had internal logic but no connection to the extension lifecycle. This is a recurring pattern in large plans: the "how it works internally" is specified but "how it gets created and called" is omitted.

### Pattern to Avoid

Every new file in a plan must trace an import chain to an entry point. The minimum wiring specification is: (1) where is the class instantiated, (2) what owns its lifecycle, (3) what command or event triggers its first use.

### Remediation Attempted

Pending — Governor must add entry point wiring for all 12 files.

---

## Failure Entry #17

**Date**: 2026-02-27T21:00:00Z
**Verdict ID**: Entry #92 (META_LEDGER)
**Failure Mode**: SECURITY_STUB

### What Failed

GovernanceWebhook (B81) accepts user-configured endpoint URLs with no validation. The `endpoint.url` field is passed directly to `fetch()`, creating an SSRF vector that could exfiltrate governance data to arbitrary endpoints including internal network addresses.

### Why It Failed

The plan focused on the webhook notification pattern (filter + dispatch) but omitted the trust boundary between user configuration and network I/O. User-configured URLs are untrusted input that crosses a network boundary.

### Pattern to Avoid

Any user-configured URL that triggers server-side HTTP requests must be validated: HTTPS-only, no private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x, ::1), and optionally restricted to an allowlist. This applies to webhooks, callbacks, and any "phone home" pattern.

### Remediation Attempted

Pending — Governor must add URL validation with SSRF protection.

---

## Failure Entry #18

**Date**: 2026-02-27T22:30:00Z
**Verdict ID**: Entry #93 (META_LEDGER)
**Failure Mode**: HALLUCINATION

### What Failed

Plan Rev 2 route data sources and service constructors reference 9+ methods that do not exist on the specified classes. Examples: `PlanManager.getActiveSprint()` (nonexistent), `QoreLogicManager.getGovernanceMode()` (exists on EnforcementEngine, not QoreLogicManager), `SentinelDaemon.getRecentVerdicts()` (nonexistent), `LedgerManager.record()` (actual API is `appendEntry()`), `TrustEngine.setTrust()`/`setRevoked()` (nonexistent).

### Why It Failed

During V6 remediation, route components were specified with data source lists that look correct architecturally but were not verified against the actual codebase. Method names were inferred from class semantics rather than read from source files. The Governor assumed API surfaces based on what the classes _should_ have, not what they _do_ have.

### Pattern to Avoid

When specifying data sources or constructor dependencies for new code, always verify the exact method name, signature, and class by reading the source file. If the method doesn't exist, list the parent class as an affected file and specify the new method. Never reference methods by assumed name — always `grep` first.

### Remediation Attempted

Pending — Governor must verify all method references against actual codebase and either correct them or add the parent classes to affected files lists.

---

## Failure Entry #19

**Date**: 2026-02-27T22:30:00Z
**Verdict ID**: Entry #93 (META_LEDGER)
**Failure Mode**: HALLUCINATION

### What Failed

V10 remediation replaced an undeclared dependency (ZIP library) with another undeclared dependency (`tar`). The plan claims "tar (existing)" in the VETO Remediation Map but `tar` is not in `package.json`. Node.js built-in `zlib` provides gzip compression but not tar archive creation.

### Why It Failed

The Governor conflated `zlib` (built-in, gzip only) with `tar` (npm package, not built-in). The remediation checked that `zlib` was available but didn't verify that `tar` was already a project dependency.

### Pattern to Avoid

When claiming a dependency is "existing" or "built-in", verify against both Node.js built-in module list AND the project's `package.json`. "Built-in `zlib`" is correct; "built-in `tar`" is not — `tar` is an npm package.

### Remediation Attempted

Pending — Governor must either declare `tar` as a new dependency or switch to gzipped JSON without tar wrapping.

---

---

## Failure Entry #11

**Date**: 2026-02-27T18:00:00Z
**Verdict ID**: Entry #99 - GATE TRIBUNAL - v4.2.0 Continuation
**Failure Mode**: COMPLEXITY_VIOLATION

### What Failed

Plan proposed adding B81 injection methods directly to `FrameworkSync.ts` (224 lines) and B55 workflow types directly to `planning/types.ts` (280 lines), pushing both beyond the 250-line limit.

### Why It Failed

Governor did not check current file sizes before proposing extensions. `planning/types.ts` was already over limit (280 lines, pre-existing debt). `FrameworkSync.ts` was 26 lines from limit — adding 37+ lines of injection logic exceeded it.

### Pattern to Avoid

Before extending an existing file in a plan, verify its current line count against the 250-line limit. If headroom is <30 lines, extract new functionality into a separate file. Never worsen pre-existing Section 4 debt.

### Remediation Attempted

Governor must extract B81 into `AgentConfigInjector.ts` and B55 into `planning/workflowTypes.ts`.

---

## Failure Entry #12

**Date**: 2026-02-27T18:00:00Z
**Verdict ID**: Entry #99 - GATE TRIBUNAL - v4.2.0 Continuation
**Failure Mode**: GHOST_PATH + ORPHAN

### What Failed

1. B60 command handler referenced `currentRunId` with no defined source — ghost path.
2. `AgentCoverageRoute.ts` barrel-exported but not mounted in `RoadmapServer.ts` — orphan route.
3. `FirstRunOnboarding.ts` created but not wired into any bootstrap file — orphan service.

### Why It Failed

Governor focused on the service design but not the wiring. Barrel exports were treated as sufficient for route connectivity (they are not — routes must be explicitly mounted). The B60 command handler used a pseudo-variable without defining its resolution path.

### Pattern to Avoid

For every new route file, verify it appears in both `routes/index.ts` AND has a `this.app.get()` mount in `RoadmapServer.ts`. For every new service, verify it appears in a bootstrap file's substrate interface. For every command handler, verify all referenced variables have defined sources.

### Remediation Attempted

Governor must add RoadmapServer.ts mount for coverage route, wire FirstRunOnboarding into bootstrapQoreLogic, and define `getActiveRunId()` for B60 command resolution.

_Shadow Genome updated. Remediation plans must be verified against the actual codebase with the same rigor as original plans. Assumed API surfaces are the most common source of hallucination in large-scale plans._

---

## Failure Entry #13

**Date**: 2026-02-27T19:00:00Z
**Verdict ID**: Entry #96 (SUBSTANTIATION FAIL) / DISCOVERY DEBT
**Failure Mode**: GHOST_PATH / TEST_EVASION

### What Failed

1. **Architectural Drift**: `SystemRegistry.ts` path resolution broke silently when the `qorelogic/` directory was moved to `_STAGING_OLD/` during an ungoverned refactor.
2. **Release Pipeline Test Evasion**: `.github/workflows/release.yml` packaged and published the codebase without running `npm test`.

### Why It Failed

1. **Missing Test Coverage**: `SystemRegistry.ts` had no unit tests, so changing physical folder structures did not break the build. TypeScript type-checking does not test if an absolute path exists at runtime.
2. **Pipeline Bypass**: The release workflow successfully ran `npm ci` and `npm run compile`, but omitted test execution. Governance gates and compiler safety mean nothing if the CI/CD pipeline ignores the test suite entirely.

### Pattern to Avoid

**"Compiles != Works"**: Passing TypeScript compilation is necessary but insufficient. Code that interacts with the file system MUST have test coverage.
**"Trusting the Pipeline Blindly"**: A CI/CD pipeline that doesn't run tests is a vulnerability. Always verify that `npm test` or equivalent is part of the `build` or `publish` jobs.

### Remediation Required

1. `release.yml` updated to include `npm run test:all` before `vsce package`.
2. `SystemRegistry.ts` base path updated to `_STAGING_OLD`.
3. `SystemRegistry.test.ts` created to ensure path resolution errors fail the build.

---

## Failure Entry #14

**Date**: 2026-02-28T00:55:00Z
**Verdict ID**: Entry #100 - GATE TRIBUNAL (RE-AUDIT) — v4.2.0 Remediated Continuation
**Failure Mode**: HALLUCINATION / GHOST_PATH

### What Failed

1. **Hallucinated Method**: Plan delegates B60 undo to `CheckpointReconciler.revertToLatest()` — method does not exist anywhere in codebase.
2. **Non-Existent File as Existing**: Plan references `FirstRunOnboarding.ts` as "existing file, verify wiring target" — file does not exist.
3. **Phantom Substrate Field**: Plan references `qore.systemRegistry` in 6+ locations — `QoreLogicSubstrate` has 10 fields, none is `systemRegistry`. `SystemRegistry` is a private internal of `FrameworkSync`.
4. **Phase 0 Stale Claims**: Plan proposes creating `SystemRegistry.test.ts` (already exists, 62 lines) and adding `npm run test:all` to release.yml (already present at line 17).

### Why It Failed

The Governor used information from the handoff document and agent team reports rather than reading the actual source files to verify substrate interfaces and method existence. The 7-agent planning team verified the OLD vetoed plan's issues but the new plan introduced new hallucinations in the remediation pass. The pattern is: imagination fills gaps where verification should occur.

### Pattern to Avoid

**"Trust the Interface, Not the Name"**: Before referencing any method or field in a plan, verify it exists by reading the actual TypeScript interface definition. Class names and method names cannot be inferred from semantic meaning — they must be traced through `grep` or `Read`.

**"Existing = Verified"**: Never label a file as "existing" without running `Glob` for it first. A file that was discussed in design documents may never have been implemented.

**"Substrate = Contract"**: Bootstrap substrate interfaces (CoreSubstrate, GovernanceSubstrate, QoreLogicSubstrate) are the ONLY contract for cross-bootstrap access. If a service isn't in the substrate interface, it's not reachable from outside its bootstrap function.

### Remediation Required

1. Replace `revertToLatest()` with an actually-existing method or specify a new method to be added.
2. Change `FirstRunOnboarding.ts` from "existing" to NEW — provide full specification.
3. Add `SystemRegistry` to `QoreLogicSubstrate` or expose via `FrameworkSync` getter.
4. Update Phase 0 to reflect that test file and CI step already exist.

---

_Shadow Genome updated. Hallucinated APIs persist as the most common failure mode (entries #5, #9, #14, #15, #18)._

---

## Failure Entry #19

**Date**: 2026-03-02T19:48:00Z
**Verdict ID**: Entry #105 — GATE TRIBUNAL (VETO) v4.3.0
**Failure Mode**: COMPLEXITY_VIOLATION + SECURITY_STUB

### What Failed

v4.3.0 "Telemetry Loop" plan — hook script governance logic duplication and unauthenticated API access.

### Why It Failed

1. **Duplicated Decision Logic**: The shell hook script re-implemented the 3-mode (observe/assist/enforce) governance decision tree that already lives in `EnforcementEngine.ts`. Two separate HTTP calls created a TOCTOU race between intent status and mode queries.
2. **Auth Bypass**: The hook relied on localhost auth bypass (`auth.ts:21-24`) which allows ANY local process to mutate governance state, not just the hook.
3. **Razor Debt Ignored**: Plan modified 5 files already over the 250-line limit without acknowledgment or decomposition.

### Why It Failed (Root Cause)

The plan treated the shell hook as an independent decision-maker rather than a thin client. When a subprocess needs to query a running service, the service should expose a pre-computed answer — not raw data that forces the client to re-derive the answer.

### Pattern to Avoid

**"Distributed Decision Re-derivation"**: Never replicate decision logic in a client (especially a shell script) when the server already computes that decision. Expose a purpose-built endpoint returning the final answer. This applies to any IPC boundary — hooks, CLI tools, CI scripts, webviews.

**"Silent Razor Debt Compounding"**: When a plan modifies files already exceeding Razor limits, it must either decompose them or create explicit debt-tracking backlog items. Silence implies acceptance.

### Remediation Required

1. Add `GET /api/v1/governance/commit-check` endpoint with per-session token auth.
2. Reduce hook to single HTTP call + boolean check.
3. Create backlog items for pre-existing Razor violations.

---

_Shadow Genome updated. Distributed decision re-derivation is a new failure mode._

---

## Failure Entry #25

**Date**: 2026-03-02T21:15:00Z
**Verdict ID**: Entry #109 — Quality Sweep VETO
**Failure Mode**: INCOMPLETE_FIX / NO_OP_FUNCTION / COMPLEXITY_VIOLATION

### What Failed

Quality sweep (8 post-substantiation fixes) introduced 3 new violations while fixing existing gaps.

### Why It Failed

**V1 — Incomplete SSRF fix**: `isPrivateIp()` was rewritten to fix RFC 1918 range errors but only handles IPv4. IPv6 private ranges (`fc00::/7`, `fe80::/10`) and IPv4-mapped IPv6 (`::ffff:x.x.x.x`) bypass the filter entirely. A security fix that only covers one address family is incomplete.

**V2 — No-op audit function**: `logCapabilityCheck()` had its `console.log` removed but was left as an exported no-op function with a dead `status` variable. Removing a logging mechanism without replacement breaks the audit trail for capability checks.

**V3 — Razor breach via additive change**: Adding 11 lines to SentinelRagStore.ts pushed it from 250 to 261 lines. The file was already at the exact limit — any addition without extraction creates a violation.

### Pattern to Avoid

**"Fix-Forward Without Regression Check"**: When fixing a bug (SSRF, console.log), always verify the fix is complete across all dimensions (IPv4 AND IPv6, remove logging AND provide alternative). A partial fix creates false confidence.

**"Gutting Without Replacing"**: When removing a logging artifact, either remove the entire function and its callers, or replace the mechanism. Never leave a no-op exported function — it signals to callers that audit logging is happening when it is not.

**"Additive Edits to Boundary Files"**: Before adding code to a file at or near a Razor limit, check current line count. Extract existing code first to create headroom.

### Remediation Required

1. Add IPv6 private range detection to `isPrivateIp()`.
2. Either restore `logCapabilityCheck()` with EventBus emission or remove it entirely.
3. Extract `buildMetadata()` helper from `SentinelRagStore.buildRecord()` to bring file under 250 lines.


---

## Failure Entry #26

**Date**: 2026-03-03T08:42:00Z
**Verdict ID**: Entry #113 — GATE TRIBUNAL — v4.3.2 Performance & Polish
**Failure Mode**: GHOST_UI / IMPLIED_HANDLERS

### What Failed

Plan v4.3.2 Performance & Polish (plan-v4-3-2-performance-polish.md) — Phase 2 message-based UI updates for TransparencyPanel and EconomicsPanel.

### Why It Failed

Phase 2 proposes converting two webview panels from full HTML rebuilds to message-based updates but references client-side functions and DOM selectors that are neither defined nor connected to the existing server-side rendering architecture:

**TransparencyPanel violations**:
1. **Undefined `renderEvents()` function** — Plan proposes `container.innerHTML = renderEvents(events)` as client-side JavaScript. Current `renderEvents()` (line 217-237) is a PRIVATE server-side method. Plan doesn't show WHERE this function is defined in the HTML or HOW it's moved from server to client.
2. **Incomplete HTML template modification** — Plan says "Update `getHtmlContent()` to include message handler" but doesn't show the actual HTML modification or where `window.addEventListener('message', ...)` code is inserted.

**EconomicsPanel violations**:
3. **Non-existent DOM selectors** — Plan proposes `document.querySelector('.total-cost').textContent = snapshot.totalCost` but EconomicsTemplate.ts uses server-side rendering with NO `.total-cost` or `.total-tokens` classes.
4. **Architecture mismatch** — Plan proposes message-driven DOM updates for a template that is purely server-rendered (EconomicsTemplate generates complete HTML strings, not interactive DOM). Plan doesn't explain how to refactor from server-side generation to client-side message handling.

All four violations represent "implied handlers" — the same failure mode as Shadow Genome Entries #1 and #3.

### Pattern to Avoid

**"Implied Message Handlers"** (recurring pattern from Entries #1, #3): When converting from server-rendered HTML to message-driven updates, the plan MUST specify:

1. **HTML structure changes**: Show the exact DOM elements with classes/IDs that will be updated
2. **Client-side function definitions**: Define all functions referenced in message handlers (not just reference them)
3. **CSP-compliant script blocks**: Show `<script nonce="${nonce}">` blocks with complete message listener code
4. **Architecture transition path**: Explain how to refactor from pure server-render to hybrid (initial render + message updates)

Never propose message handlers without showing:
- WHERE the message listener code goes in the HTML
- WHAT DOM selectors are being updated
- HOW client-side functions are defined
- WHY the template structure supports message-based updates

### Remediation Required

Phase 2 must be revised to include:

1. **TransparencyPanel HTML Template Specification**:
   - Show exact `<script nonce="${nonce}">` block location in `getHtmlContent()`
   - Define complete `renderEvents(events)` client-side function
   - Specify how to extract logic from server-side method

2. **TransparencyPanel Message Handler**:
   - Add full message listener code with event type checking
   - Show how `updateEventList(events)` integrates with existing template

3. **EconomicsPanel Template Refactoring**:
   - Modify `EconomicsTemplate.ts` to add DOM elements with selectors
   - Show hybrid structure (initial render + client-side updatable fields)
   - Define complete `updateDashboard(snapshot)` with all field mappings

4. **EconomicsPanel Message Handler**:
   - Add `<script nonce="${nonce}">` block in template
   - Show CSP-compliant event handling integration

---

_Shadow Genome updated. Message-based UI conversions require explicit HTML structure, client-side function definitions, and architecture transition specifications — not just proposed message handler stubs._


---

## Failure Entry #27

**Date**: 2026-03-03T09:15:00Z
**Verdict ID**: Entry #114 — GATE TRIBUNAL — v4.3.2 Performance & Polish (Rev 2)
**Failure Mode**: COMPLEXITY_VIOLATION (Razor)

### What Failed

Plan v4.3.2 Performance & Polish Rev 2 (plan-v4-3-2-performance-polish-v2.md) — Phase 3 WorkspaceMigration async conversion

### Why It Failed

Phase 3 converted synchronous file operations to async (good) but the `repairConfig()` method grew to ~68 lines during the conversion, exceeding the 40-line Section 4 Razor limit by +28 lines (70% over).

The function performs 5 distinct operations in sequence:
1. Config directory setup
2. Load and parse existing config file
3. Integrity check (hash verification)
4. Alignment check (structure comparison)  
5. User prompt and config write

Each operation is 10-30 lines, making the combined function too long. The async conversion added `await` keywords and `fs.promises` calls throughout, but didn't decompose the logical operations.

### Pattern to Avoid

**"Async Conversion Without Decomposition"**: When converting synchronous code to async, the addition of `await`, `try-catch`, and promise handling can push previously acceptable functions over the Razor limit. Always verify line count AFTER async conversion and decompose if needed.

The pattern:
- Synchronous version: borderline acceptable (~50-60 lines with `fs.readFileSync`, `fs.writeFileSync`)
- Async version: exceeds limit (~65-70 lines with `await fs.promises.readFile`, `await fs.promises.writeFile`, expanded error handling)

**Signs that async conversion needs decomposition**:
- Function has 4+ sequential `await` calls
- Multiple try-catch blocks
- Mix of I/O operations and business logic
- User interaction (dialogs) combined with file operations

### Remediation Required

Decompose `repairConfig()` into 5 helper methods:
1. `loadExistingConfig()` - file read and parse (~15 lines)
2. `validateConfigIntegrity()` - hash checking (~8 lines)
3. `checkConfigAlignment()` - structure comparison (~10 lines)
4. `promptUserForAlignment()` - user dialog (~12 lines)
5. `writeAlignedConfig()` - config write (~10 lines)

After extraction, main function becomes orchestration (~25 lines).

---

_Shadow Genome updated. Async conversion can push functions over Razor limits — verify line counts after conversion and decompose multi-operation functions._

---

## Failure Entry #22

**Date**: 2026-03-04T02:15:00Z
**Verdict ID**: Entry #125 - GATE TRIBUNAL - Unified Command Center UI
**Failure Mode**: GHOST_PATH

### What Failed

Plan `plan-unified-command-center.md` — 4 of 7 tab renderers reference API methods or server routes that do not exist in the codebase.

### Why It Failed

The plan assumed infrastructure that was designed but never implemented:
- Risk CRUD routes (`POST/PUT/DELETE /api/v1/risks`) were specified in `UNIFIED_UI_DESIGN.md` Section 5A but never built on the server
- `ConnectionClient` was built with 4 REST methods; the plan referenced 8+ methods that don't exist
- Plan Phase 1B said "modify existing handlers" for risk CRUD — those handlers are nonexistent

### Pattern to Avoid

**Never reference "existing" code without grep verification.** When a design spec says "REST polling via `GET /api/v1/*` endpoints," the plan author must verify those endpoints exist in the actual server source — not assume the spec was implemented. Design documents describe intent, not reality.

### Remediation Required

Phase 1 must create (not modify) all missing server routes and ConnectionClient methods before any tab renderer can reference them.

---

## Failure Entry #23

**Date**: 2026-03-04T02:15:00Z
**Verdict ID**: Entry #125 - GATE TRIBUNAL - Unified Command Center UI
**Failure Mode**: COMPLEXITY_VIOLATION

### What Failed

`brainstorm.js` — interactive mindmap canvas with drag-to-connect edges, node CRUD, categories, persistence, and export scoped to a single module file.

### Why It Failed

Canvas-based drag interaction (mousedown/mousemove/mouseup handlers, hit detection, coordinate math) combined with node rendering, edge rendering, 4 color categories, localStorage persistence serialization, and JSON export is conservatively 300-400 lines — exceeding the 250-line Section 4 Razor limit.

### Pattern to Avoid

**Interactive canvas features require file decomposition at plan time.** Any module with drag/drop, coordinate geometry, or hit testing should be split into: (1) a renderer for display/layout and (2) a separate interaction handler for mouse/touch events. Plan-time line estimation must account for event handler boilerplate.

### Remediation Required

Split into `brainstorm.js` (renderer + state + export) and `brainstorm-canvas.js` (drag/connect interaction), or reduce to a simpler list-based ideation tool.

---

_Shadow Genome updated. Ghost path pattern: design specs describe intent, not implemented reality — always grep-verify before referencing "existing" infrastructure._

---

## Failure Entry #24

**Date**: 2026-03-04T02:45:00Z
**Verdict ID**: Entry #126 - GATE TRIBUNAL (RE-AUDIT) - Unified Command Center UI Rev 2
**Failure Mode**: GHOST_PATH

### What Failed

Governance tab "[Process All]" button for L3 verification queue — declared in plan but no REST endpoint exists for browser-based L3 batch approval.

### Why It Failed

L3 approval decisions flow through VS Code's EventBus (`qorelogic.l3Decided`) triggered from `L3ApprovalPanel` — a VS Code webview panel. The Command Center is a browser-served UI on port 9376 with no VS Code extension API access. There is no REST endpoint to proxy L3 approvals. The design spec included "[Process All]" as aspirational UI without verifying the backend path.

### Pattern to Avoid

**Browser UIs cannot invoke VS Code extension-only flows.** When porting features from VS Code webviews to browser-served Command Center, verify that every action has a REST endpoint. EventBus-only flows (L3 approval, VS Code command execution) need explicit REST proxies or must be marked read-only in the browser context.

### Remediation Required

Either add `POST /api/actions/approve-l3-batch` server route that calls `qorelogicManager`, or replace [Process All] with read-only queue display noting "Approve via VS Code L3 Panel."

---

## Failure Entry #25

**Date**: 2026-03-04T02:45:00Z
**Verdict ID**: Entry #126 - GATE TRIBUNAL (RE-AUDIT) - Unified Command Center UI Rev 2
**Failure Mode**: COMPLEXITY_VIOLATION

### What Failed

`connection.js` — adding 5 REST methods to an existing 242-line file pushes it to ~288 lines, exceeding the 250-line Section 4 Razor limit.

### Why It Failed

The plan added methods to the most convenient location (the existing ConnectionClient class) without checking the resulting file size. Remediation of V2-V4 (adding missing client methods) was correctly scoped but incorrectly placed — all methods went into one file that was already near the limit.

### Pattern to Avoid

**Check file line counts before adding to existing files.** When a remediation adds N lines to an existing file, verify `current_lines + N <= 250`. If it exceeds, split concerns: transport (WebSocket/SSE/reconnection) vs. data fetching (REST API calls) are independent concerns that belong in separate files.

### Remediation Required

Extract REST methods to `modules/rest-api.js` (~50 lines). ConnectionClient imports and delegates, staying under 250 lines.

---

## Failure Entry #26

**Date**: 2026-03-04T12:00:00Z
**Verdict ID**: Entry #113 - GATE TRIBUNAL - Voice Brainstorm
**Failure Mode**: ARCHITECTURE_GAP

### What Failed

Voice Brainstorm plan specified `import { PiperTTS } from 'piper-tts-web'` and `@xenova/transformers` for Whisper — bare npm module specifiers in frontend code. The existing UI architecture serves plain ES modules via `express.static()` with `<script type="module">`. No bundler, no import maps.

### Why It Failed

The plan designed the voice engine abstraction (STT/TTS) without verifying how the existing frontend loads dependencies. All existing inter-module imports use relative paths (`'./modules/brainstorm.js'`). Bare specifiers like `from 'piper-tts-web'` require either a bundler (webpack, vite) or an import map in the HTML — neither exists. The plan assumed npm-install-and-import would "just work" in a browser context.

### Pattern to Avoid

**Verify the module loading architecture before planning npm dependency usage in frontend code.** When a UI serves plain ES modules without a bundler, external dependencies must either be: (a) vendored as local files with relative imports, (b) loaded via `<script>` tags from CDN, (c) served via an import map in the HTML, or (d) require introducing a build step. Always check how existing imports resolve before adding new external dependencies.

### Remediation Required

Define one of: (a) vendor Piper WASM + Whisper ONNX files into `ui/vendor/` with relative imports, (b) add import map to `command-center.html`, or (c) introduce a lightweight build step. Document where `.wasm` and `.onnx` model files are served from.

---

## Failure Entry #27

**Date**: 2026-03-04T12:00:00Z
**Verdict ID**: Entry #113 - GATE TRIBUNAL - Voice Brainstorm
**Failure Mode**: DATA_MODEL_MISMATCH

### What Failed

Plan defined `BrainstormNode` with `label` and `type` fields, `BrainstormEdge` with `source`/`target`. But existing `brainstorm-canvas.js` renders `node.title`, colors by `node.category`, and looks up edges by `e.from`/`e.to`. Plan's canvas changes section did not address the rename.

### Why It Failed

The backend interfaces were designed clean from scratch, but the plan didn't cross-reference the exact property names used in the existing canvas rendering code. The Simple Made Easy audit caught the complecting issues (STT/TTS, position fields) but missed this concrete naming gap because the focus was on architectural separation, not field-level compatibility.

### Pattern to Avoid

**When changing a data model, grep the existing consumers for every renamed field.** A backend interface rename (`title` → `label`) is incomplete unless every frontend reference to the old name is also updated. Always include a "Migration" subsection listing old → new property names when the data contract changes.

### Remediation Required

Add explicit field migration to brainstorm-canvas.js changes: `title` → `label`, `category` → `type`, `from`/`to` → `source`/`target` in both `setNodes()` and `setEdges()`.

---

_Shadow Genome updated. Two new patterns: (1) verify module loading architecture before planning npm deps in frontend; (2) grep existing consumers for every renamed data field._

---

## Failure Entry #28

**Date**: 2026-03-04T23:45:00Z
**Verdict ID**: Entry #134 - GATE TRIBUNAL - Voice UI
**Failure Mode**: SECURITY_VULNERABILITY

### What Failed

`brainstorm.js:289` renders `node.label` and `node.type` via `innerHTML` without HTML escaping. These values originate from user voice transcripts and LLM extraction responses — a stored XSS vector.

### Why It Failed

The force-layout node tooltip was built with template literals injected directly into `innerHTML`. No sanitization step was applied despite the values coming from external sources (voice input → backend API → WebSocket → frontend render).

### Pattern to Avoid

**Never inject server/user-originated data into `innerHTML` without escaping.** Use `textContent` for text-only fields, or apply `escapeHtml()` before any innerHTML assignment. Treat all data crossing a trust boundary (API responses, user input, LLM output) as untrusted.

### Remediation Required

Escape `node.label` and `node.type` before innerHTML injection. Apply `escapeHtml()` helper or use `textContent` assignments.

---

## Failure Entry #29

**Date**: 2026-03-04T23:45:00Z
**Verdict ID**: Entry #134 - GATE TRIBUNAL - Voice UI
**Failure Mode**: GHOST_PATH

### What Failed

`brainstorm.js:100-102` computes `cats` — a string of category chip `<button>` elements — but never interpolates it into the returned HTML template. Dead code producing ghost HTML.

### Why It Failed

During iterative development of the brainstorm shell, the category chip rendering was written but the template was restructured without updating the interpolation. The variable survived because no dead-code analysis was run between iterations.

### Pattern to Avoid

**After restructuring a template, verify all computed variables are actually interpolated.** Search for variables declared before a template literal that don't appear inside `${...}` within that template.

### Remediation Required

Delete the `cats` variable computation or interpolate it into the template where intended.

---

## Failure Entry #30

**Date**: 2026-03-04T23:45:00Z
**Verdict ID**: Entry #134 - GATE TRIBUNAL - Voice UI
**Failure Mode**: COMPLEXITY_VIOLATION

### What Failed

`brainstorm.js` grew to 452 lines (limit: 250), mixing 6+ concerns: shell rendering, voice control, PTT keyboard management, chat box I/O, node CRUD, and WebSocket event handling. God module.

### Why It Failed

Features were added incrementally (voice, PTT, chat box) to an existing renderer without extracting responsibilities into separate modules. Each addition was small enough to seem "fine" but cumulatively doubled the file.

### Pattern to Avoid

**Extract before extending.** When adding a new concern to an existing module, check whether the module already exceeds or approaches the line limit. If so, extract existing concerns first, then add the new feature to the correct module.

### Remediation Required

Extract voice controller logic and keyboard manager logic into separate modules (`voice-controller.js`, `keyboard-manager.js`). Each resulting file must be ≤ 250 lines.

---

## Failure Entry #31

**Date**: 2026-03-04T23:45:00Z
**Verdict ID**: Entry #134 - GATE TRIBUNAL - Voice UI
**Failure Mode**: COMPLEXITY_VIOLATION

### What Failed

`settings.js:_bindVoiceSettings()` at 53 lines exceeds the 40-line function limit. Binds 4 unrelated control groups (model status, PTT recorder, wake word toggle/phrase, silence slider) in a single function.

### Why It Failed

All voice settings bindings were grouped into one function for convenience during initial implementation. The function grew beyond the limit as more controls were added.

### Pattern to Avoid

**One binding function per logical control group.** When a settings section has multiple independent control groups, each should have its own binding function (e.g., `_bindPttRecorder()`, `_bindWakeWord()`, `_bindSilenceSlider()`).

### Remediation Required

Split into `_bindPttRecorder()`, `_bindWakeWord()`, `_bindSilenceSlider()`, each ≤ 40 lines.

---

## Failure Entry #32

**Date**: 2026-03-05T00:30:00Z
**Verdict ID**: Entry #135 - GATE TRIBUNAL RE-AUDIT - Voice UI
**Failure Mode**: COMPLEXITY_VIOLATION

### What Failed

`settings.js:_renderVoiceSettings()` at 49 lines exceeds the 40-line function limit. The function returns a single HTML template literal containing 4 unrelated settings control groups (STT engine status, PTT key recorder, wake word toggle/phrase, silence timeout slider).

### Why It Failed

During the V4 remediation, only the `_bindVoiceSettings()` binder function was split into sub-functions. The corresponding `_renderVoiceSettings()` template renderer — which has a 1:1 structural correspondence — was left as a single 49-line function. The Specialist applied the "split by concern" pattern to the binding logic but not to the rendering logic.

### Pattern to Avoid

**When splitting a binder function by concern, split the corresponding renderer function by the same concern boundaries.** Render and bind functions for settings panels are structurally parallel — if one is decomposed, the other must be too.

### Remediation Required

Split `_renderVoiceSettings()` into `_renderSttStatus()`, `_renderPttKey()`, `_renderWakeWord()`, `_renderSilenceTimeout()`. Parent function concatenates results. Each ≤ 40 lines.

---

## Failure Entry #33

**Date**: 2026-03-05T14:22:00Z
**Verdict ID**: Entry #140 - GATE TRIBUNAL - Remediation Plan Audit
**Failure Mode**: HALLUCINATION

### What Failed

Remediation plan `plan-audit-remediation-v1.md` Phase 3 proposed a Razor contract table with fabricated file measurements. All 6 rows were labeled "Measured" but none were measured. 4 of 6 files exceed the 250-line Razor limit: PlanManager.ts (490), events.ts (353), types.ts (282), RoadmapViewProvider.ts (350).

### Why It Failed

The Governor drafted Razor values from memory or assumption rather than running `wc -l` against actual files. The plan then hedged with "Exact line counts to be confirmed by measurement at implementation time" -- deferring the same evidence gap that caused the original V4 violation.

### Pattern to Avoid

**Never write "Measured" in a Razor contract without having measured.** Run line counts, function-length analysis, and nesting-depth checks BEFORE populating the table. If files exceed limits, acknowledge them as exceptions or add a refactoring phase -- do not fabricate compliant values.

### Remediation Required

Re-measure all files. Acknowledge the 4 files exceeding 250 lines. Either grandfather them with a refactoring timeline or add a decomposition phase to the plan.

---

## Failure Entry #34

**Date**: 2026-03-05T14:22:00Z
**Verdict ID**: Entry #140 - GATE TRIBUNAL - Remediation Plan Audit
**Failure Mode**: COMPLEXITY_VIOLATION

### What Failed

V1 fix proposed a 3-build table (Antigravity, VSCode, Claude) but did not update the architecture decision text at line 29-31 which states "Claude Code is no longer a separate build." Phase D planned paths (lines 210-219) still propose `.claude/commands/` under Antigravity and VSCode, contradicting the proposed fix.

### Why It Failed

The Governor scoped the V1 fix narrowly to line 38 without checking whether the fix contradicts other sections of the same document. The architecture decision text and Phase D section were not read as part of the fix.

### Pattern to Avoid

**When correcting a claim in a blueprint, search the entire document for related claims.** A fix that makes one section truthful while leaving contradicting sections untouched creates a new violation of the same class.

### Remediation Required

Update architecture decision text (line 29-31) and Phase D section (lines 210-219) to be consistent with the V1 fix. All references to build identity and `.claude/commands/` placement must agree.

---

## Failure Entry #41

**Date**: 2026-03-06T03:30:00Z
**Verdict ID**: Entry #154 VETO
**Failure Mode**: COMPLEXITY_VIOLATION

### What Failed

Brainstorm.js decomposition plan claimed ~250 lines post-extraction but actual arithmetic shows ~370 lines remaining.

### Why It Failed

`renderShell()` (95 lines) and `renderRightPanel()` (70 lines) are large HTML template methods that weren't included in the extraction plan. The Governor counted the extracted code but didn't re-measure what was left behind.

### Pattern to Avoid

When planning file decomposition, always sum the remaining method line counts — don't subtract extracted lines from the total without accounting for import/boilerplate overhead and the actual sizes of remaining methods.

### Remediation Required

Extract HTML templates to `brainstorm-templates.js` or fold `renderRightPanel` into the `LlmStatusRenderer` module (since the right panel is predominantly LLM status content).

---

## Failure Entry #42

**Date**: 2026-03-07T12:00:00Z
**Verdict ID**: Entry #161 VETO
**Failure Mode**: GHOST_PATH

### What Failed

mergeNodes undo `forward` callback in Phase 2 of plan-brainstorm-production.md (line 423).

### Why It Failed

The `forward` closure was `() => { /* re-add */ }` — a placeholder comment. Redo after undoing a merge would silently produce no effect. The redo stack would consume the command, the canvas would re-render with unchanged data, and the user would have no indication that redo failed.

### Pattern to Avoid

Never use comment placeholders inside closures stored in a command stack. Every `forward`/`backward` pair must be complete and symmetric at plan time.

### Remediation Required

Implement the forward callback to re-add captured nodes and edges.

---

## Failure Entry #43

**Date**: 2026-03-07T12:00:00Z
**Verdict ID**: Entry #161 VETO
**Failure Mode**: RUNTIME_CRASH

### What Failed

B131 (IdeationBuffer overflow warning) changes `commit()` return type without handling the null path.

### Why It Failed

Return type changed from `thought | null` to `{ thought, dropped } | null`, but the `return null` path (empty text) was left unchanged. Caller destructures `const { thought, dropped } = commit()` — destructuring `null` throws TypeError.

### Pattern to Avoid

When changing a return type, audit ALL return paths and ALL callers. A return-type change is a contract change.

### Remediation Required

Either change `return null` to `return { thought: null, dropped: null }`, or add null guard before destructuring.

---

## Failure Entry #44

**Date**: 2026-03-07T12:00:00Z
**Verdict ID**: Entry #161 VETO
**Failure Mode**: NAMING_MISMATCH

### What Failed

B131 plan references `this._history` but source uses `this.history` (no underscore).

### Why It Failed

Plan author assumed private naming convention that doesn't exist in the source.

### Pattern to Avoid

Always verify property names against source before writing plan snippets.

### Remediation Required

Change `this._history` to `this.history` in B131 code block.

---

## Failure Entry #45

**Date**: 2026-03-08T00:45:00Z
**Verdict ID**: Entry #177 - GATE TRIBUNAL — v4.6.0 Remediated Plan
**Failure Mode**: COMPLEXITY_VIOLATION

### What Failed

stt-engine.js decomposition plan targets ~290L after extracting wake-word-listener.js and whisper-loader.js. Plan claims "All under 250L" but 290L > 250L Razor limit.

### Why It Failed

Insufficient extraction scope. Two sub-modules were extracted (110L total) but 400L - 110L = 290L still exceeds the 250L limit. The plan needed at least one more extraction target.

### Pattern to Avoid

When decomposing over-limit files, calculate the final line count explicitly and verify it meets the Razor BEFORE claiming compliance. Don't claim "all under limit" without doing the arithmetic.

### Remediation Required

Extract SilenceTimer (~50L) or LiveTranscriber (~45L) as a third sub-module.

---

## Failure Entry #46

**Date**: 2026-03-08T00:45:00Z
**Verdict ID**: Entry #177 - GATE TRIBUNAL — v4.6.0 Remediated Plan
**Failure Mode**: GHOST_PATH

### What Failed

B129 `_drawModalVisualizer()` method body was implemented in the plan, but no call-site wiring was specified. The modal canvas element exists in HTML but nothing connects the audio analyser to it.

### Why It Failed

The remediation addressed the ghost *function* (implementing the method body) but not the ghost *path* (the end-to-end wiring from analyser creation to canvas rendering). A method that exists but is never called is functionally equivalent to one that doesn't exist.

### Pattern to Avoid

When remediating ghost UI, trace the complete data flow from source to sink, not just the missing piece. A method without a call site is still a ghost path.

### Remediation Required

Wire `voice.onAnalyser` callback in `openModal()` to call `_drawModalVisualizer(canvas, analyser)` when modal is open.

---

## Failure Entry #47

**Date**: 2026-03-08T22:30:00Z
**Verdict ID**: Entry #194 - GATE TRIBUNAL - Data Architecture Remediation
**Failure Mode**: HALLUCINATION + LAYERING_VIOLATION + INCOMPLETE_MIGRATION

### What Failed

Data architecture remediation plan contained 4 violations across 4 phases:
1. Removed `recentVerdicts` property without updating `/api/v1/verdicts` HTTP endpoint
2. Created governance → roadmap reverse dependency for `CheckpointDb` type import
3. Assumed `IConfigProvider.get<T>()` method that doesn't exist on the interface
4. Referenced `SkillScaffolder` class from an unimplemented plan

### Why It Failed

Plans that modify shared state (removing a field, changing a type, refactoring an API) must trace ALL consumers, not just the primary ones. The Governor audited the hub snapshot path but missed the dedicated HTTP route and the downstream UI files. Similarly, proposing API calls against interfaces requires reading the interface first — not assuming it matches a generic pattern.

### Pattern to Avoid

**"Selective Consumer Tracing"**: When removing or renaming any field, grep for ALL references across the entire codebase — not just the known callers. A field used in 3 places likely has a 4th you haven't seen.

**"API Assumption"**: Never propose calling `interface.method()` without reading the interface definition. Generic patterns (`get<T>(key, default)`) feel natural but may not exist.

**"Cross-Layer Import Blindness"**: Before adding an import, check whether the importing module's directory has ANY existing imports from the target. If not, you're introducing a new architectural dependency.

### Remediation Required

1. Update `/api/v1/verdicts` endpoint to use `getRecentVerdicts()` accessor
2. Move `CheckpointDb` type to shared layer
3. Replace `configProvider.get()` with `configProvider.getConfig().property`
4. Add explicit prerequisite for SkillScaffolder or inline the implementation

---

## Failure Entry #48

**Date**: 2026-03-08T23:15:00Z
**Verdict ID**: Entry #195 - GATE TRIBUNAL (RE-AUDIT) - Data Architecture Remediation v2
**Failure Mode**: BOOTSTRAP_ORDER

### What Failed

Phase 2 proposed passing `ledgerManager.getDatabase()` to `RBACManager` constructor in `bootstrapGovernance.ts`, but `ledgerManager` is not created until `bootstrapQoreLogic` which runs AFTER governance bootstrap.

### Why It Failed

The Governor assumed `ledgerManager` was available in the governance bootstrap function without verifying the bootstrap chain order. The main.ts bootstrap sequence is: Core(1) → Governance(2) → QoreLogic(3). `LedgerManager` is created at step 3; `RBACManager` is constructed at step 2.

### Pattern to Avoid

**"Assuming Dependency Availability"**: Before proposing constructor injection, verify that the dependency exists at the call site's execution time. For multi-phase bootstrap systems, check the initialization order — a dependency created in phase N is NOT available in phase N-1.

**Corollary**: When an existing codebase uses deferred setters (`setLedgerManager()`, `setPlanManager()`) for cross-phase wiring, new services in earlier phases MUST use the same pattern.

### Remediation Required

Construct `RBACManager` with `null` DB. Add `setDatabase()` deferred setter. Wire in `main.ts` after `bootstrapQoreLogic` completes, matching the pattern at `main.ts:84-87`.

---

## Failure Entry #198

**Date**: 2026-03-09T02:30:00Z
**Verdict ID**: Entry #198
**Failure Mode**: HALLUCINATED_API / TYPE_SYSTEM_BYPASS / INCOMPLETE_SPECIFICATION

### What Failed

plan-governance-state-integrity.md — Trust Cache event-driven invalidation and timestamp honesty

### Why It Failed

Three distinct failure patterns:

1. **Hallucinated API**: Plan referenced `this.isDbAvailable()` on TrustEngine — method doesn't exist. TrustEngine uses `this.db` null check or `this.ledgerManager.isAvailable()`.

2. **Type system bypass**: Plan prescribed `as never` casts to subscribe to 3 event types that don't exist in `FailSafeEventType`. Instead of extending the type union in `shared/types/events.ts`, the plan bypassed TypeScript safety entirely.

3. **Conditional specification**: Plan said "Verify event emissions exist... If not, add" for 3 mutation methods. Grep confirmed none of these events are emitted. The plan must specify exact code, not defer decisions to the implementer.

4. **Missing affected files**: `shared/types/events.ts` (new event types), `shared/types/trust.ts` (`updatedAt` field), and `AgentRow` type (missing `updated_at`) were all required but not listed.

5. **Section 4 violation**: TrustEngine.ts at 450 lines already exceeds the 250-line limit. Plan adds ~20 more lines without proposing a split.

### Pattern to Avoid

**"Verify and Add If Needed"**: Plans must NEVER defer specification decisions. If a feature requires code that may or may not exist, the planner must verify BEFORE writing the plan and include definitive changes. Conditional instructions create implementation ambiguity.

**"Cast Away Type Errors"**: When TypeScript rejects an event name, the fix is extending the type union — never casting to `never` or `any`. Type system errors are signals, not obstacles.

**"Close Enough API Names"**: Always verify exact method signatures against source code. `isDbAvailable()` vs `isAvailable()` vs `this.db !== null` are all different patterns with different semantics.

### Remediation Required

1. Verify all referenced APIs against actual source before writing plan
2. List ALL files that need modification, including type definition files
3. Specify exact code for all changes — no conditional "check and maybe fix"
4. Propose TrustEngine split to address pre-existing 450-line violation
5. Extend `FailSafeEventType` instead of using type casts

---

## Failure Entry #199

**Date**: 2026-03-09T03:15:00Z
**Verdict ID**: Entry #199
**Failure Mode**: INCORRECT_LINE_COUNT / INCONSISTENT_SPECIFICATION

### What Failed

plan-governance-state-integrity.md v2 — TrustEngine extraction line count and withOptimisticRetry specification

### Why It Failed

1. **Incorrect arithmetic**: Plan claimed TrustEngine.ts drops to "~240 lines" after TrustPersistence extraction. Actual calculation: 449 - 117 (extracted) - 19 (initialize compression) + 29 (additions) = ~342 lines. The discrepancy is ~100 lines. TrustEngine.ts would remain 92 lines over the 250-line Section 4 limit.

2. **Specification gap**: Phase 1 affected files description lists `withOptimisticRetry` as extracted to TrustPersistence.ts, but the TrustPersistence.ts code block does not include it. If extracted, the function requires `optimisticLockConfig` passed as a parameter (currently a private field on TrustEngine), which was not specified.

### Pattern to Avoid

**"Eyeball Line Counting"**: Never estimate post-refactoring line counts without enumerating what stays vs what goes. Count removed blocks precisely (include surrounding blanks), count additions precisely (imports, new methods, signature changes), then subtract.

**"Description-Code Divergence"**: If the affected files description says X is extracted, the code block MUST include X. Affected files and code blocks are a contract — they must agree.

### Remediation Required

1. Perform precise line arithmetic before claiming compliance
2. Extract additional code to reach 250-line compliance — candidates: `TrustCalculator` (determineStage, isProbationary, calculateInfluenceWeight, config = ~55 lines) and/or `registerAgent` (~43 lines, fundamentally a persistence operation)
3. Include `withOptimisticRetry` in TrustPersistence.ts code block with explicit `optimisticLockConfig` parameter, or remove from affected files list

---

## Failure Entry #11

**Date**: 2026-03-09T21:45:00Z
**Verdict ID**: Entry #205
**Failure Mode**: COMPLEXITY_VIOLATION / ORPHAN / COMPILE_ERROR / MISSING_TESTS / LOGIC_ERROR

### What Failed

plan-proprietary-skills-v1.md implementation by GLM 4.7 — ModelAdapter.ts (329 lines), SkillShipping.ts (350 lines), WorkspaceMigration.ts modifications (352 lines total), bundle.cjs modifications (72-line function, 4-level nesting).

### Why It Failed

1. **Section 4 violations**: All three TypeScript files exceed the 250-line limit. The bundle.cjs function exceeds the 40-line limit with 4-level nesting.
2. **Orphaned modules**: ModelAdapter.ts and SkillShipping.ts are not imported by any module in the codebase. They compile but are never loaded at runtime. The plan specified SkillDiscovery.ts integration, but this was not implemented.
3. **Compile error**: WorkspaceMigration.ts calls `this.scaffoldBundledSkills()` in a static context producing TS2339.
4. **Zero tests**: Plan specified 4 test files; none were created.
5. **Logic errors**: `extractSkillContent()` has two branches that return identical output (dead code). `scaffoldBundledSkillsToWorkspace()` calculates hashes then unconditionally skips regardless of result.
6. **Code duplication**: `collectAllMarkdownFiles()`, `calculateFileHash()`, and `matchesPattern()` are duplicated across multiple files with no shared utility module.

### Pattern to Avoid

**"Ship Without Wiring"**: Creating service modules without connecting them to the entry point or any activation path. A module that compiles but has no import chain from the entry point is dead code — it cannot execute.

**"Copy-Paste Utilities"**: When multiple files need the same function (file hashing, glob matching, markdown collection), extract to a shared utility immediately. Do not duplicate across 3+ files with independent maintenance.

**"Branch-Identical Conditionals"**: If an `if/else` produces the same result for both branches, the conditional is meaningless. Remove the dead branch or implement distinct behavior.

### Remediation Required

1. Extract shared utilities into `SkillFileUtils.ts`
2. Wire ModelAdapter and SkillShipping into SkillDiscovery or another activation-path module
3. Fix compile error in WorkspaceMigration.ts
4. Split all files to comply with 250-line limit
5. Create all 4 specified unit test files
6. Fix logic errors in extractSkillContent() and scaffoldBundledSkillsToWorkspace()
7. Remove debug artifacts (console.log/error) from production code

---

## Failure Entry #214

**Date**: 2026-03-10T01:15:00Z
**Verdict ID**: Entry #214 - GATE TRIBUNAL - Skill Consolidation Plan v2
**Failure Mode**: COMPLECTING / COVERAGE_GAP

### What Failed

plan-skill-consolidation-v2.md — Remediation of Entry #212 VETO. Fixed all 3 original violations but introduced 2 new ones.

### Why It Failed

1. **AGENT_SCAFFOLD_COLLISION**: The plan bundles agents (`agents/ql-*.md`) and skills (`skills/ql-*/SKILL.md`) into the same VSIX directory (`dist/extension/skills/`). The scaffolding code uses `path.basename(path.dirname(sourcePath))` to extract skill names. For agent files under `agents/`, ALL files produce `skillName="agents"` — a collision. Only 1 of 7 agent definitions is scaffolded; 6 are silently dropped. The surviving agent is placed at `.claude/skills/agents/SKILL.md` (a skill path) instead of `.claude/agents/ql-governor.md` (the correct agent path). Root cause: agents and skills are complected into a single bundling/scaffolding pipeline that assumes directory-based SKILL.md format for all entries.

2. **COVERAGE_GAP**: `FailSafe/Claude/` contains 20 duplicate files in identical Genesis/Qorelogic structure (parallel to `FailSafe/Antigravity/` but for Claude Code). The plan restructures Antigravity (Phase 2) and migrates `.claude/commands/` (Phase 1) but never mentions `FailSafe/Claude/` in any phase, affected files list, or open question. This leaves a 5th copy of the SHIELD skills untouched in a plan whose stated goal is "source ALL cumulative knowledge, de-duplicate."

### Pattern to Avoid

**"Complected Pipelines"**: When two artifact types (skills and agents) have different output formats, destinations, and naming conventions, do NOT process them through a single pipeline. Bundling agents into a skill directory and then extracting names with skill-specific logic produces collisions. Keep separate concerns in separate pipes — or add explicit routing/dispatch at the junction point.

**"Inventory Before Planning"**: Before claiming comprehensive coverage, enumerate EVERY source location and verify each is addressed. The research brief counted "4 copies" but missed `FailSafe/Claude/` as a 5th copy. The plan inherited this gap. Run `find . -name "ql-*.md"` (or equivalent) to get ground truth before writing phases.

### Remediation Required

1. Separate agent bundling from skill scaffolding — either bundle to different VSIX subdirectory (`dist/extension/agents/`), add routing logic to detect agents, or remove agents from VSIX bundling entirely (Claude Code loads `.claude/agents/` natively)
2. Add `FailSafe/Claude/` to Phase 2 (alongside Antigravity restructure) or to Open Question #3 (alongside PROD-Extension/_STAGING_OLD for user-authorized deletion)

---

## Failure Entry #212

**Date**: 2026-03-10T00:30:00Z
**Verdict ID**: Entry #212 - GATE TRIBUNAL - Skill Consolidation Plan
**Failure Mode**: STALE_REFERENCE / PHASE_DEPENDENCY / NAMING_COLLISION

### What Failed

plan-skill-consolidation-v1.md — Cross-Agent Skill Consolidation (3-phase plan to migrate 200+ skill files to modern SDK conventions)

### Why It Failed

1. **CLAUDE.md stale reference**: The plan deletes `.claude/commands/` and `.claude/commands/agents/` in Phase 1 but never updates `CLAUDE.md` (the root instruction file Claude Code reads on every session). Line 2 says "Follow the rules in .claude/commands/agents/ and .claude/commands/" — both paths would be deleted, misdirecting Claude Code to non-existent locations.

2. **Phase ordering dependency**: Phase 2 updates `bundle.cjs` patterns to reference `skills/ql-*/SKILL.md` in Antigravity, but the Antigravity directory restructure from flat files to SKILL.md directories doesn't happen until Phase 3. Phase 2 would break bundling.

3. **Scaffolding naming collision**: Phase 3 proposes `path.basename(sourcePath, ".md")` to derive skill names from bundled SKILL.md files. But `path.basename("ql-audit/SKILL.md", ".md")` returns `"SKILL"` for every file — all 17 skills would scaffold to `.claude/skills/SKILL/SKILL.md`, colliding into one file.

### Pattern to Avoid

**"Root Instruction Amnesia"**: When migrating file structures, always check whether root-level instruction files (CLAUDE.md, AGENTS.md, .cursorrules) reference the paths being moved or deleted. These files are loaded first and steer all subsequent agent behavior.

**"Cross-Phase Assumptions"**: When splitting work into phases, verify that each phase is self-contained. If Phase N references artifacts created in Phase N+1, either re-order or add the dependency explicitly.

**"Filename vs Directory Name"**: When switching from flat-file format (`skill-name.md`) to directory-based format (`skill-name/SKILL.md`), all code that derives names from filenames must be updated to derive from directory names instead. `path.basename` on a uniform filename produces uniform output — a collision.

### Remediation Required

1. Add CLAUDE.md path update to Phase 1 affected files list
2. Move bundle.cjs update to Phase 3 (after Antigravity restructure) or move Antigravity restructure to Phase 2
3. Replace `path.basename(sourcePath, ".md")` with `path.basename(path.dirname(sourcePath))` in scaffolding code


---

## Failure Entry #54

**Date**: 2026-03-14T15:30:00Z
**Verdict ID**: Entry #224 — GATE TRIBUNAL — B158-B160 CC Consolidation
**Failure Mode**: HALLUCINATION / GHOST_PATH / FACTUAL_ERROR

### What Failed

Plan for Command Center tab consolidation (plan-cc-consolidation-audit-skills.md) — Phase 2 references three renderer modules (`TimelineRenderer`, `ReplayRenderer`, `GenomeRenderer`) that do not exist in the codebase. Plan claims "11 → 5 tabs" but the actual Command Center has 8 tabs.

### Why It Failed

The planner hallucinated future/planned components (Timeline, Replay, Genome from B146-B149 Agent Run Replay plan) as if they already existed. These were planned in a prior session but never implemented. The tab count "11" was fabricated — no prior version had 11 tabs.

### Pattern to Avoid

**"Hallucinated Components"**: When planning consolidation or refactoring, ALWAYS glob the actual source files to verify what exists. Never reference components from other plans as if they are implemented unless verified by file existence check.

### Remediation Required

1. Correct tab count from "11 → 5" to "8 → 5"
2. Replace hallucinated Agents group (Timeline+Replay+Genome) with actual renderer (Operations)
3. Remove ConsoleServer.ts from affected files or add concrete changes

---

## Failure Entry #55

**Date**: 2026-03-14T19:00:00Z
**Verdict ID**: Entry #228 - GATE TRIBUNAL - Codex Post-Hoc Audit
**Failure Mode**: COMPLEXITY_VIOLATION

### What Failed

Codex CLI session added ~83 lines to `governance.js` (renderIntegrityCard, renderUnattributedCard, derivePolicies) without checking file size against Section 4 Razor limits.

### Why It Failed

`governance.js` went from ~194 to 277 lines, exceeding the 250-line limit. External AI agents operating outside S.H.I.E.L.D. governance do not enforce Section 4 Razor constraints.

### Pattern to Avoid

When accepting changes from ungovern agents (Codex, Copilot, etc.), always post-hoc audit against Section 4 Razor before merging. File size limits are not self-enforcing — they require explicit checks.

### Remediation Required

1. Extract integrity/unattributed rendering into a separate module (e.g., `integrity.js`)
2. Bring `governance.js` back under 250 lines

---

## Failure Entry #56

**Date**: 2026-03-16T21:30:00Z
**Verdict ID**: Entry #236 - GATE TRIBUNAL - SRE Panel Amended v2
**Failure Mode**: COMPLEXITY_VIOLATION

### What Failed

`buildSreConnectedHtml()` in `SreTemplate.ts` — nested ternary for `sliStatus` (`A ? B : C ? D : E`).

### Why It Failed

Three-way conditional (true / false / null) expressed as a ternary chain. Razor enforces zero nested ternaries — a three-outcome condition requires `if/else if/else`.

### Pattern to Avoid

When a variable has three possible meaningful states (true / false / null/undefined), resist expressing the discrimination as a chained ternary. Use `if/else if/else` or a lookup map.

### Remediation Required

Replace `const sliStatus = A ? B : C ? D : E` with explicit `if/else if/else` block.

---

## Failure Entry #57

**Date**: 2026-03-16T21:30:00Z
**Verdict ID**: Entry #236 - GATE TRIBUNAL - SRE Panel Amended v2
**Failure Mode**: GHOST_PATH

### What Failed

`FailSafeSidebarProvider.ts:131` — `vscode.setState({ initDone: true })` full state overwrite silently destroys `sreMode` when the user clicks Initialize.

### Why It Failed

Two separate code paths write to `vscode.setState` without coordinating: the new `switchView()` (correctly spreads state) and the existing `initBtn` handler (blindly overwrites). The plan introduced new state keys without auditing all existing state writes.

### Pattern to Avoid

When adding a new key to `vscode.getState()` / `vscode.setState()`, audit ALL existing calls to `vscode.setState()` in the file and update them to spread state: `vscode.setState({ ...vscode.getState(), newKey: value })`.

### Remediation Required

Update `initBtn` handler at line 131: `vscode.setState({ initDone: true })` → `vscode.setState({ ...vscode.getState(), initDone: true })`.

---

## Failure Entry #17

**Date**: 2026-03-17T21:00:00Z
**Verdict ID**: VETO (Entry #251)
**Failure Mode**: GHOST_PATH

### What Failed

v4.9.8 plan Phase 2 (sentinel-monitor extraction) references methods by incorrect names.

### Why It Failed

Plan author used approximate/remembered method names instead of verifying against source. `renderSentinelStatus()` was written instead of `renderSentinel()`. `showMetricHelp()` was written instead of `showMetricExplanation()` + `getMetricExplanations()`. Line ranges were also inaccurate (520-545 vs actual 509-610).

### Pattern to Avoid

When writing extraction plans that reference specific methods by name, always verify method names and line numbers against the actual source file. Do not rely on memory or approximate names. Use `grep` or search to confirm before committing to the plan.

### Remediation Required

Amend plan Phase 2 extraction list with correct method names: `renderSentinel()`, `showMetricExplanation()`, `getMetricExplanations()`. Update line references accordingly.

---

## VETO — 2026-05-05: v5.0.0 Round 2 Install UX (plan vs current code drift)

**Plan**: `.failsafe/governance/plans/plan-v5-round2-install-ux.md`
**Audit**: `.agent/staging/AUDIT_REPORT.md` (Entry #262)
**Categories**: `infrastructure-mismatch`, `macro-architecture`, `specification-drift`

### What Failed

Plan introduces a parallel install-report type system (`QorLogicInstallReport` with `invocations`) that diverges from the existing `InstallReport` shape used at `installSkillsHandler.ts:22-34`, and changes `createInstallSkillsHandler`'s arity by adding `context: vscode.ExtensionContext` and `mode: InstallMode` parameters — without enumerating the cascading edits required at the existing `bootstrapServers.ts:92` call-site, the `ConsoleServer.setScaffoldCallback` type contract at `ConsoleServer.ts:746` (which expects `Promise<{scaffolded, skipped, error?}>` — fields the new report shape drops), the `InstallStepId` enum migration (`'resolve-python'` vs plan's `'python-probe'`; host-encoded id vs separate field), and a webview→ConsoleServer "Show Output" message route whose message-type identifier and `OutputChannel`-access wiring are unspecified.

### Why It Failed

The plan was authored 2026-04-27 against a snapshot of `installSkillsHandler.ts` and `ConsoleServer.ts`, but did not perform pre-write source verification of the back-compat surfaces it touches. Specifically:

1. The `InstallReport` back-compat fields exist precisely *because* `setScaffoldCallback` is load-bearing — the comment "Back-compat fields for the Console scaffold callback shape" at line 30 announces the constraint, but the plan did not cite or honor it.
2. The plan asserts a Phase-1 step-emission ordering only in test bodies, never in the implementation prose. An implementer following the plan literally cannot derive emit ordering without reading test fixtures, which inverts the normal direction (impl declares behavior, tests verify it).
3. The plan's "Plan A Phase 3 wiring" reference is partially stale: Plan A wired `onComplete` to receive `InstallReport`, and the plan implicitly retypes that call without enumerating consumer-side migration in `settings.js` or broadcast-event listeners.

### Pattern to Avoid

**SG-PlanTypeMigrationUnderspecification**: When a plan introduces a new type or alters a function signature that ripples through cross-module contracts, the plan body must (a) declare the migration strategy for each existing consumer of the old type/signature explicitly in the Affected Surfaces list, (b) cite the source-line evidence of any back-compat field or invariant being preserved or replaced, and (c) anchor sequencing or ordering claims in the implementation prose, not only in test fixtures. Tests that assert ordering against a body that never declares it are presence-of-spec inversions and should be flagged at the Plan-text level before /qor-audit issues PASS.

This pattern compounds with **SG-InfrastructureMismatch**: plans that name infrastructure (`outputChannel`, `setScaffoldCallback`, `Plan A Phase 3 wiring`) without grep-verifying current ownership and wiring direction will silently presume access that does not exist at the implementer's hand.

### Remediation Required

Amend `plan-v5-round2-install-ux.md` per the five-item list in `.agent/staging/AUDIT_REPORT.md` §"Required Remediation":
1. Resolve report-type duality (rename or coexist + bridge).
2. Enumerate all `createInstallSkillsHandler` call-site migrations.
3. Declare `InstallStepId` enum migration explicitly.
4. Specify "Show Output" message contract and `OutputChannel` wiring.
5. Anchor Phase-1 step-emission ordering in implementation prose.

Re-run `/qor-audit` after amendments. No retry-with-waiver path.

---

## VETO — 2026-05-05: v5.0.0 Round 2 Install UX v2 (Razor overage on orchestrator closure)

**Plan**: `.failsafe/governance/plans/plan-v5-round2-install-ux-v2.md`
**Audit**: `.agent/staging/AUDIT_REPORT.md` (Entry #263)
**Categories**: `razor-overage`

### What Failed

Phase 1's "Handler restructure" section declares `createInstallSkillsHandler`'s returned async closure at ~55 lines, orchestrating the full 5-phase + N-host install sequence in one body. The Section 4 Razor function-line limit is 40.

### Why It Failed

The plan author (this skill, in dialogue with the operator) baked five distinct phase orchestrations (probe, pip, per-host loop, provenance, refresh) into a single closure during the first draft. This was a Razor-style omission, not a design defect — the design is sound, but the function-shape commitment overshoots. Notably: the audit verified every other amendment from Entry #262 cleanly. Single isolated finding.

### Pattern to Avoid

**SG-OrchestratorMonolith**: When a plan declares a multi-step orchestration as a single function body, count the steps explicitly during plan authoring. If the step count × per-step-line-budget (typically 8-15 lines/step including error branches) exceeds 40 lines, split into named per-step helpers BEFORE plan finalization. The split is mechanical (one helper per phase) and yields tests that anchor to specific helper outputs rather than orchestrator-end-state assertions only.

This pattern compounds with **SG-DialogueDraftBlindness**: in collaborative-dialogue plan authoring, the Razor estimate is often pencilled in as "~N lines" without per-step accounting. A self-check pass — "for each named step in this orchestrator, what is its line budget?" — should be a final gate before writing the plan file.

### Remediation Required

Amend Phase 1 §"Handler restructure" to declare:

```ts
async function runProbeStep(resolver: PythonInterpreterResolver): Promise<QorLogicInstallInvocation>;
async function runPipStep(installer: QorLogicPackageInstaller): Promise<QorLogicInstallInvocation>;
async function runHostInstallStep(ingestor: QorLogicSkillIngestor, host: QorLogicHost, scope: 'repo' | 'global'): Promise<QorLogicInstallInvocation>;
async function runProvenanceStep(workspaceRoot: string): Promise<QorLogicInstallInvocation>;
async function runRefreshStep(): Promise<QorLogicInstallInvocation>;
```

The `createInstallSkillsHandler` closure becomes a ~25-line sequencer calling each helper with short-circuit checks on probe/pip errors. Re-run `/qor-audit` after amendment.

---

## VETO — 2026-05-06: v4.10.1 Pre-v5 Cleanup v1 (5 specification-drift / dependency placeholder findings)

**Plan**: `.failsafe/governance/plans/plan-v4.10.1-pre-v5-cleanup.md`
**Audit**: `.failsafe/governance/AUDIT_REPORT.md` (Entry #267)
**Categories**: `specification-drift` (×4), `dependency-unjustified` (×1)

### What Failed

Five plan-text gaps:

1. Voice-controller's new "unified status emit" referenced by name but its API (method, multiplicity, state-precedence rule, signal-translation map) never specified. A single-slot variant would replicate the same B129 bug being fixed elsewhere in the same plan.
2. Voice-catalog source-of-truth declared simultaneously OPEN (in Open Questions Q1) and RESOLVED (in B127 step 7 hardcoded 12-language map).
3. `'en-US'` final fallback removal in stt-engine.js with no replacement contract; `live-transcriber.js` told to "trust caller for non-null" but caller (stt-engine) lost its non-null guarantor.
4. Whisper model-swap semantics flagged as Open Q2 ("confirmed acceptable in dialogue") but absent from B127 implementation steps. Settings-driven control, no specified side effect.
5. `piper-tts-web` declared as `"^<latest>"` — `<latest>` is a placeholder, not a published version.

### Why It Failed

This plan was authored after a long collaborative dialogue (Q1 through Q14) covering substantial design surface (voice substrate, brainstorm UX, decomposition, three new Settings sections, severity-tiered toasts, configurable history, language auto-match, model picker, voice-catalog mapping, vendor strategy, etc.). The dialogue was exhaustive on user-facing decisions and architectural shape — but several **cross-module contracts** (controller→badge state subscription, store→engine swap reactivity, fallback chain ownership) were resolved verbally in the dialogue and never re-rendered into the plan's implementation steps.

The Open Questions block was used as a parking lot for "decided in dialogue but flagged for visibility" — but the plan also wrote authoritative-sounding implementation steps for the same items, producing the contradiction in Findings 2 and 4.

### Pattern to Avoid

**SG-DialogueResidueUnrendered**: When a long collaborative-dialogue plan-authoring session resolves cross-module contracts verbally, those resolutions must be re-rendered as concrete implementation steps in the plan — not parked in Open Questions, not implied by other steps, not assumed-from-context. The plan file is the contract; the dialogue is its draft, not its addendum.

A self-check pass before writing the plan file:

1. List every cross-module API the plan introduces (e.g., `controller.addStateListener`, `controller.setLanguage`, `service.fetchSnapshot`).
2. For each: where is its signature declared in the plan? If "implied by step X" or "covered in dialogue", upgrade to an explicit step with method name, parameter types, return type, multiplicity (single-slot vs. multi-subscriber), and lifecycle (when called, when invalidated).
3. List every Open Question. For each: does any implementation step contradict its "open" status? If yes, resolve the contradiction in one direction.
4. For every dependency added, every cited version is concrete (no `<latest>`, no `<version>`, no placeholder tokens).

This pattern compounds with **SG-OrchestratorMonolith** (Entry #263): both stem from collaborative-dialogue authoring where the plan-file render lags the conversation's resolution depth. The mitigation is a structural plan-render pass after the dialogue, walking the Affected Files list against the dialogue transcript to surface unrendered contracts.

### Remediation Required

Amend `plan-v4.10.1-pre-v5-cleanup.md` per the 5 specific items in `.failsafe/governance/AUDIT_REPORT.md` §"Required Next Action":

1. Add explicit `voice-controller` state-emission API: method name, multi-subscriber `addStateListener(fn)` mirroring B129's analyser cache-and-replay pattern, precedence rule (most-recent-active-wins), and the signal-translation table mapping engine outputs (`'downloading'`, `'loading'`, `'ready'`, `'speaking'`, `'idle'`, `'error'`, auto-stop, wake-word) to badge states (`idle | stt-loading | stt-listening | tts-speaking | error:<reason>`).
2. Remove Q1 from Open Questions; the bundled-static-map decision in B127 step 7 stands.
3. Specify the non-null language guarantee — recommend keeping a single `'en-US'` (or a `DEFAULT_STT_LANGUAGE` constant) fallback in stt-engine.js as the contract source.
4. Add explicit Whisper-model-swap step under B127: store-subscription / settings-route handler triggers pipeline teardown; in-flight audio dropped; force-reload on next mic press; corresponding test in `stt-engine-multilingual.test.ts`.
5. Replace `^<latest>` with a concrete pinned version (operator runs `npm view piper-tts-web` outside skill); document re-vendor policy.

Re-run `/qor-audit` after amendments. Expected outcome: PASS.

---

## VETO — 2026-05-06: v4.10.1 Pre-v5 Cleanup v3 (B132 truncation feature data-flow gaps)

**Plan**: `.failsafe/governance/plans/plan-v4.10.1-pre-v5-cleanup-v3.md`
**Audit**: `.failsafe/governance/AUDIT_REPORT.md` (Entry #269)
**Categories**: `specification-drift` (×2), `infrastructure-mismatch` (×1)

### What Failed

The v3 plan correctly addressed all 4 v2 findings (extraction modules for at-cap files, swapWhisperModel API enumeration). But three plan-text gaps in the B132 server-side-truncation-transparency feature surfaced:

1. **Route-side pre-truncation** at `BrainstormRoute.ts:91-93` and `TransparencyRiskRoute.ts:36,39` truncates the label BEFORE invoking the service. Plan declares `BrainstormService.addNode` returns `{truncated, originalLength}` but the service can never see over-length input from the HTTP path, so the warning surface silently never fires.

2. **Truncation marker render path** says "in onEvent/node-update path" but `onEvent` processes WebSocket events whose payload (`{nodes, edges}`) carries no `warnings`. Warnings only flow via HTTP response. Data flow from server detection to client marker render not traced.

3. **`showStatusGated` parameter mismatch** — function defined with 5 params (`severity, text, color, showStatusFn, store`); called with 4 args in `brainstorm-export.js` (omits `store`). Severity gating silently bypasses at this call site.

### Why It Failed

The v1→v2→v3 SG-DialogueResidueUnrendered countermeasure pass caught earlier-iteration glue gaps (controller↔badge state API in v1, file-size budgets and swapWhisperModel in v2). But the v3 pass focused on the gaps the v2 audit flagged — extractions, model swap, file budgets — and didn't extend the same scrutiny to the B132 truncation feature glue, which had been carried forward from v1 unchanged.

The B132 feature's data flow involves three coupling surfaces:
- Route ↔ Service (truncation responsibility)
- HTTP response ↔ WebSocket broadcast (warning propagation)
- Caller ↔ notifications module (parameter threading for severity gating)

None of these were verified end-to-end against existing code shape during plan-render. The plan's data-flow claims read as plausible-sounding sentences ("service returns truncated flag", "client reads warnings in onEvent path") but each contradicts the actual route+service+websocket+module shapes.

### Pattern to Avoid

**SG-DataFlowTracingGap**: When a plan introduces a new data flow (e.g., server detects condition → broadcasts/responds → client reacts), the plan-render must trace EACH step end-to-end against existing code:

1. Where is the data first observed? (Specific file, specific line, specific function.)
2. What is the existing shape of the surface that carries it forward? (HTTP response body schema, WebSocket payload shape, function parameter list.)
3. Does the existing surface support the data being added, or does it require schema/shape changes?
4. Where is the data ultimately consumed? (Specific render path, specific DOM mutation, specific UI surface.)
5. For every intermediate hop: does the plan specify either "no change" (with verification that no change is required) or an explicit shape amendment?

The plan-render checklist (mechanical):

```
For each new data field (e.g., "warnings"):
  Origin: <file>:<line>      // where value is computed
  Carrier 1: <surface>       // existing shape; is amendment needed?
  Carrier 2: <surface>       // ditto
  Sink: <file>:<line>        // where value is consumed
  ∀ Carriers: existing shape supports field? Y/N
    if N → plan must include explicit shape amendment step
```

This pattern compounds with **SG-DialogueResidueUnrendered** (#267) and **SG-AtCapAdditionBlindness** (#268): all three are post-dialogue plan-render gaps where the dialogue's design depth outruns the plan-render's structural accounting. Each iteration's countermeasure pass extended the structural-accounting scope:

- v1→v2: catch missing API contracts (signature, multiplicity)
- v2→v3: catch missing file-size budgets (`wc -l` table)
- v3→v4: catch missing data-flow tracings (this pattern)

The cumulative discipline is: render-time structural verification covers every cross-module artifact (API surface, file size, data flow) AGAINST the existing codebase shape, not just internal consistency.

### Remediation Required

Amend to v4:

1. **Finding 1 fix**: Add steps to remove route-side pre-truncation in `BrainstormRoute.ts:91-93` and `TransparencyRiskRoute.ts:36, 39`; service owns truncation; service returns `{node, truncated, originalLength}`; route translates to `warnings` array. Update test description to assert on round-trip.

2. **Finding 2 fix**: Pick a single data-flow path. Recommend amending WebSocket broadcast payload to include per-node `truncated` flag; `onEvent` reads it; sets `data-truncated`. Update §B132 step 4 + Phase 1 affected files (BrainstormRoute.ts must explicitly amend broadcast payload, not just response shape) + test description.

3. **Finding 3 fix**: Update `exportBrainstormJSON(showStatusFn, store)` signature; call site passes `store`. Verify all `showStatusGated` calls in the plan have consistent arity.

4. **Add a Data-Flow Tracing table** to v4 plan top-matter (per SG-DataFlowTracingGap countermeasure):

| Field | Origin | Carrier 1 | Carrier 2 | Sink | Shape OK? |
|---|---|---|---|---|---|
| `warnings` | service.addNode | HTTP response `{node, warnings}` | (terminal) | brainstorm.js toast | YES (after amend) |
| `truncated` (per-node) | service.addNode | HTTP response | WebSocket `brainstorm.update` payload | brainstorm-graph.js onEvent | YES (after amend) |

Re-run `/qor-audit` after amendments. Expected outcome: PASS.

---

## VETO — 2026-05-06: v4.10.1 Pre-v5 Cleanup v2 (Razor overage on three at-cap files)

**Plan**: `.failsafe/governance/plans/plan-v4.10.1-pre-v5-cleanup-v2.md`
**Audit**: `.failsafe/governance/AUDIT_REPORT.md` (Entry #268)
**Categories**: `razor-overage` (×3), `specification-drift` (×1)

### What Failed

The v2 plan correctly addressed all 5 v1 findings (state-emission API, voice-catalog Q1, en-US fallback, model-swap behavior, `^<latest>` placeholder). But the plan added substantive functionality to three files already at or near the 250-line razor cap WITHOUT specifying any extraction or trimming:

- `stt-engine.js` (248L) + ~22L additions → estimated 270L
- `prep-bay.js` (248L) + ~5-8L additions → estimated 253-256L
- `brainstorm-graph.js` (231L) + ~25L additions → estimated 256L

Plus a residue from the v1 Finding 4 fix: `controller.swapWhisperModel` is the actual mechanism for model-swap (since `StateStore` has no `subscribe` method per `state.js`), but the v2 §step 9 code block presents `store.subscribe?.` as primary and names `swapWhisperModel` only in a parenthetical fallback. The method isn't enumerated in §step 8's public API list.

### Why It Failed

**Razor-overage**: The Governor's v2 dialogue focused on resolving the v1 findings about API surface, fallback contracts, and version pinning — all real and important. The dialogue did not include a file-size accounting pass against the razor caps. Three of the files involved happened to be sitting AT or near the cap pre-existing-condition. The v1 audit (Entry #267) noted this risk in passing for ConsoleServer.ts (acknowledging the pre-existing 5.5× overage as out-of-scope) but did not call out the at-cap files in the Brainstorm UX surface — those quietly absorbed the additions and broke the cap.

**SwapWhisperModel API gap**: The v1 Finding 4 fix added `store.subscribe?.` as the primary mechanism with a fallback sentence. This is graceful-fallback coding, but it conflates "what the plan presents as primary" with "what the codebase actually supports". The fallback IS the mechanism on this codebase; presenting it as a fallback creates the perception that subscribe is the contract when subscribe doesn't exist.

### Pattern to Avoid

**SG-AtCapAdditionBlindness**: When a plan declares additions to a file already within 10 lines of the razor cap, the plan must either (a) include an explicit extraction step that pulls existing code out to a sibling helper module, restoring headroom for the additions; or (b) include an explicit trimming step naming the lines or methods being removed; or (c) explicitly waive the cap with rationale (rarely valid). The plan-render step must include a file-size budget table:

| File | Current LoC | Cap | Plan adds | Net | Status |
|---|---|---|---|---|---|
| (file) | (current) | 250 | (delta) | (current+delta) | OK / VETO-target |

This table is mechanical to produce (`wc -l` per affected file + a per-step LoC estimate) and would have caught all three v2 razor findings before the plan was finalized.

This pattern compounds with **SG-DialogueResidueUnrendered** (Entry #267) and **SG-OrchestratorMonolith** (Entry #263): all three are post-dialogue plan-render gaps where the dialogue's design depth outruns the plan-render's structural accounting. The mitigation is a structural "render-time razor budget" pass — not just listing affected files, but tabulating their size budgets.

**SG-DeadCodePrimaryPath**: When a plan presents a code mechanism as primary that isn't supported by the existing codebase (e.g., `store.subscribe?.` when StateStore has no subscribe), even with a graceful-fallback sentence, the plan reads as if the primary mechanism is the contract. The plan-render must verify that every cited API ON the existing codebase is reachable; missing APIs either need to be added explicitly as a new affected file, or removed from the code block in favor of the actual mechanism. Optional chaining is for runtime defense, not specification clarity.

### Remediation Required

Amend to v3:

1. **Add explicit extraction steps** for the three at-cap files:
   - `whisper-pipeline.js` (new) — extract `loadPipeline`-related logic + retry from `stt-engine.js`
   - `modal-visualizer.js` (new) — extract `_wireModalVisualizer` + `_drawModalVisualizer` from `prep-bay.js`
   - `brainstorm-export.js` (new) — extract `exportJSON` + filename builder from `brainstorm-graph.js`

2. **Add file-size budget table** to v3 plan top-matter showing post-plan size for each modified file.

3. **Add `controller.swapWhisperModel(newModelId)`** to §step 8 public API enumeration with full method signature, behavior contract (calls `stt.teardownPipeline()`, emits state `'idle'`, idempotent), and Settings-UI binding sequence (`voice-settings.js` change handler calls `store.set` THEN `controller.swapWhisperModel`). Drop the dead-code `store.subscribe?.` block from §step 9.

4. **Add matching test files** for each extracted helper.

Re-run `/qor-audit` after amendments. Expected outcome: PASS.

---

## VETO — 2026-05-06: v4.10.1 Pre-v5 Cleanup v4 (Canvas DOM accessor doesn't exist for truncation marker)

_**Status**: `addressed_pending` 2026-05-06 — covered by `.failsafe/governance/REMEDIATE_PROPOSAL.md`. Full `addressed: true` flip pending operator-driven `/qor-audit reviews-remediate:.failsafe/governance/REMEDIATE_PROPOSAL.md` PASS or operator-explicit application of the proposal's Part 3 (plan split + four verification sections installed in /qor-plan)._


**Plan**: `.failsafe/governance/plans/plan-v4.10.1-pre-v5-cleanup-v4.md`
**Audit**: `.failsafe/governance/AUDIT_REPORT.md` (Entry #270)
**Categories**: `infrastructure-mismatch` (×1)

### What Failed

The v4 plan correctly fixed all 3 v3 findings (route pre-truncation removed, data-flow path specified, parameter threading corrected). The Data-Flow Tracing table was added per SG-DataFlowTracingGap, tracing 5 fields end-to-end across origin/carrier/sink. But one finding remained: the chosen client-side sink mechanism (`canvas.getNodeElement(id).setAttribute('data-truncated', 'true')`) is incompatible with the actual rendering technology.

`BrainstormCanvas` (line 26 of `brainstorm-canvas.js`) wraps `3d-force-graph`, which renders nodes as Three.js meshes (3D mode) or HTML5 Canvas drawings (2D mode) — they are **not DOM elements per node**. There is no `getNodeElement(id)` method, none can meaningfully be added (the underlying nodes don't exist as DOM), and the CSS rule `[data-truncated="true"]::after { content: ' (truncated)'; }` matches no element. The plan's whole client-side render path was mechanically incapable of producing visible output.

The test `brainstorm-truncation-warning.test.ts` mocked `getNodeElement`, giving false confidence — the test would PASS while the production behavior silently failed.

### Why It Failed

The Data-Flow Tracing table from v3→v4 verified that each new field (e.g., `truncated`) had a defined origin, a verified carrier surface (HTTP response shape, WebSocket broadcast payload), and a named sink. But **the discipline did not extend to verifying that the sink's API supports the consumption pattern**. The Tracing table named the sink as `mergeNodes propagates to canvas node DOM via data-truncated attribute` — which is structurally a valid sentence but not actually executable on this codebase's rendering library.

The four-deep recurrence pattern across iterations:

| Iteration | Caught | Missed |
|---|---|---|
| v1 | (initial) | Cross-module API contracts (state emitter, swap method) |
| v2 | API contracts | File-size budgets at-cap |
| v3 | File budgets | Data-flow tracing through carriers |
| v4 | Data-flow tracing | Sink-mechanism API verification |

Each iteration's countermeasure caught the previous gap class, but exposed a new one. The progression is from "is the surface specified?" → "is the surface sized correctly?" → "does the surface carry the data?" → "does the consuming surface support the consumption pattern?"

### Pattern to Avoid

**SG-SinkMechanismVerificationGap**: When a plan's Data-Flow Tracing table names a sink, the sink mechanism must be verified against the consuming module's actual API — not just that the field arrives at the consumer. The verification asks: "does the consumer have an API that accepts this consumption pattern, and what's its signature?"

Refinement to the SG-DataFlowTracingGap table: add a column.

| Field | Origin | Carrier 1 | Carrier 2 | Sink | **Sink mechanism verified?** | Shape OK? |
|---|---|---|---|---|---|---|
| (field) | (file:line) | (surface) | ... | (file:line) | **Y/N — name the consumer API; cite line if existing** | Y/N |

When **Sink mechanism verified = N**, the plan must add an explicit step naming either (a) the existing API used or (b) the new API added. No hand-wave hedge ("if absent, a tiny new method on the canvas wrapper") — verification is a binary grep check.

This pattern compounds with **SG-DataFlowTracingGap** (#269), **SG-AtCapAdditionBlindness** (#268), and **SG-DialogueResidueUnrendered** (#267): all four are post-dialogue plan-render gaps where structural verification has been progressively extended. The cumulative discipline is now:

1. Every cross-module API contract specified end-to-end (signatures, multiplicity, lifecycle) — caught by v2 pass
2. Every modified file's size accounted in budget table — caught by v3 pass
3. Every new data field traced origin→carrier→sink — caught by v4 pass
4. Every sink's API verified to support the consumption pattern — caught here, applied in v5+

### Remediation Required

Amend to v5:

1. **Replace §B132 step 4's `mergeNodes` data-truncated loop** with an amendment to `brainstorm-canvas.js:65`'s `.nodeLabel(...)` accessor:
   ```js
   .nodeLabel(node => {
     const label = escapeHtml(node.label);
     return node.truncated ? `${label} (truncated)` : label;
   })
   ```
   The library reads the accessor on every render frame and presents the result in its native tooltip overlay on hover. No DOM mutation needed; `truncated` flag arrives via `setNodes` (existing path) and is consumed by the accessor.

2. **Drop §B132 step 6** (CSS rule for `[data-truncated="true"]::after`) — inoperable on this rendering stack.

3. **Update `brainstorm-truncation-warning.test.ts`** Client onEvent assertion: replace `canvas.getNodeElement → setAttribute` mock chain with a direct test of the `nodeLabel` accessor. Given a node `{label: 'foo', truncated: true}`, the accessor returns `'foo (truncated)'`; with `truncated: false` or absent, returns `'foo'` (escaped).

4. **Add `brainstorm-canvas.js`** to Phase 1 Affected Files (MODIFIED) — one-line accessor change.

5. **Optionally**: add a "Sink mechanism verified" column to v5's Data-Flow Tracing table per the new SG-SinkMechanismVerificationGap countermeasure. Each row's cell either cites an existing API (`brainstorm-canvas.js:65 .nodeLabel()`) with a Y, or names a new API with a corresponding affected-file entry.

Re-run `/qor-audit` after amendments. Expected outcome: PASS.


