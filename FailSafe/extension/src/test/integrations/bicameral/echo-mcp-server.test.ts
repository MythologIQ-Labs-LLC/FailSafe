// FX528 — Phase 2 of plan-qor-bicameral-cluster-high: live-subprocess MCP test.
// Spawns the vendored echo-mcp-server (out/test/integrations/bicameral/echo-mcp-server.js)
// and exercises BicameralMcpClient against real MCP stdio framing.
//
// Closes B-BIC-20: all prior BicameralMcpClient tests stubbed the transport;
// this covers real Stdio handshake + listTools + call wire-shape.
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BicameralMcpClient } from '../../../integrations/bicameral/BicameralMcpClient';

const ECHO_SERVER_JS = path.join(__dirname, 'echo-mcp-server.js');

suite('BicameralMcpClient against vendored echo-mcp-server (FX528)', function () {
  // Real subprocess + MCP handshake can be slow under CI.
  this.timeout(20000);

  let sideChannelDir: string;
  let sideChannelFile: string;
  let client: BicameralMcpClient;

  setup(async () => {
    sideChannelDir = fs.mkdtempSync(path.join(os.tmpdir(), 'echo-mcp-'));
    sideChannelFile = path.join(sideChannelDir, 'last-call.json');
    client = new BicameralMcpClient({
      command: process.execPath,
      args: [ECHO_SERVER_JS],
      cwd: sideChannelDir,
      // No factory overrides: real Client + StdioClientTransport.
    });
    // Inject side-channel path via env on the spawned process. StdioClientTransport
    // does not expose env passthrough; the test relies on cwd-relative default.
  });

  teardown(async () => {
    try { await client.disconnect(); } catch { /* ignore */ }
    try { fs.rmSync(sideChannelDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  test('FX528.1 — spawn + handshake: client reports connected after await', async () => {
    await client.connect();
    assert.equal(client.isConnected(), true, 'client.isConnected() must be true post-connect');
  });

  test('FX528.2 — listTools returns the 15 declared bicameral tool names', async () => {
    await client.connect();
    const names = Array.from(client.getCapabilities()).sort();
    assert.deepEqual(names, [
      'bicameral.brief',
      'bicameral.dashboard',
      'bicameral.drift',
      'bicameral.getNeighbors',
      'bicameral.history',
      'bicameral.ingest',
      'bicameral.judgeGaps',
      'bicameral.linkCommit',
      'bicameral.preflight',
      'bicameral.ratify',
      'bicameral.reset',
      'bicameral.resolveCompliance',
      'bicameral.search',
      'bicameral.update',
      'bicameral.validateSymbols',
    ]);
  });

  test('FX528.3 — bicameral.history round-trip: client.history() returns parsed canned feature', async () => {
    await client.connect();
    const features = await client.history();
    assert.equal(features.length, 1, 'expected single canned feature');
    assert.equal(features[0].feature, 'echo-feature');
  });

  test('FX528.4 — bicameral.ratify wire-shape: side-channel file records decision_id + verdict', async () => {
    // Echo server writes to cwd/echo-mcp-server.last-call.json by default.
    const expectedSideChannel = path.join(sideChannelDir, 'echo-mcp-server.last-call.json');
    await client.connect();
    await client.ratify('decision-123', 'ratify');
    // Echo server's writeFileSync is synchronous on its end, but cross-process
    // delivery requires a small wait for the response to flush back.
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(fs.existsSync(expectedSideChannel), `side-channel file missing at ${expectedSideChannel}`);
    const recorded = JSON.parse(fs.readFileSync(expectedSideChannel, 'utf8'));
    assert.equal(recorded.tool, 'bicameral.ratify');
    assert.deepEqual(recorded.args, { decision_id: 'decision-123', verdict: 'ratify' });
  });

  test('FX528.5 — transport.onclose fires + isConnected flips on disconnect', async () => {
    await client.connect();
    assert.equal(client.isConnected(), true);
    await client.disconnect();
    assert.equal(client.isConnected(), false, 'client.isConnected() must be false after disconnect()');
  });
});
