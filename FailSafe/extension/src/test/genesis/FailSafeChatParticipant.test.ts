// Functional tests for FailSafe Chat Participant slash commands
// (FX054 chat participant + FX055 /intent + FX056 /audit + FX057 /trust + FX058 /status + FX059 /seal).
// Constructs the participant in vscode-test mode and drives each command via
// handleRequest with mock services + captured stream output.

import { strict as assert } from 'assert';
import * as vscode from 'vscode';
import { FailSafeChatParticipant } from '../../genesis/chat/FailSafeChatParticipant';

interface CapturedStream {
  markdownChunks: string[];
  buttons: Array<{ command: string; title: string }>;
}

function makeStream(): CapturedStream & vscode.ChatResponseStream {
  const captured: CapturedStream = { markdownChunks: [], buttons: [] };
  const stream = {
    ...captured,
    markdown(value: string | vscode.MarkdownString) {
      captured.markdownChunks.push(typeof value === 'string' ? value : value.value);
      return undefined;
    },
    button(opts: { command: string; title: string }) {
      captured.buttons.push(opts);
      return undefined;
    },
    progress: () => undefined,
    reference: () => undefined,
    anchor: () => undefined,
    filetree: () => undefined,
    push: () => undefined,
  } as unknown as CapturedStream & vscode.ChatResponseStream;
  return stream;
}

function mkRequest(command: string, prompt = ''): vscode.ChatRequest {
  return { command, prompt, references: [], toolReferences: [] } as unknown as vscode.ChatRequest;
}

const FAKE_CTX = {} as vscode.ChatContext;
const FAKE_TOK = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => undefined }) } as unknown as vscode.CancellationToken;

suite('FailSafeChatParticipant (FX054-FX059)', () => {
  let participant: FailSafeChatParticipant;
  let intentService: any;
  let sentinel: any;
  let qorelogic: any;

  setup(() => {
    intentService = {
      activeIntent: null,
      getActiveIntent: async () => intentService.activeIntent,
      sealIntent: async () => undefined,
    };
    sentinel = {
      getStatus: () => ({ running: true, mode: 'observe', filesWatched: 5, queueDepth: 0 }),
      auditFile: async (_path: string) => ({
        decision: 'PASS',
        summary: 'Looks fine',
        details: 'No matched patterns',
        matchedPatterns: [],
      }),
    };
    qorelogic = {
      getTrustEngine: () => ({ getAllAgents: async () => [] }),
    };
    participant = new FailSafeChatParticipant(intentService, sentinel, qorelogic);
  });

  test('FX058 /status — emits Sentinel + Governance markdown sections', async () => {
    const stream = makeStream();
    await (participant as unknown as { handleRequest: (r: vscode.ChatRequest, c: vscode.ChatContext, s: vscode.ChatResponseStream, t: vscode.CancellationToken) => Promise<vscode.ChatResult> }).handleRequest(
      mkRequest('status'), FAKE_CTX, stream, FAKE_TOK,
    );
    const all = (stream as unknown as CapturedStream).markdownChunks.join('');
    assert.match(all, /## FailSafe Status/);
    assert.match(all, /### Sentinel/);
    assert.match(all, /Mode.*observe/i);
    assert.match(all, /### Governance/);
  });

  test('FX058 /status — when no active intent, shows "writes blocked"', async () => {
    intentService.activeIntent = null;
    const stream = makeStream();
    await (participant as unknown as { handleRequest: any }).handleRequest(
      mkRequest('status'), FAKE_CTX, stream, FAKE_TOK,
    );
    const all = (stream as unknown as CapturedStream).markdownChunks.join('');
    assert.match(all, /Active Intent.*None.*writes blocked/i);
  });

  test('FX058 /status — when active intent exists, shows purpose + status + risk grade', async () => {
    intentService.activeIntent = {
      purpose: 'Test refactor',
      status: 'PULSE',
      scope: { riskGrade: 'L1', files: [] },
    };
    const stream = makeStream();
    await (participant as unknown as { handleRequest: any }).handleRequest(
      mkRequest('status'), FAKE_CTX, stream, FAKE_TOK,
    );
    const all = (stream as unknown as CapturedStream).markdownChunks.join('');
    assert.match(all, /Test refactor/);
    assert.match(all, /PULSE/);
    assert.match(all, /L1/);
  });

  test('FX055 /intent — without active intent surfaces "No Active Intent" + Create button', async () => {
    intentService.activeIntent = null;
    const stream = makeStream();
    await (participant as unknown as { handleRequest: any }).handleRequest(
      mkRequest('intent'), FAKE_CTX, stream, FAKE_TOK,
    );
    const captured = stream as unknown as CapturedStream;
    const all = captured.markdownChunks.join('');
    assert.match(all, /No Active Intent/);
    assert.match(all, /BLOCKED/);
    assert.equal(captured.buttons.length, 1);
    assert.equal(captured.buttons[0].command, 'failsafe.createIntent');
  });

  test('FX055 /intent — with active intent renders purpose + type + status + risk grade', async () => {
    intentService.activeIntent = {
      purpose: 'Refactor cache layer',
      type: 'refactor',
      status: 'PASS',
      scope: { riskGrade: 'L2', files: ['src/cache.ts'] },
    };
    const stream = makeStream();
    await (participant as unknown as { handleRequest: any }).handleRequest(
      mkRequest('intent'), FAKE_CTX, stream, FAKE_TOK,
    );
    const all = (stream as unknown as CapturedStream).markdownChunks.join('');
    assert.match(all, /Refactor cache layer/);
    assert.match(all, /refactor/);
    assert.match(all, /PASS/);
    assert.match(all, /L2/);
    assert.match(all, /src\/cache\.ts/);
  });

  test('FX057 /trust — empty agents list shows "No registered agents"', async () => {
    qorelogic.getTrustEngine = () => ({ getAllAgents: async () => [] });
    const stream = makeStream();
    await (participant as unknown as { handleRequest: any }).handleRequest(
      mkRequest('trust'), FAKE_CTX, stream, FAKE_TOK,
    );
    const all = (stream as unknown as CapturedStream).markdownChunks.join('');
    assert.match(all, /No registered agents/);
  });

  test('FX057 /trust — populated agents list renders table with score % + stage', async () => {
    qorelogic.getTrustEngine = () => ({
      getAllAgents: async () => [
        { persona: 'governor', did: 'did:test:abc12345abc12345', trustScore: 0.85, trustStage: 'verified' },
        { persona: 'specialist', did: 'did:test:xyz67890xyz67890', trustScore: 0.45, trustStage: 'probation' },
      ],
    });
    const stream = makeStream();
    await (participant as unknown as { handleRequest: any }).handleRequest(
      mkRequest('trust'), FAKE_CTX, stream, FAKE_TOK,
    );
    const all = (stream as unknown as CapturedStream).markdownChunks.join('');
    assert.match(all, /Agent Trust Scores/);
    assert.match(all, /governor/);
    assert.match(all, /85%/);
    assert.match(all, /verified/);
    assert.match(all, /specialist/);
    assert.match(all, /45%/);
    assert.match(all, /probation/);
  });

  test('FX059 /seal — no active intent surfaces "No active intent to seal"', async () => {
    intentService.activeIntent = null;
    const stream = makeStream();
    await (participant as unknown as { handleRequest: any }).handleRequest(
      mkRequest('seal'), FAKE_CTX, stream, FAKE_TOK,
    );
    const all = (stream as unknown as CapturedStream).markdownChunks.join('');
    assert.match(all, /No active intent to seal/);
  });

  test('FX059 /seal — non-PASS status refuses to seal', async () => {
    intentService.activeIntent = { purpose: 'X', status: 'PULSE', scope: { riskGrade: 'L1', files: [] } };
    const stream = makeStream();
    await (participant as unknown as { handleRequest: any }).handleRequest(
      mkRequest('seal'), FAKE_CTX, stream, FAKE_TOK,
    );
    const all = (stream as unknown as CapturedStream).markdownChunks.join('');
    assert.match(all, /Cannot seal.*PULSE/);
  });

  test('FX059 /seal — PASS status calls sealIntent + reports archived', async () => {
    let sealActor: string | undefined;
    intentService.activeIntent = { purpose: 'Done refactor', status: 'PASS', scope: { riskGrade: 'L1', files: [] } };
    intentService.sealIntent = async (actor: string) => { sealActor = actor; };
    const stream = makeStream();
    await (participant as unknown as { handleRequest: any }).handleRequest(
      mkRequest('seal'), FAKE_CTX, stream, FAKE_TOK,
    );
    const all = (stream as unknown as CapturedStream).markdownChunks.join('');
    assert.equal(sealActor, 'chat-participant');
    assert.match(all, /Intent Sealed.*Done refactor/);
  });

  test('FX054 default (unknown command) — renders help with command list', async () => {
    const stream = makeStream();
    await (participant as unknown as { handleRequest: any }).handleRequest(
      mkRequest('', 'random user prompt'), FAKE_CTX, stream, FAKE_TOK,
    );
    const all = (stream as unknown as CapturedStream).markdownChunks.join('');
    assert.match(all, /FailSafe Governance/);
    assert.match(all, /\/intent/);
    assert.match(all, /\/audit/);
    assert.match(all, /\/trust/);
    assert.match(all, /\/status/);
    assert.match(all, /\/seal/);
  });

  test('FX054 handler exception is caught + reported as Error markdown', async () => {
    sentinel.getStatus = () => { throw new Error('boom'); };
    const stream = makeStream();
    await (participant as unknown as { handleRequest: any }).handleRequest(
      mkRequest('status'), FAKE_CTX, stream, FAKE_TOK,
    );
    const all = (stream as unknown as CapturedStream).markdownChunks.join('');
    assert.match(all, /\*\*Error\*\*.*boom/);
  });

  test('FX056 /audit — no active editor surfaces "No file open" prompt', async () => {
    // vscode-test may have an active editor; only assert the path-without-editor
    // case if no editor is currently active. Skip the assertion otherwise.
    if (!vscode.window.activeTextEditor) {
      const stream = makeStream();
      await (participant as unknown as { handleRequest: any }).handleRequest(
        mkRequest('audit'), FAKE_CTX, stream, FAKE_TOK,
      );
      const all = (stream as unknown as CapturedStream).markdownChunks.join('');
      assert.match(all, /No file open/);
    } else {
      // Editor present — exercise audit path; should call sentinel.auditFile and emit verdict header
      const stream = makeStream();
      await (participant as unknown as { handleRequest: any }).handleRequest(
        mkRequest('audit'), FAKE_CTX, stream, FAKE_TOK,
      );
      const all = (stream as unknown as CapturedStream).markdownChunks.join('');
      assert.match(all, /Verdict:/);
    }
  });
});
