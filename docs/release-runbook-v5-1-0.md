# Release Runbook — FailSafe v5.1.0

**Audience**: FailSafe operator (release manager).
**Plan reference**: `docs/plan-qor-v5-1-0-publish-block-lift.md` (PASS audit Entry #356).
**Preconditions**: PUBLISH_BLOCK Condition 1 satisfied (FEATURE_INDEX 0 unverified; sealed at META_LEDGER Entry #354). Conditions 2-5 are what this runbook closes.

This is a linear runbook. Every step is operator-actionable; no step requires Qor-logic runtime. Steps 1-9 are pre-seal preparation; step 10 invokes `/qor-substantiate` which seals this plan; steps 11-13 are post-seal release-class emission.

---

## Pre-flight

### Step 1. Re-confirm PUBLISH_BLOCK Condition 1

```bash
cd FailSafe/extension && node ./scripts/feature-index-classifier.cjs --repo-root ../..
```

Expected output ends with a summary line showing `unverified: 0`. If non-zero, **stop**: a regression has reintroduced unverified entries since Entry #354 sealed. Open a debug cycle before continuing.

### Step 2. Capture build SHA

```bash
git rev-parse HEAD
```

Record the output. It becomes the `**Build SHA**` field of `.failsafe/governance/BROWSER_VERIFICATION.md`. The SHA must remain stable from this point through step 9 — if you commit anything else, restart from this step.

---

## Playwright attestation

### Step 3. Run the Playwright suite

```bash
cd FailSafe/extension && npm run test:ui
```

`test:ui` is the package.json alias for `playwright test` (config: `FailSafe/extension/playwright.config.ts`; specs auto-discovered under `src/test/ui/*.spec.ts`). The full suite is the 12 specs inventoried by `scripts/lib/playwright-spec-inventory.cjs`.

If any spec fails: **stop**, open a debug cycle, fix the failure, return to step 2 (build SHA changes after the fix commit).

### Step 4. Capture per-row timestamps + results

Open `.failsafe/governance/BROWSER_VERIFICATION.md`. For each Playwright-covered row, fill in:

- `last run:` → ISO 8601 timestamp from the Playwright run (the suite ends with a summary line including the timestamp).
- `result:` → `pass` (literal string).
- Check the box: `- [ ]` → `- [x]`.

The schema validator (`scripts/lib/browser-verification-schema.cjs`) rejects placeholder timestamps (`<timestamp>`) and any `result:` value other than `pass`.

---

## Screenshot attestation

### Step 5. Take screenshots for the four `n/a`-justified surfaces

Playwright cannot reach: voice modal (needs MediaRecorder + microphone), Whisper pipeline loader (needs WebGPU), WebLLM engine (needs WebGPU), Live transcriber (needs MediaStream + microphone). Open each surface in the running extension, capture a screenshot showing the surface in a steady non-error state, and save each as:

```
.failsafe/governance/screenshots/voice-modal-YYYY-MM-DD.png
.failsafe/governance/screenshots/whisper-loader-YYYY-MM-DD.png
.failsafe/governance/screenshots/webllm-engine-YYYY-MM-DD.png
.failsafe/governance/screenshots/live-transcriber-YYYY-MM-DD.png
```

Where `YYYY-MM-DD` is the actual capture date.

For each `### FX2xx ...` block in BROWSER_VERIFICATION.md, fill the `- Screenshot:` line with the path you just saved, and the `- Operator note:` line with a one-sentence observation ("Surface loaded; theme + cards coherent; no contradiction observed.") The schema validator rejects the literal placeholder `<observed coherence yes/no + any concerns>`.

---

## Sign-off + validator

### Step 6. Run the lifting-protocol validator

```bash
cd FailSafe/extension && npm run verify:publish-block
```

This invokes `scripts/check-publish-block.cjs` which (post-Phase 60 §5 + post-Phase 2 lift integration) checks all five PUBLISH_BLOCK conditions:

1. FEATURE_INDEX 0 unverified (sealed at #354)
2. BROWSER_VERIFICATION.md `Active: yes` flipped + every Playwright row `result: pass` + structural inventory match against `src/test/ui/*.spec.ts`
3. Every screenshot row has `Screenshot:` + `Operator note:`
4. Signature line non-blank
5. (Substantiate-seal condition — operator step 10)

If exit non-zero, the script prints which condition failed; fix and re-run until exit 0.

### Step 7. Sign

In `.failsafe/governance/BROWSER_VERIFICATION.md`, replace the blank signature line:

```
Signature: ___________________________
```

with your initials + date stamp:

```
Signature: JD 2026-05-14
```

### Step 8. Flip BROWSER_VERIFICATION Active flag

In the same file, change:

```
**Active**: yes
```

to:

```
**Active**: no
```

This signals the attestation cycle is complete from the operator's side. Save the file.

### Step 9. Re-run validator

```bash
cd FailSafe/extension && npm run verify:publish-block
```

Expected: exit 0. All five conditions pass.

---

## Substantiate + lift commit

### Step 10. Substantiate this plan

Invoke `/qor-substantiate` against `docs/plan-qor-v5-1-0-publish-block-lift.md`. The substantiate cycle confirms Reality = Promise across all four phases, writes the SESSION SEAL entry to META_LEDGER, and (per plan boundary L18) **SKIPS** Steps 7.4 / 7.5 / 7.6 / 9.5.5 (SSDF emission + version bump + CHANGELOG stamp + annotated tag) — those are reserved for step 12 below.

After the seal entry lands, the seal entry's chain hash becomes the reference for Condition 5 satisfaction. The substantiate cycle does not flip PUBLISH_BLOCK.md — that's step 11.

### Step 11. Flip PUBLISH_BLOCK active flag

In `.failsafe/governance/PUBLISH_BLOCK.md`, change:

```
**Active**: yes
```

to:

```
**Active**: no
**Lifted on**: YYYY-MM-DD
**Lift reference**: META_LEDGER #<substantiate-entry>
```

Commit this single atomic edit. Use the helper-produced edit shape if convenient (`scripts/lib/publish-block-lift-commit.cjs::prepareLiftCommit(repoRoot)` returns the structured edit + ledger draft).

This is the **gate-lifted** state. Marketplace publish is no longer blocked at the governance layer.

---

## Release-class emission

The remaining steps emit the v5.1.0 release. They are operator-only and not auto-runnable; each requires explicit confirmation.

### Step 12. Version bump + CHANGELOG stamp

```bash
cd FailSafe/extension
npm version 5.1.0 --no-git-tag-version
```

This bumps `FailSafe/extension/package.json` from the current version to `5.1.0`. The `--no-git-tag-version` flag prevents npm from auto-tagging — tag creation is step 13's concern, after the release commit.

In `CHANGELOG.md` at the repo root, change the top `## [Unreleased]` heading to:

```
## [5.1.0] - YYYY-MM-DD
```

Where the date is today. The Unreleased entries beneath that heading become the v5.1.0 changelog body. Add a fresh empty `## [Unreleased]` heading above for future work.

### Step 13. Release commit + tag + push

```bash
# Stage the release-class artifacts
git add FailSafe/extension/package.json CHANGELOG.md docs/META_LEDGER.md

# Commit with [RELEASE] marker — pre-commit hook validates publish-block conditions
git commit -m "release: v5.1.0 — Monitor coherence + browser verification + 100% feature coverage [RELEASE]"

# Annotated tag pointing at the seal commit
git tag -a v5.1.0 -m "FailSafe v5.1.0 — Monitor coherence + browser verification + 100% feature coverage"

# Push the main branch (release-commit-msg.sh hook runs verify:publish-block)
git push origin main

# Push the tag separately to trigger the marketplace workflow
git push origin v5.1.0
```

The tag push triggers `.github/workflows/release.yml`. That workflow contains two jobs: `publish-vscode` (runs `npx @vscode/vsce publish --packagePath "mythologiq-failsafe-${VSIX_VERSION}.vsix"`) and `publish-openvsx` (runs `npx ovsx publish "mythologiq-failsafe-${VSIX_VERSION}.vsix"`). Both dispatch from the same tag.

Marketplace surface confirmation: VS Code Marketplace listing for `mythologiq.failsafe` shows v5.1.0; Open VSX shows the same.

---

## Rollback hooks

If anything fails after step 11 (PUBLISH_BLOCK lifted) but before step 13 (push), the lift is recoverable by reverting the lift commit. If failure happens after step 13's `git push origin v5.1.0`, the marketplace publish has already started; coordinate a v5.1.1 hotfix per `feedback_no_v4_10_x_version.md` analogous flow rather than attempting to unpublish.

---

## Variables referenced

| Token | Meaning | Source |
|---|---|---|
| `${VSIX_VERSION}` | Package version derived from `package.json` | `.github/workflows/release.yml` step that builds the VSIX |
| `mythologiq-failsafe-${VSIX_VERSION}.vsix` | Output of `npx @vscode/vsce package` | Same workflow |
| `JD 2026-05-14` (etc.) | Operator initials + date | Operator types |

## CI command reference

| Command | Purpose |
|---|---|
| `cd FailSafe/extension && npm run compile` | TypeScript compilation |
| `cd FailSafe/extension && npm test -- --runInBand` | Mocha + vscode-test suite (deterministic serial) |
| `cd FailSafe/extension && npm run test:ui` | Playwright suite (step 3) |
| `cd FailSafe/extension && npm run verify:publish-block` | Lifting-protocol validator (steps 6 + 9) |
| `cd FailSafe/extension && node ./scripts/feature-index-classifier.cjs --repo-root ../..` | FEATURE_INDEX coverage re-check (step 1) |
| `node FailSafe/extension/scripts/check-governance-canaries.cjs --repo-root .` | Governance markdown canary scan (advisory) |
