// FX724 — OpenDesignMcpAllowlist tests.
// Asserts the 7 read + 4 write tool enumerations match upstream
// `nexu-io/open-design@abe72af apps/daemon/src/mcp.ts`, and explicitly
// regression-guards against the 4-cycle Plan-Time Hallucination pattern:
// previously-fabricated tool names must NOT register as either read-only
// OR known write tools.

import { strict as assert } from 'assert';
import { OpenDesignMcpAllowlist } from '../../../integrations/open-design/OpenDesignMcpAllowlist';

const READ_TOOLS = [
  'list_projects',
  'get_active_context',
  'get_artifact',
  'get_project',
  'get_file',
  'search_files',
  'list_files',
];

const WRITE_TOOLS = ['create_artifact', 'write_file', 'delete_file', 'delete_project'];
const DESTRUCTIVE_TOOLS = ['write_file', 'delete_file', 'delete_project'];

// 4-cycle Plan-Time Hallucination pattern: names invented in v1 plans that
// do NOT exist upstream. Must not register as either read or write.
const FABRICATED_NAMES = [
  'list_skills',
  'get_skill',
  'list_design_systems',
  'get_design_system',
  'update_artifact',
  'get_active_project', // v1 mis-name of get_active_context
  'read_file', // v1 mis-name of get_file
];

suite('integrations/open-design OpenDesignMcpAllowlist', () => {
  test('all 7 read tools return true from isReadOnly + false from isKnownWriteTool', () => {
    for (const t of READ_TOOLS) {
      assert.equal(OpenDesignMcpAllowlist.isReadOnly(t), true, `read tool ${t} isReadOnly`);
      assert.equal(OpenDesignMcpAllowlist.isKnownWriteTool(t), false, `read tool ${t} !isKnownWriteTool`);
      assert.equal(OpenDesignMcpAllowlist.isDestructive(t), false, `read tool ${t} !isDestructive`);
    }
  });

  test('all 4 write tools return false from isReadOnly + true from isKnownWriteTool', () => {
    for (const t of WRITE_TOOLS) {
      assert.equal(OpenDesignMcpAllowlist.isReadOnly(t), false, `write tool ${t} !isReadOnly`);
      assert.equal(OpenDesignMcpAllowlist.isKnownWriteTool(t), true, `write tool ${t} isKnownWriteTool`);
    }
  });

  test('only 3 destructive tools return true from isDestructive; create_artifact returns false', () => {
    for (const t of DESTRUCTIVE_TOOLS) {
      assert.equal(OpenDesignMcpAllowlist.isDestructive(t), true, `${t} isDestructive`);
    }
    assert.equal(OpenDesignMcpAllowlist.isDestructive('create_artifact'), false);
  });

  test('unknown tool returns false from every accessor', () => {
    const unk = 'not_a_real_tool_xyz';
    assert.equal(OpenDesignMcpAllowlist.isReadOnly(unk), false);
    assert.equal(OpenDesignMcpAllowlist.isKnownWriteTool(unk), false);
    assert.equal(OpenDesignMcpAllowlist.isDestructive(unk), false);
  });

  test('regression guard: 4-cycle Plan-Time Hallucination names are NOT in either set', () => {
    for (const name of FABRICATED_NAMES) {
      assert.equal(
        OpenDesignMcpAllowlist.isReadOnly(name),
        false,
        `fabricated name "${name}" must NOT register as read-only`,
      );
      assert.equal(
        OpenDesignMcpAllowlist.isKnownWriteTool(name),
        false,
        `fabricated name "${name}" must NOT register as known write tool`,
      );
    }
  });

  test('sorted accessors return correct enumerations', () => {
    assert.deepEqual(OpenDesignMcpAllowlist.getReadOnlyTools(), [...READ_TOOLS].sort());
    assert.deepEqual(OpenDesignMcpAllowlist.getWriteTools(), [...WRITE_TOOLS].sort());
    assert.deepEqual(OpenDesignMcpAllowlist.getDestructiveTools(), [...DESTRUCTIVE_TOOLS].sort());
  });

  test('accessors return defensive copies (mutation does not leak)', () => {
    const r = OpenDesignMcpAllowlist.getReadOnlyTools();
    // Should be a fresh array per call.
    assert.notStrictEqual(r, OpenDesignMcpAllowlist.getReadOnlyTools());
  });

  // FX807 — B-OD-8: isL3GatedWrite admits only the non-destructive write tool.
  test('FX807 isL3GatedWrite is true ONLY for create_artifact', () => {
    assert.equal(OpenDesignMcpAllowlist.isL3GatedWrite('create_artifact'), true);
    for (const t of DESTRUCTIVE_TOOLS) {
      assert.equal(OpenDesignMcpAllowlist.isL3GatedWrite(t), false, `destructive ${t} is NOT L3-gated`);
    }
    for (const t of READ_TOOLS) {
      assert.equal(OpenDesignMcpAllowlist.isL3GatedWrite(t), false, `read tool ${t} is NOT a write`);
    }
    assert.equal(OpenDesignMcpAllowlist.isL3GatedWrite('not_a_real_tool_xyz'), false, 'unknown is NOT L3-gated');
  });

  // Inverse coverage: every WRITE_TOOL is classified destructive XOR L3-gated, never both/neither.
  test('FX807 every write tool is exactly one of destructive | L3-gated', () => {
    for (const t of WRITE_TOOLS) {
      const d = OpenDesignMcpAllowlist.isDestructive(t);
      const g = OpenDesignMcpAllowlist.isL3GatedWrite(t);
      assert.equal(d !== g, true, `${t} must be exactly one of destructive/L3-gated (d=${d}, g=${g})`);
    }
  });
});
