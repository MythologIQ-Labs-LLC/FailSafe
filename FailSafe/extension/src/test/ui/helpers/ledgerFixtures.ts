// Fixture builders for `docs/META_LEDGER.md` content used by Monitor E2E specs.
// Produces a deterministic, chain-shaped ledger string from structured entries.
// The hub-snapshot builders below are what the mocked `/api/hub` returns; the
// ledger string is written to disk for parity with production layout but is not
// re-parsed during tests (the hub already carries the derived state).

import crypto from 'crypto';

export type ShieldPhase = 'PLAN' | 'GATE' | 'IMPLEMENT' | 'SUBSTANTIATE' | 'SEALED' | 'IDLE';

export interface ShieldEntry {
  id: number;
  phase: ShieldPhase;
  author: 'Governor' | 'Judge' | 'Specialist';
  riskGrade: 'L1' | 'L2' | 'L3';
  decision: string;
  verdict?: 'PASS' | 'VETO';
  plan?: string;
  timestamp?: string;
}

const FIXED_TS = '2026-05-06T00:00:00Z';

function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function renderEntry(entry: ShieldEntry, previousHash: string): { block: string; chainHash: string } {
  const ts = entry.timestamp || FIXED_TS;
  const contentHash = sha256(`entry-${entry.id}-${entry.phase}-${entry.decision}`);
  const chainHash = sha256(contentHash + previousHash);
  const verdictLine = entry.verdict ? `\n**Verdict**: ${entry.verdict}\n` : '';
  const planLine = entry.plan ? `\n**Plan**: ${entry.plan}\n` : '';
  const block = [
    `### Entry #${entry.id}: ${entry.phase}`,
    '',
    `**Timestamp**: ${ts}`,
    `**Phase**: ${entry.phase}`,
    `**Author**: ${entry.author}`,
    `**Risk Grade**: ${entry.riskGrade}`,
    verdictLine,
    planLine,
    '',
    '**Content Hash**:',
    '',
    '```',
    contentHash,
    '```',
    '',
    `**Previous Hash**: ${previousHash}`,
    '',
    '**Chain Hash**:',
    '',
    '```',
    chainHash,
    '```',
    '',
    `**Decision**: ${entry.decision}`,
    '',
    '---',
    '',
  ].join('\n');
  return { block, chainHash };
}

export function buildLedgerContent(entries: ShieldEntry[]): string {
  const header = [
    '# QorLogic Meta Ledger',
    '',
    '## Chain Status: ACTIVE',
    '',
    `## Genesis: ${FIXED_TS}`,
    '',
    '---',
    '',
  ].join('\n');
  let prev = 'GENESIS';
  const blocks: string[] = [];
  for (const entry of entries) {
    const { block, chainHash } = renderEntry(entry, prev);
    blocks.push(block);
    prev = chainHash;
  }
  return header + blocks.join('') + '_Chain integrity: VALID_\n';
}

export interface HubFixture {
  governancePhase: { current: ShieldPhase; activeAlerts?: unknown[]; recentCompletions?: unknown[]; nextSteps?: string[] };
  activePlan: { title: string; phases: unknown[]; blockers: unknown[]; milestones: unknown[]; risks: unknown[] };
  sentinelStatus?: Record<string, unknown>;
  l3Queue?: unknown[];
  recentVerdicts?: unknown[];
  qorRuntime?: Record<string, unknown>;
  repoCompliance?: Record<string, unknown>;
  recentCompletions?: unknown[];
  runState?: { currentPhase?: string };
}

export function hubForPhase(phase: ShieldPhase, planTitle = 'Test Plan: Monitor SHIELD Visibility'): HubFixture {
  return {
    governancePhase: { current: phase, activeAlerts: [], recentCompletions: [], nextSteps: [] },
    activePlan: { title: planTitle, phases: [], blockers: [], milestones: [], risks: [] },
    sentinelStatus: { running: true },
    l3Queue: [],
    recentVerdicts: [],
    qorRuntime: { enabled: false, connected: false },
    repoCompliance: { grade: 'A', percentage: 95, errors: 0, warnings: 0 },
    recentCompletions: [],
  };
}
