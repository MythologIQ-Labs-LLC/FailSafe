#!/usr/bin/env node
"use strict";

// Bounded Entry #331-#336 META_LEDGER repair tool.
// Pure helpers + CLI. stdlib-only. Fails closed on any input drift.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ANCHOR_PREV_331 =
    "f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9";

const EXPECTED_CONTENT = {
    331: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2",
    332: "f2d7eb641458cae6ec5b9d08461923efc78478e1f935cd591aa4deb3f96537bc",
    333: "00d8b3bc5f090774e5a853385a610b6e72607f599ca273705ad77911ea9b19ef",
    334: "7e6b09758417beae6a5167105f3e8e5bf20528adac69445a148d4dfad07294cc",
    335: "aecc3ed8558da0b45f5dd60d60f328b45711877d6f6490de935588df57520a5b",
    336: "20f4bb5a15c866a3067076a377b67a9f2694372ed453c7f0563e8ec3fc62650a",
};

const EXPECTED_BROKEN_CHAIN = {
    331: "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3",
    332: "62d542f424f44f40b88d096ed333dbba5982c1fead7fc5f4c494f2cb2d1e2f4e",
    333: "9aa1caba56ac574d9914753a56cf1df7df944e88ddcf41ce8bfae1b4b5a911f4",
    334: "ef31d2d414225e6e482f2c66c7324145110f2079ff30f41c9344078a58be3d4e",
    335: "800894ea8d6daa1e8d2afc5a0dfc1913f83974318ca84f03f197034c26520490",
    336: "ca2f6ef1f5b66c8245e955ab4eafc98d66d6f8315c934232c9ddc2d0764691af",
};

function legacyHash(contentHex, previousHex) {
    return crypto.createHash("sha256").update(contentHex + previousHex).digest("hex");
}

function parseFields(block) {
    const fields = { content_hash: null, previous_hash: null, chain_hash: null, seal_kind: null };
    const c = /\*\*Content Hash\*\*[\s\S]*?=\s*`([a-f0-9]{64})`/i.exec(block);
    if (c) fields.content_hash = c[1];
    const p = /\*\*Previous Hash\*\*[^`]*`([a-f0-9]{64})`/i.exec(block);
    if (p) fields.previous_hash = p[1];
    const chain = /\*\*Chain Hash(?:\s*\(Session Seal\))?\*\*[\s\S]*?=\s*`([a-f0-9]{64})`/i.exec(block);
    if (chain) {
        fields.chain_hash = chain[1];
        fields.seal_kind = /\(Session Seal\)/.test(chain[0]) ? "chain_and_seal" : "chain_hash";
        return fields;
    }
    const seal = /\*\*Session Seal\*\*[\s\S]*?=\s*`([a-f0-9]{64})`/i.exec(block);
    if (seal) {
        fields.chain_hash = seal[1];
        fields.seal_kind = "session_seal";
    }
    return fields;
}

function parseEntries(text, range) {
    const [lo, hi] = range;
    const entries = {};
    const re = /### Entry #(\d+):([^\n]*)\n([\s\S]*?)(?=\n### Entry #\d+:|\n_Chain integrity:|$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const num = parseInt(m[1], 10);
        if (num < lo || num > hi) continue;
        entries[num] = {
            number: num,
            header: m[2].trim(),
            raw: m[0],
            startIndex: m.index,
            endIndex: m.index + m[0].length,
            ...parseFields(m[0]),
        };
    }
    return entries;
}

function validateCurrentHashes(entries) {
    for (let n = 331; n <= 336; n += 1) {
        const e = entries[n];
        if (!e) throw new Error(`drift: missing Entry #${n}`);
        if (e.content_hash !== EXPECTED_CONTENT[n]) {
            throw new Error(`drift: Entry #${n} content_hash ${e.content_hash} != expected ${EXPECTED_CONTENT[n]}`);
        }
        if (e.chain_hash !== EXPECTED_BROKEN_CHAIN[n]) {
            throw new Error(`drift: Entry #${n} chain/seal ${e.chain_hash} != expected broken ${EXPECTED_BROKEN_CHAIN[n]}`);
        }
    }
    if (entries[331].previous_hash !== ANCHOR_PREV_331) {
        throw new Error(`drift: Entry #331 previous_hash != ${ANCHOR_PREV_331}`);
    }
}

function computeRepairPlan(entries) {
    validateCurrentHashes(entries);
    const plan = {};
    let prev = ANCHOR_PREV_331;
    for (let n = 331; n <= 336; n += 1) {
        const chain = legacyHash(EXPECTED_CONTENT[n], prev);
        plan[n] = { previous_hash: prev, chain_hash: chain };
        prev = chain;
    }
    return plan;
}

function rewriteEntry(block, n, repairPair) {
    let out = block.replace(
        /(\*\*Previous Hash\*\*:?\s*`)[a-f0-9]{64}(`)/i,
        `$1${repairPair.previous_hash}$2`
    );
    if (n === 336) {
        out = out.replace(/\*\*Session Seal\*\*/, "**Chain Hash (Session Seal)**");
        out = out.replace(
            /(\*\*Chain Hash \(Session Seal\)\*\*[\s\S]*?=\s*`)[a-f0-9]{64}(`)/,
            `$1${repairPair.chain_hash}$2`
        );
        return out;
    }
    return out.replace(
        /(\*\*Chain Hash\*\*[\s\S]*?=\s*`)[a-f0-9]{64}(`)/,
        `$1${repairPair.chain_hash}$2`
    );
}

function renderRepaired(originalText, range, plan) {
    const entries = parseEntries(originalText, range);
    const ordered = Object.values(entries).slice().sort((a, b) => a.startIndex - b.startIndex);
    const sliceStart = ordered[0].startIndex;
    const sliceEnd = ordered[ordered.length - 1].endIndex;
    const [lo, hi] = range;
    const repaired = [];
    for (let n = lo; n <= hi; n += 1) {
        repaired.push(rewriteEntry(entries[n].raw, n, plan[n]));
    }
    return originalText.slice(0, sliceStart) + repaired.join("\n") + originalText.slice(sliceEnd);
}

function applyRepair(text, range) {
    const entries = parseEntries(text, range);
    const plan = computeRepairPlan(entries);
    return renderRepaired(text, range, plan);
}

function checkContinuity(text, range) {
    const [lo, hi] = range;
    const entries = parseEntries(text, range);
    for (let n = lo; n <= hi; n += 1) {
        const e = entries[n];
        if (!e) return { ok: false, firstFailure: n, reason: "missing entry" };
        const expected = legacyHash(e.content_hash, e.previous_hash);
        if (e.chain_hash !== expected) {
            return { ok: false, firstFailure: n, reason: "local arithmetic" };
        }
        if (n > lo && e.previous_hash !== entries[n - 1].chain_hash) {
            return { ok: false, firstFailure: n, reason: "adjacency" };
        }
    }
    return { ok: true, firstFailure: null };
}

function parseRange(arg) {
    const m = /^(\d+):(\d+)$/.exec(arg || "");
    if (!m) throw new Error(`--range must be N:M, got: ${arg}`);
    return [parseInt(m[1], 10), parseInt(m[2], 10)];
}

function parseArgs(argv) {
    const out = { repoRoot: null, range: null, apply: false, checkContinuity: false };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        if (a === "--repo-root") out.repoRoot = argv[++i];
        else if (a === "--range") out.range = parseRange(argv[++i]);
        else if (a === "--apply") out.apply = true;
        else if (a === "--check-continuity") out.checkContinuity = true;
    }
    return out;
}

function renderDiffTable(entries, plan) {
    const lines = ["Entry | from previous_hash -> to | from chain/seal -> to"];
    for (let n = 331; n <= 336; n += 1) {
        lines.push(`#${n} | ${entries[n].previous_hash} -> ${plan[n].previous_hash} | ${entries[n].chain_hash} -> ${plan[n].chain_hash}`);
    }
    return lines.join("\n");
}

function cliMain(argv) {
    const args = parseArgs(argv);
    if (!args.repoRoot) throw new Error("--repo-root required");
    if (!args.range) throw new Error("--range required");
    const [lo, hi] = args.range;
    if (lo !== 331 || hi !== 336) throw new Error("only --range 331:336 is supported");
    const ledgerPath = path.join(args.repoRoot, "docs", "META_LEDGER.md");
    const original = fs.readFileSync(ledgerPath, "utf8");
    if (args.checkContinuity) {
        const result = checkContinuity(original, args.range);
        if (result.ok) {
            process.stdout.write("continuity: OK\n");
            return 0;
        }
        process.stderr.write(`continuity: FAIL at #${result.firstFailure} (${result.reason})\n`);
        return 1;
    }
    const entries = parseEntries(original, args.range);
    const plan = computeRepairPlan(entries);
    if (!args.apply) {
        process.stdout.write("DRY RUN — replacement map:\n");
        process.stdout.write(renderDiffTable(entries, plan) + "\n");
        return 0;
    }
    const repaired = renderRepaired(original, args.range, plan);
    fs.writeFileSync(ledgerPath, repaired);
    process.stdout.write(`APPLIED to ${ledgerPath}\n`);
    return 0;
}

module.exports = {
    legacyHash,
    parseFields,
    parseEntries,
    validateCurrentHashes,
    computeRepairPlan,
    rewriteEntry,
    renderRepaired,
    applyRepair,
    checkContinuity,
    EXPECTED_CONTENT,
    EXPECTED_BROKEN_CHAIN,
    ANCHOR_PREV_331,
};

if (require.main === module) {
    try {
        process.exit(cliMain(process.argv.slice(2)));
    } catch (e) {
        process.stderr.write(`ERROR: ${e.message}\n`);
        process.exit(1);
    }
}
