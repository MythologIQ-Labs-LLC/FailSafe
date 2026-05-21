// FX558 — SkillsRenderer cache invalidation (B198 Phase 1).
//
// Asserts:
//  - render(hub) populates this.skills from the client fetch
//  - onEvent({type:'skills.install.complete'}) clears the cache and triggers
//    a re-render that re-fetches (client fetchSkills called a 2nd time)
//  - a voicePack.* event likewise invalidates the cache
//  - an unrelated event (hub.refresh) does NOT clear the cache (no re-fetch)

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { SkillsRenderer } from '../../../src/roadmap/ui/modules/skills.js';

interface FetchCounter {
  fetchSkills: () => Promise<{ skills: any[] }>;
  fetchRelevance: (phase: string) => Promise<{ skills: any[] }>;
  postAction: (path: string, body?: any) => Promise<any>;
  fetchSkillsCalls: number;
}

function setupDom(): { cleanup: () => void } {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="sk-root"></div></body></html>');
  const prevDoc = (global as any).document;
  const prevWin = (global as any).window;
  (global as any).document = dom.window.document;
  (global as any).window = dom.window;
  (global as any).Event = dom.window.Event;
  return {
    cleanup: () => {
      (global as any).document = prevDoc;
      (global as any).window = prevWin;
    },
  };
}

function makeClient(skills: any[] = []): FetchCounter {
  const c: FetchCounter = {
    fetchSkillsCalls: 0,
    fetchSkills: async () => { c.fetchSkillsCalls += 1; return { skills }; },
    fetchRelevance: async (_phase: string) => ({ skills: [] }),
    postAction: async () => ({ ok: true }),
  };
  return c;
}

const SAMPLE = [
  { id: 's1', name: 'Skill One', tags: ['security'], installed: true },
  { id: 's2', name: 'Skill Two', tags: ['planning'], installed: false },
];

const HUB = { runState: { currentPhase: '' } };

// Allow microtasks queued by the synchronous onEvent re-render to drain.
function flush(): Promise<void> { return new Promise(r => setTimeout(r, 10)); }

suite('FX558 SkillsRenderer cache invalidation', () => {
  let cleanup: () => void;
  setup(() => { cleanup = setupDom().cleanup; });
  teardown(() => cleanup());

  test('FX558 render(hub) populates this.skills from the client fetch', async () => {
    const client = makeClient(SAMPLE);
    const r = new SkillsRenderer('sk-root', { client });
    await r.render(HUB);
    assert.equal((r as any).skills.length, 2);
    assert.equal(client.fetchSkillsCalls, 1);
  });

  test('FX558 skills.* event clears the cache and re-fetches', async () => {
    const client = makeClient(SAMPLE);
    const r = new SkillsRenderer('sk-root', { client });
    await r.render(HUB);
    assert.equal(client.fetchSkillsCalls, 1);
    r.onEvent({ type: 'skills.install.complete' });
    await flush();
    assert.equal(client.fetchSkillsCalls, 2, 'install event should trigger a re-fetch');
    assert.equal((r as any).skills.length, 2);
  });

  test('FX558 voicePack.* event likewise invalidates the cache', async () => {
    const client = makeClient(SAMPLE);
    const r = new SkillsRenderer('sk-root', { client });
    await r.render(HUB);
    assert.equal(client.fetchSkillsCalls, 1);
    r.onEvent({ type: 'voicePack.uninstalled' });
    await flush();
    assert.equal(client.fetchSkillsCalls, 2, 'voicePack event should trigger a re-fetch');
  });

  test('FX558 unrelated event (hub.refresh) does NOT clear the cache', async () => {
    const client = makeClient(SAMPLE);
    const r = new SkillsRenderer('sk-root', { client });
    await r.render(HUB);
    assert.equal(client.fetchSkillsCalls, 1);
    r.onEvent({ type: 'hub.refresh' });
    await flush();
    assert.equal(client.fetchSkillsCalls, 1, 'unrelated event must not re-fetch');
  });
});
