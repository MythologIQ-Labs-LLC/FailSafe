import subprocess, sys, os, re, json
E=sys.argv[1]; S=sys.argv[2]
R='src/roadmap/ui/modules/delivery-assessment-renderer.js'
C='src/roadmap/ui/modules/delivery-review-controls.js'
M=[
 ('K1 in-flight early return and disabled removed', C, [("    if (renderer.reviewInFlight) return;\n",""),("  pass.disabled = renderer.reviewInFlight;\n  veto.disabled = renderer.reviewInFlight;\n","")]),
 ('K2 message not intent-scoped', R, [("if (this.message && this.message[2] === state.view?.intent?.id) {","if (this.message) {")]),
 ('K3 no check after listing', R, [("      const listing = await getJson('/api/v1/delivery/intents');\n      if (generation !== this.refreshGeneration) return;\n","      const listing = await getJson('/api/v1/delivery/intents');\n")]),
 ('K4 no check after detail', R, [("encodeURIComponent(chosen.id)}`);\n      if (generation !== this.refreshGeneration) return;\n","encodeURIComponent(chosen.id)}`);\n")]),
 ('K5 no check in catch', R, [("    } catch (err) {\n      if (generation !== this.refreshGeneration) return;\n","    } catch (err) {\n")]),
 ('K6 no check before paint', R, [("    if (generation !== this.refreshGeneration) return;\n    this.paint(this.container, state);","    this.paint(this.container, state);")]),
 ('K7 draft cleared unconditionally on 200', R, [("      if (status === 200 && submittedDraft && this.reviewNoteDraft === submittedDraft &&","      if (status === 200 || submittedDraft && this.reviewNoteDraft === submittedDraft &&")]),
 ('K8 no draft restore on commit change', C, [("  select.addEventListener('change', restore);\n","")]),
 ('K9 draft not intent-scoped', C, [("draft && draft.intentId === intentId && draft.commitSha","draft && draft.commitSha")]),
 ('K9b draft not commit-scoped', C, [(" && draft.commitSha === select.value ? draft.value"," ? draft.value")]),
 ('K10 link success message not intent-scoped', R, [("'Link recorded in the intent history.', false, intentId]","'Link recorded in the intent history.', false]")]),
 ('K10b link failure message not intent-scoped', R, [("'Link'} failed (${status}).`, true, intentId];","'Link'} failed (${status}).`, true];")]),
 ('K15 review HTTP failure message not intent-scoped', R, [("`Recording the review failed (${status}).`, true, intentId]","`Recording the review failed (${status}).`, true]")]),
 ('K16 review network failure message not intent-scoped', R, [("err && err.message ? err.message : err}`, true, intentId];","err && err.message ? err.message : err}`, true];")]),
 ('K11 picked commit not restored', C, [("  if (form && linked.some((e) => e.target === form.commitSha)) select.value = form.commitSha;\n","")]),
 ('K12 rework pick not restored', C, [("      opt.selected = opt.value === kept;\n","")]),
 ('K13 form not intent-scoped', C, [("renderer.reviewForm && renderer.reviewForm.intentId === intentId ? renderer.reviewForm : null","renderer.reviewForm")]),
 ('K14 in-flight not reset after review', R, [("      this.reviewInFlight = false;\n","")]),
]
res=[]
for name,f,edits in M:
    p=os.path.join(E,f); orig=open(p,encoding='utf-8',newline='').read()
    nl='\r\n' if '\r\n' in orig else '\n'
    s=orig.replace(nl,'\n')
    ok=True
    for a,b in edits:
        if s.count(a)!=1: ok=False; print('APPLY-FAIL',name,repr(a[:50]),s.count(a)); break
        s=s.replace(a,b)
    if not ok: res.append((name,'APPLY-FAIL',[])); continue
    open(p,'w',encoding='utf-8',newline='').write(s.replace('\n',nl))
    try:
        out=subprocess.run(['sh',os.path.join(S,'run703.sh'),E,'400'],capture_output=True,text=True).stdout
    finally:
        open(p,'w',encoding='utf-8',newline='').write(orig)
    m=re.search(r'(\d+) failing',out)
    fails=re.findall(r'^\s+\d+\) .*\n\s+(.*):$',out,re.M)
    res.append((name,'KILLED' if m else 'SURVIVED',sorted(set(fails))))
for name,v,f in res:
    print(f'{v:9} {name}')
    for t in f: print('            -',t)
