import { strict as assert } from 'assert';
import {
  PythonInterpreterResolver,
  type ConfigLike,
  type VSCodeLike,
  type RunCommand,
  type RunResult,
} from '../../qorlogic/PythonInterpreterResolver';

function makeConfig(values: Record<string, string | undefined>): ConfigLike {
  return { get: (k: string) => values[k] };
}

interface ProbeCall {
  cmd: string;
  args: string[];
}

function makeRun(
  responses: (call: ProbeCall) => RunResult,
): { run: RunCommand; calls: ProbeCall[] } {
  const calls: ProbeCall[] = [];
  const run: RunCommand = async (cmd, args) => {
    const call = { cmd, args: [...args] };
    calls.push(call);
    return responses(call);
  };
  return { run, calls };
}

function versionResponse(major: number, minor: number, patch = 0): RunResult {
  return { stdout: `Python ${major}.${minor}.${patch}\n`, stderr: '', code: 0 };
}

function failedResponse(): RunResult {
  return { stdout: '', stderr: 'not found', code: 127 };
}

const noVscode: VSCodeLike | null = null;

suite('PythonInterpreterResolver: user setting precedence', () => {
  test('honors valid user setting and returns source=user-setting', async () => {
    const config = makeConfig({ 'failsafe.qorlogic.pythonPath': '/opt/py/python' });
    const { run } = makeRun(() => versionResponse(3, 12, 1));
    const resolver = new PythonInterpreterResolver(config, noVscode, run);

    const result = await resolver.resolve();

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.command, '/opt/py/python');
      assert.equal(result.source, 'user-setting');
      assert.equal(result.version, '3.12.1');
    }
  });

  test('returns user-path-invalid when setting points to non-executable', async () => {
    const config = makeConfig({ 'failsafe.qorlogic.pythonPath': '/nonexistent/python' });
    const { run } = makeRun(() => failedResponse());
    const resolver = new PythonInterpreterResolver(config, noVscode, run);

    const result = await resolver.resolve();

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'user-path-invalid');
    }
  });

  test('returns version-too-old for Python < 3.11 from user setting', async () => {
    const config = makeConfig({ 'failsafe.qorlogic.pythonPath': '/opt/py3.10' });
    const { run } = makeRun(() => versionResponse(3, 10, 5));
    const resolver = new PythonInterpreterResolver(config, noVscode, run);

    const result = await resolver.resolve();

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, 'version-too-old');
    }
  });

  test('skips user setting when empty/whitespace and falls through to probe', async () => {
    const config = makeConfig({ 'failsafe.qorlogic.pythonPath': '   ' });
    const { run, calls } = makeRun((call) => {
      if (call.cmd === 'python3') return versionResponse(3, 11, 4);
      return failedResponse();
    });
    const resolver = new PythonInterpreterResolver(config, noVscode, run);

    const result = await resolver.resolve();

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.source, 'probe');
    assert.equal(calls[0].cmd, 'python3');
  });
});

suite('PythonInterpreterResolver: probe order', () => {
  test('probes python3, python, py -3 in order; first valid wins', async () => {
    const config = makeConfig({});
    const { run, calls } = makeRun((call) => {
      if (call.cmd === 'python') return versionResponse(3, 12, 0);
      return failedResponse();
    });
    const resolver = new PythonInterpreterResolver(config, noVscode, run);

    const result = await resolver.resolve();

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.command, 'python');
      assert.deepEqual(result.args, []);
      assert.equal(result.source, 'probe');
    }
    assert.deepEqual(calls.map((c) => c.cmd), ['python3', 'python']);
  });

  test('falls through to py -3 when python3 and python both fail', async () => {
    const config = makeConfig({});
    const { run, calls } = makeRun((call) => {
      if (call.cmd === 'py' && call.args[0] === '-3') return versionResponse(3, 11, 9);
      return failedResponse();
    });
    const resolver = new PythonInterpreterResolver(config, noVscode, run);

    const result = await resolver.resolve();

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.command, 'py');
      assert.deepEqual(result.args, ['-3']);
    }
    assert.deepEqual(calls.map((c) => `${c.cmd} ${c.args.join(' ')}`.trim()), [
      'python3 --version',
      'python --version',
      'py -3 --version',
    ]);
  });

  test('returns no-python-found when every candidate fails', async () => {
    const config = makeConfig({});
    const { run } = makeRun(() => failedResponse());
    const resolver = new PythonInterpreterResolver(config, noVscode, run);

    const result = await resolver.resolve();

    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'no-python-found');
  });

  test('skips Python < 3.11 candidates and continues probing', async () => {
    const config = makeConfig({});
    const { run } = makeRun((call) => {
      if (call.cmd === 'python3') return versionResponse(3, 10, 0); // too old
      if (call.cmd === 'python') return versionResponse(3, 11, 0);
      return failedResponse();
    });
    const resolver = new PythonInterpreterResolver(config, noVscode, run);

    const result = await resolver.resolve();

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.command, 'python');
  });
});

suite('PythonInterpreterResolver: caching', () => {
  test('caches result across calls', async () => {
    const config = makeConfig({});
    const { run, calls } = makeRun(() => versionResponse(3, 12, 0));
    const resolver = new PythonInterpreterResolver(config, noVscode, run);

    await resolver.resolve();
    await resolver.resolve();

    assert.equal(calls.length, 1, 'second resolve should hit cache');
  });

  test('invalidate() clears cache', async () => {
    const config = makeConfig({});
    const { run, calls } = makeRun(() => versionResponse(3, 12, 0));
    const resolver = new PythonInterpreterResolver(config, noVscode, run);

    await resolver.resolve();
    resolver.invalidate();
    await resolver.resolve();

    assert.equal(calls.length, 2, 'after invalidate, resolve should re-probe');
  });
});

suite('PythonInterpreterResolver: ms-python integration', () => {
  function makeVscode(execCommand: string[] | null): VSCodeLike {
    const extension = execCommand
      ? {
        isActive: true,
        activate: async () => undefined,
        exports: {
          settings: {
            getExecutionDetails: () => ({ execCommand }),
          },
        },
      }
      : undefined;
    return {
      extensions: {
        getExtension: (id: string) => (id === 'ms-python.python' ? extension : undefined),
      },
    };
  }

  test('uses ms-python interpreter when extension provides execCommand', async () => {
    const config = makeConfig({});
    const vscode = makeVscode(['/usr/bin/python3.12']);
    const { run } = makeRun((call) => {
      if (call.cmd === '/usr/bin/python3.12') return versionResponse(3, 12, 2);
      return failedResponse();
    });
    const resolver = new PythonInterpreterResolver(config, vscode, run);

    const result = await resolver.resolve();

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.command, '/usr/bin/python3.12');
      assert.equal(result.source, 'ms-python');
    }
  });

  test('falls through to probe when ms-python returns null execCommand', async () => {
    const config = makeConfig({});
    const vscode = makeVscode(null);
    const { run } = makeRun((call) => {
      if (call.cmd === 'python3') return versionResponse(3, 11, 0);
      return failedResponse();
    });
    const resolver = new PythonInterpreterResolver(config, vscode, run);

    const result = await resolver.resolve();

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.source, 'probe');
  });

  test('falls through to probe when ms-python extension is absent', async () => {
    const config = makeConfig({});
    const vscode: VSCodeLike = {
      extensions: { getExtension: () => undefined },
    };
    const { run } = makeRun((call) => {
      if (call.cmd === 'python3') return versionResponse(3, 11, 0);
      return failedResponse();
    });
    const resolver = new PythonInterpreterResolver(config, vscode, run);

    const result = await resolver.resolve();

    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.source, 'probe');
  });
});
