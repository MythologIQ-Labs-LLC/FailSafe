// Functional tests for NodeEditor (FX206 add/edit/delete dialog flow).
// Pure-logic with element-stub injection — no DOM globals required.

import { strict as assert } from 'assert';
// @ts-expect-error JS module import in TS test context
import { NodeEditor } from '../../../src/roadmap/ui/modules/node-editor.js';

interface ElStub {
  disabled?: boolean;
  value?: string;
  textContent?: string;
  innerHTML?: string;
  style: Record<string, string>;
  onclick?: () => void;
  focus(): void;
  _focused?: boolean;
}

function makeEl(initial: Partial<ElStub> = {}): ElStub {
  return {
    style: {},
    focus() { (this as ElStub)._focused = true; },
    ...initial,
  };
}

interface GraphStub {
  nodes: Array<{ id: string; label: string; type: string; confidence?: number }>;
  addCalls: Array<{ label: string; type: string }>;
  saveCalls: Array<{ id: string; label: string; type: string }>;
  addNode(label: string, type: string): void;
  saveNode(id: string, label: string, type: string): Promise<void>;
}

function makeGraph(initial: GraphStub['nodes'] = []): GraphStub {
  const stub: GraphStub = {
    nodes: [...initial],
    addCalls: [],
    saveCalls: [],
    addNode(label, type) { stub.addCalls.push({ label, type }); },
    saveNode: async (id, label, type) => { stub.saveCalls.push({ id, label, type }); },
  };
  return stub;
}

function makeGetEl(map: Record<string, ElStub | null>): (sel: string) => ElStub | null {
  return (sel) => map[sel] ?? null;
}

suite('NodeEditor (FX206)', () => {
  test('FX206 select(null) — disables edit/remove buttons + hides info', () => {
    const editBtn = makeEl({ disabled: false });
    const removeBtn = makeEl({ disabled: false });
    const info = makeEl({ style: { display: 'block' } });
    const editor = new NodeEditor(makeGraph(), makeGetEl({
      '.cc-bs-edit': editBtn, '.cc-bs-remove': removeBtn, '.cc-bs-node-info': info,
    }));
    editor.select(null);
    assert.equal(editBtn.disabled, true);
    assert.equal(removeBtn.disabled, true);
    assert.equal(info.style.display, 'none');
    assert.equal(editor.selectedNodeId, null);
  });

  test('FX206 select(id) — enables buttons + shows node info with escaped label/type + confidence%', () => {
    const editBtn = makeEl({ disabled: true });
    const removeBtn = makeEl({ disabled: true });
    const info = makeEl({ style: { display: 'none' } });
    const editor = new NodeEditor(
      makeGraph([{ id: 'n1', label: 'My <b>node</b>', type: 'Idea', confidence: 75 }]),
      makeGetEl({ '.cc-bs-edit': editBtn, '.cc-bs-remove': removeBtn, '.cc-bs-node-info': info }),
    );
    editor.select('n1');
    assert.equal(editBtn.disabled, false);
    assert.equal(removeBtn.disabled, false);
    assert.equal(info.style.display, 'block');
    assert.match(String(info.innerHTML), /My &lt;b&gt;node&lt;\/b&gt;/);
    assert.match(String(info.innerHTML), /Idea/);
    assert.match(String(info.innerHTML), /75%/);
  });

  test('FX206 select(id) — confidence < 0 renders "N/A"', () => {
    const info = makeEl({ style: {} });
    const editor = new NodeEditor(
      makeGraph([{ id: 'n1', label: 'X', type: 'Risk', confidence: -1 }]),
      makeGetEl({ '.cc-bs-edit': makeEl({}), '.cc-bs-remove': makeEl({}), '.cc-bs-node-info': info }),
    );
    editor.select('n1');
    assert.match(String(info.innerHTML), /N\/A/);
  });

  test('FX206 select(id) when buttons missing from DOM — does not throw', () => {
    const editor = new NodeEditor(
      makeGraph([{ id: 'n1', label: 'X', type: 'Idea', confidence: 50 }]),
      makeGetEl({ '.cc-bs-edit': null, '.cc-bs-remove': null, '.cc-bs-node-info': null }),
    );
    assert.doesNotThrow(() => editor.select('n1'));
    assert.doesNotThrow(() => editor.select(null));
  });

  test('FX206 add(label, type) — calls graph.addNode', () => {
    const graph = makeGraph();
    const editor = new NodeEditor(graph, makeGetEl({}));
    editor.add('New idea', 'Idea');
    assert.deepEqual(graph.addCalls, [{ label: 'New idea', type: 'Idea' }]);
  });

  test('FX206 add("") — empty label is dropped without calling graph', () => {
    const graph = makeGraph();
    const editor = new NodeEditor(graph, makeGetEl({}));
    editor.add('', 'Idea');
    assert.equal(graph.addCalls.length, 0);
  });

  test('FX206 startEdit(id) — populates input with current label + type and switches button to Save', () => {
    const input = makeEl({ value: '' });
    const select = makeEl({ value: '' });
    const addBtn = makeEl({ textContent: 'Add', onclick: undefined });
    const editor = new NodeEditor(
      makeGraph([{ id: 'n1', label: 'Original', type: 'Decision' }]),
      makeGetEl({
        '.cc-bs-label-input': input,
        '.cc-bs-type-select': select,
        '.cc-bs-add': addBtn,
      }),
    );
    editor.startEdit('n1');
    assert.equal(input.value, 'Original');
    assert.equal(select.value, 'Decision');
    assert.equal(addBtn.textContent, 'Save');
    assert.equal(typeof addBtn.onclick, 'function');
    assert.equal(input._focused, true);
  });

  test('FX206 startEdit(unknown id) — no-op', () => {
    const input = makeEl({ value: 'untouched' });
    const editor = new NodeEditor(
      makeGraph([{ id: 'n1', label: 'A', type: 'Idea' }]),
      makeGetEl({ '.cc-bs-label-input': input }),
    );
    editor.startEdit('missing');
    assert.equal(input.value, 'untouched');
  });

  test('FX206 saveEdit(id) — calls graph.saveNode + clears input + restores Add label', async () => {
    const input = makeEl({ value: 'Updated label' });
    const select = makeEl({ value: 'Risk' });
    const addBtn = makeEl({ textContent: 'Save', onclick: () => undefined });
    const graph = makeGraph();
    const editor = new NodeEditor(graph, makeGetEl({
      '.cc-bs-label-input': input,
      '.cc-bs-type-select': select,
      '.cc-bs-add': addBtn,
    }));
    await editor.saveEdit('n1');
    assert.deepEqual(graph.saveCalls, [{ id: 'n1', label: 'Updated label', type: 'Risk' }]);
    assert.equal(input.value, '');
    assert.equal(addBtn.textContent, 'Add');
    assert.equal(typeof addBtn.onclick, 'function');
  });

  test('FX206 saveEdit(id) — empty input refocuses without calling saveNode', async () => {
    const input = makeEl({ value: '   ' });
    const graph = makeGraph();
    const editor = new NodeEditor(graph, makeGetEl({
      '.cc-bs-label-input': input,
    }));
    await editor.saveEdit('n1');
    assert.equal(graph.saveCalls.length, 0);
    assert.equal(input._focused, true);
  });
});
