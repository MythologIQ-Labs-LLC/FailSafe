/**
 * Delivery review controls (plan-b320 LD9, #703): Record PASS / Record VETO on one linked commit of
 * the active intent, with a note and (B344) a "Reworked by" pick per trusted VETO.
 *
 * #703: the Delivery panel is repainted by refreshes the operator does not control, so the review
 * form is kept on the renderer, never in the DOM: the picked commit and rework picks per intent
 * (`reviewForm`), and the unsent note per intent and commit (`reviewNoteDraft`). Only one review
 * request is in flight at a time (`reviewInFlight`), so PASS and VETO cannot race into
 * contradictory submissions. The server's review lock remains the authority (FX1010).
 */
import { el, button } from './delivery-dom.js';

function linkedOption(e) {
  const opt = el('option', null, `${e.target.slice(0, 12)} linked ${e.linkedAt}`);
  opt.value = e.target;
  return opt;
}

/** The commit to review: the operator's earlier pick on this intent while still linked, else the newest. */
function commitPick(linked, form) {
  const select = el('select', 'cc-dlv-select cc-dlv-review-pick');
  select.setAttribute('aria-label', 'Commit to review');
  for (const e of linked) select.appendChild(linkedOption(e));
  select.selectedIndex = linked.length - 1;
  if (form && linked.some((e) => e.target === form.commitSha)) select.value = form.commitSha;
  return select;
}

/** The note input, showing the unsent draft for this intent and the picked commit only. */
function noteInput(renderer, intentId, select) {
  const note = el('input', 'cc-dlv-select cc-dlv-review-note');
  note.type = 'text';
  note.maxLength = 500;
  note.placeholder = 'Note (optional)';
  note.setAttribute('aria-label', 'Review note');
  const restore = () => {
    const draft = renderer.reviewNoteDraft;
    note.value = draft && draft.intentId === intentId && draft.commitSha === select.value ? draft.value : '';
  };
  restore();
  note.addEventListener('input', () => {
    renderer.reviewNoteDraft = { intentId, commitSha: select.value, value: note.value };
  });
  select.addEventListener('change', restore);
  return note;
}

/**
 * #532 B344 (plan-b344 LD5): a "Reworked by" select on each blocking trusted VETO (a sealed row's
 * commit): none, or a linked commit other than the vetoed one. The server verifies the relation.
 */
function reworkPicks(view, linked, form) {
  const step = ((view.assessment && view.assessment.steps) || []).find((s) => s.key === 'review');
  const vetoes = ((step && step.records) || []).filter((r) => r.record === 'blocking' && r.kind === 'veto' && r.commitState === 'sealed' && r.commitSha);
  return vetoes.map((r) => {
    const wrap = el('label', 'cc-dlv-line cc-dlv-rework', `Reworked by (VETO #${r.id} on ${String(r.commitSha).slice(0, 12)}): `);
    const pick = el('select', 'cc-dlv-select cc-dlv-rework-pick');
    pick.setAttribute('data-veto', String(r.id));
    pick.setAttribute('aria-label', `Linked commit that reworks the VETO in ledger entry #${r.id}`);
    const none = el('option', null, 'none');
    none.value = '';
    pick.appendChild(none);
    const kept = form ? form.reworks[String(r.id)] : '';
    for (const e of linked.filter((x) => x.target !== r.commitSha)) {
      const opt = linkedOption(e);
      opt.selected = opt.value === kept;
      pick.appendChild(opt);
    }
    wrap.appendChild(pick);
    return pick;
  });
}

/** PASS and VETO: one review request at a time, across repaints. */
function reviewButtons(renderer, intentId, select, note, reworksOf) {
  const record = (verdict) => {
    if (renderer.reviewInFlight) return;
    renderer.reviewInFlight = true;
    pass.disabled = true;
    veto.disabled = true;
    void renderer.review(intentId, verdict, select.value, note.value, verdict === 'PASS' ? reworksOf() : []);
  };
  const pass = button('Record PASS', 'cc-dlv-review-pass', () => record('PASS'));
  const veto = button('Record VETO', 'cc-dlv-btn-link cc-dlv-review-veto', () => record('VETO'));
  pass.disabled = renderer.reviewInFlight;
  veto.disabled = renderer.reviewInFlight;
  return [pass, veto];
}

/** plan-b320 LD9: the review controls for the active intent's view. */
export function reviewControls(renderer, view) {
  const actions = el('div', 'cc-dlv-actions cc-dlv-review-actions');
  const linked = view.edges.filter((e) => e.edge === 'committed-under');
  if (!linked.length) {
    actions.appendChild(el('span', 'cc-dlv-line', 'Link a commit first; a review is recorded on one linked commit.'));
    return actions;
  }
  const intentId = view.intent.id;
  const form = renderer.reviewForm && renderer.reviewForm.intentId === intentId ? renderer.reviewForm : null;
  const select = commitPick(linked, form);
  const note = noteInput(renderer, intentId, select);
  const picks = reworkPicks(view, linked, form);
  const remember = () => {
    renderer.reviewForm = { intentId, commitSha: select.value, reworks: Object.fromEntries(picks.map((p) => [p.getAttribute('data-veto'), p.value])) };
  };
  for (const control of [select, ...picks]) control.addEventListener('change', remember);
  actions.appendChild(select);
  actions.appendChild(note);
  for (const pick of picks) actions.appendChild(pick.parentNode);
  const reworksOf = () => picks.filter((p) => p.value).map((p) => ({ vetoEntryId: Number(p.getAttribute('data-veto')), reworkCommit: p.value }));
  for (const b of reviewButtons(renderer, intentId, select, note, reworksOf)) actions.appendChild(b);
  return actions;
}
