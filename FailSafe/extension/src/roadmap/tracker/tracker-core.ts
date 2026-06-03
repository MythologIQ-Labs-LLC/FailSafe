/**
 * tracker-core — pure types + scoring + evidence-lint for the Development Tracker.
 *
 * Implements docs/design/DEVELOPMENT_TRACKER_STANDARD.md. No fs/express/git here:
 * scoring and the evidence-lint are deterministically testable, and the lint's
 * evidence resolution is injected (so tests need no real artifacts). Parsing of
 * FEATURE_INDEX/BACKLOG lives in tracker-parsers.ts; I/O orchestration in
 * TrackerGenerator.ts.
 */

export type EvidenceRef =
  | { kind: 'pr'; number: number; sha?: string; url?: string }
  | { kind: 'commit'; sha: string }
  | { kind: 'ledger'; entry: number; chainHash?: string }
  | { kind: 'feature'; id: string; status: 'verified' | 'unverified' | 'n/a' }
  | { kind: 'test'; path: string; result: 'pass' | 'fail' | 'unknown' }
  | { kind: 'backlog'; id: string }
  | { kind: 'artifact'; path: string; note?: string }
  | { kind: 'runtime'; statement: string; verifiedAt: string };

export interface Provenance { source: string; formula: string; provisional?: boolean }
export interface Cited { text: string; evidence: EvidenceRef[] }

export interface Vertical {
  key: string; name: string; accent: string;
  pct: number;
  provenance: Provenance;
  scoredOn: Cited;
  nextGate: string;
  inPlace: Cited[];
  whyItMatters: string;
  openWork: string[];
  gate?: { built: boolean; inert: boolean; reason: string };
}

export interface Decision { decision: string; drivenBy: string; evidence: EvidenceRef[] }
export interface ShippedItem { date: string; channel: 'merged' | 'verified-applied'; text: string; evidence: EvidenceRef[] }
export interface Risk { risk: string; whyItMatters: string; mitigation: string; evidence: EvidenceRef[] }
export interface Bridge { left: string; flow: string; right: string; contract: string; status: string }
export interface PendingDecision { decision: string; whyPending: string; decider: string; status: string }

export interface TrackerModel {
  title: string; date: string; scope: string;
  basis: Cited;
  summary: { posture: string; nextGate: string; mainConstraint: string };
  verticals: Vertical[];
  shipped: ShippedItem[];
  manifest: { area: string; evidence: EvidenceRef[] }[];
  sequence: { n: number; title: string; detail: string }[];
  decisions: Decision[];
  risks: Risk[];
  convergence: Bridge[];
  pending: PendingDecision[];
  footer: string;
  generatedAt: string;
  generatedFrom: EvidenceRef[];
}

/**
 * Compute a vertical's % from an artifact-in-tree tally (standard §4). `n/a`
 * units are excluded from the denominator. Returns `{ pct, formula }`; pct is 0
 * with a "not adopted" formula when the unit set is empty (audit A6).
 */
export function computePct(tally: { verified: number; unverified: number; open: number }): { pct: number; formula: string } {
  const denom = tally.verified + tally.unverified + tally.open;
  if (denom === 0) return { pct: 0, formula: 'not adopted (no FX/B units mapped)' };
  const pct = Math.round((100 * tally.verified) / denom);
  return { pct, formula: `round(100 · ${tally.verified} verified / ${denom} total)` };
}

export interface LintFinding { rule: string; severity: 'abort' | 'warn'; message: string }

const PREFERENCE_TOKENS = ['', 'preference', 'feelings', 'opinion', '-', '—', 'n/a'];

/**
 * Validate a TrackerModel against the evidentiary doctrine (standard §1, §7).
 * `resolve(ref)` returns whether an EvidenceRef points at a real artifact; it is
 * injected so this function stays pure/testable. ABORT-class findings mean the
 * generator must not present the model as proven (caller decides whether to
 * fail-closed or surface a banner — standard §7 / audit A3).
 */
export function lintTrackerModel(
  model: TrackerModel,
  resolve: (ref: EvidenceRef) => boolean,
): LintFinding[] {
  const out: LintFinding[] = [];
  const requireCited = (c: Cited | undefined, where: string): void => {
    if (!c || !c.evidence || c.evidence.length === 0) {
      out.push({ rule: 'uncited-claim', severity: 'abort', message: `${where}: claim has no evidence` });
    }
  };

  requireCited(model.basis, 'basis');
  for (const v of model.verticals) {
    requireCited(v.scoredOn, `vertical "${v.name}".scoredOn`);
    if (!v.provenance || !v.provenance.formula) {
      out.push({ rule: 'pct-not-computed', severity: 'abort', message: `vertical "${v.name}": pct has no provenance.formula` });
    }
    v.inPlace.forEach((p, i) => requireCited(p, `vertical "${v.name}".inPlace[${i}]`));
    // P4: a "built/done" claim with only unverified evidence and no gate is ambiguous.
    const looksDone = /\b(built|done|shipped|complete)\b/i.test(v.scoredOn.text);
    const anyVerified = v.scoredOn.evidence.some((e) => e.kind !== 'feature' || e.status === 'verified');
    if (looksDone && !anyVerified && !v.gate) {
      out.push({ rule: 'gate-ambiguity', severity: 'warn', message: `vertical "${v.name}": reads done but no verified evidence and no gate` });
    }
  }
  model.shipped.forEach((s, i) => requireCited(s, `shipped[${i}]`));
  model.manifest.forEach((m, i) => requireCited({ text: m.area, evidence: m.evidence }, `manifest[${i}]`));
  model.risks.forEach((r, i) => requireCited({ text: r.mitigation, evidence: r.evidence }, `risk[${i}].mitigation`));
  model.decisions.forEach((d, i) => {
    if (PREFERENCE_TOKENS.includes(d.drivenBy.trim().toLowerCase())) {
      out.push({ rule: 'decision-without-requirement', severity: 'abort', message: `decision[${i}] "${d.decision}": drivenBy is preference/empty, not a requirement` });
    }
    requireCited({ text: d.decision, evidence: d.evidence }, `decision[${i}]`);
  });

  // dangling-evidence: any EvidenceRef that does not resolve.
  const allRefs: EvidenceRef[] = [
    ...model.basis.evidence, ...model.generatedFrom,
    ...model.verticals.flatMap((v) => [...v.scoredOn.evidence, ...v.inPlace.flatMap((p) => p.evidence)]),
    ...model.shipped.flatMap((s) => s.evidence),
    ...model.manifest.flatMap((m) => m.evidence),
    ...model.risks.flatMap((r) => r.evidence),
    ...model.decisions.flatMap((d) => d.evidence),
  ];
  for (const ref of allRefs) {
    if (!resolve(ref)) {
      out.push({ rule: 'dangling-evidence', severity: 'abort', message: `evidence does not resolve: ${JSON.stringify(ref)}` });
    }
  }
  return out;
}

/** True when the model has no ABORT-class lint findings (standard §7 gate). */
export function lintPasses(findings: LintFinding[]): boolean {
  return !findings.some((f) => f.severity === 'abort');
}
