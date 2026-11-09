// #463: freeze the 0.176.1 enumeration contract. Unsupported selection
// inventory cannot trigger a Python command or be presented as selectable.
import { strict as assert } from 'assert';
import { enumerateSkillsForHost, type SkillEnumerationDeps } from '../../qorlogic/skillEnumeration';

suite('#463 frozen Qor-logic skill enumeration', () => {
  test('unsupported JSON enumeration never runs Python even if injected executor lies', async () => {
    let probes = 0;
    const deps: SkillEnumerationDeps = {
      runQorlogicCommand: async () => {
        probes++;
        return { stdout: '{"skills":[{"name":"qor-audit","kind":"skill","path":"fake"}]}', stderr: '', code: 0 };
      },
      warn: () => undefined,
    };
    const result = await enumerateSkillsForHost({} as never, 'claude', 'repo', deps);
    assert.deepEqual(result, {
      skills: [], degraded: true, reason: 'frozen-qor-logic-selective-enumeration-unavailable',
    });
    assert.equal(probes, 0);
  });

  test('unknown and prototype-like host keys cannot provoke subprocess execution', async () => {
    let probes = 0;
    const deps: SkillEnumerationDeps = {
      runQorlogicCommand: async () => { probes++; throw Error('must not execute'); },
      warn: () => undefined,
    };
    for (const host of ['constructor', '__proto__', 'gemini', '', 'other']) {
      for (const scope of ['repo', 'global', undefined] as const) {
        const result = await enumerateSkillsForHost({} as never, host, scope, deps);
        assert.equal(result.degraded, true);
        assert.deepEqual(result.skills, []);
      }
    }
    assert.equal(probes, 0);
  });
});
