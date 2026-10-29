// Writes the walkthrough as one ordered driver queue. Every step is an ordinary VS Code API call
// performed by the disposable driver (scripted stand-in for a developer's clicks and keystrokes).
// FailSafe's reactions (notifications, verdicts, Console content) are not scripted.
const fs = require('fs'); const path = require('path');
const queue = 'C:/dev/mythologiq/FailSafe-rc611-qual/iso/ctl/queue';
const C = 'http://127.0.0.1:9376/';
const steps = [
  // 0-10 s: the repository and its open defect
  { type: 'exec', command: 'notifications.clearAll' },
  { type: 'exec', command: 'workbench.action.closeAllEditors' },
  { type: 'exec', command: 'workbench.action.closePanel' },
  { type: 'exec', command: 'workbench.view.explorer' },
  { type: 'sleep', ms: 2500 },
  { type: 'open', file: 'ISSUES.md', line: 3 },
  { type: 'sleep', ms: 5000 },
  // 10-25 s: FailSafe's view of the workspace
  { type: 'exec', command: 'failsafe.openSidebar' },
  { type: 'sleep', ms: 2500 },
  { type: 'exec', command: 'notifications.clearAll' },
  { type: 'exec', command: 'notifications.hideToasts' },
  { type: 'exec', command: 'simpleBrowser.show', args: [C + '#overview'] },
  { type: 'sleep', ms: 9000 },
  // 25-50 s: the change: a regression test first, then the fix
  { type: 'exec', command: 'workbench.action.closeAllEditors' },
  { type: 'open', file: 'test/validation.test.ts', line: 18 },
  { type: 'sleep', ms: 1500 },
  { type: 'replace', file: 'test/validation.test.ts', save: true,
    find: "  assert.throws(() => validateDueDate('2026-13-01'), ValidationError);\n});\n",
    with: "  assert.throws(() => validateDueDate('2026-13-01'), ValidationError);\n});\n\n" +
      "test('impossible calendar days are rejected, real leap days accepted (TASK-14)', () => {\n" +
      "  assert.throws(() => validateDueDate('2026-02-30'), ValidationError);\n" +
      "  assert.throws(() => validateDueDate('2026-04-31'), ValidationError);\n" +
      "  assert.equal(validateDueDate('2028-02-29'), '2028-02-29');\n});\n" },
  { type: 'sleep', ms: 5500 },
  { type: 'terminal', name: 'tests', text: 'npm test', preserveFocus: true },
  { type: 'sleep', ms: 6000 },
  { type: 'exec', command: 'notifications.clearAll' },
  { type: 'open', file: 'src/validation.ts', line: 26 },
  { type: 'sleep', ms: 1500 },
  { type: 'replace', file: 'src/validation.ts', save: true,
    find: "  return parsed.toISOString().slice(0, 10);\n}",
    with: "  // TASK-14: Date rolls impossible days forward (2026-02-30 -> 2026-03-02); reject them instead.\n" +
      "  const canonical = parsed.toISOString().slice(0, 10);\n" +
      "  if (canonical !== dueDate) throw new ValidationError(`due date \"${dueDate}\" does not exist`);\n" +
      "  return canonical;\n}" },
  { type: 'sleep', ms: 5000 },
  // 50-70 s: verification and governance evidence
  { type: 'terminal', name: 'tests', text: 'npm test', preserveFocus: true },
  { type: 'sleep', ms: 6000 },
  { type: 'exec', command: 'workbench.action.closePanel' },
  { type: 'exec', command: 'notifications.clearAll' },
  { type: 'exec', command: 'notifications.hideToasts' },
  { type: 'exec', command: 'simpleBrowser.show', args: [C + '#governance:audit'] },
  { type: 'sleep', ms: 10000 },
  // 70-90 s: outcome
  { type: 'exec', command: 'workbench.action.closeAllEditors' },
  { type: 'exec', command: 'notifications.clearAll' },
  { type: 'exec', command: 'notifications.hideToasts' },
  { type: 'exec', command: 'simpleBrowser.show', args: [C + '#overview'] },
  { type: 'sleep', ms: 4000 },
  { type: 'terminal', name: 'tests', text: 'git --no-pager diff --stat', preserveFocus: true },
  { type: 'sleep', ms: 9000 },
];
let t = Date.now() * 1000;
for (const s of steps) fs.writeFileSync(path.join(queue, `${t++}.json`), JSON.stringify(s));
console.log(`queued ${steps.length} steps`);
