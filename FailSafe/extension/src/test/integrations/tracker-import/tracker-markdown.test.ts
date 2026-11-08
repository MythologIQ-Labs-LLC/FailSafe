// #480 T11, VS Code extension host: provider text in the Jira/Linear preview,
// and an imported purpose in the chat participant, render no link, image or
// HTML. Rendering goes through the built-in Markdown engine
// (`markdown.api.render`), and a control string proves that engine renders a
// real image and link, so an empty render cannot pass.

import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { parseIssueResponse, toIntentPreview } from '../../../integrations/jira/jira-import';
import { fenceFor, fromJiraPreview, previewMarkdown } from '../../../integrations/tracker-import/tracker-intent-import';
import { FailSafeChatParticipant } from '../../../genesis/chat/FailSafeChatParticipant';
import { validatePurpose } from '../../../extension/trackerReviewUi';
import { loadFixture } from './replay';

async function render(md: string): Promise<string> {
  return String(await vscode.commands.executeCommand('markdown.api.render', md));
}

const HOSTILE_TITLE = '![x](https://evil.example/p.png) <img src=x onerror=alert(1)> <script>alert(1)</script> [link](http://evil.example)';

/**
 * Newer VS Code markdown renderers percent-encode a literal backslash in
 * auto-linked URL hrefs while keeping the visible URL text unencoded.
 * Normalize %5C only at the *end* of the href, matching the observed case.
 * Only this one verified representation difference is accepted. Encoded
 * slashes, @, percent signs or arbitrary disguises are NOT normalized.
 */
function assertNoDisguisedAutoLinks(html: string): void {
  // Reject every anchor with markup or a non-canonical href, including
  // attributes before href and nested formatted labels (previously skipped).
  const anchors = Array.from(html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi));
  const openings = (html.match(/<a\b/gi) ?? []).length;
  const closings = (html.match(/<\/a\s*>/gi) ?? []).length;
  assert.equal(anchors.length, openings, `unrecognized opening anchor in ${html}`);
  assert.equal(anchors.length, closings, `unmatched closing anchor in ${html}`);
  for (const [, attrs, content] of anchors) {
    const href = /(?:^|\s)href\s*=\s*"([^"]*)"/i.exec(attrs)?.[1];
    assert.ok(href, `anchor without quoted href in ${html}`);
    assert.ok(!/<[^>]*>/.test(content), `nested markup in anchor in ${html}`);
    const displayedTarget = href.replace(/%5c$/i, '\\');
    assert.equal(content, displayedTarget, `disguised link in ${html}`);
  }
}

suite('tracker preview and chat Markdown safety (#480 T11)', () => {
  test('renderer URL encoding remains narrow: a disguised destination still fails', () => {
    assert.doesNotThrow(() =>
      assertNoDisguisedAutoLinks('<a href="https://evil.example/p.png%5C">https://evil.example/p.png\\</a>'));
    assert.doesNotThrow(() =>
      assertNoDisguisedAutoLinks('<a href="https://evil.example/p.png%5c">https://evil.example/p.png\\</a>'));
    for (const [href, text] of [
      ['https://evil.example', 'Trusted link'],
      ['https://evil.example/%2Fadmin', 'https://evil.example//admin'],
      ['https://evil.example/%40trusted', 'https://evil.example/@trusted'],
      ['https://evil.example/%255C', 'https://evil.example/%5C'],
      ['https://evil.example/%5Cpath', 'https://evil.example/\\path'],
      ['http://evil.example', 'http://trusted.example'],
    ]) {
      assert.throws(() => assertNoDisguisedAutoLinks(`<a href="${href}">${text}</a>`), /disguised link/);
    }
  });


  test('formatted labels, attribute reordering and unquoted links cannot evade the link disclosure check', () => {
    assert.doesNotThrow(() =>
      assertNoDisguisedAutoLinks('<a class="safe" href="https://evil.example">https://evil.example</a>'));
    for (const html of [
      '<a href="https://evil.example"><strong>Trusted</strong></a>',
      '<a class="x" href="https://evil.example">Trusted</a>',
      '<a href="https://evil.example"><span>https://evil.example</span></a>',
      "<a href='https://evil.example'>Trusted</a>",
      '<a href=https://evil.example>Trusted</a>',
      '<a href="https://evil.example">https://evil.example</a><a href="https://evil.example">Trusted</a>',
    ]) {
      assert.throws(() => assertNoDisguisedAutoLinks(html), /anchor|disguised|markup/i);
    }
  });

  test('control: the render probe turns a real image and link into tags', async () => {
    const html = await render(HOSTILE_TITLE);
    assert.match(html, /<img/);
    assert.match(html, /<a /);
  });

  test('the hostile Jira fixture renders no image, link or HTML from provider text', async () => {
    const body = loadFixture('jira-PROJ-666-hostile').response.body;
    const issue = fromJiraPreview(toIntentPreview(parseIssueResponse(body)!, 'https://acme.atlassian.net'));
    const md = previewMarkdown(issue);
    const html = await render(md);
    assert.ok(!/<img/.test(html), html);
    assert.ok(!/<a /.test(html), html);
    assert.ok(!/<script/.test(html), html);
    assert.match(html, /&lt;img src=x/, 'the text is still shown, as text');
    // The description holds a four-backtick run; its fence must be longer.
    assert.equal(fenceFor(issue.description!).length, 5);
    assert.ok(md.includes('`````text\nClose the fence: ````'), 'the description sits inside a five-backtick fence');
  });

  test('the chat participant renders an imported purpose as text at all three sites', async () => {
    const values: string[] = [];
    const stream = {
      markdown: (v: string | vscode.MarkdownString) => { values.push(typeof v === 'string' ? v : v.value); },
      button: () => undefined,
    };
    const active = { id: 'i', purpose: HOSTILE_TITLE, type: 'feature', status: 'PASS', scope: { files: [], riskGrade: 'L1' } };
    const participant = Object.create(FailSafeChatParticipant.prototype) as Record<string, unknown>;
    // B340: the participant reads the effective status (here the same object).
    participant.intentService = { getActiveIntent: async () => active, getEnforcedActiveIntent: async () => active, sealIntent: async () => undefined };
    participant.sentinel = { getStatus: () => ({ running: true, mode: 'LOCAL', filesWatched: 0, queueDepth: 0 }) };
    const handle = (participant.handleRequest as (...a: unknown[]) => Promise<unknown>).bind(participant);
    const token = new vscode.CancellationTokenSource().token;
    for (const command of ['intent', 'status', 'seal']) {
      await handle({ command, prompt: '' }, {}, stream, token);
    }
    const withPurpose = values.filter((v) => v.includes('evil.example'));
    assert.equal(withPurpose.length, 3, 'one purpose rendering per site');
    for (const v of withPurpose) {
      const html = await render(v);
      assert.ok(!/<img/.test(html), html);
      assert.ok(!/<script\b/i.test(html), html);
      // Auto-links may encode literal \\ as %5C in href on newer VS Code,
      // but a visible label hiding a different target must still fail.
      assertNoDisguisedAutoLinks(html);
    }
  });

  test('purpose validation rejects empty and over-200 input', () => {
    assert.equal(validatePurpose('ok'), undefined);
    assert.ok(validatePurpose('  '));
    assert.equal(validatePurpose('x'.repeat(200)), undefined);
    assert.ok(validatePurpose('x'.repeat(201)));
  });
});
