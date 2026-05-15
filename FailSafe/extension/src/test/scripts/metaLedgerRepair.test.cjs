"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const crypto = require("node:crypto");

const repair = require(path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "scripts",
    "meta-ledger-repair.cjs"
));

const ANCHOR_PREV_331 =
    "f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9";

const CONTENT = {
    331: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
    332: "f2d7eb641458cae6ec5b9d08461923efc78478e1f935cd591aa4deb3f96537bc",
    333: "00d8b3bc5f090774e5a853385a610b6e72607f599ca273705ad77911ea9b19ef",
    334: "7e6b09758417beae6a5167105f3e8e5bf20528adac69445a148d4dfad07294cc",
    335: "aecc3ed8558da0b45f5dd60d60f328b45711877d6f6490de935588df57520a5b",
    336: "20f4bb5a15c866a3067076a377b67a9f2694372ed453c7f0563e8ec3fc62650a",
};

const BROKEN_CHAIN = {
    331: "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
    332: "62d542f424f44f40b88d096ed333dbba5982c1fead7fc5f4c494f2cb2d1e2f4e",
    333: "9aa1caba56ac574d9914753a56cf1df7df944e88ddcf41ce8bfae1b4b5a911f4",
    334: "ef31d2d414225e6e482f2c66c7324145110f2079ff30f41c9344078a58be3d4e",
    335: "800894ea8d6daa1e8d2afc5a0dfc1913f83974318ca84f03f197034c26520490",
    336: "ca2f6ef1f5b66c8245e955ab4eafc98d66d6f8315c934232c9ddc2d0764691af",
};

const EXPECTED_CASCADE = {
    331: "74217c8c014489dfcbe25a2ef041fd660b92729fbe31e9ff354e7d161cbe514e",
    332: "9c381a9171ca78db5e9092d5b7afcf2989aa24743fd73d32a01e4e963dc47406",
    333: "65d6b9cf48a6374679114d22eb5f0cb09ab7fb3d09d95c31c5a7d0f6735d5b27",
    334: "d3017af520746668ea2ddc609c46a7566fd8460f46636ad8f570d2117c32a53c",
    335: "370e10d084316503ab12d84c634dc452713676920ffff5fdce5cf59fca692bb5",
    336: "2553826d0cb4b6c217732d95469be47f38a2c1a43595bc198aec5b90c5d9315d",
};

function entryBlock(n, header, contentHash, prevHash, sealLabel, sealHash) {
    return [
        `### Entry #${n}: ${header}`,
        ``,
        `**Content Hash**:`,
        `SHA256(plan + audit report) = \`${contentHash}\``,
        ``,
        `**Previous Hash**: \`${prevHash}\` (Entry #${n - 1} chain hash)`,
        ``,
        `**${sealLabel}**:`,
        `SHA256(content_hash + previous_hash) = \`${sealHash}\``,
        ``,
        `_Gate Status: TEST_`,
        ``,
        `---`,
    ].join("\n");
}

function brokenFixture() {
    // File-order matches current META_LEDGER.md: 331, 334, 333, 332, 335, 336.
    const blocks = [
        entryBlock(331, "VETO", CONTENT[331], ANCHOR_PREV_331, "Chain Hash", BROKEN_CHAIN[331]),
        entryBlock(334, "PASS", CONTENT[334], BROKEN_CHAIN[333], "Chain Hash", BROKEN_CHAIN[334]),
        entryBlock(333, "VETO", CONTENT[333], BROKEN_CHAIN[332], "Chain Hash", BROKEN_CHAIN[333]),
        entryBlock(332, "VETO", CONTENT[332], BROKEN_CHAIN[331], "Chain Hash", BROKEN_CHAIN[332]),
        entryBlock(335, "IMPLEMENT", CONTENT[335], BROKEN_CHAIN[334], "Chain Hash", BROKEN_CHAIN[335]),
        entryBlock(336, "SUBSTANTIATE", CONTENT[336], BROKEN_CHAIN[335], "Session Seal", BROKEN_CHAIN[336]),
    ];
    return [
        `_Earlier content_`,
        ``,
        `---`,
        ``,
        ...blocks.map((b) => b),
        ``,
        `_Chain integrity: VALID_`,
        ``,
    ].join("\n");
}

test("computeRepairPlan returns exact legacy cascade for broken fixture", () => {
    const entries = repair.parseEntries(brokenFixture(), [331, 336]);
    const plan = repair.computeRepairPlan(entries);
    let prev = ANCHOR_PREV_331;
    for (let n = 331; n <= 336; n += 1) {
        assert.equal(plan[n].previous_hash, prev, `prev for #${n}`);
        assert.equal(plan[n].chain_hash, EXPECTED_CASCADE[n], `chain for #${n}`);
        prev = plan[n].chain_hash;
    }
});

test("drift guard rejects changed #331 content hash", () => {
    const drifted = brokenFixture().replace(
        CONTENT[331],
        "0000000000000000000000000000000000000000000000000000000000000000"
    );
    const entries = repair.parseEntries(drifted, [331, 336]);
    assert.throws(
        () => repair.computeRepairPlan(entries),
        /drift/i
    );
});

test("renderRepaired produces verifier-readable #336 chain/seal field", () => {
    const text = brokenFixture();
    const repaired = repair.applyRepair(text, [331, 336]);
    // verifier-readable means the entry uses **Chain Hash** so qor-logic verify-ledger
    // matches it. The repaired #336 field is "**Chain Hash (Session Seal)**".
    assert.match(repaired, /\*\*Chain Hash \(Session Seal\)\*\*/);
    assert.doesNotMatch(repaired, /\*\*Session Seal\*\*\s*:/);
});

test("apply round-trip: #332.previous_hash equals #331 repaired chain_hash", () => {
    const repaired = repair.applyRepair(brokenFixture(), [331, 336]);
    const entries = repair.parseEntries(repaired, [331, 336]);
    assert.equal(entries[332].previous_hash, entries[331].chain_hash);
    assert.equal(entries[331].chain_hash, EXPECTED_CASCADE[331]);
});

test("apply round-trip: #336 keeps content hash and seal becomes verifier-readable", () => {
    const repaired = repair.applyRepair(brokenFixture(), [331, 336]);
    const entries = repair.parseEntries(repaired, [331, 336]);
    assert.equal(entries[336].content_hash, CONTENT[336]);
    assert.equal(entries[336].chain_hash, EXPECTED_CASCADE[336]);
    // verify locally with legacy formula
    const expected = crypto
        .createHash("sha256")
        .update(entries[336].content_hash + entries[336].previous_hash)
        .digest("hex");
    assert.equal(entries[336].chain_hash, expected);
});

test("checkContinuity accepts repaired #331-#336 text", () => {
    const repaired = repair.applyRepair(brokenFixture(), [331, 336]);
    const result = repair.checkContinuity(repaired, [331, 336]);
    assert.equal(result.ok, true);
    assert.equal(result.firstFailure, null);
});

test("checkContinuity rejects broken fixture and reports #331 as first failure", () => {
    const result = repair.checkContinuity(brokenFixture(), [331, 336]);
    assert.equal(result.ok, false);
    assert.equal(result.firstFailure, 331);
});
