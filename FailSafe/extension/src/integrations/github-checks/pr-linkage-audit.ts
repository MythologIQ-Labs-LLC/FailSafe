/**
 * pr-linkage-audit — PR↔issue linkage hygiene auditor (#154), a second Check Run
 * beside the SHIELD-verdict check (#96). PURE parse + audit (no I/O, no secrets)
 * so the logic is deterministically testable; the live path uses an INJECTED GET
 * transport and is off-by-default (no token ⇒ no network).
 *
 * The originating footgun: GitHub auto-closes an issue only when EACH number
 * carries its own close-keyword, so `Closes #1, #2, #3` silently closes only #1.
 * This is exactly the deterministic pre-merge hygiene FailSafe governs.
 *
 * Close keywords per GitHub docs (case-insensitive):
 *   https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/using-keywords-in-issues-and-pull-requests
 */

import type { CheckConclusion, CheckRunPayload } from './github-checks-map';

/** The nine documented GitHub closing keywords (case-insensitive). */
export const CLOSE_KEYWORDS = [
  'close', 'closes', 'closed', 'fix', 'fixes', 'fixed', 'resolve', 'resolves', 'resolved',
] as const;

// Longest-first alternation so e.g. `closes` wins over `close` before the `\b`.
const KW_ALT = [...CLOSE_KEYWORDS].sort((a, b) => b.length - a.length).join('|');
const CLOSING_RE = new RegExp(`\\b(?:${KW_ALT})\\s+#(\\d+)`, 'gi');
const COMMA_LIST_RE = new RegExp(`\\b(?:${KW_ALT})\\s+#\\d+((?:\\s*,\\s*#\\d+)+)`, 'gi');
const ANY_REF_RE = /#(\d+)/g;

export interface ParsedLinkage {
  /** Issues that WILL auto-close on merge (each has its own keyword). */
  closing: number[];
  /** Every issue number referenced anywhere in the body. */
  referenced: number[];
  /** Numbers in a `keyword #a, #b` list AFTER the first — the silent non-closes. */
  commaListBare: number[];
}

const uniqNums = (xs: number[]): number[] => [...new Set(xs)];

export function parsePrLinkage(body: string): ParsedLinkage {
  const text = body || '';
  const closing: number[] = [];
  for (const m of text.matchAll(CLOSING_RE)) closing.push(parseInt(m[1], 10));
  const commaListBare: number[] = [];
  for (const m of text.matchAll(COMMA_LIST_RE)) {
    for (const r of m[1].matchAll(/#(\d+)/g)) commaListBare.push(parseInt(r[1], 10));
  }
  const referenced: number[] = [];
  for (const m of text.matchAll(ANY_REF_RE)) referenced.push(parseInt(m[1], 10));
  return { closing: uniqNums(closing), referenced: uniqNums(referenced), commaListBare: uniqNums(commaListBare) };
}

export type LinkageFindingKind = 'multi-close-no-keyword' | 'closes-stale-or-missing' | 'referenced-not-closed';
export interface LinkageFinding {
  kind: LinkageFindingKind;
  issue: number;
  severity: 'warn' | 'fail';
  detail: string;
}

export interface LinkageAuditInput {
  body: string;
  /** Currently-open issue numbers in the repo. */
  openIssues: number[];
  /** All existing issue numbers (open + closed). When provided, a closing ref
   *  not present here is flagged as nonexistent (fail) vs already-closed (warn). */
  knownIssues?: number[];
  /** The PR's own number — never flag a self-reference. */
  selfPr?: number;
}

export interface LinkageAuditResult {
  findings: LinkageFinding[];
  conclusion: CheckConclusion;
}

/** Pure: parsed linkage + the repo's open-issue list → findings + conclusion. */
export function auditPrLinkage(input: LinkageAuditInput): LinkageAuditResult {
  const p = parsePrLinkage(input.body);
  const open = new Set(input.openIssues);
  const known = input.knownIssues ? new Set(input.knownIssues) : null;
  const closingSet = new Set(p.closing);
  const bareSet = new Set(p.commaListBare);
  const findings: LinkageFinding[] = [];

  // The originating footgun: a comma-listed number after a keyword won't close.
  for (const n of p.commaListBare) {
    findings.push({
      kind: 'multi-close-no-keyword', issue: n, severity: 'fail',
      detail: `#${n} is in a "Closes …, #${n}" list without its own keyword — it will NOT auto-close on merge (GitHub closes only the first).`,
    });
  }

  // A closing keyword pointing at a nonexistent or already-closed issue.
  for (const n of p.closing) {
    if (known && !known.has(n)) {
      findings.push({ kind: 'closes-stale-or-missing', issue: n, severity: 'fail', detail: `Closes #${n}, which does not exist in this repo.` });
    } else if (!open.has(n)) {
      findings.push({ kind: 'closes-stale-or-missing', issue: n, severity: 'warn', detail: `Closes #${n}, which is not currently open (already closed).` });
    }
  }

  // An open issue referenced without any close keyword — it will stay open.
  for (const n of p.referenced) {
    if (closingSet.has(n) || bareSet.has(n)) continue;
    if (n === input.selfPr) continue;
    if (open.has(n)) {
      findings.push({ kind: 'referenced-not-closed', issue: n, severity: 'warn', detail: `#${n} is referenced but has no close keyword — it will stay open after merge.` });
    }
  }

  const hasFail = findings.some((f) => f.severity === 'fail');
  const hasWarn = findings.some((f) => f.severity === 'warn');
  const conclusion: CheckConclusion = hasFail ? 'failure' : hasWarn ? 'neutral' : 'success';
  return { findings, conclusion };
}

const TITLE: Record<CheckConclusion, string> = {
  success: 'PR linkage: clean',
  neutral: 'PR linkage: advisory',
  failure: 'PR linkage: gaps',
};

/** Pure builder for the linkage Check Run body. Carries only issue numbers +
 *  finding kinds — never PR content, tokens, or secrets. */
export function buildLinkageCheckRunPayload(
  headSha: string, result: LinkageAuditResult, detailsUrl?: string,
): CheckRunPayload {
  const summary = result.findings.length
    ? result.findings.map((f) => `- ${f.detail}`).join('\n')
    : 'Linkage clean — every referenced issue closes correctly.';
  const payload: CheckRunPayload = {
    name: 'FailSafe: PR Linkage',
    head_sha: headSha,
    status: 'completed',
    conclusion: result.conclusion,
    output: { title: TITLE[result.conclusion], summary },
  };
  if (detailsUrl?.trim()) payload.details_url = detailsUrl.trim();
  return payload;
}

/** Injected GET transport — tests pass a stub so there is NO live network. */
export interface GitHubGetFn {
  (url: string, headers: Record<string, string>): Promise<{ status: number; body: string }>;
}

export interface LinkageRunOptions {
  get: GitHubGetFn;
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  /** SECRET — placed only in the Authorization header, never returned/logged. */
  token?: string;
  /** Off-by-default. `false` (or no token) ⇒ localOnly, no network. */
  enabled?: boolean;
}

export interface LinkageRunResult {
  ok: boolean;
  localOnly?: boolean;
  conclusion?: CheckConclusion;
  findings?: LinkageFinding[];
  error?: string;
}

/**
 * Live path: fetch the PR body + the repo's open issues via the injected GET,
 * then audit. Off-by-default — with no token (or disabled) it returns localOnly
 * WITHOUT touching the network. The token never appears in the result.
 */
export async function runLinkageAudit(opts: LinkageRunOptions): Promise<LinkageRunResult> {
  if (opts.enabled === false || !opts.token || !opts.token.trim()) {
    return { ok: true, localOnly: true };
  }
  const headers = {
    Authorization: `token ${opts.token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'FailSafe',
  };
  const base = `https://api.github.com/repos/${opts.owner}/${opts.repo}`;
  try {
    const prRes = await opts.get(`${base}/pulls/${opts.prNumber}`, headers);
    if (prRes.status >= 400) return { ok: false, error: `GitHub PR fetch failed (HTTP ${prRes.status}).` };
    const body = (JSON.parse(prRes.body || '{}') as { body?: string }).body ?? '';

    const issRes = await opts.get(`${base}/issues?state=open&per_page=100`, headers);
    if (issRes.status >= 400) return { ok: false, error: `GitHub issue fetch failed (HTTP ${issRes.status}).` };
    const issues = JSON.parse(issRes.body || '[]') as Array<{ number: number; pull_request?: unknown }>;
    const openIssues = issues.filter((i) => !i.pull_request).map((i) => i.number);

    const result = auditPrLinkage({ body, openIssues, selfPr: opts.prNumber });
    return { ok: true, conclusion: result.conclusion, findings: result.findings };
  } catch {
    // Never surface raw error text (could echo a header/token); keep it generic.
    return { ok: false, error: 'PR linkage audit failed (network or parse error).' };
  }
}
