'use strict';
// QUALIFICATION-ONLY probe (not committed). Renders hostile Markdown through the
// host's real markdown.api.render and applies a verbatim copy of PR #629's
// assertNoDisguisedAutoLinks helper, recording raw HTML and verdicts.
const assert = require('assert').strict;
const vscode = require('vscode');
const fs = require('fs');

function assertNoDisguisedAutoLinks(html) {
  const anchors = Array.from(html.matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g));
  for (const [, href, text] of anchors) {
    const displayedTarget = href.replace(/%5c/gi, '\\');
    assert.equal(text, displayedTarget, `disguised link in ${html}`);
  }
}

const CASES = [
  ['bare-url-trailing-backslash', 'https://evil.example/p.png\\'],
  ['escaped-image-syntax', '!\\[x\\]\\(https://evil.example/p.png\\)'],
  ['bare-url-same-text', 'see https://evil.example/path ok'],
  ['md-link-disguised-label', '[Trusted link](https://evil.example)'],
  ['md-link-url-lookalike', '[http://trusted.example](http://evil.example)'],
  ['md-link-backslash-text-other-host', '[https://evil.example/p.png\\\\](https://other.example/p.png%5C)'],
  ['md-link-nested-markup-label', '[**Trusted**](https://evil.example)'],
  ['md-image-in-link', '[![x](https://evil.example/i.png)](https://evil.example)'],
  ['md-image', '![x](https://evil.example/p.png)'],
  ['raw-html-anchor', '<a href="https://evil.example">Trusted</a>'],
  ['raw-html-img', '<img src=x onerror=alert(1)>'],
  ['raw-html-script', '<script>alert(1)</script>'],
  ['javascript-link', '[x](javascript:alert(1))'],
];

suite('QUAL PROBE #629 renderer matrix', () => {
  test('record renderer output and helper verdicts', async () => {
    const out = { vscode: vscode.version, electron: process.versions.electron, node: process.versions.node, cases: [] };
    for (const [id, md] of CASES) {
      const html = String(await vscode.commands.executeCommand('markdown.api.render', md));
      let helper = 'accepted';
      try { assertNoDisguisedAutoLinks(html); } catch { helper = 'REJECTED'; }
      out.cases.push({
        id, md, html: html.trim(), helper,
        anchors: (html.match(/<a\b/g) || []).length,
        img: /<img/.test(html), script: /<script/i.test(html),
      });
    }
    fs.writeFileSync(process.env.QUAL_OUT, JSON.stringify(out, null, 2));
  });
});

suite('QUAL PROBE #629 chat sites', () => {
  test('record real chat-participant purpose renderings', async () => {
    const { FailSafeChatParticipant } = require('../../genesis/chat/FailSafeChatParticipant');
    const HOSTILE_TITLE = '![x](https://evil.example/p.png\) <img src=x onerror=alert(1)> [link](http://evil.example)';
    const values = [];
    const stream = { markdown: (v) => values.push(typeof v === 'string' ? v : v.value), button: () => undefined };
    const active = { id: 'i', purpose: HOSTILE_TITLE, type: 'feature', status: 'PASS', scope: { files: [], riskGrade: 'L1' } };
    const p = Object.create(FailSafeChatParticipant.prototype);
    p.intentService = { getActiveIntent: async () => active, getEnforcedActiveIntent: async () => active, sealIntent: async () => undefined };
    p.sentinel = { getStatus: () => ({ running: true, mode: 'LOCAL', filesWatched: 0, queueDepth: 0 }) };
    const token = new vscode.CancellationTokenSource().token;
    for (const command of ['intent', 'status', 'seal']) await p.handleRequest({ command, prompt: '' }, {}, stream, token);
    const sites = [];
    for (const v of values.filter((x) => x.includes('evil.example'))) {
      const html = String(await vscode.commands.executeCommand('markdown.api.render', v));
      let helper = 'accepted';
      try { assertNoDisguisedAutoLinks(html); } catch { helper = 'REJECTED'; }
      const anchors = Array.from(html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)).map((m) => m[0]);
      sites.push({ md: v, html: html.replace(/<span id="markdown-mermaid"[^>]*><\/span>/, '').trim(), helper,
        anyImgTag: /<img/i.test(html), anyScriptTag: /<script/i.test(html), rawOnerrorTag: /<[a-z]+[^>]*onerror/i.test(html),
        linkToEvilWithTextLink: /<a [^>]*href="http:\/\/evil\.example"[^>]*>link<\/a>/.test(html), anchors });
    }
    fs.writeFileSync(process.env.QUAL_OUT.replace(/\.json$/, '-chat.json'), JSON.stringify({ vscode: vscode.version, sites }, null, 2));
  });
});
