# Judge (iteration-5 auditor) mutants for plan-703. usage: python zmut-iter5-auditor.py <extension-root> <dir containing run703.sh> [Z-ids...]
import subprocess, sys, os, re
E=sys.argv[1]; S=sys.argv[2]; ONLY=sys.argv[3:]
R='src/roadmap/ui/modules/delivery-assessment-renderer.js'
C='src/roadmap/ui/modules/delivery-review-controls.js'
M=[
 ('Z1 review POST carries renderer.selectedId, not the painted intent', C, [("void renderer.review(intentId, verdict,","void renderer.review(renderer.selectedId, verdict,")]),
 ('Z2 form tagged with renderer.selectedId, not the painted intent', C, [("    renderer.reviewForm = { intentId, commitSha","    renderer.reviewForm = { intentId: renderer.selectedId, commitSha")]),
 ('Z3 message consumed even when it belongs to another intent', R, [("      this.message = null;\n    }\n    if (state.error)","    }\n    if (this.message && this.message[2] !== state.view?.intent?.id && state.view) this.message = null;\n    if (state.error)")]),
 ('Z4 form cleared after a successful review', R, [("        this.reviewNoteDraft = null;\n      }\n","        this.reviewNoteDraft = null;\n      }\n      if (status === 200) this.reviewForm = null;\n")]),
 ('Z5 form cleared after any review completion', R, [("    } finally {\n      this.reviewInFlight = false;","    } finally {\n      this.reviewForm = null;\n      this.reviewInFlight = false;")]),
 ('Z6 only the click-time early return removed (disabled kept)', C, [("    if (renderer.reviewInFlight) return;\n","")]),
 ('Z7 note restore not run when the controls are built', C, [("  restore();\n  note.addEventListener","  note.addEventListener")]),
 ('Z8 rework restore keyed by position, not VETO id', C, [("  return vetoes.map((r) => {","  return vetoes.map((r, idx) => {"),("    const kept = form ? form.reworks[String(r.id)] : '';","    const kept = form ? Object.values(form.reworks)[idx] : '';")]),
 ('Z9 generation check after detail moved after the candidates GET', R, [("      if (generation !== this.refreshGeneration) return;\n      const candidates = view.linkable ? await getJson('/api/v1/delivery/candidates') : null;\n","      const candidates = view.linkable ? await getJson('/api/v1/delivery/candidates') : null;\n      if (generation !== this.refreshGeneration) return;\n")]),
 ('Z10 stale catch still records selection reset (selectedId=null) before its check', R, [("    } catch (err) {\n      if (generation","    } catch (err) {\n      this.selectedId = null;\n      if (generation")]),
 ('Z11 selection written before the listing check only for valid listings', R, [("      if (generation !== this.refreshGeneration) return;\n      if (listing.integrity === 'invalid')","      if (listing.integrity !== 'invalid' && Array.isArray(listing.intents)) { const c0 = listing.intents.find((i) => i.id === this.selectedId) || listing.intents.find((i) => i.active) || listing.intents[0]; if (c0) this.selectedId = c0.id; }\n      if (generation !== this.refreshGeneration) return;\n      if (listing.integrity === 'invalid')")]),
 ('Z12 draft captured at click time vs in review (captured after a microtask)', R, [("    const submittedDraft = this.reviewNoteDraft;\n    try {\n      const { status, data } = await postJson('/api/actions/delivery/review', body);\n","    let submittedDraft;\n    try {\n      const pending = postJson('/api/actions/delivery/review', body);\n      await Promise.resolve();\n      submittedDraft = this.reviewNoteDraft;\n      const { status, data } = await pending;\n")]),
 ('Z13 in-flight not set on click (disable only)', C, [("    renderer.reviewInFlight = true;\n","")]),
 ('Z14 commit pick restored only when the form has rework picks', C, [("  if (form && linked.some((e) => e.target === form.commitSha)) select.value = form.commitSha;","  if (form && Object.keys(form.reworks).length && linked.some((e) => e.target === form.commitSha)) select.value = form.commitSha;")]),
 ('Z15 rework pick restored only when the form commit is the newest', C, [("    const kept = form ? form.reworks[String(r.id)] : '';","    const kept = form && form.commitSha === linked[linked.length - 1].target ? form.reworks[String(r.id)] : '';")]),
 ('Z16 message shown on panels without a view (error/invalid/empty)', R, [("if (this.message && this.message[2] === state.view?.intent?.id) {","if (this.message && (!state.view || this.message[2] === state.view.intent.id)) {")]),
 ('Z17 link message on network rejection not applicable; link message dropped on 200', R, [("      ? [action === 'unlink' ? 'Link removed and recorded in the intent history.' : 'Link recorded in the intent history.', false, intentId]","      ? null")]),
 ('Z18 stale listing check only for the invalid branch', R, [("      if (generation !== this.refreshGeneration) return;\n      if (listing.integrity === 'invalid') { this.paint(this.container, { invalid: true }); return; }\n","      if (listing.integrity === 'invalid') { if (generation !== this.refreshGeneration) return; this.paint(this.container, { invalid: true }); return; }\n")]),
 ('Z19 draft clear compares note text only to the draft (not the posted note)', R, [("submittedDraft.commitSha === commitSha && submittedDraft.value === note","submittedDraft.commitSha === commitSha")]),
 ('Z20 draft tagged with renderer.selectedId (= X14)', C, [("renderer.reviewNoteDraft = { intentId, commitSha: select.value, value: note.value };","renderer.reviewNoteDraft = { intentId: renderer.selectedId, commitSha: select.value, value: note.value };")]),
 ('Z21 form listeners registered only when there are rework picks', C, [("  for (const control of [select, ...picks]) control.addEventListener('change', remember);","  if (picks.length) for (const control of [select, ...picks]) control.addEventListener('change', remember);")]),
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
    print(('KILLED  ' if m else 'SURVIVED'), name, '|', (p2.group(1) if p2 else '?'),'pass', (m.group(1) if m else 0),'fail |', '; '.join(sorted(set(fails)))[:400], flush=True)
