/**
 * Recorded-fixture replay for the #480 Jira/Linear suites. Each fixture JSON
 * (src/test/fixtures/integrations/tracker/) holds the expected request (method,
 * URL, header names) and the recorded response. The replay plugs into the
 * clients' injected transports, serves fixtures in order, and fails the test on
 * any request it did not expect. Fixtures were built from the providers'
 * documented response shapes (see each file's `provenance`); none was captured
 * from a live tenant.
 */

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import type { JiraGetFn } from '../../../integrations/jira/jira-client';
import type { LinearPostFn } from '../../../integrations/linear/linear-client';

// out/test/integrations/tracker-import -> extension root
export const FIXTURE_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'src', 'test', 'fixtures', 'integrations', 'tracker');

export interface RecordedFixture {
  provenance: string;
  request: { method: 'GET' | 'POST'; url: string; headers: string[] };
  response: { status: number; headers: Record<string, string>; body: unknown };
}

export function loadFixture(name: string): RecordedFixture {
  const f = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf8')) as RecordedFixture;
  assert.ok(/Not captured from a live/.test(f.provenance), `${name} declares its provenance`);
  return f;
}

function bodyText(f: RecordedFixture): string {
  return typeof f.response.body === 'string' ? f.response.body : JSON.stringify(f.response.body);
}

export interface Replay<T> {
  fn: T;
  /** Requests actually made (url plus the Authorization header value, for secret checks). */
  requests: Array<{ url: string; authorization?: string; body?: string }>;
  /** Fixtures not yet served. */
  remaining(): number;
}

function next(queue: RecordedFixture[], method: string, url: string, headers: Record<string, string>): RecordedFixture {
  const f = queue.shift();
  assert.ok(f, `unexpected ${method} ${url}: no recorded fixture left`);
  assert.equal(method, f.request.method, 'recorded method');
  assert.equal(url, f.request.url, 'recorded URL');
  for (const h of f.request.headers) assert.ok(h in headers, `request carries the ${h} header`);
  return f;
}

export function jiraReplay(names: string[]): Replay<JiraGetFn> {
  const queue = names.map(loadFixture);
  const requests: Replay<JiraGetFn>['requests'] = [];
  const fn: JiraGetFn = async (url, headers) => {
    requests.push({ url, authorization: headers.Authorization });
    const f = next(queue, 'GET', url, headers);
    return { status: f.response.status, body: bodyText(f) };
  };
  return { fn, requests, remaining: () => queue.length };
}

export function linearReplay(names: Array<{ fixture: string; id: string }>): Replay<LinearPostFn> {
  const queue = names.map((n) => loadFixture(n.fixture));
  const ids = names.map((n) => n.id);
  const requests: Replay<LinearPostFn>['requests'] = [];
  const fn: LinearPostFn = async (url, headers, body) => {
    requests.push({ url, authorization: headers.Authorization, body });
    const id = ids.shift();
    const f = next(queue, 'POST', url, headers);
    assert.equal((JSON.parse(body) as { variables: { id: string } }).variables.id, id, 'recorded GraphQL variable');
    return { status: f.response.status, body: bodyText(f), headers: f.response.headers };
  };
  return { fn, requests, remaining: () => queue.length };
}
