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
    assert.deepEqual(fs.readdirSync(f.parent).sort(), [...names].sort());
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

test("G4 #660: failed publication does not remove unrelated preexisting trust records", async () => {
  const f = fixture();
  const original = fs.linkSync;
  const unrelated = path.join(f.parent, "previous-owner.json");
  fs.mkdirSync(f.parent, { recursive: true });
  fs.writeFileSync(unrelated, "trusted-unrelated-record");
  let calls = 0;
  try {
    fs.linkSync = (...args) => {
      if (++calls === 2) throw errno("EIO");
      return original(...args);
    };
    await assert.rejects(writeNew(f.root, rels, f.maker), /injected EIO/);
  } finally { fs.linkSync = original; }
  try {
    assert.equal(fs.readFileSync(unrelated, "utf8"), "trusted-unrelated-record");
    assert.deepEqual(fs.readdirSync(f.parent), ["previous-owner.json"]);
    assert.ok(f.targets.every((target) => !fs.existsSync(target)));
    await writeNew(f.root, rels, f.maker);
    assert.equal(fs.readFileSync(unrelated, "utf8"), "trusted-unrelated-record");
  } finally { f.cleanup(); }
});

test("G4 #660: staged partial write or ENOSPC publishes no evidence, retry works", async () => {
  const f = fixture();
  const original = fs.writeSync;
  let writes = 0;
  try {
    fs.writeSync = (...args) => {
      ++writes;
      if (writes === 1) {
        // Force a real partial write of the first staged file, then fail its
        // continuation. The final record set must remain entirely absent.
        const [fd, data, offset, length, position] = args;
        return original(fd, data, offset, Math.max(1, Math.floor(length / 2)), position);
      }
      if (writes === 2) throw errno("ENOSPC");
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

test("G4 #660: silently corrupted staged bytes are refused before publishing trust files", async () => {
  const f = fixture();
  const original = fs.writeSync;
  let tampered = false;
  try {
    fs.writeSync = (...args) => {
      if (!tampered) {
        tampered = true;
        const [fd, data, offset, length, position] = args;
        const changed = Buffer.from(data);
        changed[offset] ^= 0x01;
        return original(fd, changed, offset, length, position);
      }
      return original(...args);
    };
    await assert.rejects(writeNew(f.root, rels, f.maker), /staged record bytes changed before publication/);
  } finally { fs.writeSync = original; }
  try {
    checkClean(f);
    assert.deepEqual(await writeNew(f.root, rels, f.maker), rels);
  } finally { f.cleanup(); }
});

test("G4 #660: directory fsync I/O failure rolls back every published output", async () => {
  const f = fixture();
  const original = fs.fsyncSync;
  let calls = 0;
  try {
    fs.fsyncSync = (...args) => {
      // Three staged file flushes succeed; final directory fsync fails.
      if (++calls === 4) throw errno("EIO");
      return original(...args);
    };
    await assert.rejects(writeNew(f.root, rels, f.maker), /injected EIO/);
  } finally { fs.fsyncSync = original; }
  try {
    checkClean(f);
    assert.deepEqual(await writeNew(f.root, rels, f.maker), rels);
    for (const target of f.targets) assert.equal(fs.lstatSync(target).isFile(), true);
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
    await assert.rejects(writeNew(f.root, [...rels].reverse(), f.maker), /earlier writer or interrupted record owns the lock/);
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
    try { fs.symlinkSync(path.join(f.root, "missing-outside"), f.targets[0], "file"); }
    catch (err) {
      if (process.platform === "win32" && err.code === "EPERM") return t.skip("file symlink denied by runner");
      throw err;
    }
    await assert.rejects(writeNew(f.root, rels, f.maker), /never replaced/);
    assert.equal(fs.lstatSync(f.targets[0]).isSymbolicLink(), true);
  } finally { f.cleanup(); }
});

test("G4 #660: symlinked parent refuses before publication", async (t) => {
  const f = fixture();
  try {
    fs.mkdirSync(path.join(f.root, "tools/g4"), { recursive: true });
    const outside = path.join(f.root, "outside");
    fs.mkdirSync(outside);
    try { fs.symlinkSync(outside, f.parent, process.platform === "win32" ? "junction" : "dir"); }
    catch (err) {
      if (process.platform === "win32" && err.code === "EPERM") return t.skip("directory junction denied by runner");
      throw err;
    }
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


test("G4 #660: replaced lock after asynchronous staging cannot delete foreign evidence", async () => {
  const f = fixture();
  try {
    let foreignLock;
    let movedLock;
    await assert.rejects(writeNew(f.root, rels, async (stage) => {
      foreignLock = path.dirname(stage);
      movedLock = foreignLock + ".owned-original";
      fs.renameSync(foreignLock, movedLock);
      fs.mkdirSync(foreignLock);
      fs.writeFileSync(path.join(foreignLock, "foreign-evidence.json"), "FOREIGN-PRESERVE");
      throw new Error("injected asynchronous lock swap");
    }), /G4 lock identity changed/);
    assert.equal(fs.readFileSync(path.join(foreignLock, "foreign-evidence.json"), "utf8"),
      "FOREIGN-PRESERVE", "an unrelated replacement lock cannot be removed by cleanup");
    assert.ok(fs.existsSync(movedLock), "original lock and staged evidence remain for inspection");
    assert.ok(f.targets.every(t => !fs.existsSync(t)));
  } finally { f.cleanup(); }
});

test("G4 #660: foreign file inside owned stage survives successful publication cleanup", async () => {
  const f = fixture();
  let injected;
  try {
    await assert.rejects(writeNew(f.root, rels, async (stage) => {
      injected = path.join(stage, "foreign-custody-proof.txt");
      fs.writeFileSync(injected, "DO-NOT-DELETE");
      return f.maker();
    }), /G4 stage contains unowned files/);
    assert.equal(fs.readFileSync(injected, "utf8"), "DO-NOT-DELETE");
    assert.equal(fs.existsSync(path.dirname(injected)), true,
      "ambiguous stage and lock must remain for investigation");
    assert.ok(f.targets.every((target) => fs.lstatSync(target).isFile()),
      "publication may already have completed; preserve actual trust files");
    await assert.rejects(writeNew(f.root, rels, f.maker), /never replaced|owns the lock/);
  } finally { f.cleanup(); }
});

test("G4 #660: foreign stage evidence survives an asynchronous builder failure", async () => {
  const f = fixture();
  let injected;
  try {
    await assert.rejects(writeNew(f.root, rels, async (stage) => {
      injected = path.join(stage, "foreign-custody-proof.txt");
      fs.writeFileSync(injected, "PRESERVE-AFTER-ERROR");
      throw new Error("injected builder failure");
    }), /G4 stage contains unowned files/);
    assert.equal(fs.readFileSync(injected, "utf8"), "PRESERVE-AFTER-ERROR");
    assert.ok(f.targets.every((target) => !fs.existsSync(target)),
      "builder failure cannot publish partial trust evidence");
    assert.equal(fs.existsSync(path.dirname(injected)), true,
      "foreign files keep the owned lock for operator inspection");
  } finally { f.cleanup(); }
});

test("G4 #660: unexpected file inside owned lock is retained for manual investigation", async () => {
  const f = fixture();
  try {
    let lock;
    await assert.rejects(writeNew(f.root, rels, async (stage) => {
      lock = path.dirname(stage);
      fs.writeFileSync(path.join(lock, "foreign-notice.json"), "DO-NOT-DELETE");
      return f.maker();
    }), /G4 lock contents changed/);
    assert.equal(fs.readFileSync(path.join(lock, "foreign-notice.json"), "utf8"), "DO-NOT-DELETE");
    assert.equal(fs.existsSync(lock), true, "lock must remain as a fail-closed incident signal");
    assert.ok(f.targets.every(t => fs.lstatSync(t).isFile()),
      "all three atomic links may already have published; never misreport rollback");
    await assert.rejects(writeNew(f.root, rels, f.maker), /never replaced/);
  } finally { f.cleanup(); }
});


test("G4 #660: replaced stage directory cannot be deleted as owned evidence", async () => {
  const f = fixture();
  try {
    let stage;
    let moved;
    await assert.rejects(writeNew(f.root, rels, async (ownedStage) => {
      stage = ownedStage;
      moved = stage + ".owned-original";
      fs.renameSync(stage, moved);
      fs.mkdirSync(stage);
      fs.writeFileSync(path.join(stage, "foreign-token.tsr"), "FOREIGN-TIMESTAMP");
      throw new Error("injected stage swap before record generation");
    }), /G4 lock contents changed/);
    assert.equal(fs.readFileSync(path.join(stage, "foreign-token.tsr"), "utf8"),
      "FOREIGN-TIMESTAMP", "unowned replacement stage content must be preserved");
    assert.ok(fs.existsSync(moved), "original owned stage is retained as evidence");
    assert.equal(fs.existsSync(path.dirname(stage)), true, "ambiguous lock stays closed");
    assert.ok(f.targets.every(t => !fs.existsSync(t)), "the aborted builder published no final records");
  } finally { f.cleanup(); }
});

test("G4 #660: a foreign file under an expected output name survives failed staging cleanup", async () => {
  const f = fixture();
  let injected;
  try {
    await assert.rejects(writeNew(f.root, rels, async (stage) => {
      injected = path.join(stage, "output-0");
      fs.writeFileSync(injected, "FOREIGN-STAGED-OUTPUT", { flag: "wx" });
      return f.maker();
    }), /G4 stage contains unowned staged output/);
    assert.equal(fs.readFileSync(injected, "utf8"), "FOREIGN-STAGED-OUTPUT",
      "cleanup must not unlink a file it did not create, even if its name is reserved");
    assert.equal(fs.existsSync(path.dirname(injected)), true,
      "ambiguous stage and lock remain for operator inspection");
    assert.ok(f.targets.every((target) => !fs.existsSync(target)),
      "a failed exclusive staged create cannot publish final trust records");
    await assert.rejects(writeNew(f.root, rels, f.maker), /earlier writer or interrupted record owns the lock/);
  } finally { f.cleanup(); }
});

test("G4 #660: an output directory replaced during async signing remains foreign and is never published", async () => {
  const f = fixture();
  let retainedParent;
  try {
    await assert.rejects(writeNew(f.root, rels, async () => {
      // The signed bytes are prepared asynchronously after the original path
      // has been checked and a lock created inside the original directory.
      retainedParent = f.parent + ".owned-original";
      fs.renameSync(f.parent, retainedParent);
      fs.mkdirSync(f.parent);
      fs.writeFileSync(path.join(f.parent, "foreign-evidence.json"), "FOREIGN-PRESERVE");
      return f.maker();
    }), /record output directory identity changed during preparation/);
    assert.deepEqual(fs.readdirSync(f.parent), ["foreign-evidence.json"],
      "a replacement directory must not receive records or have its files deleted");
    assert.equal(fs.readFileSync(path.join(f.parent, "foreign-evidence.json"), "utf8"), "FOREIGN-PRESERVE");
    assert.ok(f.targets.every((target) => !fs.existsSync(target)),
      "no final trust evidence may publish to a different output directory");
    assert.ok(fs.readdirSync(retainedParent).some((name) => name.endsWith(".lock")),
      "the original owned lock and staging directory remain for manual inspection");
  } finally { f.cleanup(); }
});

for (const tempName of ["request.tsq", "reply.tsr"]) {
  test(`G4 #660: foreign ${tempName} survives reserved-name cleanup`, async () => {
    const f = fixture();
    let foreign;
    try {
      await assert.rejects(writeNew(f.root, rels, async (stage) => {
        foreign = path.join(stage, tempName);
        fs.writeFileSync(foreign, "FOREIGN-TSA-EVIDENCE", { flag: "wx" });
        throw new Error("injected builder rejection before TSA ownership");
      }), /G4 stage contains unowned TSA temporary file/);
      assert.equal(fs.readFileSync(foreign, "utf8"), "FOREIGN-TSA-EVIDENCE");
      assert.equal(fs.existsSync(path.dirname(foreign)), true, "retained stage is inspectable");
      assert.ok(f.targets.every(target => !fs.existsSync(target)), "no G4 record published");
      await assert.rejects(writeNew(f.root, rels, f.maker), /earlier writer or interrupted record owns the lock/);
    } finally { f.cleanup(); }
  });
}

test("G4 #660: owned TSA temporary files are cleaned without blocking a valid record", async () => {
  const f = fixture();
  try {
    assert.deepEqual(await writeNew(f.root, rels, async (stage, markStageFile) => {
      for (const name of ["request.tsq", "reply.tsr"]) {
        fs.writeFileSync(path.join(stage, name), "TEST-ONLY-TSA-BYTES", { flag: "wx" });
        markStageFile(name);
      }
      return f.maker();
    }), rels);
    assert.deepEqual(fs.readdirSync(f.parent).sort(), [...names].sort());
    assert.ok(f.targets.every(target => fs.lstatSync(target).isFile()));
  } finally { f.cleanup(); }
});
