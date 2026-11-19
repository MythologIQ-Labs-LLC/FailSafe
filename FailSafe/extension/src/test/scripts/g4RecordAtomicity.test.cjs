"use strict";
/** #660: real filesystem adversarial tests; never touch owner TPM keys or G4 releases. */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeNew } = require("../../../scripts/lib/g4/records.cjs");

const names = ["a.json", "a.sig", "a.tsr"];
const rels = names.map((x) => "tools/g4/transitions/" + x);
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "failsafe-g4-660-"));
  const parent = path.join(root, "tools/g4/transitions");
  const targets = rels.map((rel) => path.join(root, rel));
  const cleanup = () => fs.rmSync(root, { recursive: true, force: true });
  const maker = async () => Object.fromEntries(rels.map((rel, i) => [rel, Buffer.from("signed-test-" + i)]));
  return { root, parent, targets, cleanup, maker };
}
function checkClean(f) {
  for (const t of f.targets) assert.equal(fs.existsSync(t), false, "failed attempt must not publish " + t);
  if (fs.existsSync(f.parent)) {
    assert.deepEqual(fs.readdirSync(f.parent), [], "owned stage and lock removed on rollback");
  }
}
const errno = (code) => Object.assign(new Error("injected " + code), { code });

test("G4 #660: complete three-record publish, data intact, never overwrite even with retry", async () => {
  const f = fixture();
  try {
    const result = await writeNew(f.root, rels, f.maker);
    assert.deepEqual(result, rels);
    for (let i = 0; i < f.targets.length; i++) {
      assert.equal(fs.readFileSync(f.targets[i], "utf8"), "signed-test-" + i);
    }
    assert.deepEqual(fs.readdirSync(f.parent), names);
    await assert.rejects(writeNew(f.root, rels, f.maker), /never replaced/);
    assert.equal(fs.readFileSync(f.targets[0], "utf8"), "signed-test-0");
  } finally { f.cleanup(); }
});

for (const failAt of [1, 2, 3]) {
  test(`G4 #660: failed hardlink ${failAt}/3 rolls back only owned files and is safely retriable`, async () => {
    const f = fixture();
    const original = fs.linkSync;
    let calls = 0;
    try {
      fs.linkSync = (...args) => {
        if (++calls === failAt) throw errno("EIO");
        return original(...args);
      };
      await assert.rejects(writeNew(f.root, rels, f.maker), /injected EIO/);
    } finally { fs.linkSync = original; }
    try {
      checkClean(f);
      assert.deepEqual(await writeNew(f.root, rels, f.maker), rels);
      assert.equal(fs.readdirSync(f.parent).length, 3);
    } finally { f.cleanup(); }
  });
}

test("G4 #660: staged partial write or ENOSPC publishes no evidence, retry works", async () => {
  const f = fixture();
  const original = fs.writeSync;
  let writes = 0;
  try {
    fs.writeSync = (...args) => {
      if (++writes === 2) throw errno("ENOSPC");
      return original(...args);
    };
    await assert.rejects(writeNew(f.root, rels, f.maker), /ENOSPC/);
  } finally { fs.writeSync = original; }
  try {
    checkClean(f);
    await writeNew(f.root, rels, f.maker);
    assert.equal(fs.readFileSync(f.targets[2], "utf8"), "signed-test-2");
  } finally { f.cleanup(); }
});

test("G4 #660: concurrent same-record writer is refused while first holds exclusive lock", async () => {
  const f = fixture();
  let unblock;
  let entered;
  const inside = new Promise((resolve) => { entered = resolve; });
  const blocked = new Promise((resolve) => { unblock = resolve; });
  try {
    const first = writeNew(f.root, rels, async () => {
      entered();
      await blocked;
      return f.maker();
    });
    await inside;
    await assert.rejects(writeNew(f.root, rels, f.maker), /earlier writer or interrupted record owns the lock/);
    unblock();
    assert.deepEqual(await first, rels);
    assert.equal(fs.readdirSync(f.parent).length, 3);
  } finally { if (unblock) unblock(); f.cleanup(); }
});

test("G4 #660: tampered final pathname during failure is never deleted by rollback", async () => {
  const f = fixture();
  const original = fs.linkSync;
  let n = 0;
  try {
    fs.linkSync = (...args) => {
      if (++n === 2) {
        // Model a competing writer that removes the first hardlink and places
        // a different inode before this operation detects its own failure.
        fs.unlinkSync(f.targets[0]);
        fs.writeFileSync(f.targets[0], "outside-writer-content", { flag: "wx" });
        throw errno("EIO");
      }
      return original(...args);
    };
    await assert.rejects(writeNew(f.root, rels, f.maker), /ownership-safe rollback incomplete/);
  } finally { fs.linkSync = original; }
  try {
    assert.equal(fs.readFileSync(f.targets[0], "utf8"), "outside-writer-content");
    const locks = fs.readdirSync(f.parent).filter((n) => n.endsWith(".lock"));
    assert.equal(locks.length, 1, "ambiguous rollback retains lock for owner inspection");
    await assert.rejects(writeNew(f.root, rels, f.maker), /never replaced|owns the lock/);
  } finally { f.cleanup(); }
});

test("G4 #660: pre-existing file or dangling symlink never gets replaced", async (t) => {
  const f = fixture();
  try {
    fs.mkdirSync(f.parent, { recursive: true });
    fs.writeFileSync(f.targets[0], "PRESERVED");
    await assert.rejects(writeNew(f.root, rels, f.maker), /never replaced/);
    assert.equal(fs.readFileSync(f.targets[0], "utf8"), "PRESERVED");
    fs.unlinkSync(f.targets[0]);
    if (process.platform === "win32") return t.skip("Windows symlink privilege varies");
    fs.symlinkSync(path.join(f.root, "missing-outside"), f.targets[0]);
    await assert.rejects(writeNew(f.root, rels, f.maker), /never replaced/);
    assert.equal(fs.lstatSync(f.targets[0]).isSymbolicLink(), true);
  } finally { f.cleanup(); }
});

test("G4 #660: symlinked parent refuses before publication", async (t) => {
  if (process.platform === "win32") return t.skip("Windows junction/symlink privileges vary");
  const f = fixture();
  try {
    fs.mkdirSync(path.join(f.root, "tools/g4"), { recursive: true });
    const outside = path.join(f.root, "outside");
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, f.parent, "dir");
    await assert.rejects(writeNew(f.root, rels, f.maker), /not a real directory/);
    assert.deepEqual(fs.readdirSync(outside), []);
  } finally { f.cleanup(); }
});

test("G4 #660: mismatched record inventory cannot publish", async () => {
  const f = fixture();
  try {
    await assert.rejects(writeNew(f.root, rels, async () => ({
      [rels[0]]: Buffer.from("only one"),
    })), /prepared record file set differs/);
    checkClean(f);
    await assert.rejects(writeNew(f.root, [rels[0], "../escape"], f.maker), /escapes repository/);
    assert.equal(fs.existsSync(path.join(f.root, "escape")), false);
  } finally { f.cleanup(); }
});
