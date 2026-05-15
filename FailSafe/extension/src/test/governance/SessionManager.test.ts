// Functional tests for SessionManager (FX290).
// Tempfile workspace; the implementation calls vscode.commands.executeCommand
// for setContext during lock/unlock — patch globals to capture these.

import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { SessionManager } from '../../governance/SessionManager';

interface CapturedExec { name: string; args: unknown[]; }

function withCapturedExec(): { calls: CapturedExec[]; restore: () => void } {
  const calls: CapturedExec[] = [];
  const original = vscode.commands.executeCommand.bind(vscode.commands);
  (vscode.commands as { executeCommand: unknown }).executeCommand = ((name: string, ...args: unknown[]) => {
    calls.push({ name, args });
    if (name === 'setContext') return Promise.resolve(undefined);
    return original(name, ...args);
  }) as typeof vscode.commands.executeCommand;
  return {
    calls,
    restore: () => { (vscode.commands as { executeCommand: unknown }).executeCommand = original; },
  };
}

function tmpRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'failsafe-session-'));
}

suite('SessionManager (FX290)', () => {
  let workspaceRoot: string;
  let exec: { calls: CapturedExec[]; restore: () => void };

  setup(() => {
    workspaceRoot = tmpRoot();
    exec = withCapturedExec();
  });

  teardown(() => {
    exec.restore();
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  test('FX290 constructor — creates .failsafe/session/ directory', () => {
    new SessionManager(workspaceRoot);
    const dir = path.join(workspaceRoot, '.failsafe', 'session');
    assert.ok(fs.existsSync(dir));
  });

  test('FX290 constructor — initial state has no active intent + isLocked=false', () => {
    const sm = new SessionManager(workspaceRoot);
    const state = sm.getState();
    assert.equal(state.activeIntentId, null);
    assert.equal(state.isLocked, false);
    assert.ok(state.lastActiveAt);
  });

  test('FX290 constructor — restores previously persisted state', async () => {
    const sm1 = new SessionManager(workspaceRoot);
    await sm1.setActiveIntent('intent-restored');
    // New instance reads from disk
    const sm2 = new SessionManager(workspaceRoot);
    assert.equal(sm2.getState().activeIntentId, 'intent-restored');
  });

  test('FX290 saveState — partial update merges with existing state + bumps lastActiveAt', async () => {
    const sm = new SessionManager(workspaceRoot);
    await sm.saveState({ activeIntentId: 'intent-x' });
    const before = sm.getState().lastActiveAt;
    await new Promise((r) => setTimeout(r, 5));
    await sm.saveState({ isLocked: true });
    const after = sm.getState();
    assert.equal(after.activeIntentId, 'intent-x', 'prior field preserved');
    assert.equal(after.isLocked, true);
    assert.notEqual(after.lastActiveAt, before, 'lastActiveAt should bump on every save');
  });

  test('FX290 saveState — persists to disk synchronously enough for next read', async () => {
    const sm = new SessionManager(workspaceRoot);
    await sm.saveState({ activeIntentId: 'persisted' });
    const sessionFile = path.join(workspaceRoot, '.failsafe', 'session', 'current_session.json');
    const onDisk = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
    assert.equal(onDisk.activeIntentId, 'persisted');
  });

  test('FX290 lockSession — sets isLocked + lockReason + dispatches setContext', async () => {
    const sm = new SessionManager(workspaceRoot);
    await sm.lockSession('axiom-3-veto');
    const state = sm.getState();
    assert.equal(state.isLocked, true);
    assert.equal(state.lockReason, 'axiom-3-veto');
    const setCtxCall = exec.calls.find((c) => c.name === 'setContext' && c.args[0] === 'failsafe:isLocked');
    assert.ok(setCtxCall);
    assert.equal(setCtxCall!.args[1], true);
  });

  test('FX290 unlockSession — clears isLocked + lockReason + dispatches setContext false', async () => {
    const sm = new SessionManager(workspaceRoot);
    await sm.lockSession('temp-lock');
    exec.calls.length = 0; // reset capture
    await sm.unlockSession();
    const state = sm.getState();
    assert.equal(state.isLocked, false);
    assert.equal(state.lockReason, undefined);
    const setCtxCall = exec.calls.find((c) => c.name === 'setContext' && c.args[0] === 'failsafe:isLocked');
    assert.ok(setCtxCall);
    assert.equal(setCtxCall!.args[1], false);
  });

  test('FX290 setActiveIntent — accepts string + null', async () => {
    const sm = new SessionManager(workspaceRoot);
    await sm.setActiveIntent('intent-1');
    assert.equal(sm.getState().activeIntentId, 'intent-1');
    await sm.setActiveIntent(null);
    assert.equal(sm.getState().activeIntentId, null);
  });

  test('FX290 getState — returns a copy (no shared mutation)', () => {
    const sm = new SessionManager(workspaceRoot);
    const s1 = sm.getState();
    s1.activeIntentId = 'mutated-externally';
    const s2 = sm.getState();
    assert.equal(s2.activeIntentId, null, 'external mutation should not affect internal state');
  });

  test('FX290 constructor — corrupted session file falls back to defaults instead of throwing', () => {
    const sessionDir = path.join(workspaceRoot, '.failsafe', 'session');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(path.join(sessionDir, 'current_session.json'), 'not-valid-json{', 'utf-8');
    let sm: SessionManager;
    assert.doesNotThrow(() => { sm = new SessionManager(workspaceRoot); });
    assert.equal(sm!.getState().activeIntentId, null);
    assert.equal(sm!.getState().isLocked, false);
  });
});
