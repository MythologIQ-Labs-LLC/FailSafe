import * as assert from "assert";
import { assembleHubPayload } from "../../roadmap/services/hub-payload-assembler";

suite("FX893 hub payload assembler", () => {
  test("preserves Qor consumer diagnostics and workspace identity", () => {
    const payload = assembleHubPayload({
      base: {
        version: "5.4.2",
        workspaceName: "FailSafe",
        workspacePath: "G:/MythologIQ/FailSafe",
      },
      artifacts: {
        qorConsumer: {
          supported: true,
          diagnostics: [{ code: "missing_optional", severity: "info" }],
        },
        ledgerSummary: { entries: 492 },
        latestAudit: { verdict: "PASS" },
        recentReleases: [],
      },
      liveVerdicts: [],
      ledgerVerdicts: [{ id: "v1", kind: "GATE", title: "PASS" }],
      liveCompletions: [],
      ledgerCompletions: [{ id: "c1", kind: "SEAL", title: "Done" }],
    });

    assert.deepStrictEqual(payload.qorConsumer, {
      supported: true,
      diagnostics: [{ code: "missing_optional", severity: "info" }],
    });
    assert.strictEqual(payload.workspacePath, "G:/MythologIQ/FailSafe");
    assert.deepStrictEqual(payload.recentVerdicts, [
      { id: "v1", kind: "GATE", title: "PASS", source: "meta-ledger" },
    ]);
  });
});
