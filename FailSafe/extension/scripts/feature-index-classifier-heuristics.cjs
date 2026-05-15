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

// E3: presence-style match patterns. assert.match against file content or
// rendered text variables is shape-checking, not behavioral verification.
// When ALL assert.match calls in a file match these patterns, the file is
// treated as presence-style for overall classification.
const PRESENCE_MATCH_PATTERNS = [
  /assert\.match\s*\(\s*fs\.readFileSync/,
  /assert\.match\s*\(\s*\w*Content\b/,
  /assert\.match\s*\(\s*\w*Text\b/,
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
  // E3: Playwright matcher whitelist. expect(locator).<matcher>() patterns
  // that signify functional assertions on rendered DOM state.
  /\.toHaveClass\s*\(/,
  /\.toBeVisible\s*\(/,
  /\.toBeHidden\s*\(/,
  /\.toContainText\s*\(/,
  /\.toHaveText\s*\(/,
  /\.toHaveAttribute\s*\(/,
  /\.toHaveValue\s*\(/,
  /\.toHaveCount\s*\(/,
  /\.toBeChecked\s*\(/,
  /\.toBeEnabled\s*\(/,
  /\.toBeDisabled\s*\(/,
  /\.toBeEditable\s*\(/,
  /\.toBeFocused\s*\(/,
];

// E3: weak-functional patterns are functional matchers whose semantics are
// shape-checking when divorced from invocation context. When the file's ONLY
// functional matchers are weak (.toBe alone) AND no symbol invocation occurs
// outside the test-framework allowlist, treat as ambiguous rather than
// functional. Strong matchers (.toEqual, .toHaveBeenCalled*, .toThrow,
// assert.equal, etc.) signify intent stronger than weak shape-checking.
const WEAK_FUNCTIONAL_RE = /\.toBe\s*\(/;

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
    return /\b(?!(?:if|for|while|switch|return|typeof|async|await|function|new|class|void|delete|yield|instanceof|describe|it|test|suite|before|after|beforeEach|afterEach|expect|assert|require|console|fs|path|os|process|JSON|Math|Array|Object|String|Number|Boolean|Promise|Set|Map)\b)([A-Za-z_$][\w$]*)\s*\(/;
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

// E3: strips lines containing functional matcher calls (.toBe(, .toBeVisible(,
// assert.equal(, etc.) so that the matcher's own method-call shape doesn't
// register as an out-of-framework invocation. The matcher is part of the test
// framework's vocabulary; only invocations OUTSIDE the matcher line count.
function stripFunctionalAssertionLines(text) {
  return text
    .split(/\r?\n/)
    .filter(line => !FUNCTIONAL_ASSERTION_PATTERNS.some(re => re.test(line)))
    .join('\n');
}

// E3: returns true when every assert.match call in the file matches a
// PRESENCE_MATCH pattern (file-content or shape-text). If there are no
// assert.match calls, returns false (no determination). Used to discriminate
// behavioral assert.match (return value) from presence-style (file content).
function hasOnlyPresenceMatch(text) {
  const allMatch = text.match(/assert\.match\s*\([^\n]+/g) || [];
  if (allMatch.length === 0) return false;
  return allMatch.every(line => PRESENCE_MATCH_PATTERNS.some(re => re.test(line)));
}

// E3: returns true when the file's only functional pattern is the weak
// .toBe matcher AND no other functional matcher is present. Used to detect
// shape-tests masquerading as functional verification.
function hasOnlyWeakFunctional(text) {
  if (!WEAK_FUNCTIONAL_RE.test(text)) return false;
  const strongHit = FUNCTIONAL_ASSERTION_PATTERNS.some(re => {
    if (re.source === WEAK_FUNCTIONAL_RE.source) return false;
    return re.test(text);
  });
  return !strongHit;
}

// Returns {matches, reasoning} — true when the file's only real assertions
// are presence-style, with no symbol invocation pattern hit OUTSIDE the
// presence-assertion lines themselves.
function hasOnlyPresenceAssertions(text, codeRef) {
  const presenceHit = PRESENCE_ASSERTION_PATTERNS.some(re => re.test(text));
  const presenceMatchHit = hasOnlyPresenceMatch(text);
  if (!presenceHit && !presenceMatchHit) {
    return { matches: false, reasoning: 'no presence assertions detected' };
  }

  const otherFunctionalHit = FUNCTIONAL_ASSERTION_PATTERNS.some(re => {
    if (re.source === /assert\.match\s*\(/.source && presenceMatchHit) return false;
    return re.test(text);
  });
  if (otherFunctionalHit) {
    return { matches: false, reasoning: 'functional assertion patterns also present' };
  }

  const symbol = deriveSymbol(codeRef);
  const invocationRe = buildSymbolInvocationRe(symbol);
  const stripped = stripPresenceLines(text);
  const invocationHit = invocationRe.test(stripped);
  if (invocationHit) {
    return { matches: false, reasoning: 'symbol invocation present outside presence assertions' };
  }

  const reasonPrefix = presenceMatchHit
    ? 'only file-content/presence-style assert.match'
    : 'only presence-style assertions';
  const symbolLabel = symbol ? `symbol "${symbol}"` : 'any user symbol';
  return {
    matches: true,
    reasoning: `${reasonPrefix}; no invocation of ${symbolLabel}`,
  };
}

// Returns true when the file invokes a function/method AND asserts against
// return value or observable side-effect via a functional-style matcher.
// E3: invocation detection runs against text with matcher-call lines stripped
// so that .toBe(, .toBeVisible(, etc. don't register as out-of-framework
// calls. When the only functional matcher is weak (.toBe) and no real
// invocation is present, return false (downgrades to ambiguous downstream).
function hasFunctionalAssertions(text) {
  const functionalAssertion = FUNCTIONAL_ASSERTION_PATTERNS.some(re => re.test(text));
  if (!functionalAssertion) return false;
  const stripped = stripFunctionalAssertionLines(text);
  const invocationRe = buildSymbolInvocationRe(null);
  const hasInvocation = invocationRe.test(stripped);
  if (!hasInvocation && hasOnlyWeakFunctional(text)) return false;
  return hasInvocation;
}

module.exports = {
  hasTestBlocks,
  hasOnlyPresenceAssertions,
  hasFunctionalAssertions,
  hasOnlyPresenceMatch,
  hasOnlyWeakFunctional,
  deriveSymbol,
  buildSymbolInvocationRe,
  PRESENCE_ASSERTION_PATTERNS,
  PRESENCE_MATCH_PATTERNS,
  FUNCTIONAL_ASSERTION_PATTERNS,
  WEAK_FUNCTIONAL_RE,
  TEST_BLOCK_RE,
};
