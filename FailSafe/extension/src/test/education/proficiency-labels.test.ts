// FX613 — FailSafe Learn v2: tier-label operator-binding strings (Phase 3c).
// Loads package.json and asserts the failsafe.education.proficiency
// enumDescriptions carries the three operator-binding tier-label prefixes per
// the research-brief Codex addendum. Fails RED while the field is absent
// (pre-Phase 3c state); GREEN once Phase 3c adds it.
//
// SG-035: invokes the unit (package.json JSON parse + property walk) and
// asserts on real output (the three strings). Not presence-only.

import { strict as assert } from "assert";
import * as fs from "fs";
import * as path from "path";

const PACKAGE_JSON = path.resolve(__dirname, "..", "..", "..", "package.json");

interface PackageJson {
  contributes?: {
    configuration?: {
      properties?: Record<string, { enumDescriptions?: unknown }>;
    };
  };
}

suite("Education tier labels — package.json enumDescriptions (FX613)", () => {
  let pkg: PackageJson;
  suiteSetup(() => {
    const raw = fs.readFileSync(PACKAGE_JSON, "utf8");
    pkg = JSON.parse(raw) as PackageJson;
  });

  test("FX613 failsafe.education.proficiency carries an enumDescriptions array of length 3", () => {
    const prop = pkg?.contributes?.configuration?.properties?.["failsafe.education.proficiency"];
    assert.ok(prop, "failsafe.education.proficiency property missing from package.json");
    assert.ok(
      Array.isArray(prop.enumDescriptions),
      "failsafe.education.proficiency.enumDescriptions is not an array",
    );
    assert.equal(
      (prop.enumDescriptions as unknown[]).length,
      3,
      "enumDescriptions must have exactly 3 entries (one per enum value)",
    );
  });

  test("FX613 each tier label starts with its operator-binding prefix", () => {
    const descs = pkg?.contributes?.configuration?.properties?.["failsafe.education.proficiency"]
      ?.enumDescriptions as string[] | undefined;
    assert.ok(descs && descs.length === 3, "enumDescriptions missing or wrong length");
    assert.ok(
      descs[0].startsWith("New to code"),
      `enumDescriptions[0] must start with "New to code"; got: ${descs[0]}`,
    );
    assert.ok(
      descs[1].startsWith("AI builder"),
      `enumDescriptions[1] must start with "AI builder"; got: ${descs[1]}`,
    );
    assert.ok(
      descs[2].startsWith("Product/PM background"),
      `enumDescriptions[2] must start with "Product/PM background"; got: ${descs[2]}`,
    );
  });
});
