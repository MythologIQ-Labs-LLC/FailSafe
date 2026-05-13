// Functional tests for GovernanceStatusBar (FX299).

import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { GovernanceStatusBar } from '../../governance/GovernanceStatusBar';

suite('GovernanceStatusBar (FX299)', () => {
  test('FX299 update — null intent → "Idle" text + descriptionForeground color', () => {
    const sb = new GovernanceStatusBar();
    sb.update(null);
    const item = (sb as any).item as vscode.StatusBarItem;
    assert.match(String(item.text), /Idle/);
    assert.match(String(item.tooltip), /BLOCKED/);
    sb.dispose();
  });

  test('FX299 update — PULSE intent → yellow color + status in text', () => {
    const sb = new GovernanceStatusBar();
    sb.update({
      id: 'i1', purpose: 'test', status: 'PULSE',
      scope: { files: ['a.ts'], riskGrade: 'L1' },
    } as never);
    const item = (sb as any).item as vscode.StatusBarItem;
    assert.match(String(item.text), /PULSE/);
    sb.dispose();
  });

  test('FX299 update — PASS intent → green color', () => {
    const sb = new GovernanceStatusBar();
    sb.update({
      id: 'i1', purpose: 'p', status: 'PASS',
      scope: { files: [], riskGrade: 'L1' },
    } as never);
    const item = (sb as any).item as vscode.StatusBarItem;
    assert.match(String(item.text), /PASS/);
    sb.dispose();
  });

  test('FX299 update — VETO intent → red color', () => {
    const sb = new GovernanceStatusBar();
    sb.update({
      id: 'i1', purpose: 'p', status: 'VETO',
      scope: { files: [], riskGrade: 'L1' },
    } as never);
    const item = (sb as any).item as vscode.StatusBarItem;
    assert.match(String(item.text), /VETO/);
    sb.dispose();
  });

  test('FX299 update — SEALED intent → blue color', () => {
    const sb = new GovernanceStatusBar();
    sb.update({
      id: 'i1', purpose: 'p', status: 'SEALED',
      scope: { files: [], riskGrade: 'L1' },
    } as never);
    const item = (sb as any).item as vscode.StatusBarItem;
    assert.match(String(item.text), /SEALED/);
    sb.dispose();
  });

  test('FX299 update — tooltip contains intent purpose + scope file count', () => {
    const sb = new GovernanceStatusBar();
    sb.update({
      id: 'i1', purpose: 'My Purpose Text', status: 'PASS',
      scope: { files: ['a.ts', 'b.ts', 'c.ts'], riskGrade: 'L1' },
    } as never);
    const item = (sb as any).item as vscode.StatusBarItem;
    assert.match(String(item.tooltip), /My Purpose Text/);
    assert.match(String(item.tooltip), /3 files/);
    sb.dispose();
  });

  test('FX299 dispose — disposes underlying StatusBarItem without throwing', () => {
    const sb = new GovernanceStatusBar();
    assert.doesNotThrow(() => sb.dispose());
  });

  test('FX299 update — sets item command to failsafe.showMenu', () => {
    const sb = new GovernanceStatusBar();
    const item = (sb as any).item as vscode.StatusBarItem;
    assert.equal(item.command, 'failsafe.showMenu');
    sb.dispose();
  });

  // B194 — governance mode escalation surface
  test('B194 updateMode — explicit observe does NOT include "(default)"', () => {
    const sb = new GovernanceStatusBar();
    sb.updateMode({ mode: 'observe', defaulted: false });
    const modeItem = (sb as any).modeItem as vscode.StatusBarItem;
    assert.match(String(modeItem.text), /Observe/);
    assert.ok(!/\(default\)/.test(String(modeItem.text)),
      `Expected no "(default)" tag for explicit observe; got ${modeItem.text}`);
    sb.dispose();
  });

  test('B194 updateMode — defaulted observe DOES include "(default)"', () => {
    const sb = new GovernanceStatusBar();
    sb.updateMode({ mode: 'observe', defaulted: true });
    const modeItem = (sb as any).modeItem as vscode.StatusBarItem;
    assert.match(String(modeItem.text), /Observe/);
    assert.match(String(modeItem.text), /\(default\)/);
    sb.dispose();
  });

  test('B194 updateMode — assist mode label contains "Assist"', () => {
    const sb = new GovernanceStatusBar();
    sb.updateMode({ mode: 'assist', defaulted: false });
    const modeItem = (sb as any).modeItem as vscode.StatusBarItem;
    assert.match(String(modeItem.text), /Assist/);
    assert.ok(!/\(default\)/.test(String(modeItem.text)));
    sb.dispose();
  });

  test('B194 updateMode — enforce mode label contains "Enforce"', () => {
    const sb = new GovernanceStatusBar();
    sb.updateMode({ mode: 'enforce', defaulted: false });
    const modeItem = (sb as any).modeItem as vscode.StatusBarItem;
    assert.match(String(modeItem.text), /Enforce/);
    assert.ok(!/\(default\)/.test(String(modeItem.text)));
    sb.dispose();
  });
});
