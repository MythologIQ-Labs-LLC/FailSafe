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

const HOSTILE_TITLE = '![x](https://evil.example/p.png) <img src=x onerror=alert(1)> [link](http://evil.example)';

suite('tracker preview and chat Markdown safety (#480 T11)', () => {
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
    participant.intentService = { getActiveIntent: async () => active, sealIntent: async () => undefined };
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
      // Chat Markdown still auto-links a bare URL (disclosed limitation); what
      // must not happen is a link whose text hides its target, which is what
      // the [link](...) syntax in the purpose would produce if not escaped.
      const anchors = Array.from(html.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g));
      for (const [, href, text] of anchors) assert.equal(text, href, `disguised link in ${html}`);
    }
  });

  test('purpose validation rejects empty and over-200 input', () => {
    assert.equal(validatePurpose('ok'), undefined);
    assert.ok(validatePurpose('  '));
    assert.equal(validatePurpose('x'.repeat(200)), undefined);
    assert.ok(validatePurpose('x'.repeat(201)));
  });
});
