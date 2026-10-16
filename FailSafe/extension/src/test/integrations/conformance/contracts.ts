/**
 * Capability contracts (#474). Each claimed capability of a catalog adapter has
 * one contract; a harness drives the adapter's real code and returns what it
 * observed, and the contract turns that observation into violations. An
 * adapter is checked only for what it claims, plus the cross-cutting
 * status-evidence contract that binds every catalog adapter.
 */

import type { IntegrationCapability, IntegrationDescriptor } from '../../../integrations/catalog/integration-catalog';
import type { HealthMapping } from '../../../integrations/catalog/integration-health';
import { isShieldFamilyName } from '../../../integrations/github-checks/github-checks-map';

export type Capability = IntegrationCapability | 'status-evidence';

export interface IssuePreviewObs { key: string; title: string; url: string; text: string; disabledCalls: number; secrets: string[] }
export interface IntentDraftObs { afterDecline: number; afterApprove: number; externalRef?: string; restartedRef?: string; expectedRef: string; afterRepeat: number }
export interface TimelineEvidenceObs { entries: Array<{ category: string; detail: string }>; repeatImported: number; forgedEntries: number }
export interface PolicyAuditObs { highFindings: number; findingsText: string; secret: string }
export interface RiskRecord { id?: unknown; title?: unknown; severity?: unknown; source?: unknown }
export interface RiskIngestObs { records: RiskRecord[]; secondIds: string[]; throwingSinkThrew: boolean; throwingSinkFailed: number }
export interface CheckPublishObs { conclusion: unknown; name: unknown; failureOk: boolean }
export interface NotifyObs { okResult: { ok: boolean }; failResult: { ok: boolean }; threw: boolean }
export interface IsolatedRunObs { status?: string; hasChangeSet: boolean; workspaceUnchanged: boolean }
export interface StatusEvidenceObs { success: HealthMapping; failure: HealthMapping }

export interface ObsByCapability {
  'issue-preview': IssuePreviewObs;
  'intent-draft': IntentDraftObs;
  'timeline-evidence': TimelineEvidenceObs;
  'policy-audit': PolicyAuditObs;
  'risk-ingest': RiskIngestObs;
  'check-publish': CheckPublishObs;
  notify: NotifyObs;
  'isolated-run': IsolatedRunObs;
  'status-evidence': StatusEvidenceObs;
}

type Contract<C extends Capability> = (obs: ObsByCapability[C]) => string[];

const ids = (rs: RiskRecord[]) => rs.map((r) => String(r.id)).sort();

export const CONTRACTS: { [C in Capability]: Contract<C> } = {
  'issue-preview': (o) => [
    ...(!o.key || !o.text.includes(o.key) ? ['the preview does not show the issue key'] : []),
    ...(!o.title || !o.text.includes(o.title) ? ['the preview does not show the title'] : []),
    ...(!o.url || !o.text.includes(o.url) ? ['the preview does not show the source URL'] : []),
    ...(o.disabledCalls !== 0 ? [`a disabled integration made ${o.disabledCalls} request(s)`] : []),
    ...o.secrets.filter((s) => o.text.includes(s)).map(() => 'a credential appears in the preview'),
  ],
  'intent-draft': (o) => [
    ...(o.afterDecline !== 0 ? ['an intent was created without approval'] : []),
    ...(o.afterApprove !== 1 ? [`approval created ${o.afterApprove} intents, not 1`] : []),
    ...(o.externalRef !== o.expectedRef ? [`the draft's externalRef is ${o.externalRef}`] : []),
    ...(o.restartedRef !== o.expectedRef ? ['the draft did not survive a new IntentService'] : []),
    ...(o.afterRepeat !== 1 ? [`a repeat import left ${o.afterRepeat} intents`] : []),
  ],
  'timeline-evidence': (o) => [
    ...(o.entries.length === 0 ? ['no imported entry is readable'] : []),
    ...(o.entries.some((e) => e.category !== 'imported' || !/not live enforcement/.test(e.detail)) ? ['an entry is not labelled as historical'] : []),
    ...(o.repeatImported !== 0 ? [`a repeat import added ${o.repeatImported} record(s)`] : []),
    ...(o.forgedEntries !== 0 ? [`a forged file yielded ${o.forgedEntries} entr(ies)`] : []),
  ],
  'policy-audit': (o) => [
    ...(o.highFindings < 1 ? ['a risky config produced no high finding'] : []),
    ...(o.findingsText.includes(o.secret) ? ['a secret value appears in the findings'] : []),
  ],
  'risk-ingest': (o) => [
    ...(o.records.length === 0 ? ['no risk record was written'] : []),
    ...(o.records.some((r) => typeof r.id !== 'string' || typeof r.title !== 'string' || typeof r.severity !== 'string' || typeof r.source !== 'string')
      ? ['a record lacks id, title, severity or source'] : []),
    ...(JSON.stringify(ids(o.records)) !== JSON.stringify([...o.secondIds].sort()) ? ['a re-run produced different ids (not idempotent)'] : []),
    ...(o.throwingSinkThrew ? ['a throwing sink escaped the import'] : []),
    ...(o.throwingSinkFailed < 1 ? ['a throwing sink was not counted as failed'] : []),
  ],
  'check-publish': (o) => [
    ...(o.conclusion !== 'neutral' ? [`the check conclusion is ${String(o.conclusion)}, not neutral`] : []),
    ...(isShieldFamilyName(o.name) ? ['the check uses the SHIELD name'] : []),
    ...(o.failureOk ? ['a transport failure was reported as ok'] : []),
  ],
  notify: (o) => [
    ...(!o.okResult.ok ? ['a 2xx delivery was not ok'] : []),
    ...(o.failResult.ok ? ['a 500 delivery was reported as ok'] : []),
    ...(o.threw ? ['a failed delivery threw'] : []),
  ],
  'isolated-run': (o) => [
    ...(o.status !== 'QUARANTINED_PENDING_APPROVAL' ? [`the run ended ${o.status}, not quarantined`] : []),
    ...(!o.hasChangeSet ? ['no quarantined change set'] : []),
    ...(!o.workspaceUnchanged ? ['the workspace file changed'] : []),
  ],
  'status-evidence': (o) => [
    ...(o.success[0] !== 'contract-verified' && o.success[0] !== 'connected' ? [`a successful call maps to ${JSON.stringify(o.success)}`] : []),
    ...(o.failure[0] !== 'failing' || !o.failure[1] ? [`a failed call maps to ${JSON.stringify(o.failure)}`] : []),
  ],
};

export type Harness = { [C in Capability]?: () => Promise<ObsByCapability[C]> };
export type Harnesses = Record<string, Harness>;

export interface Violation {
  adapter: string;
  capability: string;
  kind: 'missing-harness' | 'unclaimed-harness' | 'contract';
  detail: string;
}

export function claimsOf(d: Pick<IntegrationDescriptor, 'capabilities'>): Capability[] {
  return [...d.capabilities, 'status-evidence'];
}

/** Run every claimed capability's harness through its contract. */
export async function checkConformance(
  catalog: ReadonlyArray<Pick<IntegrationDescriptor, 'id' | 'capabilities'>>,
  harnesses: Harnesses,
): Promise<{ violations: Violation[]; checked: number }> {
  const violations: Violation[] = [];
  let checked = 0;
  for (const d of catalog) {
    const claimed = claimsOf(d);
    const set = harnesses[d.id] ?? {};
    for (const c of Object.keys(set) as Capability[]) {
      if (!claimed.includes(c)) violations.push({ adapter: d.id, capability: c, kind: 'unclaimed-harness', detail: `a harness exists for ${c}, which ${d.id} does not claim` });
    }
    for (const c of claimed) {
      const h = set[c] as (() => Promise<unknown>) | undefined;
      if (!h) { violations.push({ adapter: d.id, capability: c, kind: 'missing-harness', detail: `${d.id} claims ${c} but has no harness` }); continue; }
      checked++;
      let obs: unknown;
      try { obs = await h(); } catch (e) {
        violations.push({ adapter: d.id, capability: c, kind: 'contract', detail: `the harness threw: ${e instanceof Error ? e.message : String(e)}` });
        continue;
      }
      for (const detail of (CONTRACTS[c] as (o: unknown) => string[])(obs)) violations.push({ adapter: d.id, capability: c, kind: 'contract', detail });
    }
  }
  return { violations, checked };
}
