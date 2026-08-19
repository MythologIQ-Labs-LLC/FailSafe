// FX-244A: Tranche A status-truth audit (native FailSafe#244).
//
// buildGovernancePhase() is the actual server-side source of `hub.governancePhase`,
// which the Command Center / Monitor SHIELD phase-track renders (see
// roadmap/ui/modules/monitor-render.js getPhaseInfo/renderPhase). Prior to this
// fix, a META_LEDGER.md that exists and is non-empty but fails to parse into any
// recognizable "### Entry #N" block was silently indistinguishable from a
// workspace that has no governance ledger at all -- both rendered as a plain
// "IDLE" phase, i.e. malformed evidence rendered as if it were a clean/healthy
// idle state. Confirmed defect per FailSafe#244 Tranche A acceptance criteria:
// "malformed evidence must not be silently treated as absent or healthy."
import { describe, it } from "mocha";
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildGovernancePhase } from "../../roadmap/ConsoleServerHub";

function mkWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "console-server-hub-test-"));
}

function writeLedger(root: string, content: string): void {
  const docsDir = path.join(root, "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, "META_LEDGER.md"), content, "utf8");
}

describe("ConsoleServerHub.buildGovernancePhase", () => {
  it("returns IDLE with no evidenceState when no ledger file exists", () => {
    const root = mkWorkspace();
    const state = buildGovernancePhase(root);
    assert.strictEqual(state.current, "IDLE");
    assert.strictEqual(state.evidenceState, undefined);
  });

  it("returns IDLE with no evidenceState for a genuinely empty ledger", () => {
    const root = mkWorkspace();
    writeLedger(root, "");
    const state = buildGovernancePhase(root);
    assert.strictEqual(state.current, "IDLE");
    assert.strictEqual(state.evidenceState, undefined);
  });

  it("flags evidenceState=malformed for a small, fully-read, non-empty ledger with no recognizable entries (RED before fix / GREEN after)", () => {
    const root = mkWorkspace();
    // Well under the 4096-byte tail-read budget, so the read is guaranteed
    // complete -- this is the case the fix must catch.
    writeLedger(root, "# META_LEDGER\ncorrupted mid-write; no entry headers survive this crash.\n");
    const state = buildGovernancePhase(root);
    assert.strictEqual(state.current, "IDLE");
    assert.strictEqual(
      state.evidenceState,
      "malformed",
      "a non-empty, unparseable-but-fully-read ledger must not render identically to no governance history",
    );
  });

  it("is distinguishable from the missing-ledger case", () => {
    const missingRoot = mkWorkspace();
    const malformedRoot = mkWorkspace();
    writeLedger(malformedRoot, "# META_LEDGER\nno entry headers at all, definitely not empty.\n");
    const missing = buildGovernancePhase(missingRoot);
    const malformed = buildGovernancePhase(malformedRoot);
    assert.strictEqual(missing.evidenceState, undefined);
    assert.strictEqual(malformed.evidenceState, "malformed");
    assert.notDeepStrictEqual(missing, malformed);
  });

  it("still resolves a normal well-formed ledger with no evidenceState", () => {
    const root = mkWorkspace();
    writeLedger(
      root,
      "### Entry #1: PLAN Phase\n\n**Timestamp**: 2025-03-09T10:00:00Z\n**Phase**: PLAN\n",
    );
    const state = buildGovernancePhase(root);
    assert.strictEqual(state.current, "PLAN");
    assert.strictEqual(state.evidenceState, undefined);
  });

  it("does NOT flag evidenceState for a large ledger whose tail read lands with zero visible entries (truncation must not be misclassified as malformed)", () => {
    const root = mkWorkspace();
    // Pad well past the 4096-byte tail-read budget with content that
    // contains no "### Entry #" header anywhere in the final 4096 bytes,
    // simulating a tail slice landing inside a long entry body. A real,
    // healthy large ledger (e.g. this repo's own docs/META_LEDGER.md,
    // exercised as this audit's "medium" profile) must never be reported
    // malformed merely because the bounded tail read didn't include a
    // header line.
    const header = "### Entry #1: PLAN Phase\n\n**Timestamp**: 2025-03-09T10:00:00Z\n**Phase**: PLAN\n\n---\n\n";
    const filler = "x".repeat(6000) + "\n";
    writeLedger(root, header + filler);
    const state = buildGovernancePhase(root);
    assert.strictEqual(
      state.evidenceState,
      undefined,
      "a truncated tail read must not be trusted to classify malformed -- false positives on healthy large ledgers are as harmful as false negatives",
    );
  });
});
