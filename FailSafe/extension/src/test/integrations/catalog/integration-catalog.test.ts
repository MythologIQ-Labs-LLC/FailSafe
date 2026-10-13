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

  test('FX480 Jira and Linear advertise single-issue previews, not persisted synchronization', () => {
    for (const id of ['jira', 'linear']) {
      const summary = byId(id).summary.toLowerCase();
      assert.match(summary, /preview/);
      assert.match(summary, /no backlog import or sync/);
      assert.ok(!summary.startsWith('imports'), `${id} must not claim a persisted import`);
    }
  });

  test('FX479 does not advertise pre-write enforcement or completed observer persistence', () => {
    assert.match(byId('aider').summary, /post-run diff/);
    assert.match(byId('continue').summary, /not an enforced filesystem isolation/i);
    assert.match(byId('openhands').summary, /does not yet persist/);
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
