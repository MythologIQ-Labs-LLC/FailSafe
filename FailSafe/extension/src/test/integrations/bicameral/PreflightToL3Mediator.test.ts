// FX553 — Phase 1 of plan-qor-b-int-2-preflight-l3 (B-INT-2).
// PreflightToL3Mediator.onTier3Queued behavior: no-op on null/disconnected
// client, no attach on empty drifted[], one attach on a single drifted
// decision (with joined title), swallow a thrown preflight, filter mixed
// drifted[] to drifted-only.
import { strict as assert } from 'assert';
import {
  PreflightToL3Mediator,
  PreflightToL3MediatorDeps,
} from '../../../integrations/bicameral/PreflightToL3Mediator';
import type { BicameralMcpClient } from '../../../integrations/bicameral/BicameralMcpClient';
import type {
  BicameralDecision,
  BicameralDriftStatus,
  BicameralPreflightResult,
} from '../../../integrations/bicameral/types';

interface AttachRecord {
  approvalId: string;
  preflightMeta: Record<string, unknown>;
  flag: string;
}

interface MakeDepsOpts {
  client?: 'null' | 'disconnected' | 'connected';
  preflightResult?: BicameralPreflightResult;
  preflightShouldThrow?: boolean;
}

function decision(id: string, title: string): BicameralDecision {
  return { id, title, source: 's', status: 'drifted', bindings: [] };
}

function drift(decisionId: string, status: BicameralDriftStatus['status']): BicameralDriftStatus {
  return { decisionId, filePath: '/foo.ts', status };
}

function makeDeps(opts: MakeDepsOpts = {}): {
  deps: PreflightToL3MediatorDeps;
  attaches: AttachRecord[];
  warns: Array<{ msg: string; data: unknown }>;
} {
  const attaches: AttachRecord[] = [];
  const warns: Array<{ msg: string; data: unknown }> = [];
  const mode = opts.client ?? 'connected';
  const liveClient = {
    isConnected: () => mode === 'connected',
    preflight: async (): Promise<BicameralPreflightResult> => {
      if (opts.preflightShouldThrow) throw new Error('preflight-failed');
      return opts.preflightResult ?? { priorDecisions: [], drifted: [], openQuestions: [] };
    },
  } as unknown as BicameralMcpClient;
  // 'null' exercises the lazy-accessor returning null (a config rewire that
  // dropped the client); other modes pass the live client directly.
  const client: PreflightToL3MediatorDeps['client'] =
    mode === 'null' ? () => null : liveClient;
  const l3Service = {
    attachPreflightEvidence: async (
      approvalId: string,
      preflightMeta: Record<string, unknown>,
      flag: string,
    ) => {
      attaches.push({ approvalId, preflightMeta, flag });
    },
  };
  const logger = {
    warn: (msg: string, data?: unknown) => { warns.push({ msg, data }); },
    info: () => undefined, error: () => undefined, debug: () => undefined,
  } as unknown as PreflightToL3MediatorDeps['logger'];
  return { deps: { client, l3Service, logger }, attaches, warns };
}

suite('PreflightToL3Mediator.onTier3Queued (FX553)', () => {
  test('null client → returns without calling attachPreflightEvidence', async () => {
    const { deps, attaches } = makeDeps({ client: 'null' });
    const m = new PreflightToL3Mediator(deps);
    await m.onTier3Queued('a1', '/foo.ts');
    assert.equal(attaches.length, 0);
  });

  test('disconnected client → returns without calling attachPreflightEvidence', async () => {
    const { deps, attaches } = makeDeps({ client: 'disconnected' });
    const m = new PreflightToL3Mediator(deps);
    await m.onTier3Queued('a1', '/foo.ts');
    assert.equal(attaches.length, 0);
  });

  test('preflight resolves with empty drifted[] → no attach call', async () => {
    const { deps, attaches } = makeDeps({
      preflightResult: { priorDecisions: [], drifted: [], openQuestions: [] },
    });
    const m = new PreflightToL3Mediator(deps);
    await m.onTier3Queued('a1', '/foo.ts');
    assert.equal(attaches.length, 0);
  });

  test('one drifted decision → attach called once with joined title', async () => {
    const { deps, attaches } = makeDeps({
      preflightResult: {
        priorDecisions: [decision('d1', 'Adopt 15-min TTL')],
        drifted: [drift('d1', 'drifted')],
        openQuestions: [],
      },
    });
    const m = new PreflightToL3Mediator(deps);
    await m.onTier3Queued('a1', '/foo.ts');
    assert.equal(attaches.length, 1);
    assert.equal(attaches[0].approvalId, 'a1');
    assert.equal(attaches[0].flag, 'bicameral-preflight-conflict');
    const drifted = (attaches[0].preflightMeta.driftedDecisions as Array<Record<string, unknown>>);
    assert.equal(drifted.length, 1);
    assert.equal(drifted[0].decisionId, 'd1');
    assert.equal(drifted[0].title, 'Adopt 15-min TTL');
    assert.equal(typeof attaches[0].preflightMeta.checkedAt, 'string');
  });

  test('preflight throws → onTier3Queued resolves, no attach call', async () => {
    const { deps, attaches } = makeDeps({ preflightShouldThrow: true });
    const m = new PreflightToL3Mediator(deps);
    await m.onTier3Queued('a1', '/foo.ts');
    assert.equal(attaches.length, 0);
  });

  test('mixed drifted[] → only drifted-status entry appears in driftedDecisions', async () => {
    const { deps, attaches } = makeDeps({
      preflightResult: {
        priorDecisions: [decision('d1', 'Drifted one'), decision('d2', 'Synced one')],
        drifted: [drift('d1', 'drifted'), drift('d2', 'in-sync')],
        openQuestions: [],
      },
    });
    const m = new PreflightToL3Mediator(deps);
    await m.onTier3Queued('a1', '/foo.ts');
    assert.equal(attaches.length, 1);
    const drifted = (attaches[0].preflightMeta.driftedDecisions as Array<Record<string, unknown>>);
    assert.equal(drifted.length, 1);
    assert.equal(drifted[0].decisionId, 'd1');
    assert.equal(drifted[0].title, 'Drifted one');
  });
});
