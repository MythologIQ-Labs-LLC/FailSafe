// FX592 — Educational Component Phase 2: settings reader.
// SG-035: invoke readEducationConfig() against a stubbed VS Code config and
// assert on the normalized output. Stub pattern mirrors
// src/test/governance/FirstRunModePicker.test.ts.

import { strict as assert } from "assert";
import * as vscode from "vscode";
import { readEducationConfig } from "../../education/educationConfig";

suite("readEducationConfig (FX592)", () => {
  let originalGetConfiguration: typeof vscode.workspace.getConfiguration;

  // `stored` simulates whatever the workspace settings hold for the
  // `failsafe` section. `undefined` entries mean "not set".
  let stored: Record<string, unknown>;

  suiteSetup(() => {
    originalGetConfiguration = vscode.workspace.getConfiguration;
    (vscode.workspace as { getConfiguration: unknown }).getConfiguration = (
      _section?: string,
    ) => {
      return {
        get: <T>(key: string, defaultValue: T): T => {
          const value = stored[key];
          return value === undefined ? defaultValue : (value as T);
        },
      };
    };
  });

  suiteTeardown(() => {
    (vscode.workspace as { getConfiguration: unknown }).getConfiguration =
      originalGetConfiguration;
  });

  setup(() => {
    stored = {};
  });

  test("FX592 defaults when unset → enabled:true, proficiency:beginner", () => {
    const cfg = readEducationConfig();
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.proficiency, "beginner");
  });

  test("FX592 reads enabled:false", () => {
    stored["education.enabled"] = false;
    assert.equal(readEducationConfig().enabled, false);
  });

  test("FX592 reads each proficiency value", () => {
    for (const level of ["beginner", "intermediate", "advanced"] as const) {
      stored["education.proficiency"] = level;
      assert.equal(readEducationConfig().proficiency, level);
    }
  });

  test("FX592 invalid stored proficiency falls back to beginner", () => {
    stored["education.proficiency"] = "expert";
    assert.equal(readEducationConfig().proficiency, "beginner");
  });

  test("FX592 non-string proficiency falls back to beginner", () => {
    stored["education.proficiency"] = 42;
    assert.equal(readEducationConfig().proficiency, "beginner");
  });

  test("FX592 non-boolean enabled falls back to true", () => {
    stored["education.enabled"] = "yes";
    assert.equal(readEducationConfig().enabled, true);
  });
});
