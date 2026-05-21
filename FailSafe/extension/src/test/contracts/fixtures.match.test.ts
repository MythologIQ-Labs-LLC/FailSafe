// FX546 — B190 Phase 3: representative in-repo fixtures validate against
// their respective JSON Schemas. Catches drift between hand-maintained TS
// mirrors (src/contracts/types.ts) and the canonical schema files.
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type {
  ApprovalContract,
  CheckpointContract,
  FailureModeContract,
  IntentContract,
  LedgerEntryContract,
  EvaluationRequestContract,
  ReceiptContract,
  GovernanceConfigContract,
} from '../../contracts';

const CONTRACTS_DIR = path.resolve(__dirname, '..', '..', 'contracts');

function compileSchema(name: string): (data: unknown) => boolean {
  const schema = JSON.parse(fs.readFileSync(path.join(CONTRACTS_DIR, `${name}.json`), 'utf8'));
  const ajv = new Ajv2020({ strict: false, allErrors: true });
  // ajv-formats may not be installed; if not, fall back to a relaxed AJV that
  // treats `format` keywords as opaque (i.e., no validation on date-time).
  try { (addFormats as unknown as (a: Ajv2020) => void)(ajv); } catch { /* relaxed */ }
  return ajv.compile(schema) as (data: unknown) => boolean;
}

suite('Governance contract schemas — fixture validation (FX546)', () => {
  test('LedgerEntry fixture matches ledger_entry.json', () => {
    const validate = compileSchema('ledger_entry');
    const fixture: LedgerEntryContract = {
      id: 1,
      timestamp: '2026-05-20T12:00:00.000Z',
      eventType: 'AUDIT_PASS',
      agentDid: 'did:failsafe:agent:test',
      agentTrustAtAction: 0.85,
      gdprTrigger: false,
      payload: { verdict: 'PASS' },
      entryHash: 'a'.repeat(64),
      prevHash: 'b'.repeat(64),
      signature: 'sig-stub',
    };
    assert.equal(validate(fixture), true, JSON.stringify((validate as unknown as { errors?: unknown }).errors));
  });

  test('LedgerEntry missing required field is rejected', () => {
    const validate = compileSchema('ledger_entry');
    const malformed = {
      id: 1,
      timestamp: '2026-05-20T12:00:00Z',
      // missing eventType
      agentDid: 'did:test',
      agentTrustAtAction: 0.5,
      gdprTrigger: false,
      payload: {},
      entryHash: 'a'.repeat(64),
      prevHash: 'b'.repeat(64),
      signature: 's',
    };
    assert.equal(validate(malformed), false);
  });

  test('Approval fixture (with B-BIC-16 kind+meta) matches approval.json', () => {
    const validate = compileSchema('approval');
    const fixture: ApprovalContract = {
      id: '11111111-2222-3333-4444-555555555555',
      state: 'QUEUED',
      filePath: '/x.ts',
      riskGrade: 'L2',
      agentDid: 'did:bicameral',
      agentTrust: 0,
      sentinelSummary: 'Bicameral decision drifted: d1',
      flags: ['bicameral-drift'],
      queuedAt: '2026-05-20T12:00:00.000Z',
      slaDeadline: '2026-05-20T13:00:00.000Z',
      kind: 'bicameral-drift-resolution',
      meta: { decisionId: 'd1' },
    };
    assert.equal(validate(fixture), true, JSON.stringify((validate as unknown as { errors?: unknown }).errors));
  });

  test('FailureMode fixture matches failure_mode.json', () => {
    const validate = compileSchema('failure_mode');
    const fixture: FailureModeContract = {
      schemaVersion: '1.2.0',
      id: 42,
      createdAt: '2026-05-20T12:00:00.000Z',
      agentDid: 'did:test',
      inputVector: 'hash:abc',
      failureMode: 'HALLUCINATION',
      remediationStatus: 'UNRESOLVED',
    };
    assert.equal(validate(fixture), true, JSON.stringify((validate as unknown as { errors?: unknown }).errors));
  });

  test('Checkpoint fixture matches checkpoint.json', () => {
    const validate = compileSchema('checkpoint');
    const fixture: CheckpointContract = {
      id: 'ckpt-1',
      checkpointType: 'snapshot.created',
      actor: 'did:failsafe:system',
      phase: 'plan',
      status: 'validated',
      policyVerdict: 'PASS',
      evidenceRefs: ['ledger:42'],
      payload: { plan: 'plan-test.md' },
      timestamp: '2026-05-20T12:00:00.000Z',
    };
    assert.equal(validate(fixture), true, JSON.stringify((validate as unknown as { errors?: unknown }).errors));
  });

  test('Intent fixture matches intent.json', () => {
    const validate = compileSchema('intent');
    const fixture: IntentContract = {
      id: 'intent-1',
      declarer: 'did:operator',
      scope: 'Refactor authentication module to use new token format.',
      files: ['src/auth/token.ts'],
      status: 'PASS',
      createdAt: '2026-05-20T12:00:00.000Z',
    };
    assert.equal(validate(fixture), true, JSON.stringify((validate as unknown as { errors?: unknown }).errors));
  });

  test('EvaluationRequest fixture matches evaluation_request.json', () => {
    const validate = compileSchema('evaluation_request');
    const fixture: EvaluationRequestContract = {
      agentDid: 'did:agent:test',
      action: {
        kind: 'file_edit',
        target: 'src/auth/token.ts',
        payload: { hunks: 3 },
      },
      context: { intentId: 'intent-1', riskGrade: 'L2' },
      timestamp: '2026-05-20T12:00:00.000Z',
    };
    assert.equal(validate(fixture), true, JSON.stringify((validate as unknown as { errors?: unknown }).errors));
  });

  test('Receipt fixture matches receipt.json', () => {
    const validate = compileSchema('receipt');
    const fixture: ReceiptContract = {
      receiptId: 'rcpt-1',
      evaluationRequestId: 'eval-1',
      verdict: 'ALLOW',
      verdictRationale: 'Low risk, agent trust above threshold.',
      riskGrade: 'L1',
      evidence: [
        { kind: 'ledger_entry', ref: '42', summary: 'Last action by this agent was PASS.' },
      ],
      ledgerEntryRef: 43,
      issuedAt: '2026-05-20T12:00:00.000Z',
      issuedBy: 'did:failsafe:instance:dev',
    };
    assert.equal(validate(fixture), true, JSON.stringify((validate as unknown as { errors?: unknown }).errors));
  });

  test('GovernanceConfig fixture matches governance_config.json', () => {
    const validate = compileSchema('governance_config');
    const fixture: GovernanceConfigContract = {
      mode: 'enforce',
      l3SLAseconds: 3600,
      trustThresholds: { l2: 0.7, l3: 0.9 },
      breakGlassEnabled: true,
      policyTags: ['EU-AI-Act'],
      lastUpdatedAt: '2026-05-20T12:00:00.000Z',
      lastUpdatedBy: 'did:operator',
    };
    assert.equal(validate(fixture), true, JSON.stringify((validate as unknown as { errors?: unknown }).errors));
  });
});
