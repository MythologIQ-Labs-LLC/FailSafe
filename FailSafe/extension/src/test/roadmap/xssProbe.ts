// Lane E (plan-e-console-ui-xss): shared hostile payloads and the inertness
// check for the Console XSS rows. A payload is inert when rendering it creates
// no element, no event-handler attribute carrying it, and no attribute that
// only an attribute breakout could have produced.

import { strict as assert } from 'assert';
import { JSDOM } from 'jsdom';

export const MARK = '__fsXss';
export const TAG = `<img src=x onerror="window.${MARK}=1">`;
export const DQ = `x" autofocus onfocus="window.${MARK}=1" data-x="`;
export const SQ = `x' onmouseover='window.${MARK}=1' data-x='`;
export const JSURL = `javascript:window.${MARK}=1`;
export const CLS = `low" onclick="window.${MARK}=1`;

const ACTIVE_TAGS = new Set(['IMG', 'SCRIPT', 'IFRAME', 'OBJECT', 'EMBED']);

export interface InertOptions {
  /** on* attribute names the markup legitimately carries (lower case). */
  allowOn?: string[];
}

/** Every reason `root` is not inert, case-insensitive (empty when inert). */
export function hostileFindings(root: Element | Document, opts: InertOptions = {}): string[] {
  const allowOn = new Set((opts.allowOn ?? []).map((n) => n.toLowerCase()));
  const mark = MARK.toLowerCase();
  const out: string[] = [];
  for (const el of Array.from(root.querySelectorAll('*'))) {
    const tag = el.tagName.toUpperCase();
    if (ACTIVE_TAGS.has(tag)) out.push(`element <${tag.toLowerCase()}>`);
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name === 'autofocus' || name === 'data-x') out.push(`attribute ${name} on <${tag.toLowerCase()}>`);
      if (name.startsWith('on')) {
        if (!allowOn.has(name)) out.push(`handler ${name} on <${tag.toLowerCase()}>`);
        else if (attr.value.toLowerCase().includes(mark)) out.push(`payload in ${name} on <${tag.toLowerCase()}>`);
      }
    }
  }
  return out;
}

export function assertInert(root: Element | Document, opts: InertOptions = {}): void {
  const findings = hostileFindings(root, opts);
  assert.deepEqual(findings, [], `payload was not inert: ${findings.join('; ')}`);
}

/** Parse a server-sent HTML document for the same checks. */
export function parseHtml(html: string): Document {
  return new JSDOM(html).window.document;
}

/** Install a fresh jsdom as the global document/window; returns the restore function. */
export function installDom(body = '', url = 'http://localhost/'): { dom: JSDOM; restore: () => void } {
  const g = globalThis as Record<string, unknown>;
  const prev = { document: g.document, window: g.window, CSS: g.CSS, Event: g.Event, fetch: g.fetch };
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${body}</body></html>`, { url });
  g.document = dom.window.document;
  g.window = dom.window;
  g.CSS = (dom.window as unknown as { CSS?: unknown }).CSS;
  g.Event = dom.window.Event;
  return {
    dom,
    restore: () => {
      g.document = prev.document;
      g.window = prev.window;
      g.CSS = prev.CSS;
      g.Event = prev.Event;
      g.fetch = prev.fetch;
    },
  };
}

/** Resolve after pending microtasks and timers have run (async renderers). */
export async function settle(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
}
