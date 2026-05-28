/**
 * FX700 — extractOpenDesignProvenance file-path detector tests.
 *
 * Verifies the regex-driven file-path parser:
 *  - Detects `.od/artifacts/<projectId>/...` on POSIX + Windows separators.
 *  - Returns null for non-matching paths.
 *  - Returns null for empty / malformed input without throwing.
 */

import { describe, it } from "mocha";
import { strict as assert } from "assert";
import { extractOpenDesignProvenance } from "../../../integrations/open-design/provenance";

describe("FX700 — extractOpenDesignProvenance", () => {
  it("matches POSIX path", () => {
    const p = extractOpenDesignProvenance(
      "/workspace/.od/artifacts/proj-abc/foo.html",
    );
    assert.deepEqual(p, { source: "open-design", projectId: "proj-abc" });
  });

  it("matches Windows path with backslashes", () => {
    const p = extractOpenDesignProvenance(
      "C:\\repos\\.od\\artifacts\\proj-xyz\\deck\\slide.html",
    );
    assert.deepEqual(p, { source: "open-design", projectId: "proj-xyz" });
  });

  it("matches nested artifact subdir (deeply nested)", () => {
    const p = extractOpenDesignProvenance(
      "/repo/.od/artifacts/proj-1/sub/a/b/c/d/e.json",
    );
    assert.deepEqual(p, { source: "open-design", projectId: "proj-1" });
  });

  it("matches when .od is at the path root", () => {
    const p = extractOpenDesignProvenance(".od/artifacts/proj-root/file.html");
    assert.deepEqual(p, { source: "open-design", projectId: "proj-root" });
  });

  it("returns null for non-matching path", () => {
    assert.equal(extractOpenDesignProvenance("/workspace/src/foo.ts"), null);
    assert.equal(
      extractOpenDesignProvenance("/workspace/.od/other-dir/proj/file"),
      null,
    );
  });

  it("returns null for empty string", () => {
    assert.equal(extractOpenDesignProvenance(""), null);
  });

  it("returns null for non-string input without throwing", () => {
    // @ts-expect-error -- intentional bad input
    assert.equal(extractOpenDesignProvenance(null), null);
    // @ts-expect-error -- intentional bad input
    assert.equal(extractOpenDesignProvenance(undefined), null);
    // @ts-expect-error -- intentional bad input
    assert.equal(extractOpenDesignProvenance(42), null);
  });
});
