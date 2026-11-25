# Judge (iteration-4 auditor) mutants for plan-703. usage: python ymut-iter4-auditor.py <extension-root> <dir containing run703.sh> [Y-ids...]
import subprocess, sys, os, re
E=sys.argv[1]; S=sys.argv[2]; ONLY=sys.argv[3:] 
R='src/roadmap/ui/modules/delivery-assessment-renderer.js'
C='src/roadmap/ui/modules/delivery-review-controls.js'
M=[
 ('Y1 generation captured after the listing GET', R, [("    const generation = ++this.refreshGeneration;\n","    let generation = -1;\n"),("      const listing = await getJson('/api/v1/delivery/intents');\n","      const listing = await getJson('/api/v1/delivery/intents');\n      generation = ++this.refreshGeneration;\n")]),
 ('Y2 draft clear drops the identity clause', R, [("submittedDraft && this.reviewNoteDraft === submittedDraft &&","submittedDraft && this.reviewNoteDraft &&")]),
 ('Y3 unlinked picked commit falls back to the oldest', C, [("  if (form && linked.some((e) => e.target === form.commitSha)) select.value = form.commitSha;\n","  if (form && linked.some((e) => e.target === form.commitSha)) select.value = form.commitSha;\n  else if (form) select.selectedIndex = 0;\n")]),
 ('Y4 in-flight reset only on a settled POST (rejection leaves it set)', R, [("    } finally {\n      this.reviewInFlight = false;\n      await this.refresh();","    } finally {\n      await this.refresh();"),("        this.reviewNoteDraft = null;\n      }\n","        this.reviewNoteDraft = null;\n      }\n      this.reviewInFlight = false;\n")]),
 ('Y5 review non-200 sets no message', R, [(": [data.error || `Recording the review failed (${status}).`, true, intentId];",": null;")]),
 ('Y6 message scoped to selectedId instead of the painted view', R, [("this.message[2] === state.view?.intent?.id","this.message[2] === this.selectedId")]),
 ('Y7 draft-clear null guard dropped', R, [("status === 200 && submittedDraft && this.reviewNoteDraft","status === 200 && this.reviewNoteDraft")]),
 ('Y8 refresh after review not awaited', R, [("      this.reviewInFlight = false;\n      await this.refresh();","      this.reviewInFlight = false;\n      void this.refresh();")]),
 ('Y9 form mutated in place (same intent) instead of replaced', C, [("    renderer.reviewForm = { intentId, commitSha: select.value, reworks: Object.fromEntries(picks.map((p) => [p.getAttribute('data-veto'), p.value])) };",
   "    const next = { intentId, commitSha: select.value, reworks: Object.fromEntries(picks.map((p) => [p.getAttribute('data-veto'), p.value])) };\n    if (renderer.reviewForm && renderer.reviewForm.intentId === intentId) Object.assign(renderer.reviewForm, next); else renderer.reviewForm = next;")]),
 ('Y10 PASS reworks captured at paint time', C, [("  for (const b of reviewButtons(renderer, intentId, select, note, reworksOf)) actions.appendChild(b);","  const atPaint = reworksOf();\n  for (const b of reviewButtons(renderer, intentId, select, note, () => atPaint)) actions.appendChild(b);")]),
 ('Y11 message consumed on every paint', R, [("      this.message = null;\n    }\n    if (state.error)","    }\n    if (state.view) this.message = null;\n    if (state.error)")]),
 ('Y12 posted note read from the draft, not the input', C, [("select.value, note.value, verdict","select.value, (renderer.reviewNoteDraft && renderer.reviewNoteDraft.value) || '', verdict")]),
 ('Y13 rework restore only when the form commit is still linked', C, [("    const kept = form ? form.reworks[String(r.id)] : '';","    const kept = form && linked.some((e) => e.target === form.commitSha) ? form.reworks[String(r.id)] : '';")]),
 ('Y14 commit pick restored only when the note draft is absent', C, [("  if (form && linked.some((e) => e.target === form.commitSha)) select.value = form.commitSha;\n","  if (form && !renderer.reviewNoteDraft && linked.some((e) => e.target === form.commitSha)) select.value = form.commitSha;\n"),("function commitPick(linked, form) {","function commitPick(linked, form, renderer) {"),("  const select = commitPick(linked, form);","  const select = commitPick(linked, form, renderer);")]),
 ('Y15 in-flight guard released when the button is repainted', C, [("  pass.disabled = renderer.reviewInFlight;\n  veto.disabled = renderer.reviewInFlight;\n","  renderer.reviewInFlight = false;\n  pass.disabled = false;\n  veto.disabled = false;\n")]),
 ('Y16 draft cleared on 200 for any draft of the same intent', R, [("submittedDraft && this.reviewNoteDraft === submittedDraft &&\n          submittedDraft.intentId === intentId && submittedDraft.commitSha === commitSha && submittedDraft.value === note","this.reviewNoteDraft && this.reviewNoteDraft.intentId === intentId")]),
 ('Y17 stale catch paints the error on the newer view (check after paint)', R, [("    } catch (err) {\n      if (generation !== this.refreshGeneration) return;\n      this.paint(this.container, { error: `Could not load the delivery assessment: ${err && err.message ? err.message : err}` });\n      return;",
   "    } catch (err) {\n      this.paint(this.container, { error: `Could not load the delivery assessment: ${err && err.message ? err.message : err}` });\n      if (generation !== this.refreshGeneration) return;\n      return;")]),
 ('Y18 draft commit read via options[selectedIndex] (equivalent by construction)', C, [("    renderer.reviewNoteDraft = { intentId, commitSha: select.value, value: note.value };","    renderer.reviewNoteDraft = { intentId, commitSha: select.options[select.selectedIndex].value, value: note.value };")]),
 ('Y19 message for link refusal dropped', R, [(": [data.error || `${action === 'unlink' ? 'Unlink' : 'Link'} failed (${status}).`, true, intentId];",": null;")]),
 ('Y20 X8 + selection written only when unchanged (stale listing still writes)', R, [("      if (generation !== this.refreshGeneration) return;\n      if (listing.integrity","      if (listing.integrity"),("      this.selectedId = chosen.id;\n","      this.selectedId = chosen.id;\n      if (generation !== this.refreshGeneration) return;\n")]),
]
for name,f,edits in M:
    if ONLY and name.split()[0] not in ONLY: continue
    p=os.path.join(E,f); orig=open(p,encoding='utf-8',newline='').read()
    nl='\r\n' if '\r\n' in orig else '\n'
    s=orig.replace(nl,'\n'); ok=True
    for a,b in edits:
        if s.count(a)!=1: ok=False; print('APPLY-FAIL',name,repr(a[:60]),s.count(a)); break
        s=s.replace(a,b)
    if not ok: continue
    open(p,'w',encoding='utf-8',newline='').write(s.replace('\n',nl))
    try: out=subprocess.run(['sh',os.path.join(S,'run703.sh'),E,'400'],capture_output=True,text=True).stdout
    finally: open(p,'w',encoding='utf-8',newline='').write(orig)
    m=re.search(r'(\d+) failing',out); p2=re.search(r'(\d+) passing',out)
    fails=re.findall(r'^\s+\d+\) .*\n\s+(.*):$',out,re.M)
    print(('KILLED  ' if m else 'SURVIVED'), name, '|', (p2.group(1) if p2 else '?'),'pass', (m.group(1) if m else 0),'fail |', '; '.join(sorted(set(fails)))[:500], flush=True)
