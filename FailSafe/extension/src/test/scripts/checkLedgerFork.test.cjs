"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const guard = require(path.resolve(__dirname, "..", "..", "..", "scripts", "check-ledger-fork.cjs"));

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const LEDGER = path.join(REPO_ROOT, "docs", "META_LEDGER.md");
const FIX = path.resolve(__dirname, "..", "fixtures", "ledger-fork");
const fixture = (name) => path.join(FIX, `${name}.md`);
const liveText = () => fs.readFileSync(LEDGER, "utf-8");

const SAFE_HASH = "7f3a9b2e5d8c1a4f6b0e3d7c2a5f8b1e4d6c9a3f7b2e5d8c1a4f6b0e3d7c2a5f";
// Non-hex on purpose: it must classify as `unclassified`, which is the pin that
// survives ledger growth. Counts (labels/recovered/sentinel/inspected) all grow
// with every legitimate append and are therefore reported, never equality-pinned.
const NON_HEX = "zzzz9b2e5d8c1a4f6b0e3d7c2a5f8b1e4d6c9a3f7b2e5d8c1a4f6b0e3d7c2a5f";

function capture(argv) {
    const out = [];
    const err = [];
    const so = process.stdout.write.bind(process.stdout);
    const se = process.stderr.write.bind(process.stderr);
    process.stdout.write = (c) => { out.push(String(c)); return true; };
    process.stderr.write = (c) => { err.push(String(c)); return true; };
    try {
        return { code: guard.main(argv), stdout: out.join(""), stderr: err.join("") };
    } finally {
        process.stdout.write = so;
        process.stderr.write = se;
    }
}

function tempRepo(mutateSentinel) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ledger-fork-"));
    fs.mkdirSync(path.join(dir, "docs"), { recursive: true });
    let text = liveText();
    if (mutateSentinel) {
        const lines = text.split(/\r?\n/);
        const i = lines.findIndex((l) => /^\*\*Previous Hash\*\*:[ \t]*`?(?:pending[-a-z]*|N\/A|none|GENESIS)/i.test(l));
        assert.ok(i >= 0, "fixture precondition: the live artifact must contain a sentinel line");
        lines[i] = "**Previous Hash**: " + NON_HEX;
        text = lines.join("\n");
    }
    fs.writeFileSync(path.join(dir, "docs", "META_LEDGER.md"), text, "utf-8");
    return dir;
}

// ---------------------------------------------------------------- classifier

test("classifyPreviousHash returns the FULL hex run, not a 64-char prefix", () => {
    const sixtySix = "d9a3e8c7b2f6e0a4d8c1b5f9e3a7d2c6b0e4f8a1d5e9c3b7f0a4".padEnd(66, "a").slice(0, 66);
    const got = guard.classifyPreviousHash(`**Previous Hash**: ${sixtySix}`);
    assert.equal(got.form, "inline");
    assert.equal(got.value.length, 66, "pinning the run to 64 collapses every duplicate group to zero");
});

test("classifyPreviousHash recognises all three live sentinel surface forms", () => {
    for (const line of [
        "**Previous Hash**: `pending-runtime-tooling` (Entry #324)",
        "**Previous Hash**: pending-runtime-tooling (Entry #322)",
        "**Previous Hash**: GENESIS (no predecessor)",
    ]) {
        const got = guard.classifyPreviousHash(line);
        assert.equal(got.form, "sentinel", line);
        assert.equal(got.value, null, "sentinel value must be null or all 63 form one false group");
    }
});

test("classifyPreviousHash reports a non-hex value as unclassified", () => {
    const got = guard.classifyPreviousHash("**Previous Hash**: f1g2h3i4j5k6l7m8n9o0p1q2");
    assert.equal(got.form, "unclassified");
    assert.equal(got.value, null);
});

// ----------------------------------------------------------------- coverage

test("coverage on the live artifact classifies every label into a known form", () => {
    const cov = guard.coverage(liveText());
    assert.equal(cov.labels, cov.recovered + cov.sentinel + cov.unclassified);
    assert.ok(cov.recovered > 0, "a parser recovering nothing is degraded, not a small ledger");
    assert.ok(cov.sentinel > 0);
    // Totals grow with every append and are deliberately NOT pinned; the
    // unclassified SET is the growth-stable degradation check.
    assert.deepEqual(guard.unclassifiedEntries(liveText()), guard.UNCLASSIFIED_BASELINE);
});

test("degraded classifier injected into the real coverage satisfies the identity and fails the pins", () => {
    const real = guard.coverage(liveText());
    const cov = guard.coverage(liveText(), () => ({ form: "sentinel", value: null }));
    assert.deepEqual(cov, { labels: real.labels, recovered: 0, sentinel: real.labels, unclassified: 0 });
    assert.equal(cov.labels, cov.recovered + cov.sentinel + cov.unclassified,
        "the partition identity is a tautology - it holds even here");
    assert.equal(cov.unclassified, 0,
        "and the unclassified SET check is what catches it: 0 !== UNCLASSIFIED_BASELINE");
});

test("coverage counts labels independently, so a label-dropping classifier still fails", () => {
    const real = guard.coverage(liveText());
    const cov = guard.coverage(liveText(), () => ({ form: "unclassified", value: null }));
    assert.equal(cov.labels, real.labels, "labels must not be derived from the classifier's return");
    assert.equal(cov.unclassified, real.labels);
});

// ------------------------------------------------------------------ grouping

test("groupByPreviousHash groups an inline entry with a backtick entry sharing the value", () => {
    const groups = guard.groupByPreviousHash(liveText()).map((g) => g.join(","));
    assert.ok(groups.includes("259,262"),
        "#259 is inline and #262 is backtick - the same 66-hex value must group across forms");
});

test("groupByPreviousHash excludes null-valued entries", () => {
    const groups = guard.groupByPreviousHash(liveText());
    assert.ok(groups.every((g) => g.length < 60),
        "sentinels share a literal; grouping on null would form one 67-member false group");
});

test("attestedGroups clears a fully-named group and keeps a partially-named one", () => {
    const shared = "**Previous Hash**: `" + "a".repeat(64) + "`";
    const body = (n, extra) => `### Entry #${n}: fixture\n\n${shared}\n${extra || ""}\n`;
    const full = body(1) + body(2) + `### Entry #3: recon\n\n**Reconciled Entries**: #1, #2\n`;
    const partial = body(1) + body(2) + `### Entry #3: recon\n\n**Reconciled Entries**: #1\n`;
    assert.equal(guard.attestedGroups(full).length, 0, "naming every member clears the group");
    assert.equal(guard.attestedGroups(partial).length, 1, "partial naming must NOT clear");
});

// ------------------------------------------------------------------- fences

test("findDuplicateNumbers ignores a heading inside a fenced block", () => {
    const fenced = "### Entry #1: real\n\n```\n### Entry #1: quoted\n```\n";
    assert.deepEqual(guard.findDuplicateNumbers(fenced), {});
    assert.deepEqual(guard.findDuplicateNumbers("### Entry #1: a\n### Entry #1: b\n"), { 1: 2 });
});

test("both heading dialects agree on the live artifact's entry count", () => {
    const text = liveText();
    const raw = (text.match(/^### Entry #\d+:/gm) || []).length;
    const stripped = (guard.stripFences(text).match(/^### Entry #\d+:/gm) || []).length;
    assert.equal(raw, stripped, "a heading quoted inside a fence would make these diverge");
});

test("inspect returns zero for empty input", () => {
    assert.equal(guard.inspect("").inspected, 0);
});

// --------------------------------------------------- fixture mode (--file)

const EXPECTED = [
    ["clean", 0, null, 7],
    ["forked", 1, /597 appears 2 times/, 9],
    ["repaired", 0, null, 9],
    ["empty", 1, /inspected 0 entries/, 0],
    ["dup204x4", 1, /204 appears 4 times/, 11],
    ["partial-attest", 1, /9001,9002/, 3],
];

for (const [name, code, reason, inspected] of EXPECTED) {
    test(`main --file ${name}.md exits ${code}`, () => {
        const res = capture(["--file", fixture(name)]);
        assert.equal(res.code, code);
        assert.match(res.stdout, new RegExp(`inspected ${inspected} entries`),
            "inspected count is pinned, so a parser recognising fewer entries fails");
        if (reason) assert.match(res.stderr, reason, "the failure must be pinned to its reason");
    });
}

// ------------------------------------------------ live mode (--repo-root)

test("B9 case 1: --repo-root on a verbatim ledger copy exits 0", () => {
    const dir = tempRepo(false);
    const res = capture(["--repo-root", dir]);
    assert.equal(res.code, 0, res.stderr);
    assert.match(res.stdout, /inspected \d+ entries/);
});

test("B9 case 1b: live mode still exits 0 after a LEGITIMATE append", () => {
    const dir = tempRepo(false);
    const file = path.join(dir, "docs", "META_LEDGER.md");
    fs.appendFileSync(file,
        "\n---\n\n### Entry #9999: a legitimate new entry\n\n" +
        "**Previous Hash**: `" + "b".repeat(64) + "`\n", "utf-8");
    const res = capture(["--repo-root", dir]);
    assert.equal(res.code, 0,
        "counts grow with every append; pinning them would redden CI on normal ledger growth");
});

test("B9 case 2: one unrecognisable previous_hash makes the coverage pin gate the exit code", () => {
    const dir = tempRepo(true);
    const res = capture(["--repo-root", dir]);
    assert.equal(res.code, 1, "a guard that computes the counts but never wires them would exit 0");
    assert.match(res.stderr, /coverage pin unclassified/);
});

test("main requires exactly one of --repo-root / --file", () => {
    assert.equal(capture(["--repo-root", ".", "--file", "x"]).code, 2);
    assert.equal(capture([]).code, 2);
});

// ---------------------------------------------------------- anti-widening

test("the live duplicate-number set EQUALS the baseline constant", () => {
    const live = guard.findDuplicateNumbers(liveText());
    assert.deepEqual(
        Object.fromEntries(Object.entries(live).map(([k, v]) => [Number(k), v])),
        guard.DUPLICATE_NUMBER_BASELINE,
        "widening the constant to silence a new duplicate makes this go red");
});

test("the live unattested previous_hash groups EQUAL the 15-group baseline", () => {
    const live = guard.attestedGroups(liveText()).map((g) => g.join(",")).sort();
    const base = guard.PREV_HASH_BASELINE.map((g) => g.join(",")).sort();
    assert.deepEqual(live, base, "[397,401] is attested by Entry #447 and must not be in the baseline");
    assert.equal(live.length, 15);
});

test("the live unclassified set EQUALS the baseline", () => {
    assert.deepEqual(guard.unclassifiedEntries(liveText()), guard.UNCLASSIFIED_BASELINE);
});
