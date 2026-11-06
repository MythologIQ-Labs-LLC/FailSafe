// TEMPORARY #601 qualification probe (not committed): screenshots + text contrast per theme.
import { test } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { serveConsoleServerUI } from './helpers/serveConsoleServerUI';
import { hubForPhase, type HubFixture } from './helpers/ledgerFixtures';

const OUT = process.env.FS601_OUT || path.resolve('test-results/601-visual');
const THEMES = ['pegasus', 'mythiq', 'midnight', 'aurora', 'crimson', 'atmosphere'];

function alertHub(): HubFixture {
  const hub = hubForPhase('GATE');
  hub.sentinelStatus = { running: true, queueDepth: 1, lastVerdict: { decision: 'WARN' } } as never;
  hub.recentVerdicts = [{ decision: 'WARN', riskGrade: 'L2', summary: '1 issue(s) detected - review recommended', timestamp: '2026-05-01T12:00:00.000Z' }] as never;
  hub.governancePhase = { ...(hub.governancePhase as object), activeAlerts: [{ id: 'veto-548', type: 'VETO', message: 'Audit VETO on plan X', entry: 548 }] } as never;
  return hub;
}

const CONTRAST = () => {
  const parse = (c: string) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = (c: { r: number; g: number; b: number }) => { const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const blend = (top: { r: number; g: number; b: number; a: number }, under: { r: number; g: number; b: number }) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a) });
  const root = parse(getComputedStyle(document.documentElement).getPropertyValue('--bg-dark').trim().startsWith('#') ? (() => { const s = document.createElement('span'); s.style.color = getComputedStyle(document.documentElement).getPropertyValue('--bg-dark'); document.body.appendChild(s); const c = getComputedStyle(s).color; s.remove(); return c; })() : 'rgb(0,0,0)')!;
  const bgOf = (el: Element | null): { r: number; g: number; b: number } => {
    const chain: Element[] = []; for (let e = el; e; e = e.parentElement) chain.push(e);
    let acc = { r: root.r, g: root.g, b: root.b };
    for (const e of chain.reverse()) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) acc = blend(c, acc); }
    return acc;
  };
  const out: { sel: string; text: string; ratio: number }[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement; if (!el || !n.textContent?.trim()) continue;
    const st = getComputedStyle(el); if (st.visibility === 'hidden' || st.display === 'none' || el.getClientRects().length === 0) continue;
    const fg = parse(st.color); if (!fg) continue;
    const bg = bgOf(el); const f = blend(fg, bg);
    const [l1, l2] = [lum(f), lum(bg)].sort((a, b) => b - a);
    out.push({ sel: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`, text: n.textContent.trim().slice(0, 40), ratio: Math.round(((l1 + 0.05) / (l2 + 0.05)) * 100) / 100 });
  }
  return out.sort((a, b) => a.ratio - b.ratio);
};

test('601 visual probe', async ({ browser }) => {
  test.setTimeout(240_000);
  fs.mkdirSync(OUT, { recursive: true });
  const controller = await serveConsoleServerUI({ initialHub: alertHub() });
  const report: Record<string, unknown> = {};
  try {
    for (const theme of THEMES) {
      await controller.setTheme(theme);
      const ctx = await browser.newContext({ viewport: { width: 360, height: 760 } });
      const mon = await ctx.newPage();
      await mon.goto(`${controller.url}/?ui=compact`);
      await mon.waitForTimeout(1500);
      await mon.screenshot({ path: path.join(OUT, `monitor-${theme}.png`) });
      const monC = await mon.evaluate(CONTRAST);
      const sre = await ctx.newPage();
      await sre.goto(`${controller.url}/console/sre`);
      await sre.waitForTimeout(500);
      await sre.screenshot({ path: path.join(OUT, `sre-${theme}.png`) });
      const sreC = await sre.evaluate(CONTRAST);
      report[theme] = { monitorLowest: monC.slice(0, 6), sreLowest: sreC.slice(0, 4), monitorTexts: monC.length };
      await ctx.close();
    }
  } finally {
    await controller.close();
  }
  fs.writeFileSync(path.join(OUT, 'contrast.json'), JSON.stringify(report, null, 2));
});
