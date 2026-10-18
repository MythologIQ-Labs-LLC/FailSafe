/**
 * #538 lane D (B263): the path a Slack or Teams notice shows. The L3-decided
 * payload is `{ request, decision }` (L3ApprovalService), so the mapper must
 * read `request.filePath`; every path line goes through one label rule:
 * workspace-relative when inside the workspace, file name only otherwise,
 * invisible and control characters removed, capped at 200 characters. Slack
 * also escapes its mrkdwn control characters.
 */

import { strict as assert } from 'assert';
import * as os from 'os';
import * as path from 'path';
import { mapGovernanceEvent as mapSlack } from '../../integrations/slack/slack-notify-map';
import { mapGovernanceEvent as mapTeams } from '../../integrations/teams/teams-notify-map';

type Map4 = (eventType: string, payload: unknown, consoleUrl?: string, workspaceRoot?: string) =>
  { kind: string; title: string; detail?: string } | null;

const ROOT = path.resolve(os.tmpdir(), 'ws538d');
const OUTSIDE = path.resolve(path.parse(os.tmpdir()).root, 'home', 'u', 'secret-name.ts');

const MAPPERS: Array<[string, Map4]> = [
  ['Slack', mapSlack],
  ['Teams', mapTeams],
];

function decided(filePath: unknown, decision = 'APPROVED') {
  return { request: { id: 'r1', state: decision, filePath, riskGrade: 'L3' }, decision };
}

for (const [channel, map] of MAPPERS) {
  const detailOf = (filePath: unknown, root: string | undefined = ROOT) =>
    map('qorelogic.l3Decided', decided(filePath), undefined, root)?.detail;

  suite(`${channel} notice path label (#538 B263)`, () => {
    test('l3Decided reads request.filePath (relative kept)', () => {
      assert.equal(detailOf('src/b.ts'), 'Path: src/b.ts');
    });

    test('an absolute path inside the workspace becomes workspace-relative', () => {
      assert.equal(detailOf(path.resolve(ROOT, 'src', 'a.ts')), 'Path: src/a.ts');
    });

    test('an absolute path outside the workspace, or with no workspace, shows the file name only', () => {
      assert.equal(detailOf(OUTSIDE), 'Path: secret-name.ts');
      assert.equal(detailOf(OUTSIDE, undefined), 'Path: secret-name.ts');
    });

    test('drive-letter and UNC paths are absolute on every platform', () => {
      assert.equal(detailOf('C:\\Users\\u\\secret.ts'), 'Path: secret.ts');
      assert.equal(detailOf('\\\\server\\share\\x.ts'), 'Path: x.ts');
    });

    test('a relative path that climbs out shows the file name only', () => {
      assert.equal(detailOf('../../etc/passwd'), 'Path: passwd');
      assert.equal(detailOf('..\\..\\etc\\shadow'), 'Path: shadow');
    });

    test('a file URI shows the file name only', () => {
      assert.equal(detailOf('file:///home/u/x.ts'), 'Path: x.ts');
    });

    test('a file URI without // and a drive-relative path show the file name only (#538 review)', () => {
      assert.equal(detailOf('file:/home/u/secret/x.ts'), 'Path: x.ts');
      assert.equal(detailOf('C:Users\\u\\x.ts'), 'Path: x.ts');
    });

    test('characters percent-decoded from a file URI are removed from the final label (#538 review)', () => {
      assert.equal(detailOf('file:///tmp/a%0A%E2%80%AEb.ts'), 'Path: ab.ts');
      assert.equal(detailOf('file:///C:/x/a%0A%E2%80%AEb.ts'), 'Path: ab.ts');
    });

    test('control, bidi and invisible characters are removed', () => {
      const raw = 'src/\u0007a\u001b\u202e\u2066\u061c\u2028\u2029\u200b\u200d\ufeff\u0085.ts';
      assert.equal(detailOf(raw), 'Path: src/a.ts');
    });

    test('a long path is capped at 200 characters, keeping its end', () => {
      const long = `src/${'d/'.repeat(200)}end.ts`;
      const d = detailOf(long) ?? '';
      assert.ok(d.startsWith('Path: …'), d.slice(0, 20));
      assert.ok(d.length <= 'Path: '.length + 200, String(d.length));
      assert.ok(d.endsWith('end.ts'));
    });

    test('EXPIRED carries the decision and the path', () => {
      const e = map('qorelogic.l3Decided', decided('src/e.ts', 'EXPIRED'), undefined, ROOT);
      assert.match(e?.title ?? '', /EXPIRED/);
      assert.equal(e?.detail, 'Path: src/e.ts');
    });

    test('the flat filePath fallback still works (G)', () => {
      assert.equal(map('qorelogic.l3Decided', { filePath: 'src/c.ts', decision: 'REJECTED' }, undefined, ROOT)?.detail, 'Path: src/c.ts');
    });

    test('a label is kept (G)', () => {
      assert.equal(map('qorelogic.l3Queued', { filePath: 'open-design:create_artifact' }, undefined, ROOT)?.detail, 'Path: open-design:create_artifact');
    });

    test('the queued and blocking-verdict lines use the same label', () => {
      assert.equal(map('qorelogic.l3Queued', { filePath: OUTSIDE }, undefined, ROOT)?.detail, 'Path: secret-name.ts');
      assert.equal(map('sentinel.verdict', { decision: 'VETO', artifactPath: OUTSIDE }, undefined, ROOT)?.detail, 'Artifact: secret-name.ts');
    });
  });
}

suite('Slack path label escaping (#538)', () => {
  const map = mapSlack;

  test('mrkdwn control characters in a path are entity-escaped', () => {
    assert.equal(map('qorelogic.l3Decided', decided('<!channel>.ts'), undefined, ROOT)?.detail, 'Path: &lt;!channel&gt;.ts');
    const link = map('qorelogic.l3Queued', { filePath: '<https://e.example|Approve> & co.ts' }, undefined, ROOT)?.detail ?? '';
    assert.equal(link, 'Path: &lt;https://e.example|Approve&gt; &amp; co.ts');
  });
});

suite('Teams path label (#538, residual B300)', () => {
  test('the label is passed through unescaped on the queued line (G)', () => {
    const map = mapTeams;
    assert.equal(map('qorelogic.l3Queued', { filePath: '<!channel>.ts' }, undefined, ROOT)?.detail, 'Path: <!channel>.ts');
  });
});
