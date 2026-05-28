/**
 * FX701 — Open Design provenance contracts test.
 *
 * Verifies:
 *  - AgentProvenance discriminated union narrows correctly via .source.
 *  - isOpenDesignProvenance runtime guard accepts valid shapes and rejects
 *    every invalid shape (wrong source, missing projectId, non-object input).
 *  - Compile-time narrowing protects against accessing fields that don't
 *    exist on the wrong variant (verified via @ts-expect-error).
 */

import { describe, it } from "mocha";
import { strict as assert } from "assert";
import {
  isOpenDesignProvenance,
  type AgentProvenance,
} from "../../../shared/types/agentRun";

describe("FX701 — AgentProvenance contracts", () => {
  it("isOpenDesignProvenance returns true for valid open-design provenance", () => {
    const p: AgentProvenance = { source: "open-design", projectId: "proj-1" };
    assert.equal(isOpenDesignProvenance(p), true);
  });

  it("isOpenDesignProvenance returns true when optional runId is present", () => {
    const p: AgentProvenance = {
      source: "open-design",
      projectId: "proj-1",
      runId: "od-run-abc",
    };
    assert.equal(isOpenDesignProvenance(p), true);
  });

  it("isOpenDesignProvenance returns false for wrong source value", () => {
    assert.equal(
      isOpenDesignProvenance({ source: "manual", projectId: "x" }),
      false,
    );
  });

  it("isOpenDesignProvenance returns false when projectId is missing", () => {
    assert.equal(
      isOpenDesignProvenance({ source: "open-design" }),
      false,
    );
  });

  it("isOpenDesignProvenance returns false for non-object input", () => {
    assert.equal(isOpenDesignProvenance(null), false);
    assert.equal(isOpenDesignProvenance(undefined), false);
    assert.equal(isOpenDesignProvenance("open-design"), false);
    assert.equal(isOpenDesignProvenance(42), false);
  });

  it("isOpenDesignProvenance narrows TypeScript type post-call", () => {
    const x: unknown = { source: "open-design", projectId: "proj-z" };
    if (isOpenDesignProvenance(x)) {
      // Compile-time check: projectId is string-typed here.
      const id: string = x.projectId;
      assert.equal(id, "proj-z");
    } else {
      assert.fail("guard rejected a valid shape");
    }
  });

  it("AgentProvenance discriminator narrows via .source (compile-time check)", () => {
    const p: AgentProvenance = { source: "open-design", projectId: "p" };
    if (p.source === "open-design") {
      // Accessible on the narrowed variant.
      const id: string = p.projectId;
      assert.equal(id, "p");
      // The following line, if uncommented, would be a compile error because
      // `runId` access on the narrowed shape is allowed (optional), but
      // accessing a non-existent property is not. The presence of this
      // // @ts-expect-error block is the contract enforcement.
      // @ts-expect-error -- nonExistentField is not a member of the union.
      const _bad = p.nonExistentField;
      assert.equal(_bad, undefined);
    }
  });
});
