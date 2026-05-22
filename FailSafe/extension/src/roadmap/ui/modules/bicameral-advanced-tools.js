// B-INT-1: Advanced-tools section for the Bicameral integration card.
// A collapsed-by-default <details> listing the 11 remaining Bicameral MCP
// tools as labelled invoke rows, visually grouped into Query tools and
// (state-changing) Mutation tools. Each row carries the minimal input the
// tool needs; a result area renders the labelled JSON response. Capability-
// gating reuses the B-BIC-13 pattern — a tool absent from the /status
// `capabilities` array renders disabled. All fetch wiring to the
// bicameral-<tool> routes lives here.
//
// Pure HTML + JSDOM-friendly leaf. All styling lives in command-center.css
// (.cc-bicameral-advanced and friends) — this module emits class names only.

function esc(value) {
  if (value === null || value === undefined) return '';
  const d = (typeof document !== 'undefined') ? document.createElement('div') : null;
  if (d) { d.textContent = String(value); return d.innerHTML; }
  return String(value).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

// The 11 tools. `fields` enumerate the named text inputs each invoke row needs;
// an empty list renders an input-free row (dashboard, reset). `kind` drives the
// visual grouping — query tools read state, mutation tools change it.
const QUERY_TOOLS = [
  { tool: 'search',          label: 'Search decisions',   fields: [{ name: 'query', placeholder: 'query' }] },
  { tool: 'brief',           label: 'Feature brief',      fields: [{ name: 'feature', placeholder: 'feature' }] },
  { tool: 'judgeGaps',       label: 'Judge gaps',         fields: [{ name: 'feature', placeholder: 'feature' }] },
  { tool: 'dashboard',       label: 'Dashboard snapshot', fields: [] },
  { tool: 'validateSymbols', label: 'Validate symbols',   fields: [{ name: 'symbols', placeholder: 'symbol,symbol' }] },
  { tool: 'getNeighbors',    label: 'Decision neighbors', fields: [{ name: 'decisionId', placeholder: 'decision id' }] },
];

const MUTATION_TOOLS = [
  { tool: 'ingest',            label: 'Ingest repo',        fields: [{ name: 'repoPath', placeholder: 'repo path' }] },
  { tool: 'update',            label: 'Update decision',    fields: [{ name: 'decisionId', placeholder: 'decision id' }] },
  { tool: 'reset',             label: 'Reset store',        fields: [] },
  { tool: 'resolveCompliance', label: 'Resolve compliance', fields: [{ name: 'decisionId', placeholder: 'decision id' }] },
  { tool: 'linkCommit',        label: 'Link commit',        fields: [
    { name: 'commitSha', placeholder: 'commit sha' },
    { name: 'decisionId', placeholder: 'decision id' },
  ] },
];

const ADVANCED_TOOLS = [...QUERY_TOOLS, ...MUTATION_TOOLS];

function renderField(tool, field) {
  return `<input class="cc-bicameral-tool-input" data-tool="${esc(tool)}"`
    + ` data-field="${esc(field.name)}" placeholder="${esc(field.placeholder)}" />`;
}

function renderToolRow(spec, capabilities, mutation) {
  // B-BIC-13 capability-gating: a tool absent from the reported capability set
  // renders disabled. An empty/undefined capabilities array gates nothing off
  // only when it is genuinely empty — matching the B-BIC-13 safe default.
  const enabled = Array.isArray(capabilities) && capabilities.includes(spec.tool);
  const disabledAttr = enabled ? '' : 'disabled';
  const inputs = spec.fields.map((f) => renderField(spec.tool, f)).join('');
  const rowClass = 'cc-bicameral-tool-row' + (mutation ? ' cc-bicameral-tool-row--mutation' : '');
  return `
    <div class="${rowClass}" data-tool="${esc(spec.tool)}">
      <span class="cc-bicameral-tool-label">${esc(spec.label)}</span>
      <div class="cc-bicameral-tool-fields">${inputs}</div>
      <button class="cc-btn cc-bicameral-tool-run" data-action="bicameral-tool-invoke"
        data-tool="${esc(spec.tool)}" data-label="${esc(spec.label)}" ${disabledAttr}>Run</button>
    </div>
  `;
}

function renderGroup(title, specs, modifier, capabilities, mutation) {
  const rows = specs.map((s) => renderToolRow(s, capabilities, mutation)).join('');
  return `
    <div class="cc-bicameral-tool-group cc-bicameral-tool-group--${modifier}">
      <div class="cc-bicameral-tool-group-title">${esc(title)}</div>
      <div class="cc-bicameral-tool-list">${rows}</div>
    </div>
  `;
}

/**
 * Render the collapsed-by-default Advanced-tools section. `state.capabilities`
 * is the /status capability array; absent tools render their Run button
 * disabled. `state.toolResult` (optional) is rendered into the result area.
 */
export function renderAdvancedTools(state = {}) {
  const caps = Array.isArray(state.capabilities) ? state.capabilities : [];
  const query = renderGroup('Query tools', QUERY_TOOLS, 'query', caps, false);
  const mutation = renderGroup('Mutation tools', MUTATION_TOOLS, 'mutation', caps, true);
  return `
    <details class="cc-bicameral-advanced">
      <summary class="cc-bicameral-advanced-summary">Advanced tools</summary>
      <div class="cc-bicameral-advanced-body">
        ${query}
        ${mutation}
        <div class="cc-bicameral-tool-result is-empty">
          <div class="cc-bicameral-tool-result-head">Result</div>
          <pre class="cc-bicameral-tool-result-body"></pre>
        </div>
      </div>
    </details>
  `;
}

/** Collect the field values for one tool row into a request-body object. */
function collectArgs(root, tool) {
  const args = {};
  root.querySelectorAll(`.cc-bicameral-tool-input[data-tool="${tool}"]`).forEach((el) => {
    const field = el.getAttribute('data-field');
    let value = el.value || '';
    if (field === 'symbols') {
      args.symbols = value.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (field === 'decisionId' && tool === 'update') {
      args.decisionId = value;
      args.payload = {};
    } else if (field) {
      args[field] = value;
    }
  });
  return args;
}

/** POST the tool invocation to its bicameral-<tool> route; return the JSON. */
async function invokeTool(tool, args) {
  const res = await fetch(`/api/actions/bicameral-${tool}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.ok === false) {
    throw new Error(json.error || res.statusText || `${tool} failed`);
  }
  return json.result;
}

/** Render a labelled, success/error-styled result into the section. */
function showResult(root, label, value, isError) {
  const box = root.querySelector('.cc-bicameral-tool-result');
  if (!box) return;
  box.classList.remove('is-empty');
  box.classList.toggle('is-error', !!isError);
  const head = box.querySelector('.cc-bicameral-tool-result-head');
  const body = box.querySelector('.cc-bicameral-tool-result-body');
  if (head) head.textContent = (isError ? 'Error · ' : 'Result · ') + label;
  if (body) body.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

/**
 * Bind Run buttons within an already-rendered Advanced-tools section.
 * `handlers.onResult(tool, result)` / `handlers.onError(tool, message)` are
 * optional; absent, results render into the section's own result container.
 */
export function bindAdvancedTools(root, handlers = {}) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  root.querySelectorAll('[data-action="bicameral-tool-invoke"]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const target = e.currentTarget;
      const tool = target.getAttribute('data-tool') || '';
      if (!tool || target.disabled) return;
      const label = target.getAttribute('data-label') || tool;
      const original = target.textContent;
      target.disabled = true;
      target.classList.add('is-loading');
      target.textContent = 'Running…';
      try {
        const result = await invokeTool(tool, collectArgs(root, tool));
        showResult(root, label, result, false);
        handlers.onResult?.(tool, result);
      } catch (err) {
        const msg = String(err && err.message ? err.message : err);
        showResult(root, label, msg, true);
        handlers.onError?.(tool, msg);
      } finally {
        target.disabled = false;
        target.classList.remove('is-loading');
        target.textContent = original;
      }
    });
  });
}

/** Fetch the /status capability array so disabled-tool gating is accurate. */
async function fetchCapabilities() {
  try {
    const res = await fetch('/api/integrations/bicameral/status');
    const json = await res.json().catch(() => ({}));
    return Array.isArray(json.capabilities) ? json.capabilities : [];
  } catch {
    return [];
  }
}

/**
 * Single mount entry for the host card: inject the Advanced-tools section into
 * `card` (when present + not already mounted) and bind its Run buttons. No-op
 * when `card` is absent. Capability gating is sourced from /status — passing
 * `state.capabilities` skips the fetch (used by tests + pre-known state).
 */
export function mountAdvancedTools(card, state = {}, handlers = {}) {
  if (!card || typeof card.querySelector !== 'function') return;
  if (card.querySelector('.cc-bicameral-advanced')) return;
  const inject = (capabilities) => {
    if (card.querySelector('.cc-bicameral-advanced')) return;
    card.insertAdjacentHTML('beforeend', renderAdvancedTools({ ...state, capabilities }));
    const section = card.querySelector('.cc-bicameral-advanced');
    if (section) bindAdvancedTools(section, handlers);
  };
  if (Array.isArray(state.capabilities)) { inject(state.capabilities); return; }
  void fetchCapabilities().then(inject);
}
