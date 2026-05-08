#!/usr/bin/env node
// Heuristic helpers for feature-index-classifier.cjs.
//
// Section 4 Razor: factored out of the parent driver to keep both files ≤250L
// and isolate the regex-heavy presence-only / functional detection from the
// FEATURE_INDEX row-parsing + classify-entry orchestration logic.

'use strict';

const TEST_BLOCK_RE = /\b(it|test|suite|describe)\s*\(/;

const PRESENCE_ASSERTION_PATTERNS = [
  /assert\.ok\(\s*fs\.existsSync/,
  /\.toBeDefined\s*\(/,
  /\.toExist\s*\(/,
  /\.toContain\s*\(/,
];

const FUNCTIONAL_ASSERTION_PATTERNS = [
  /assert\.equal\s*\(/,
  /assert\.deepEqual\s*\(/,
  /assert\.strictEqual\s*\(/,
  /assert\.deepStrictEqual\s*\(/,
  /assert\.match\s*\(/,
  /assert\.notEqual\s*\(/,
  /assert\.notDeepEqual\s*\(/,
  /assert\.throws\s*\(/,
  /assert\.rejects\s*\(/,
  /\.toEqual\s*\(/,
  /\.toBe\s*\(/,
  /\.toMatch\s*\(/,
  /\.toHaveBeenCalled/,
  /\.toHaveBeenCalledWith\s*\(/,
  /\.toHaveBeenCalledTimes\s*\(/,
  /\.toThrow\s*\(/,
  /\.toReturn\s*\(/,
];

// Returns true when the test body contains at least one block keyword call.
function hasTestBlocks(text) {
  return TEST_BLOCK_RE.test(text);
}

// Returns the symbol token to scan for invocation. When codeRef is the
// em-dash sentinel or empty, returns null (caller falls back to any-symbol
// invocation matching).
function deriveSymbol(codeRef) {
  if (!codeRef) return null;
  const trimmed = String(codeRef).trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return null;
  // Code refs in FEATURE_INDEX are usually opaque IDs (C001, C287); they do
  // not name source symbols directly. Treat as null for invocation matching;
  // we fall back to any-symbol detection.
  if (/^C\d+$/.test(trimmed)) return null;
  // Otherwise treat as a literal symbol name (extension-friendly for future
  // FEATURE_INDEX migrations that put real symbol names in the Code column).
  const sanitized = trimmed.replace(/[^A-Za-z0-9_]/g, '');
  return sanitized || null;
}

function buildSymbolInvocationRe(symbol) {
  if (!symbol) {
    // Any non-builtin call: word(...) or .word(...) or new Word(...). We
    // intentionally exclude common test-framework calls so that a file that
    // ONLY contains describe/it/expect/assert/fs.existsSync isn't classified
    // as functional via test-runtime invocations.
    return /\b(?!(?:if|for|while|switch|return|typeof|describe|it|test|suite|before|after|beforeEach|afterEach|expect|assert|require|console|fs|path|os|process|JSON|Math|Array|Object|String|Number|Boolean|Promise|Set|Map)\b)([A-Za-z_$][\w$]*)\s*\(/;
  }
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:\\b|\\.)${escaped}\\s*\\(|\\bnew\\s+${escaped}\\s*\\(`);
}

// Strips lines whose only "invocation" is inside a presence-style assertion
// (e.g. `assert.ok(fs.existsSync(target))`) so that subsequent invocation
// detection isn't fooled by the call inside the presence wrapper.
function stripPresenceLines(text) {
  return text
    .split(/\r?\n/)
    .filter(line => !PRESENCE_ASSERTION_PATTERNS.some(re => re.test(line)))
    .join('\n');
}

// Returns {matches, reasoning} — true when the file's only real assertions
// are presence-style, with no symbol invocation pattern hit OUTSIDE the
// presence-assertion lines themselves.
function hasOnlyPresenceAssertions(text, codeRef) {
  const presenceHit = PRESENCE_ASSERTION_PATTERNS.some(re => re.test(text));
  if (!presenceHit) return { matches: false, reasoning: 'no presence assertions detected' };

  const functionalHit = FUNCTIONAL_ASSERTION_PATTERNS.some(re => re.test(text));
  if (functionalHit) {
    return { matches: false, reasoning: 'functional assertion patterns also present' };
  }

  const symbol = deriveSymbol(codeRef);
  const invocationRe = buildSymbolInvocationRe(symbol);
  const stripped = stripPresenceLines(text);
  const invocationHit = invocationRe.test(stripped);
  if (invocationHit) {
    return { matches: false, reasoning: 'symbol invocation present outside presence assertions' };
  }

  const symbolLabel = symbol ? `symbol "${symbol}"` : 'any user symbol';
  return {
    matches: true,
    reasoning: `only presence-style assertions; no invocation of ${symbolLabel}`,
  };
}

// Returns true when the file invokes a function/method AND asserts against
// return value or observable side-effect via a functional-style matcher.
function hasFunctionalAssertions(text) {
  const functionalAssertion = FUNCTIONAL_ASSERTION_PATTERNS.some(re => re.test(text));
  if (!functionalAssertion) return false;
  const invocationRe = buildSymbolInvocationRe(null);
  return invocationRe.test(text);
}

module.exports = {
  hasTestBlocks,
  hasOnlyPresenceAssertions,
  hasFunctionalAssertions,
  deriveSymbol,
  buildSymbolInvocationRe,
  PRESENCE_ASSERTION_PATTERNS,
  FUNCTIONAL_ASSERTION_PATTERNS,
  TEST_BLOCK_RE,
};
