// FX552 — B151 Phase 1: AJV instance + cached validator factory.
// getValidator compiles once and returns the same reference on repeat calls;
// an unknown schema name throws an error naming the missing schema.
import { strict as assert } from "assert";
import { getValidator } from "../../../governance/interceptor/ajv-instance";

suite("ajv-instance validator cache (FX552)", () => {
  test("getValidator('evaluation_request') returns a function on first call", () => {
    const validate = getValidator("evaluation_request");
    assert.equal(typeof validate, "function");
  });

  test("the second getValidator call returns the same cached reference", () => {
    const first = getValidator("receipt");
    const second = getValidator("receipt");
    assert.equal(first, second, "validator must be cached (=== identity)");
  });

  test("getValidator('not_a_schema') throws an error naming the missing schema", () => {
    assert.throws(
      () => getValidator("not_a_schema"),
      /not_a_schema/,
      "error message must name the missing schema",
    );
  });
});
