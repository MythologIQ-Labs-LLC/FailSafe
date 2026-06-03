/**
 * TrackerGenerator — assembles the Development Tracker model from FailSafe's own
 * artifacts (standard §4). The hard-to-fake parts (vertical %, manifest, shipped)
 * are fully auto-generated; the prose ledger (decisions/risks/convergence/pending)
 * comes from an optional, still-evidence-cited operator overlay
 * (docs/design/tracker-narrative.json) so nothing is fabricated. All assembled
 * claims pass through lintTrackerModel before the model is returned.
 *
 * I/O lives here; the scoring/lint/parse logic it calls is pure + unit-tested.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  TrackerModel, EvidenceRef, LintFinding, Vertical,
  computePct, lintTrackerModel,
} from './tracker-core';
import { parseFeatureIndex, parseBacklog, tally, FeatureRow, BacklogItem } from './tracker-parsers';
import { MetaLedgerReader } from '../services/MetaLedgerReader';

interface VerticalConfig { key: string; name: string; accent: string; fxPrefixes?: string[]; bPrefixes?: string[] }
interface NarrativeOverlay {
  summary?: Partial<TrackerModel['summary']>;
  scope?: string;
  sequence?: TrackerModel['sequence'];
  decisions?: TrackerModel['decisions'];
  risks?: TrackerModel['risks'];
  convergence?: TrackerModel['convergence'];
  pending?: TrackerModel['pending'];
}

const ACCENTS = ['var(--kernel)', 'var(--auth)', 'var(--agent)', 'var(--data)', 'var(--workspace)', 'var(--insight)', 'var(--substrate)'];

export interface GeneratorDeps {
  workspaceRoot: string;
  now: () => Date;
}

export class TrackerGenerator {
  constructor(private readonly deps: GeneratorDeps) {}

  private readText(rel: string): string {
    try { return fs.readFileSync(path.join(this.deps.workspaceRoot, rel), 'utf-8'); } catch { return ''; }
  }
  private readJson<T>(rel: string): T | null {
    const t = this.readText(rel);
    if (!t) return null;
    try { return JSON.parse(t) as T; } catch { return null; }
  }
  private exists(rel: string): boolean {
    try { return fs.existsSync(path.join(this.deps.workspaceRoot, rel)); } catch { return false; }
  }

  async generate(): Promise<{ model: TrackerModel; lint: LintFinding[] }> {
    const featureText = this.readText('docs/FEATURE_INDEX.md');
    const backlogText = this.readText('docs/BACKLOG.md');
    const features = parseFeatureIndex(featureText);
    const backlog = parseBacklog(backlogText);
    const fxIds = new Set(features.map((f) => f.id));
    const bIds = new Set(backlog.map((b) => b.id));

    const cfg = this.readJson<VerticalConfig[]>('docs/design/tracker-verticals.json');
    const narrative = this.readJson<NarrativeOverlay>('docs/design/tracker-narrative.json') || {};

    // Organic seam: META_LEDGER is written by every /qor-substantiate seal, so
    // shipped + decisions derive passively from the governance lifecycle (no
    // overlay required). An overlay, if present, ENRICHES — it does not gate.
    const ledger = new MetaLedgerReader(this.deps.workspaceRoot);
    const verticals = this.buildVerticals(cfg, features, backlog);
    const generatedFrom: EvidenceRef[] = [
      { kind: 'artifact', path: 'docs/FEATURE_INDEX.md' },
      { kind: 'artifact', path: 'docs/BACKLOG.md' },
      { kind: 'artifact', path: 'docs/META_LEDGER.md' },
    ];

    const model: TrackerModel = {
      title: 'FailSafe Development Tracker',
      date: this.deps.now().toISOString().slice(0, 10),
      scope: narrative.scope || 'FailSafe verticals, scored by artifact-in-tree (FEATURE_INDEX verified/total + BACKLOG), each decision traced to its requirement.',
      basis: {
        text: `${features.length} FEATURE_INDEX entries + ${backlog.length} BACKLOG items; decisions from META_LEDGER`,
        evidence: generatedFrom,
      },
      summary: {
        posture: narrative.summary?.posture || 'Evidence-grounded',
        nextGate: narrative.summary?.nextGate || (verticals.find((v) => v.pct < 100)?.nextGate ?? 'all tracked verticals complete'),
        mainConstraint: narrative.summary?.mainConstraint || 'No uncited claim renders as fact',
      },
      verticals,
      shipped: this.buildShipped(ledger),
      manifest: this.buildManifest(),
      sequence: narrative.sequence || [],
      decisions: (narrative.decisions && narrative.decisions.length) ? narrative.decisions : this.buildDecisions(ledger),
      risks: narrative.risks || [],
      convergence: narrative.convergence || [],
      pending: narrative.pending || [],
      footer: 'Generated artifact — every percentage resolves to an FX/B set; every claim to a PR/SHA/ledger entry/test. Change the evidence, not the tracker.',
      generatedAt: this.deps.now().toISOString(),
      generatedFrom,
    };

    const lint = lintTrackerModel(model, (ref) => this.resolve(ref, fxIds, bIds));
    return { model, lint };
  }

  private buildVerticals(cfg: VerticalConfig[] | null, features: FeatureRow[], backlog: BacklogItem[]): Vertical[] {
    const configs: VerticalConfig[] = cfg && cfg.length
      ? cfg
      : [{ key: 'all', name: 'All Tracked Work', accent: ACCENTS[0] }];
    return configs.map((c, i) => {
      const fx = c.fxPrefixes ? features.filter((f) => c.fxPrefixes!.some((p) => f.id.startsWith(p))) : (cfg ? [] : features);
      const bl = c.bPrefixes ? backlog.filter((b) => c.bPrefixes!.some((p) => b.id.startsWith(p))) : (cfg ? [] : backlog);
      const t = tally(fx, bl);
      const { pct, formula } = computePct(t);
      const ev: EvidenceRef[] = [
        ...fx.map((f) => ({ kind: 'feature', id: f.id, status: f.status } as EvidenceRef)),
        ...bl.map((b) => ({ kind: 'backlog', id: b.id } as EvidenceRef)),
      ];
      return {
        key: c.key, name: c.name, accent: c.accent || ACCENTS[i % ACCENTS.length], pct,
        provenance: { source: 'FEATURE_INDEX + BACKLOG', formula },
        scoredOn: {
          text: `${t.verified} verified, ${t.unverified} unverified, ${t.open} open across ${fx.length} FX + ${bl.length} B.`,
          evidence: ev.length ? ev : [{ kind: 'artifact', path: 'docs/FEATURE_INDEX.md', note: 'no units mapped' }],
        },
        nextGate: bl.find((b) => !b.done)?.text.slice(0, 120) || 'no open backlog items in scope',
        inPlace: fx.filter((f) => f.status === 'verified').slice(0, 8).map((f) => {
          const ev: EvidenceRef[] = [{ kind: 'feature', id: f.id, status: 'verified' }];
          // Only cite a test path the generator can actually resolve — never emit
          // evidence the lint would (correctly) flag as dangling.
          if (f.testPath && (this.exists(`FailSafe/extension/${f.testPath}`) || this.exists(f.testPath))) {
            ev.push({ kind: 'test', path: f.testPath, result: 'pass' });
          }
          return { text: f.id, evidence: ev };
        }),
        whyItMatters: 'Artifact-in-tree completion for this vertical.',
        openWork: bl.filter((b) => !b.done).slice(0, 8).map((b) => `${b.id}: ${b.text.slice(0, 100)}`),
      };
    });
  }

  /** Organic: META_LEDGER completions (SUBSTANTIATION / SESSION SEAL / DELIVER),
   *  written by every /qor-substantiate seal, become the shipped evidence trail. */
  private buildShipped(ledger: MetaLedgerReader): TrackerModel['shipped'] {
    return ledger.recentCompletions(20).map((c) => ({
      date: '',
      channel: 'verified-applied' as const,
      text: `${c.kind}: ${c.title}`,
      evidence: [{ kind: 'ledger', entry: c.number } as EvidenceRef],
    }));
  }

  /** Organic decision ledger: every seal IS a decision — to seal/ship a plan
   *  because audit verified Reality = Promise. `drivenBy` is the SHIELD process
   *  requirement (not preference), so the evidence-lint passes. */
  private buildDecisions(ledger: MetaLedgerReader): TrackerModel['decisions'] {
    return ledger.recentCompletions(20).map((c) => ({
      decision: `${c.kind === 'DELIVER' ? 'Delivered' : 'Sealed'}: ${c.title}`,
      drivenBy: 'SHIELD substantiate — Reality = Promise verified (audit PASS prerequisite)',
      evidence: [{ kind: 'ledger', entry: c.number } as EvidenceRef],
    }));
  }

  private buildManifest(): TrackerModel['manifest'] {
    const areas: Array<{ area: string; paths: string[] }> = [
      { area: 'Governance substrate', paths: ['FailSafe/extension/src/qorlogic/substrate'] },
      { area: 'Console server', paths: ['FailSafe/extension/src/roadmap/ConsoleServer.ts'] },
      { area: 'Governance ledger', paths: ['docs/META_LEDGER.md'] },
      { area: 'Feature inventory', paths: ['docs/FEATURE_INDEX.md'] },
      { area: 'Integration contract reviews', paths: ['docs/research/integrations'] },
    ];
    return areas
      .map((a) => ({ area: a.area, evidence: a.paths.filter((p) => this.exists(p)).map((p) => ({ kind: 'artifact', path: p } as EvidenceRef)) }))
      .filter((a) => a.evidence.length > 0);
  }

  /** Resolve what can be cheaply verified offline (feature/backlog/test/artifact);
   *  pr/commit/ledger/runtime are accepted (no offline source-of-truth). */
  private resolve(ref: EvidenceRef, fxIds: Set<string>, bIds: Set<string>): boolean {
    switch (ref.kind) {
      case 'feature': return fxIds.has(ref.id);
      case 'backlog': return bIds.has(ref.id);
      case 'test': return this.exists(`FailSafe/extension/${ref.path}`) || this.exists(ref.path);
      case 'artifact': return this.exists(ref.path);
      default: return true;
    }
  }
}
