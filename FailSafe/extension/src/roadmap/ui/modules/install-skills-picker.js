// Phase 3 (plan-qor-install-skills-ux-expansion.md): per-host collapsible
// skill picker inside the install modal. Collapsed by default so power-users
// opt in without affecting the default install-all flow.
//
// Exports:
//   renderPickerSection(hosts, running) → HTML string
//   bindPickerEvents(container, options)
//   collectSkillFilter(modalEl) → { [host]: string[] }

const skillCache = new Map();

export function renderPickerSection(_hosts, _running) {
  return [
    '<details class="cc-modal-picker" data-cc-picker="root">',
    '  <summary>[+] Per-host skills (advanced)</summary>',
    '  <div class="cc-picker-body" data-state="collapsed" data-cc-picker-body></div>',
    '</details>',
  ].join('\n');
}

function getCheckedHosts(modalEl) {
  // Read modal's actual selectors (install-skills-modal.js:66, 71): host
  // checkboxes use class="cc-modal-host" with the host name in value=; no
  // data-host attribute. Scope radios use name="cc-modal-scope".
  const inputs = modalEl.querySelectorAll('input.cc-modal-host');
  const out = [];
  inputs.forEach((el) => { if (el.checked) out.push(el.value); });
  return out;
}

function getScope(modalEl) {
  const scopeEl = modalEl.querySelector('input[name="cc-modal-scope"]:checked');
  const v = scopeEl ? scopeEl.value : 'repo';
  return v === 'global' ? 'global' : 'repo';
}

function renderHostBlock(host, payload) {
  if (payload && payload.degraded) {
    return `<div class="cc-picker-host" data-host="${host}"><h4>${host}</h4>` +
      `<p class="cc-picker-degraded">All skills will be installed (this version of qor-logic doesn't support per-skill selection).</p></div>`;
  }
  const skills = (payload && payload.skills) || [];
  const items = skills.map((s) => {
    const name = String(s.name || '');
    return `<label class="cc-picker-skill"><input type="checkbox" data-skill-host="${host}" value="${name}" checked> ${name}</label>`;
  }).join('');
  return `<div class="cc-picker-host" data-host="${host}"><h4>${host}</h4><div class="cc-picker-grid">${items || '<em>no skills</em>'}</div></div>`;
}

async function fetchHostSkills(host, scope, fetchImpl) {
  const key = `${host}::${scope}`;
  if (skillCache.has(key)) return skillCache.get(key);
  const url = `/api/qorlogic/list-skills?host=${encodeURIComponent(host)}&scope=${encodeURIComponent(scope)}`;
  const res = await fetchImpl(url);
  const json = await res.json();
  skillCache.set(key, json);
  return json;
}

async function populatePicker(body, hosts, scope, fetchImpl) {
  body.setAttribute('data-state', 'loading');
  const blocks = [];
  for (const host of hosts) {
    try {
      const payload = await fetchHostSkills(host, scope, fetchImpl);
      blocks.push(renderHostBlock(host, payload));
    } catch (_err) {
      blocks.push(`<div class="cc-picker-host" data-host="${host}"><h4>${host}</h4><p class="cc-picker-error">Failed to load skills.</p></div>`);
    }
  }
  body.innerHTML = blocks.join('\n');
  body.setAttribute('data-state', 'expanded');
}

export function bindPickerEvents(container, options) {
  const root = container.querySelector('[data-cc-picker="root"]');
  if (!root) return;
  const body = container.querySelector('[data-cc-picker-body]');
  if (!body) return;
  const fetchImpl = (options && options.fetch) || ((url) => fetch(url));
  root.addEventListener('toggle', async () => {
    if (!root.open) return;
    const hosts = getCheckedHosts(container);
    const scope = getScope(container);
    await populatePicker(body, hosts, scope, fetchImpl);
  });
}

export function collectSkillFilter(modalEl) {
  const root = modalEl.querySelector('[data-cc-picker="root"]');
  if (!root || !root.open) return {};
  const out = {};
  const blocks = modalEl.querySelectorAll('.cc-picker-host');
  blocks.forEach((block) => {
    const host = block.getAttribute('data-host');
    if (!host) return;
    if (block.querySelector('.cc-picker-degraded')) return;
    const selected = [];
    block.querySelectorAll('input[type="checkbox"][data-skill-host]').forEach((el) => {
      if (el.checked) selected.push(el.value);
    });
    out[host] = selected;
  });
  return out;
}
