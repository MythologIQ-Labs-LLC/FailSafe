// #378 — shared corrupt-file guard (plan-corrupt-file-guard-378). Extracted
// from FX923's RiskRegisterManager.preserveCorruptStore so AdapterService
// config and MarketplaceCatalog state stop carrying the swallow-and-overwrite
// shape. Contract: never throws; preserves original bytes aside before any
// caller overwrites an existing-but-unhealthy JSON file.

import { strict as assert } from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { preserveCorruptFile } from "../../roadmap/services/corrupt-file-guard";

const objectShape = (p: unknown) => !!p && typeof p === "object" && !Array.isArray(p);

function tmpFile(content: string | null): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fx378-guard-"));
  const file = path.join(dir, "store.json");
  if (content !== null) fs.writeFileSync(file, content, "utf-8");
  return { dir, file };
}

function baks(dir: string): string[] {
  return fs.readdirSync(dir).filter((f) => /^store\.json\.corrupt-\d+\.bak$/.test(f));
}

suite("preserveCorruptFile (#378)", () => {
  test("corrupt JSON: preserved aside with original bytes; original gone (renamed)", () => {
    const { dir, file } = tmpFile('{"broken": TRUNC');
    try {
      preserveCorruptFile(file, objectShape, "store.json");
      const b = baks(dir);
      assert.equal(b.length, 1);
      assert.equal(fs.readFileSync(path.join(dir, b[0]), "utf-8"), '{"broken": TRUNC');
      assert.equal(fs.existsSync(file), false, "rename path removes the original");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test("healthy object: no-op", () => {
    const { dir, file } = tmpFile('{"ok": true}');
    try {
      preserveCorruptFile(file, objectShape, "store.json");
      assert.equal(baks(dir).length, 0);
      assert.equal(fs.existsSync(file), true);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test("absent file: no-op, nothing created", () => {
    const { dir, file } = tmpFile(null);
    try {
      preserveCorruptFile(file, objectShape, "store.json");
      assert.equal(fs.readdirSync(dir).length, 0);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test("valid-JSON array fails the object predicate and is preserved (audit A2)", () => {
    const { dir, file } = tmpFile('[1,2,3]');
    try {
      preserveCorruptFile(file, objectShape, "store.json");
      assert.equal(baks(dir).length, 1);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test("empty file counts as corrupt (FX923 parity)", () => {
    const { dir, file } = tmpFile("");
    try {
      preserveCorruptFile(file, objectShape, "store.json");
      assert.equal(baks(dir).length, 1);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  test("never throws: a throwing predicate is contained and treated as unhealthy (audit A4)", () => {
    const { dir, file } = tmpFile('{"ok": true}');
    try {
      assert.doesNotThrow(() => preserveCorruptFile(file, () => { throw new Error("boom"); }, "store.json"));
      assert.equal(baks(dir).length, 1,
        "a predicate crash must fail toward preservation, not toward silent overwrite");
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});
