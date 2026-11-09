import { strict as assert } from 'assert';
import { frozenHostSelectionError, QOR_LOGIC_HOSTS } from '../../qorlogic/hostLayouts';

suite('#463: frozen Qor-logic host input admission', () => {
  test('known distinct built-in hosts are accepted', () => {
    for (const hosts of [['claude'], ['claude', 'codex'], [...QOR_LOGIC_HOSTS]]) {
      assert.equal(frozenHostSelectionError(hosts), null);
    }
  });
  test('no-host and non-array requests refuse before interpreter', () => {
    for (const input of [undefined, null, [], '', 'claude', {}, { hosts: ['claude'] }]) {
      assert.equal(frozenHostSelectionError(input), 'host-selection-empty');
    }
  });
  test('unknown/prototype-like hosts refuse', () => {
    for (const hosts of [['__proto__'], ['constructor'], ['claude', 'unknown'], [0], [null]]) {
      assert.equal(frozenHostSelectionError(hosts), 'host-selection-unsupported');
    }
  });
  test('duplicate host operations refuse', () => {
    assert.equal(frozenHostSelectionError(['claude', 'claude']), 'host-selection-duplicate');
    assert.equal(frozenHostSelectionError(['gemini', 'codex', 'gemini']), 'host-selection-duplicate');
  });
});
