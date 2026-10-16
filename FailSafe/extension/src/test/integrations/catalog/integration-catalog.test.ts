// Functional tests for the integration-catalog (GH #167). Each test exercises
// the pure builder against a boolean-only snapshot and asserts the derived
// enabled/configured/state, plus the secret-safety invariant that no secret
// VALUE can ever flow through the catalog (it only ever sees booleans).

import { strict as assert } from 'assert';
import {
  INTEGRATION_CATALOG,
  catalogConfigKeys,
  buildIntegrationStatus,
  buildIntegrationCatalog,
  IntegrationDescriptor,
} from '../../../integrations/catalog/integration-catalog';
import { IntegrationHealthStore, setIntegrationHealthStore } from '../../../integrations/catalog/integration-health';
import { IntegrationCatalogRoute } from '../../../roadmap/routes/IntegrationCatalogRoute';
import type { Request, Response } from 'express';

function byId(id: string): IntegrationDescriptor {
  const d = INTEGRATION_CATALOG.find((x) => x.id === id);
  assert.ok(d, `descriptor ${id} exists`);
  return d as IntegrationDescriptor;
}

suite('integrations/catalog integration-catalog', () => {
  test('catalog lists the nine #167 integrations (plus Slack) with no duplicate ids', () => {
    const ids = INTEGRATION_CATALOG.map((d) => d.id);
    for (const expected of [
      'continue', 'aider', 'openhands', 'agent-audit',
      'linear', 'jira', 'github-checks', 'sentry', 'teams',
    ]) {
      assert.ok(ids.includes(expected), `catalog includes ${expected}`);
    }
    assert.equal(new Set(ids).size, ids.length, 'no duplicate ids');
  });

  test('does NOT include integrations that already own a sub-view', () => {
    const ids = INTEGRATION_CATALOG.map((d) => d.id);
    for (const excluded of ['bicameral', 'opendesign', 'open-design', 'mcp', 'mcp-catalog', 'agt']) {
      assert.ok(!ids.includes(excluded), `catalog excludes ${excluded} (it has a dedicated sub-view)`);
    }
  });

  test('FX480 Jira and Linear advertise review plus an approved intent draft, never sync or backlog import', () => {
    for (const id of ['jira', 'linear']) {
      const summary = byId(id).summary;
      assert.match(summary, /^Fetches one (Jira|Linear) issue for review; creates a governed intent draft only when you approve\. No sync\.$/);
      assert.ok(!/governed backlog|synchroni[sz]ed/i.test(summary), `${id} must not claim backlog import or sync`);
    }
  });

  test('FX479 does not advertise pre-write enforcement or completed observer persistence', () => {
    // #475: worktree isolation with operator Apply, never claimed as a sandbox.
    for (const id of ['aider', 'continue']) {
      assert.match(byId(id).summary, /disposable git worktree/);
      assert.match(byId(id).summary, /only when you apply them/);
      assert.match(byId(id).summary, /Not a process sandbox/);
      assert.match(byId(id).summary, /writes outside it are not detected/);
    }
    // #477: the import now persists, so the summary says what it is: an
    // approved historical import, not live interception.
    assert.equal(byId('openhands').summary, 'Imports an exported OpenHands run, after you confirm, as historical timeline evidence (deduplicated). Observe-only: not live interception.');
    assert.match(byId('github-checks').summary, /SHIELD PASS is disabled/);
  });

  test('catalogConfigKeys returns every enabled + required key, de-duplicated', () => {
    const keys = catalogConfigKeys();
    // sentry contributes enabled + token + org + project
    assert.ok(keys.includes('failsafe.integrations.sentry.enabled'));
    assert.ok(keys.includes('failsafe.integrations.sentry.token'));
    assert.ok(keys.includes('failsafe.integrations.sentry.org'));
    assert.ok(keys.includes('failsafe.integrations.sentry.project'));
    assert.equal(new Set(keys).size, keys.length, 'keys de-duplicated');
  });

  test('disabled when the enabled flag is absent/false', () => {
    const s = buildIntegrationStatus(byId('linear'), {});
    assert.equal(s.enabled, false);
    assert.equal(s.configured, false);
    assert.equal(s.state, 'disabled');
  });

  test('needs-config when enabled but a required secret key is empty', () => {
    const s = buildIntegrationStatus(byId('jira'), {
      'failsafe.integrations.jira.enabled': true,
      'failsafe.integrations.jira.baseUrl': true,
      'failsafe.integrations.jira.email': true,
      // apiToken missing → empty
    });
    assert.equal(s.enabled, true);
    assert.equal(s.configured, false);
    assert.equal(s.state, 'needs-config');
    assert.deepEqual(s.missingKeys, ['failsafe.integrations.jira.apiToken']);
  });

  test('configured-unverified when enabled and all required keys present', () => {
    const s = buildIntegrationStatus(byId('sentry'), {
      'failsafe.integrations.sentry.enabled': true,
      'failsafe.integrations.sentry.token': true,
      'failsafe.integrations.sentry.org': true,
      'failsafe.integrations.sentry.project': true,
    });
    assert.equal(s.state, 'configured-unverified');
    assert.equal(s.configured, true);
    assert.deepEqual(s.missingKeys, []);
  });

  test('zero-required-key integration is configured but unverified when enabled', () => {
    const s = buildIntegrationStatus(byId('aider'), { 'failsafe.integrations.aider.enabled': true });
    assert.equal(s.state, 'configured-unverified');
    assert.equal(s.configured, true);
  });

  test('buildIntegrationCatalog returns one status per descriptor', () => {
    const all = buildIntegrationCatalog({});
    assert.equal(all.length, INTEGRATION_CATALOG.length);
    assert.ok(all.every((s) => s.state === 'disabled'), 'empty snapshot → all disabled');
  });

  test('secret safety: a non-boolean (e.g. a leaked token value) is NOT treated as present', () => {
    // The host contract is boolean-only. If a raw string ever leaked into the
    // snapshot, the strict `=== true` check must still treat it as absent so a
    // secret value can never be mistaken for "present" — and can never be echoed
    // back (the status carries key NAMES only, never values).
    const s = buildIntegrationStatus(byId('linear'), {
      'failsafe.integrations.linear.enabled': true,
      'failsafe.integrations.linear.apiKey': 'lin_api_supersecret' as unknown as boolean,
    });
    assert.equal(s.configured, false, 'non-boolean must not count as configured');
    assert.deepEqual(s.missingKeys, ['failsafe.integrations.linear.apiKey']);
    // The serialized status must not contain the secret string anywhere.
    assert.ok(!JSON.stringify(s).includes('supersecret'), 'no secret value in the status');
  });
});

// #479 H3: the catalog route reports evidence-derived status and never verified
// without a recorded call.
suite('integration catalog route evidence (#479 H3)', () => {
  teardown(() => setIntegrationHealthStore(null));

  function routeJson(): { integrations: Array<Record<string, unknown>> } {
    let body: unknown;
    const res = { json: (b: unknown) => { body = b; } } as unknown as Response;
    const all: Record<string, boolean> = {};
    for (const k of catalogConfigKeys()) all[k] = true;
    IntegrationCatalogRoute.catalog({} as Request, res, { getIntegrationConfigSnapshot: () => all });
    return body as { integrations: Array<Record<string, unknown>> };
  }

  test('with no store installed every configured card is configured-unverified and carries capabilities and evidenceKind', () => {
    setIntegrationHealthStore(null);
    const { integrations } = routeJson();
    assert.equal(integrations.length, INTEGRATION_CATALOG.length);
    for (const s of integrations) {
      assert.equal(s.state, 'configured-unverified', String(s.id));
      assert.equal(s.lastResult, undefined);
      assert.ok(Array.isArray(s.capabilities) && (s.capabilities as unknown[]).length > 0, String(s.id));
      assert.ok(['service', 'file', 'process'].includes(String(s.evidenceKind)), String(s.id));
    }
  });

  test('recorded evidence reaches the route as state and lastResult', () => {
    const data = new Map<string, unknown>();
    const store = new IntegrationHealthStore({
      get: <T>(k: string) => data.get(k) as T | undefined,
      update: (k: string, v: unknown) => { data.set(k, v); return Promise.resolve(); },
    });
    setIntegrationHealthStore(store);
    store.record('jira', 'contract-verified');
    store.record('sentry', 'failing', 'auth');
    const byState = Object.fromEntries(routeJson().integrations.map((s) => [s.id, s]));
    assert.equal(byState.jira.state, 'contract-verified');
    assert.equal(byState.sentry.state, 'failing');
    assert.equal((byState.sentry.lastResult as { category: string }).category, 'auth');
    assert.equal(byState.linear.state, 'configured-unverified');
  });
});
