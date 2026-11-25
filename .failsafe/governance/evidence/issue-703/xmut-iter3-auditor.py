import subprocess, sys, os, re
E=sys.argv[1]; S=sys.argv[2]
R='src/roadmap/ui/modules/delivery-assessment-renderer.js'
C='src/roadmap/ui/modules/delivery-review-controls.js'
M=[
 ('X1 commit-pick change drops rework picks', C, [("  for (const control of [select, ...picks]) control.addEventListener('change', remember);\n",
   "  select.addEventListener('change', () => { renderer.reviewForm = { intentId, commitSha: select.value, reworks: {} }; });\n  for (const control of picks) control.addEventListener('change', remember);\n")]),
 ('X2 draft cleared on any status', R, [("if (status === 200 && submittedDraft &&","if (submittedDraft &&")]),
 ('X3 draft cleared on network failure', R, [("    } catch (err) {\n      this.message = [`Recording","    } catch (err) {\n      this.reviewNoteDraft = null;\n      this.message = [`Recording")]),
 ('X4 message not consumed (replayed)', R, [("      this.message = null;\n    }\n    if (state.error)","    }\n    if (state.error)")]),
 ('X5 in-flight reset after the refresh', R, [("      this.reviewInFlight = false;\n      await this.refresh();","      await this.refresh();\n      this.reviewInFlight = false;")]),
 ('X6 oldest commit is the default', C, [("  select.selectedIndex = linked.length - 1;\n","  select.selectedIndex = 0;\n")]),
 ('X7 empty rework picks posted', C, [("picks.filter((p) => p.value).map(","picks.map(")]),
 ('X8 selection written before the listing check', R, [("      if (generation !== this.refreshGeneration) return;\n      if (listing.integrity","      if (listing.integrity"),("      this.selectedId = chosen.id;\n","      this.selectedId = chosen.id;\n      if (generation !== this.refreshGeneration) return;\n")]),
 ('X9 note listens on change not input', C, [("  note.addEventListener('input', () => {","  note.addEventListener('change', () => {")]),
 ('X10 review message tagged with selectedId', R, [("recorded as ledger entry #${data.ledgerEntryId} and in the intent history.`, false, intentId]","recorded as ledger entry #${data.ledgerEntryId} and in the intent history.`, false, this.selectedId]")]),
 ('X11 link message tagged with selectedId', R, [("'Link recorded in the intent history.', false, intentId]","'Link recorded in the intent history.', false, this.selectedId]")]),
 ('X12 no repaint after review', R, [("      this.reviewInFlight = false;\n      await this.refresh();","      this.reviewInFlight = false;")]),
 ('X13 form survives across intents (no intent check on rework)', C, [("  const picks = reworkPicks(view, linked, form);","  const picks = reworkPicks(view, linked, renderer.reviewForm);")]),
 ('X14 draft written without intent', C, [("renderer.reviewNoteDraft = { intentId, commitSha: select.value, value: note.value };","renderer.reviewNoteDraft = { intentId: renderer.selectedId, commitSha: select.value, value: note.value };")]),
 ('X15 draft captured after POST', R, [("    const submittedDraft = this.reviewNoteDraft;\n    try {\n      const { status, data } = await postJson('/api/actions/delivery/review', body);\n",
   "    try {\n      const { status, data } = await postJson('/api/actions/delivery/review', body);\n      const submittedDraft = this.reviewNoteDraft;\n")]),
 ('X16 candidates fetched for stale view then painted w/o pre-paint check', R, [("    if (generation !== this.refreshGeneration) return;\n    this.paint(this.container, state);","    this.paint(this.container, state);"),("      const view = await getJson(`/api/v1/delivery/intents/${encodeURIComponent(chosen.id)}`);\n      if (generation !== this.refreshGeneration) return;\n","      const view = await getJson(`/api/v1/delivery/intents/${encodeURIComponent(chosen.id)}`);\n")]),
 ('X17 buttons enabled on paint even in flight but click guard kept', C, [("  pass.disabled = renderer.reviewInFlight;\n  veto.disabled = renderer.reviewInFlight;\n","  pass.disabled = false;\n  veto.disabled = false;\n")]),
 ('X18 rework restore ignores VETO id but uses commit match', C, [("const kept = form ? form.reworks[String(r.id)] : '';","const kept = form ? Object.values(form.reworks).find(Boolean) || '' : '';")]),
]
for name,f,edits in M:
    p=os.path.join(E,f); orig=open(p,encoding='utf-8',newline='').read()
    nl='\r\n' if '\r\n' in orig else '\n'
    s=orig.replace(nl,'\n'); ok=True
    for a,b in edits:
        if s.count(a)!=1: ok=False; print('APPLY-FAIL',name,s.count(a)); break
        s=s.replace(a,b)
    if not ok: continue
    open(p,'w',encoding='utf-8',newline='').write(s.replace('\n',nl))
    try: out=subprocess.run(['sh',os.path.join(S,'run703.sh'),E,'400'],capture_output=True,text=True).stdout
    finally: open(p,'w',encoding='utf-8',newline='').write(orig)
    m=re.search(r'(\d+) failing',out); p2=re.search(r'(\d+) passing',out)
    fails=re.findall(r'^\s+\d+\) .*\n\s+(.*):$',out,re.M)
    print(('KILLED  ' if m else 'SURVIVED'), name, '|', (p2.group(1) if p2 else '?'),'pass', (m.group(1) if m else 0),'fail |', '; '.join(sorted(set(fails)))[:400])
