import subprocess, sys, os, re
E=sys.argv[1]; S=sys.argv[2]
R='src/roadmap/ui/modules/delivery-assessment-renderer.js'
C='src/roadmap/ui/modules/delivery-review-controls.js'
M=[
 ('J1 picked commit restored even when no longer linked', C, [("if (form && linked.some((e) => e.target === form.commitSha)) select.value","if (form) select.value")]),
 ('J2 commit-pick change not remembered (rework change only)', C, [("for (const control of [select, ...picks]) control","for (const control of picks) control")]),
 ('J3 rework change not remembered', C, [("for (const control of [select, ...picks]) control","for (const control of [select]) control")]),
 ('J4a only early return removed', C, [("    if (renderer.reviewInFlight) return;\n","")]),
 ('J4b only disabled-on-paint removed', C, [("  pass.disabled = renderer.reviewInFlight;\n  veto.disabled = renderer.reviewInFlight;\n","")]),
 ('J4c click does not disable buttons', C, [("    pass.disabled = true;\n    veto.disabled = true;\n","")]),
 ('J5 rework kept by first value regardless of VETO id', C, [("const kept = form ? form.reworks[String(r.id)] : '';","const kept = form ? Object.values(form.reworks)[0] : '';")]),
 ('J6 reworks not sent on PASS', C, [("verdict === 'PASS' ? reworksOf() : []","[]")]),
 ('J7 reworks sent on VETO too', C, [("verdict === 'PASS' ? reworksOf() : []","reworksOf()")]),
 ('J8 note draft stamped with newest commit, not picked', C, [("renderer.reviewNoteDraft = { intentId, commitSha: select.value, value: note.value };","renderer.reviewNoteDraft = { intentId, commitSha: select.options[select.options.length - 1].value, value: note.value };")]),
 ('J9 restore on change ignores commit (keeps note)', C, [("  select.addEventListener('change', restore);\n","  select.addEventListener('change', () => {});\n")]),
 ('J10 form reset on every paint (reviewForm=null at refresh)', R, [("    const generation = ++this.refreshGeneration;\n","    const generation = ++this.refreshGeneration;\n    this.reviewForm = null;\n")]),
 ('J11 draft reset on every paint', R, [("    const generation = ++this.refreshGeneration;\n","    const generation = ++this.refreshGeneration;\n    this.reviewNoteDraft = null;\n")]),
 ('J12 message consumed but never shown', R, [("      root.appendChild(el('p', `cc-dlv-result","      void (el('p', `cc-dlv-result")]),
]
for name,f,edits in M:
    p=os.path.join(E,f); orig=open(p,encoding='utf-8',newline='').read()
    nl=chr(13)+chr(10) if chr(13)+chr(10) in orig else chr(10)
    s=orig.replace(nl,chr(10)); ok=True
    for a,b in edits:
        if s.count(a)!=1: ok=False; print('APPLY-FAIL',name,s.count(a)); break
        s=s.replace(a,b)
    if not ok: continue
    open(p,'w',encoding='utf-8',newline='').write(s.replace(chr(10),nl))
    try: out=subprocess.run(['sh',os.path.join(S,'run703.sh'),E,'400'],capture_output=True,text=True).stdout
    finally: open(p,'w',encoding='utf-8',newline='').write(orig)
    m=re.search(r'(\d+) failing',out)
    fails=re.findall(r'^\s+\d+\) .*\n\s+(.*):$',out,re.M)
    print(('KILLED  ' if m else 'SURVIVED'), name, '|', '; '.join(sorted(set(fails)))[:300])
