// Unit tests for decideSidebarClick (UX hotfix Phase 2).
// Runs under vscode-test mocha (`npm test`). The unit-under-test imports no vscode API,
// so this is effectively a pure unit test of a discriminated-union decision function.

import { strict as assert } from "assert";
import { decideSidebarClick } from "../../roadmap/sidebarInitializeLogic";

suite("decideSidebarClick (UX hotfix Phase 2)", () => {
  test("Organize label + organize command registered → run-organize", () => {
    const result = decideSidebarClick("Organize", new Set(["failsafe.organize"]));
    assert.equal(result.kind, "run-organize");
  });

  test("Organize label + empty command set → still run-organize (label-only decision)", () => {
    const result = decideSidebarClick("Organize", new Set());
    assert.equal(result.kind, "run-organize");
  });

  test("Initialize label + bootstrap registered → run-bootstrap with full postUpdate payload", () => {
    const result = decideSidebarClick("Initialize", new Set(["failsafe.bootstrap"]));
    assert.equal(result.kind, "run-bootstrap");
    if (result.kind !== "run-bootstrap") return; // narrow for TS
    assert.equal(result.postUpdate.type, "failsafe.button.update");
    assert.equal(result.postUpdate.text, "Organize");
    assert.equal(result.postUpdate.title, "Organize Workspace Structure");
    assert.equal(result.postUpdate.persistState, true);
  });

  test("Initialize label + empty command set → bootstrap-not-ready", () => {
    const result = decideSidebarClick("Initialize", new Set());
    assert.equal(result.kind, "bootstrap-not-ready");
  });

  test("Initialize label + non-matching commands → bootstrap-not-ready", () => {
    const result = decideSidebarClick("Initialize", new Set(["unrelated.command", "another.thing"]));
    assert.equal(result.kind, "bootstrap-not-ready");
  });

  test("idempotent: two invocations with same inputs return deep-equal output; input Set not mutated", () => {
    const input = new Set(["failsafe.bootstrap"]);
    const sizeBefore = input.size;
    const a = decideSidebarClick("Initialize", input);
    const b = decideSidebarClick("Initialize", input);
    assert.deepEqual(a, b);
    assert.equal(input.size, sizeBefore);
  });
});
