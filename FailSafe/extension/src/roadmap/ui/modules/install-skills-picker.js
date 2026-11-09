// #463: Qor-logic 0.176.1 does not support selective installs or JSON
// enumeration. Preserve the host/scope installation UI, but do not offer
// an advanced picker that could silently reinterpret an empty selection.
export function renderPickerSection(_hosts, _running) {
  return '<div class="cc-picker-unavailable" role="status">' +
    'Per-skill selection is unavailable for frozen Qor-logic 0.176.1. ' +
    'The Install action installs all available skills for the selected hosts.' +
    '</div>';
}

export function bindPickerEvents(_container, _options) {
  // No unsupported enumeration endpoint or Python subprocess.
}

export function collectSkillFilter(_modalEl) {
  // Unfiltered is an explicit install-all action, not a selection result.
  return {};
}
