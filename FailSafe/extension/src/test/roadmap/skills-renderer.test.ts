// Functional tests for SkillsRenderer (FX358 + FX366) — tabs and tag filter.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';
// @ts-expect-error untyped JS module
import { SkillsRenderer } from '../../../src/roadmap/ui/modules/skills.js';

interface MockClient {
  fetchSkills: () => Promise<{ skills: any[] }>;
  fetchRelevance: (phase: string) => Promise<{ skills: any[] }>;
  postAction: (path: string, body?: any) => Promise<any>;
  posted: Array<{ path: string; body?: any }>;
}

function setupDom(): { dom: JSDOM; cleanup: () => void } {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="sk-root"></div></body></html>');
  const prevDoc = (global as any).document;
  const prevWin = (global as any).window;
  (global as any).document = dom.window.document;
  (global as any).window = dom.window;
  (global as any).Event = dom.window.Event;
  return {
    dom,
    cleanup: () => {
      (global as any).document = prevDoc;
      (global as any).window = prevWin;
    },
  };
}

function makeClient(skills: any[] = [], relevance: any[] = []): MockClient {
  const posted: Array<{ path: string; body?: any }> = [];
  return {
    posted,
    fetchSkills: async () => ({ skills }),
    fetchRelevance: async (_phase: string) => ({ skills: relevance }),
    postAction: async (p: string, b?: any) => { posted.push({ path: p, body: b }); return { ok: true }; },
  };
}

const SAMPLE_SKILLS = [
  { id: 's1', name: 'Skill One', tags: ['security', 'audit'], installed: true },
  { id: 's2', name: 'Skill Two', tags: ['planning'], installed: false },
  { id: 's3', name: 'Skill Three', tags: ['security', 'review'], installed: false },
];

suite('SkillsRenderer (FX358 + FX366)', () => {
  let cleanup: () => void;
  setup(() => { cleanup = setupDom().cleanup; });
  teardown(() => cleanup());

  test('FX358 render — emits 4 skill tabs (Recommended/All Relevant/Installed/Other)', async () => {
    const r = new SkillsRenderer('sk-root', { client: makeClient(SAMPLE_SKILLS) });
    await r.render({ runState: { currentPhase: '' } });
    const tabs = document.querySelectorAll('.cc-skill-tab');
    assert.equal(tabs.length, 4);
    const labels = Array.from(tabs).map(t => t.textContent);
    assert.deepEqual(labels, ['Recommended', 'All Relevant', 'Installed', 'Other']);
  });

  test('FX358 render — Recommended is active by default', async () => {
    const r = new SkillsRenderer('sk-root', { client: makeClient(SAMPLE_SKILLS) });
    await r.render({ runState: {} });
    const recommended = Array.from(document.querySelectorAll('.cc-skill-tab')).find(t => t.textContent === 'Recommended')!;
    assert.ok(recommended.classList.contains('active'));
  });

  test('FX358 — clicking a tab updates activeTab + adds active class', async () => {
    const r = new SkillsRenderer('sk-root', { client: makeClient(SAMPLE_SKILLS) });
    await r.render({ runState: {} });
    const installedTab = Array.from(document.querySelectorAll('.cc-skill-tab')).find(t => t.textContent === 'Installed') as HTMLButtonElement;
    installedTab.click();
    assert.equal((r as any).activeTab, 'Installed');
    assert.ok(installedTab.classList.contains('active'));
  });

  test('FX358 filterByTab — Installed → only installed=true skills', async () => {
    const r = new SkillsRenderer('sk-root', { client: makeClient(SAMPLE_SKILLS) });
    await r.render({ runState: {} });
    (r as any).activeTab = 'Installed';
    const filtered = (r as any).filterByTab();
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 's1');
  });

  test('FX358 filterByTab — Other → only installed=false skills', async () => {
    const r = new SkillsRenderer('sk-root', { client: makeClient(SAMPLE_SKILLS) });
    await r.render({ runState: {} });
    (r as any).activeTab = 'Other';
    const filtered = (r as any).filterByTab();
    assert.equal(filtered.length, 2);
    assert.deepEqual(filtered.map((s: any) => s.id), ['s2', 's3']);
  });

  test('FX358 filterByTab — Recommended slices relevance to 20', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, tags: [], installed: false }));
    const r = new SkillsRenderer('sk-root', { client: makeClient(SAMPLE_SKILLS, many) });
    await r.render({ runState: {} });
    (r as any).relevance = many;
    (r as any).activeTab = 'Recommended';
    assert.equal((r as any).filterByTab().length, 20);
  });

  test('FX358 filterByTab — All Relevant returns full relevance set', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, tags: [], installed: false }));
    const r = new SkillsRenderer('sk-root', { client: makeClient(SAMPLE_SKILLS, many) });
    await r.render({ runState: {} });
    (r as any).relevance = many;
    (r as any).activeTab = 'All Relevant';
    assert.equal((r as any).filterByTab().length, 30);
  });

  test('FX358 filterByTab — activeCat filters by tag membership', async () => {
    const r = new SkillsRenderer('sk-root', { client: makeClient(SAMPLE_SKILLS) });
    await r.render({ runState: {} });
    (r as any).activeTab = 'Other';
    (r as any).activeCat = 'security';
    const filtered = (r as any).filterByTab();
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 's3');
  });

  test('FX366 getAvailableTags — returns sorted unique tags from active pool (Installed)', async () => {
    const r = new SkillsRenderer('sk-root', { client: makeClient(SAMPLE_SKILLS) });
    await r.render({ runState: {} });
    (r as any).activeTab = 'Installed';
    const tags = (r as any).getAvailableTags();
    assert.deepEqual(tags, ['audit', 'security']);
  });

  test('FX366 getAvailableTags — Other → unique tags from non-installed', async () => {
    const r = new SkillsRenderer('sk-root', { client: makeClient(SAMPLE_SKILLS) });
    await r.render({ runState: {} });
    (r as any).activeTab = 'Other';
    const tags = (r as any).getAvailableTags();
    assert.deepEqual(tags, ['planning', 'review', 'security']);
  });

  test('FX366 — tag input renders with cc-tag-input class + suggestions container', async () => {
    const r = new SkillsRenderer('sk-root', { client: makeClient(SAMPLE_SKILLS) });
    await r.render({ runState: {} });
    assert.ok(document.querySelector('.cc-tag-input'));
    assert.ok(document.querySelector('.cc-tag-suggestions'));
  });

  test('FX366 — clearing tag filter resets activeCat to All', async () => {
    const r = new SkillsRenderer('sk-root', { client: makeClient(SAMPLE_SKILLS) });
    await r.render({ runState: {} });
    (r as any).activeTab = 'Other';
    (r as any).activeCat = 'security';
    (r as any).reRenderCategoryChips(document.getElementById('sk-root'));
    const clear = document.querySelector('.cc-tag-clear') as HTMLButtonElement | null;
    assert.ok(clear, 'clear button should appear when filter active');
    clear!.click();
    assert.equal((r as any).activeCat, 'All');
  });

  test('FX358 — Auto Ingest button posts to /api/skills/ingest/auto', async () => {
    const client = makeClient(SAMPLE_SKILLS);
    const r = new SkillsRenderer('sk-root', { client });
    await r.render({ runState: {} });
    const btn = document.querySelector('.cc-skill-auto') as HTMLButtonElement;
    btn.click();
    await new Promise(r => setTimeout(r, 5));
    assert.ok(client.posted.some(p => p.path === '/api/skills/ingest/auto'));
  });

  test('FX358 — Manual Ingest button posts to /api/skills/ingest/manual', async () => {
    const client = makeClient(SAMPLE_SKILLS);
    const r = new SkillsRenderer('sk-root', { client });
    await r.render({ runState: {} });
    const btn = document.querySelector('.cc-skill-manual') as HTMLButtonElement;
    btn.click();
    await new Promise(r => setTimeout(r, 5));
    assert.ok(client.posted.some(p => p.path === '/api/skills/ingest/manual'));
  });

  test('FX358 destroy — clears container HTML', async () => {
    const r = new SkillsRenderer('sk-root', { client: makeClient(SAMPLE_SKILLS) });
    await r.render({ runState: {} });
    assert.ok(document.getElementById('sk-root')!.innerHTML.length > 0);
    r.destroy();
    assert.equal(document.getElementById('sk-root')!.innerHTML, '');
  });
});
