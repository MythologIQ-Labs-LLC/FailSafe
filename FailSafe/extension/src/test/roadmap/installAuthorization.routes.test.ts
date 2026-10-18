/**
 * #538 lane B (plan-538b LD11): Console install routes act only after a modal VS Code
 * confirmation of a server-built operation, and run exactly that operation.
 *
 * Table-driven over every gated install route. Each case records its side effect
 * (the `.mcp.json` write, the Bicameral runner, the scaffold callbacks, the adapter
 * service, the terminal pre-fill), so every row can count it. The deps are passed
 * through `as never` and the mcp/agt routes fall back to main's registrar wiring when
 * their setup function is absent, so this suite compiles and runs against the source
 * before the change.
 */
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import type { Application, Request, Response } from 'express';
import { RouteHarness, makeApp, invokeRemote, type RouteResponse } from '../extension/helpers/routeTestHarness';
import { setupActionsRoutes } from '../../roadmap/routes/ActionsRoute';
import { setupAdapterRoutes } from '../../roadmap/routes/AdapterRoute';
import { setupBicameralRoutes } from '../../roadmap/routes/BicameralRoute';
import * as McpRouteModule from '../../roadmap/routes/McpRoute';
import * as AgtRouteModule from '../../roadmap/routes/AgtRoute';
import { BICAMERAL_PIP_SPEC } from '../../integrations/bicameral/install-handler';
import type { OperatorActionRequest, OperatorConfirmation } from '../../extension/operatorConfirmation';
import type { LedgerManager } from '../../qorelogic/ledger/LedgerManager';
import { makeEnv, openLedger, type Env } from '../qorelogic/ledgerTestKit';

type Confirm = (r: OperatorActionRequest) => Promise<OperatorConfirmation>;
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// The real ConsoleServer guard (ConsoleServer.ts rejectIfRemote), so its body is asserted.
function rejectIfRemote(req: Request, res: Response): boolean {
  const n = String(req.socket?.remoteAddress || req.ip || '').trim();
  if (n === '127.0.0.1' || n === '::1' || n === '::ffff:127.0.0.1') return false;
  res.status(403).json({ error: 'Forbidden: local access only' });
  return true;
}

interface BuildOptions { confirm?: Confirm; ledger?: unknown; deadlineMs?: number }
interface Built { app: Application; effects: unknown[]; broadcasts: Array<Record<string, unknown>>; cleanup(): void }
interface RouteCase {
  name: string;
  path: string;
  body: Record<string, unknown>;
  injected: Record<string, unknown>;
  serverValues: string[];
  injectedValues: string[];
  invalid: Array<{ body: Record<string, unknown>; status: number }>;
  /** Broadcast type that must carry the operation id after an approved run (item 6). */
  completion?: string;
  build(o: BuildOptions): Built;
}

const tmp = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));
const rm = (dir: string) => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* temp sweep */ } };
const plain = (v: unknown) => JSON.parse(JSON.stringify(v ?? null));

/** Record `.mcp.json` writes made through the shared fs module (the route reads it at call time). */
function spyMcpWrites(effects: unknown[]): () => void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const realFs = require('fs') as typeof fs;
  const original = realFs.writeFileSync;
  realFs.writeFileSync = ((file: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, ...rest: unknown[]) => {
    if (typeof file === 'string' && file.endsWith('.mcp.json')) effects.push({ file: path.basename(file), text: String(data) });
    return (original as (...a: unknown[]) => void)(file, data, ...rest);
  }) as typeof fs.writeFileSync;
  return () => { realFs.writeFileSync = original; };
}

const MCP: RouteCase = {
  name: 'mcp-install',
  path: '/api/actions/mcp-install',
  body: { id: 'context7' },
  injected: { id: 'context7', install: { command: 'evil-cmd', args: ['evil-arg'] }, command: 'evil-cmd', confirmed: true },
  serverValues: ['@upstash/context7-mcp', '.mcp.json'],
  injectedValues: ['evil-cmd', 'evil-arg'],
  invalid: [{ body: { id: 'nope' }, status: 404 }],
  build(o) {
    const ws = tmp('failsafe-538b-mcp-');
    const app = makeApp();
    const effects: unknown[] = [];
    const restore = spyMcpWrites(effects);
    const deps = {
      workspaceRoot: ws, rejectIfRemote, confirmOperatorAction: o.confirm,
      getLedgerManager: () => o.ledger ?? null, confirmationDeadlineMs: o.deadlineMs,
    };
    const mod = McpRouteModule as unknown as Record<string, any>;
    if (typeof mod.setupMcpInstallRoute === 'function') mod.setupMcpInstallRoute(app, deps);
    else app.post(MCP.path, (req, res) => { if (rejectIfRemote(req, res)) return; mod.McpRoute.install(req, res, deps); });
    return { app, effects, broadcasts: [], cleanup: () => { restore(); rm(ws); } };
  },
};

function bicameralBuild(o: BuildOptions): Built {
  const ws = tmp('failsafe-538b-bic-');
  const app = makeApp();
  const effects: unknown[] = [];
  const broadcasts: Array<Record<string, unknown>> = [];
  setupBicameralRoutes(app, {
    rejectIfRemote, broadcast: (d: Record<string, unknown>) => { broadcasts.push(d); }, workspaceRoot: ws,
    getBicameralCommand: () => 'bicameral-mcp', getBicameralClient: () => null,
    getAutoConnect: () => false, setAutoConnect: async () => undefined,
    confirmOperatorAction: o.confirm, ledgerManager: o.ledger ?? undefined, confirmationDeadlineMs: o.deadlineMs,
    runInstall: async (opts: Record<string, unknown>, mode: string) => {
      effects.push({ mode, opts: plain(opts) });
      // Like runBicameralInstall, the final progress event is emitted with done=true.
      const done = { mode, steps: [], done: true, ok: true };
      (opts.onProgress as ((e: unknown) => void) | undefined)?.(done);
      return done;
    },
  } as never);
  return { app, effects, broadcasts, cleanup: () => rm(ws) };
}

const BICAMERAL: RouteCase = {
  name: 'bicameral-install',
  path: '/api/actions/bicameral-install',
  body: { mode: 'solo' },
  injected: { mode: 'solo', pipSpec: 'evil-spec', pythonCommand: 'evil-pip', bicameralCommand: 'evil-bin', confirmed: true },
  serverValues: [BICAMERAL_PIP_SPEC, 'bicameral-mcp setup --mode solo'],
  injectedValues: ['evil-spec', 'evil-pip', 'evil-bin'],
  invalid: [{ body: { mode: 'evil' }, status: 400 }],
  completion: 'bicameral.install.complete',
  build: bicameralBuild,
};

function actionsBuild(o: BuildOptions, mutate = false): Built {
  const app = makeApp();
  const effects: unknown[] = [];
  const broadcasts: Array<Record<string, unknown>> = [];
  setupActionsRoutes(app, {
    rejectIfRemote, broadcast: (d: Record<string, unknown>) => { broadcasts.push(d); },
    qorelogicManager: { getLedgerManager: () => o.ledger ?? null, getL3Queue: () => [] },
    confirmOperatorAction: o.confirm, confirmationDeadlineMs: o.deadlineMs,
    scaffoldWithWebOptions: async (hosts: string[], scope: string, filter?: Record<string, string[]>) => {
      effects.push({ hosts: plain(hosts), scope, filter: plain(filter) });
      // Item 5: a real callee may mutate what it is given; that must not throw.
      if (mutate) { hosts.push('mutated'); if (filter?.claude) filter.claude.push('mutated'); }
      return { ok: true, invocations: [], totalInstalled: 0, destinations: [], failures: [] };
    },
    scaffoldSkills: async () => { effects.push({ prompt: true }); return { ok: true, invocations: [], totalInstalled: 0, destinations: [], failures: [] }; },
  } as never);
  return { app, effects, broadcasts, cleanup: () => undefined };
}

const SCAFFOLD: RouteCase = {
  name: 'scaffold-skills (hosts)',
  path: '/api/actions/scaffold-skills',
  body: { hosts: ['claude'], scope: 'repo', skillFilter: { claude: ['qor-plan'] } },
  injected: {
    hosts: ['claude'], scope: 'repo', skillFilter: { claude: ['qor-plan'] },
    pythonCommand: 'evil-py', packageSpec: 'evil-pkg', confirmed: true,
  },
  serverValues: ['claude', 'qor-plan', 'qor-logic'],
  injectedValues: ['evil-py', 'evil-pkg'],
  invalid: [
    { body: { hosts: ['evil-host'] }, status: 400 },
    { body: { hosts: ['claude'], scope: 'everywhere' }, status: 400 },
    { body: { hosts: ['claude'], skillFilter: { claude: ['--force'] } }, status: 400 },
    { body: { hosts: ['claude'], skillFilter: { codex: ['qor-plan'] } }, status: 400 },
  ],
  build: (o) => actionsBuild(o),
};

const SCAFFOLD_PROMPT: RouteCase = {
  name: 'scaffold-skills (no hosts)',
  path: '/api/actions/scaffold-skills',
  body: {},
  injected: { pythonCommand: 'evil-py', confirmed: true },
  serverValues: ['qor-logic', 'VS Code'],
  injectedValues: ['evil-py'],
  invalid: [],
  build: (o) => actionsBuild(o),
};

function adapterBuild(o: BuildOptions): Built {
  const app = makeApp();
  const effects: unknown[] = [];
  const broadcasts: Array<Record<string, unknown>> = [];
  const service = {
    checkState: async () => ({}), getCachedState: () => null, healthCheck: async () => ({}),
    getConfig: () => ({}), saveConfig: async () => undefined,
    install: async (options: unknown) => { effects.push({ install: plain(options) }); return { success: true }; },
    uninstall: async () => { effects.push({ uninstall: true }); return { success: true }; },
  };
  setupAdapterRoutes(app, {
    rejectIfRemote, broadcast: (d: Record<string, unknown>) => { broadcasts.push(d); }, adapterService: service,
    confirmOperatorAction: o.confirm, getLedgerManager: () => o.ledger ?? null, confirmationDeadlineMs: o.deadlineMs,
  } as never);
  return { app, effects, broadcasts, cleanup: () => undefined };
}

const ADAPTER_INSTALL: RouteCase = {
  name: 'adapter install',
  path: '/api/adapter/install',
  body: { installToolkit: true, upgradeIfExists: false },
  injected: { installToolkit: true, upgradeIfExists: false, packages: ['evil-pkg'], pipArgs: ['evil-arg'], confirmed: true },
  serverValues: ['pip3 install agent-failsafe', 'pip3 install agent-os'],
  injectedValues: ['evil-pkg', 'evil-arg'],
  invalid: [],
  completion: 'adapter.installed',
  build: adapterBuild,
};

const ADAPTER_UNINSTALL: RouteCase = {
  name: 'adapter uninstall',
  path: '/api/adapter/uninstall',
  body: {},
  injected: { packages: ['evil-pkg'], confirmed: true },
  serverValues: ['pip3 uninstall -y agent-failsafe'],
  injectedValues: ['evil-pkg'],
  invalid: [],
  completion: 'adapter.uninstalled',
  build: adapterBuild,
};

const AGT: RouteCase = {
  name: 'agt-install',
  path: '/api/actions/agt-install',
  body: { id: 'typescript' },
  injected: { id: 'typescript', command: 'evil-cmd', confirmed: true },
  serverValues: ['npm install @microsoft/agent-governance-sdk'],
  injectedValues: ['evil-cmd'],
  invalid: [{ body: { id: 'nope' }, status: 404 }, { body: { id: 'claude-code' }, status: 400 }],
  build(o) {
    const ws = tmp('failsafe-538b-agt-');
    const app = makeApp();
    const effects: unknown[] = [];
    const deps = {
      workspaceRoot: ws, rejectIfRemote, confirmOperatorAction: o.confirm,
      getLedgerManager: () => o.ledger ?? null, confirmationDeadlineMs: o.deadlineMs,
      runInTerminal: (name: string, command: string) => { effects.push({ name, command }); },
    };
    const mod = AgtRouteModule as unknown as Record<string, any>;
    if (typeof mod.setupAgtInstallRoute === 'function') mod.setupAgtInstallRoute(app, deps);
    else app.post(AGT.path, (req, res) => { if (rejectIfRemote(req, res)) return; mod.AgtRoute.install(req, res, deps); });
    return { app, effects, broadcasts: [], cleanup: () => rm(ws) };
  },
};

const CASES: RouteCase[] = [MCP, BICAMERAL, SCAFFOLD, SCAFFOLD_PROMPT, ADAPTER_INSTALL, ADAPTER_UNINSTALL, AGT];

/** A confirmer recording each dialog; `answer` can be changed between requests. */
function dialogs(answer: OperatorConfirmation = 'approved') {
  const state = { shown: [] as OperatorActionRequest[], answer };
  const confirm: Confirm = async (r) => { state.shown.push(r); return state.answer; };
  return { state, confirm };
}

/** POST through a raw socket; resolves the client request so a test can destroy it. */
function rawPost(port: number, p: string, body: unknown): http.ClientRequest {
  const payload = JSON.stringify(body);
  const req = http.request({
    host: '127.0.0.1', port, path: p, method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) },
  });
  req.on('error', () => undefined);
  req.write(payload);
  req.end();
  return req;
}

suite('#538 lane B: Console install routes require a bound VS Code confirmation', () => {
  let harness: RouteHarness | null = null;
  let built: Built | null = null;
  let env: Env | null = null;
  let ledger: LedgerManager | null = null;

  teardown(async () => {
    if (harness) await harness.stop();
    harness = null;
    built?.cleanup();
    built = null;
    ledger?.close();
    ledger = null;
    env?.cleanup();
    env = null;
  });

  async function start(c: RouteCase, o: BuildOptions): Promise<{ b: Built; h: RouteHarness }> {
    built = c.build(o);
    harness = new RouteHarness(built.app);
    await harness.start();
    return { b: built, h: harness };
  }
  const post = (h: RouteHarness, c: RouteCase, body: unknown = c.body, headers?: Record<string, string>): Promise<RouteResponse> =>
    h.request({ method: 'POST', path: c.path, body, headers });
  const portOf = (h: RouteHarness) => (h as unknown as { port: number }).port;

  for (const c of CASES) {
    suite(c.name, () => {
      test('T1 no confirmer: 503 and nothing runs', async () => {
        const { b, h } = await start(c, {});
        const res = await post(h, c);
        assert.equal(res.status, 503);
        assert.equal(res.body.confirmation, 'unwired');
        assert.equal(b.effects.length, 0);
      });

      for (const [answer, status] of [['declined', 409], ['busy', 429]] as const) {
        test(`T2/T3 ${answer}: ${status} and nothing runs`, async () => {
          const d = dialogs(answer);
          const { b, h } = await start(c, { confirm: d.confirm });
          const res = await post(h, c);
          assert.equal(res.status, status);
          assert.equal(res.body.confirmation, answer);
          assert.equal(d.state.shown.length, 1);
          assert.equal(b.effects.length, 0);
        });
      }

      test('T4 an altered payload shows and runs only the server-resolved operation', async () => {
        const d = dialogs('approved');
        const { b, h } = await start(c, { confirm: d.confirm });
        const res = await post(h, c, c.injected);
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(d.state.shown.length, 1);
        const shown = JSON.stringify(d.state.shown);
        for (const v of c.serverValues) assert.ok(d.state.shown[0].detail.includes(v), `dialog shows ${v}`);
        for (const v of c.injectedValues) {
          assert.ok(!shown.includes(v), `dialog never shows ${v}`);
          assert.ok(!JSON.stringify(b.effects).includes(v), `runner never receives ${v}`);
        }
        assert.equal(b.effects.length, 1);
        assert.match(String(res.body.operationId), /^op_[0-9a-f-]{36}$/);
        assert.ok(d.state.shown[0].detail.includes(res.body.operationId), 'the dialog shows the operation id');
      });

      test('T5 replay: each request needs its own approval', async () => {
        const d = dialogs('approved');
        const { b, h } = await start(c, { confirm: d.confirm });
        const first = await post(h, c);
        const second = await post(h, c);
        assert.equal(first.status, 200);
        assert.equal(second.status, 200);
        assert.notEqual(first.body.operationId, second.body.operationId);
        assert.equal(d.state.shown.length, 2);
        assert.equal(b.effects.length, 2);
        d.state.answer = 'declined';
        const third = await post(h, c);
        assert.equal(third.status, 409);
        assert.equal(d.state.shown.length, 3);
        assert.equal(b.effects.length, 2, 'a declined repeat runs nothing');
      });

      test('T6 a client that disconnects before approval runs nothing', async () => {
        let approve: (v: OperatorConfirmation) => void = () => undefined;
        let markShown: () => void = () => undefined;
        const shownP = new Promise<void>((r) => { markShown = r; });
        const shown: OperatorActionRequest[] = [];
        const confirm: Confirm = (r) => { shown.push(r); markShown(); return new Promise((res) => { approve = res; }); };
        const { b, h } = await start(c, { confirm });
        const client = rawPost(portOf(h), c.path, c.body);
        await Promise.race([shownP, delay(1500)]);
        assert.equal(shown.length, 1, 'the dialog opened');
        client.destroy();
        await delay(100);
        approve('approved');
        await delay(100);
        assert.equal(b.effects.length, 0);
      });

      test('T7 an approval after the deadline runs nothing', async () => {
        const shown: OperatorActionRequest[] = [];
        const confirm: Confirm = async (r) => { shown.push(r); await delay(150); return 'approved'; };
        const { b, h } = await start(c, { confirm, deadlineMs: 30 });
        const res = await post(h, c);
        assert.equal(res.status, 410);
        assert.equal(res.body.confirmation, 'expired');
        assert.equal(shown.length, 1);
        await delay(200);
        assert.equal(b.effects.length, 0);
      });

      const refused: Array<[string, { headers?: Record<string, string>; rawBody?: string; noBody?: boolean }, number, string]> = [
        ['a non-loopback Host', { headers: { host: 'evil.example:9376' } }, 403, 'host'],
        ['a lookalike Host', { headers: { host: 'localhost.evil.example' } }, 403, 'host'],
        ['a foreign Origin', { headers: { origin: 'http://evil.example' } }, 403, 'origin'],
        ['Origin null', { headers: { origin: 'null' } }, 403, 'origin'],
        ['text/plain', { rawBody: '{}', headers: { 'content-type': 'text/plain' } }, 415, 'content-type'],
        ['text/plain; charset=application/json', { rawBody: '{}', headers: { 'content-type': 'text/plain; charset=application/json' } }, 415, 'content-type'],
        ['text/plain;application/json', { rawBody: '{}', headers: { 'content-type': 'text/plain;application/json' } }, 415, 'content-type'],
        ['no content type', { noBody: true }, 415, 'content-type'],
      ];
      for (const [label, r, status, guard] of refused) {
        test(`T8 ${label} is refused (${status}) before any dialog`, async () => {
          const d = dialogs('approved');
          const { b, h } = await start(c, { confirm: d.confirm });
          const res = await h.request({
            method: 'POST', path: c.path, headers: r.headers,
            ...(r.noBody ? {} : r.rawBody !== undefined ? { rawBody: r.rawBody } : { body: c.body }),
          });
          assert.equal(res.status, status);
          assert.equal(res.body.guard, guard);
          assert.equal(d.state.shown.length, 0);
          assert.equal(b.effects.length, 0);
        });
      }

      test('T8 same-origin requests pass: Origin equal to Host, Application/JSON', async () => {
        const d = dialogs('approved');
        const { b, h } = await start(c, { confirm: d.confirm });
        const origin = `http://127.0.0.1:${portOf(h)}`;
        const res = await h.request({
          method: 'POST', path: c.path, rawBody: JSON.stringify(c.body),
          headers: { origin, 'content-type': 'Application/JSON' },
        });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(d.state.shown.length, 1);
        assert.equal(b.effects.length, 1);
      });

      test('T9 a remote socket with a loopback Host gets the rejectIfRemote 403', async () => {
        const d = dialogs('approved');
        built = c.build({ confirm: d.confirm });
        const captured = await invokeRemote(built.app, 'POST', c.path, {
          headers: { host: '127.0.0.1:9376', 'content-type': 'application/json' }, body: c.body,
        });
        assert.equal(captured.statusCode, 403);
        assert.deepEqual(captured.body, { error: 'Forbidden: local access only' });
        assert.equal(d.state.shown.length, 0);
        assert.equal(built.effects.length, 0);
      });

      for (const bad of c.invalid) {
        test(`T10 ${JSON.stringify(bad.body)} -> ${bad.status} before any dialog`, async () => {
          const d = dialogs('approved');
          const { b, h } = await start(c, { confirm: d.confirm });
          const res = await post(h, c, bad.body);
          assert.equal(res.status, bad.status, JSON.stringify(res.body));
          assert.equal(d.state.shown.length, 0);
          assert.equal(b.effects.length, 0);
        });
      }

      test('T11 the limiter allows five requests a minute', async () => {
        const d = dialogs('declined');
        const { h } = await start(c, { confirm: d.confirm });
        for (let i = 0; i < 5; i++) assert.equal((await post(h, c)).status, 409);
        const sixth = await post(h, c);
        assert.equal(sixth.status, 429);
        assert.equal(sixth.body?.confirmation, undefined, 'the limiter answered, not the confirmer');
        assert.equal(d.state.shown.length, 5);
      });

      test('T11 refused cross-site requests do not spend the limiter budget', async () => {
        const d = dialogs('declined');
        const { h } = await start(c, { confirm: d.confirm });
        for (let i = 0; i < 6; i++) {
          assert.equal((await post(h, c, c.body, { origin: 'http://evil.example' })).status, 403);
        }
        const valid = await post(h, c);
        assert.equal(valid.status, 409);
        assert.equal(d.state.shown.length, 1, 'the valid request still reached the confirmer');
      });

      test('T12 an approved run records one ledger entry with the operation id and authentication', async () => {
        env = makeEnv();
        ledger = await openLedger(env);
        const d = dialogs('approved');
        const { b, h } = await start(c, { confirm: d.confirm, ledger });
        const res = await post(h, c);
        assert.equal(res.status, 200, JSON.stringify(res.body));
        assert.equal(res.body.ledger, 'recorded');
        const entries = (await ledger.getEntriesByType('SYSTEM_EVENT', 50))
          .filter((e) => e.payload.kind === 'operator-action-authorized');
        assert.equal(entries.length, 1);
        const payload = entries[0].payload as Record<string, any>;
        assert.equal(payload.operationId, res.body.operationId);
        assert.equal(res.body.ledgerEntryId, entries[0].id);
        assert.ok(d.state.shown[0].detail.includes(payload.operationId));
        assert.equal(payload.authentication.method, 'vscode-modal-confirmation');
        assert.equal(payload.authentication.channel, `console:${c.path}`);
        assert.match(payload.authentication.proves, /does not identify which local process/);
        assert.equal(typeof payload.operation.kind, 'string');
        assert.equal(b.effects.length, 1);
        if (c.completion) {
          const done = b.broadcasts.filter((x) => x.type === c.completion);
          assert.equal(done.length, 1);
          assert.equal(done[0].operationId, res.body.operationId, 'the completion broadcast names the operation');
        }
      });

      test('T12 a ledger append that fails stops the run', async () => {
        const d = dialogs('approved');
        const broken = { isAvailable: () => true, appendEntry: async () => { throw new Error('disk full'); } };
        const { b, h } = await start(c, { confirm: d.confirm, ledger: broken });
        const res = await post(h, c);
        assert.equal(res.status, 500);
        assert.equal(res.body.ledger, 'failed');
        assert.match(String(res.body.operationId), /^op_/);
        assert.equal(b.effects.length, 0);
      });

      test('T12 with no ledger the run proceeds and says it was not recorded', async () => {
        const d = dialogs('approved');
        const { b, h } = await start(c, { confirm: d.confirm });
        const res = await post(h, c);
        assert.equal(res.status, 200);
        assert.equal(res.body.ledger, 'unavailable');
        assert.equal(b.effects.length, 1);
      });
    });
  }

  test('adapter install reads the two flags as strict booleans', async () => {
    const d = dialogs('approved');
    const { b, h } = await start(ADAPTER_INSTALL, { confirm: d.confirm });
    const res = await post(h, ADAPTER_INSTALL, { installToolkit: 'yes', upgradeIfExists: 1 });
    assert.equal(res.status, 200);
    assert.deepEqual(b.effects, [{ install: { installToolkit: false, upgradeIfExists: false } }]);
    assert.ok(!d.state.shown[0].detail.includes('agent-os'), 'no toolkit packages shown');
  });

  test('item 5: a scaffold callee that mutates its arguments still runs', async () => {
    const d = dialogs('approved');
    built = actionsBuild({ confirm: d.confirm }, true);
    harness = new RouteHarness(built.app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: SCAFFOLD.path, body: SCAFFOLD.body });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(built.effects, [{ hosts: ['claude'], scope: 'repo', filter: { claude: ['qor-plan'] } }]);
  });

  test('scaffold progress callbacks carry the operation id', async () => {
    const d = dialogs('approved');
    const app = makeApp();
    let seenOperationId: unknown = 'not called';
    setupActionsRoutes(app, {
      rejectIfRemote, broadcast: () => undefined,
      qorelogicManager: { getLedgerManager: () => null, getL3Queue: () => [] },
      confirmOperatorAction: d.confirm,
      scaffoldWithWebOptions: async (_h: unknown, _s: unknown, _f: unknown, context?: { operationId?: string }) => {
        seenOperationId = context?.operationId;
        return { ok: true, invocations: [], totalInstalled: 0, destinations: [], failures: [] };
      },
    } as never);
    harness = new RouteHarness(app);
    await harness.start();
    const res = await harness.request({ method: 'POST', path: SCAFFOLD.path, body: SCAFFOLD.body });
    assert.equal(res.status, 200);
    assert.match(String(seenOperationId), /^op_/);
    assert.equal(seenOperationId, res.body.operationId);
  });
});
