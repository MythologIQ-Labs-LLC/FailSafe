// Unit tests for decideSidebarClick (UX hotfix Phase 2).
// Runs under vscode-test mocha (`npm test`). The unit-under-test imports no vscode API,
// so this is effectively a pure unit test of a discriminated-union decision function.

import { strict as assert } from "assert";
import { decideSidebarClick, sanitizeConsoleRoute } from "../../roadmap/sidebarInitializeLogic";

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

suite("sanitizeConsoleRoute (FX916 webview→host boundary)", () => {
  test("legal deep-link route passes unchanged", () => {
    const route = "governance:audit?verdict=2026-08-20T01%3A02%3A03.000Z";
    assert.equal(sanitizeConsoleRoute(route), route);
  });

  test("bare tab routes pass unchanged", () => {
    assert.equal(sanitizeConsoleRoute("governance"), "governance");
    assert.equal(sanitizeConsoleRoute("agents"), "agents");
  });

  test("routes that could smuggle URLs or scripts are rejected", () => {
    assert.equal(sanitizeConsoleRoute("javascript:alert(1)"), null, "parens rejected");
    assert.equal(sanitizeConsoleRoute("//evil.example/x"), null, "slashes rejected");
    assert.equal(sanitizeConsoleRoute("governance /x"), null, "whitespace rejected");
    assert.equal(sanitizeConsoleRoute("a#b"), null, "hash rejected");
  });

  test("oversized and non-string inputs are rejected", () => {
    assert.equal(sanitizeConsoleRoute("g".repeat(257)), null, "over 256 chars rejected");
    assert.equal(sanitizeConsoleRoute(42), null, "number rejected");
    assert.equal(sanitizeConsoleRoute(undefined), null, "undefined rejected");
    assert.equal(sanitizeConsoleRoute({ route: "governance" }), null, "object rejected");
  });
});
