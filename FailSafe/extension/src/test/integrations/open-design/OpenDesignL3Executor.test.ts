// FX810 — OpenDesignL3Executor (B-OD-8): on qorelogic.l3Decided APPROVED for
// kind open-design-create-artifact, executes the buffered create_artifact via
// the client's sanctioned approved path + appends a ledger USER_OVERRIDE.
// Other kinds / non-APPROVED decisions / null client leave the client untouched.

import { strict as assert } from 'assert';
import { OpenDesignL3Executor } from '../../../integrations/open-design/OpenDesignL3Executor';
import { OPEN_DESIGN_CREATE_ARTIFACT_KIND } from '../../../integrations/open-design/OpenDesignMcpAllowlist';

// Minimal EventBus stand-in matching the .on(name, handler) → unsubscribe shape.
function makeBus() {
  const handlers: Array<(e: unknown) => void> = [];
  return {
    bus: {
      on(_name: string, handler: (e: unknown) => void) {
        handlers.push(handler);
        return () => {
          const i = handlers.indexOf(handler);
          if (i >= 0) handlers.splice(i, 1);
        };
      },
    } as never,
    emitL3Decided(request: Record<string, unknown>, decision: string) {
      for (const h of [...handlers]) h({ type: 'qorelogic.l3Decided', payload: { request, decision } });
    },
    handlerCount: () => handlers.length,
  };
}

interface LedgerEntry {
  eventType: string;
  agentDid: string;
  payload: Record<string, unknown>;
}

function makeLedger(available = true) {
  const entries: LedgerEntry[] = [];
  return {
    ledger: {
      isAvailable: () => available,
      appendEntry: async (e: LedgerEntry) => {
        entries.push(e);
      },
    },
    entries,
  };
}

function makeClient() {
  const calls: Array<Record<string, unknown>> = [];
  return {
    client: {
      executeApprovedCreateArtifact: async (args: Record<string, unknown>) => {
        calls.push(args);
        return { isError: false };
      },
    } as never,
    calls,
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

suite('integrations/open-design OpenDesignL3Executor (B-OD-8 FX810)', () => {
  test('APPROVED open-design-create-artifact executes the buffered call + ledger USER_OVERRIDE', async () => {
    const { bus, emitL3Decided } = makeBus();
    const { ledger, entries } = makeLedger();
    const { client, calls } = makeClient();
    new OpenDesignL3Executor({ eventBus: bus, getClient: () => client, ledgerManager: ledger });

    emitL3Decided(
      { id: 'a1', kind: OPEN_DESIGN_CREATE_ARTIFACT_KIND, meta: { tool: 'create_artifact', args: { name: 'hero.svg' } } },
      'APPROVED',
    );
    await flush();

    assert.equal(calls.length, 1, 'executed exactly once');
    assert.deepEqual(calls[0], { name: 'hero.svg' });
    const exec = entries.find((e) => e.payload.action === 'open-design.create_artifact.executed');
    assert.ok(exec, 'ledger USER_OVERRIDE executed entry appended');
    assert.equal(exec!.eventType, 'USER_OVERRIDE');
    assert.equal(exec!.payload.approvalId, 'a1');
  });

  test('REJECTED decision does NOT execute the client', async () => {
    const { bus, emitL3Decided } = makeBus();
    const { ledger, entries } = makeLedger();
    const { client, calls } = makeClient();
    new OpenDesignL3Executor({ eventBus: bus, getClient: () => client, ledgerManager: ledger });

    emitL3Decided(
      { id: 'a2', kind: OPEN_DESIGN_CREATE_ARTIFACT_KIND, meta: { tool: 'create_artifact', args: { name: 'x' } } },
      'REJECTED',
    );
    await flush();

    assert.equal(calls.length, 0, 'rejected → no execution');
    assert.ok(entries.some((e) => e.payload.action === 'open-design.create_artifact.declined'));
  });

  test('different kind (bicameral-drift-resolution) is ignored', async () => {
    const { bus, emitL3Decided } = makeBus();
    const { ledger, entries } = makeLedger();
    const { client, calls } = makeClient();
    new OpenDesignL3Executor({ eventBus: bus, getClient: () => client, ledgerManager: ledger });

    emitL3Decided({ id: 'd1', kind: 'bicameral-drift-resolution', meta: { decisionId: 'x' } }, 'APPROVED');
    await flush();

    assert.equal(calls.length, 0, 'foreign kind → no execution');
    assert.equal(entries.length, 0, 'foreign kind → no ledger entry');
  });

  test('null client (daemon not connected) does not throw and does not ledger an execute', async () => {
    const { bus, emitL3Decided } = makeBus();
    const { ledger, entries } = makeLedger();
    new OpenDesignL3Executor({ eventBus: bus, getClient: () => null, ledgerManager: ledger });

    emitL3Decided(
      { id: 'a3', kind: OPEN_DESIGN_CREATE_ARTIFACT_KIND, meta: { tool: 'create_artifact', args: { name: 'x' } } },
      'APPROVED',
    );
    await flush();

    assert.equal(entries.some((e) => e.payload.action === 'open-design.create_artifact.executed'), false);
  });

  test('client throw is isolated + recorded as a failed ledger entry', async () => {
    const { bus, emitL3Decided } = makeBus();
    const { ledger, entries } = makeLedger();
    const throwingClient = {
      executeApprovedCreateArtifact: async () => {
        throw new Error('daemon refused');
      },
    } as never;
    new OpenDesignL3Executor({ eventBus: bus, getClient: () => throwingClient, ledgerManager: ledger });

    emitL3Decided(
      { id: 'a4', kind: OPEN_DESIGN_CREATE_ARTIFACT_KIND, meta: { tool: 'create_artifact', args: { name: 'x' } } },
      'APPROVED',
    );
    await flush();

    const failed = entries.find((e) => e.payload.action === 'open-design.create_artifact.failed');
    assert.ok(failed, 'failure recorded');
    assert.match(String(failed!.payload.error), /daemon refused/);
  });

  test('dispose unsubscribes the listener', async () => {
    const { bus, emitL3Decided, handlerCount } = makeBus();
    const { ledger } = makeLedger();
    const { client, calls } = makeClient();
    const ex = new OpenDesignL3Executor({ eventBus: bus, getClient: () => client, ledgerManager: ledger });
    assert.equal(handlerCount(), 1);
    ex.dispose();
    assert.equal(handlerCount(), 0);
    emitL3Decided(
      { id: 'a5', kind: OPEN_DESIGN_CREATE_ARTIFACT_KIND, meta: { tool: 'create_artifact', args: {} } },
      'APPROVED',
    );
    await flush();
    assert.equal(calls.length, 0, 'no execution after dispose');
  });
});
