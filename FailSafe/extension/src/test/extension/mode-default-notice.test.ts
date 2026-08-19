// LD-6 (plan-qor155-align-enforce-default): one-time enforce-default notice.
// Pure unit coverage via injected deps — no VS Code API surface needed.

import { strict as assert } from 'assert';
import {
  maybeShowModeDefaultNotice,
  MODE_DEFAULT_NOTICE_KEY,
  ModeDefaultNoticeDeps,
} from '../../extension/modeDefaultNotice';
import type { GovernanceModeState } from '../../governance/types';

interface Harness {
  deps: ModeDefaultNoticeDeps;
  state: Map<string, boolean>;
  infos: Array<{ msg: string; actions: string[] }>;
  commands: string[];
  respondWith: (choice: string | undefined) => void;
}

function makeHarness(mode: GovernanceModeState, preSeeded = false): Harness {
  const state = new Map<string, boolean>();
  if (preSeeded) state.set(MODE_DEFAULT_NOTICE_KEY, true);
  const infos: Array<{ msg: string; actions: string[] }> = [];
  const commands: string[] = [];
  let choice: string | undefined;
  const deps: ModeDefaultNoticeDeps = {
    getModeState: () => mode,
    getGlobalState: (key) => state.get(key),
    setGlobalState: (key, value) => { state.set(key, value); },
    notifications: {
      showInfo: async (msg: string, ...actions: string[]) => {
        infos.push({ msg, actions });
        return choice;
      },
      showWarning: async () => undefined,
      showError: async () => undefined,
      showProgress: async <T>(_t: string, task: (r: (m: string) => void) => Promise<T>) => task(() => {}),
    },
    executeCommand: (cmd) => { commands.push(cmd); },
  };
  return { deps, state, infos, commands, respondWith: (c) => { choice = c; } };
}

const DEFAULTED_ENFORCE: GovernanceModeState = { mode: 'enforce', defaulted: true };

suite('LD-6 mode-default one-time notice', () => {
  test('defaulted mode + unset key → exactly one notice, key set, never repeats', async () => {
    const h = makeHarness(DEFAULTED_ENFORCE);

    const first = await maybeShowModeDefaultNotice(h.deps);
    const second = await maybeShowModeDefaultNotice(h.deps);

    assert.equal(first, true, 'first activation must show the notice');
    assert.equal(second, false, 'second activation must not repeat it');
    assert.equal(h.infos.length, 1, 'exactly one notification total');
    assert.match(h.infos[0].msg, /enforces governance by default/i);
    assert.equal(h.state.get(MODE_DEFAULT_NOTICE_KEY), true, 'one-shot key persisted');
  });

  test('key already set → zero notifications', async () => {
    const h = makeHarness(DEFAULTED_ENFORCE, /* preSeeded */ true);

    const shown = await maybeShowModeDefaultNotice(h.deps);

    assert.equal(shown, false);
    assert.equal(h.infos.length, 0);
  });

  test('explicitly configured mode (defaulted:false) → zero notifications, key untouched', async () => {
    const h = makeHarness({ mode: 'enforce', defaulted: false });

    const shown = await maybeShowModeDefaultNotice(h.deps);

    assert.equal(shown, false);
    assert.equal(h.infos.length, 0);
    assert.equal(h.state.has(MODE_DEFAULT_NOTICE_KEY), false, 'key must not be set when nothing was shown');
  });

  test('"Set Mode" choice executes failsafe.setGovernanceMode', async () => {
    const h = makeHarness(DEFAULTED_ENFORCE);
    h.respondWith('Set Mode');

    await maybeShowModeDefaultNotice(h.deps);
    await new Promise((r) => setImmediate(r));

    assert.deepEqual(h.commands, ['failsafe.setGovernanceMode']);
    assert.deepEqual(h.infos[0].actions, ['Set Mode', 'Dismiss']);
  });
});
