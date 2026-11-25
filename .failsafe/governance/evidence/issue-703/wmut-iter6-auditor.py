# Judge mutants W1-W24 (W21 omitted: equivalent as written), plan-703 iteration 6 audit.
# usage: python wmut-iter6-auditor.py <extension-root> <dir containing run703.sh>
import subprocess, sys, os, re
E=sys.argv[1]; S=sys.argv[2]
R='src/roadmap/ui/modules/delivery-assessment-renderer.js'
C='src/roadmap/ui/modules/delivery-review-controls.js'
M=[
 ('W1 R13 repainted PASS not disabled (VETO kept)', C, [("  pass.disabled = renderer.reviewInFlight;\n","")]),
 ('W2 R13 repainted VETO not disabled (PASS kept)', C, [("  veto.disabled = renderer.reviewInFlight;\n","")]),
 ('W3 R13 click disables only PASS', C, [("    veto.disabled = true;\n","")]),
 ('W4 R13 click disables only VETO', C, [("    pass.disabled = true;\n","")]),
 ('W5 R5 review 200 message tagged with selectedId at completion', R, [("in the intent history.`, false, intentId]","in the intent history.`, false, this.selectedId]")]),
 ('W6 R5 message held also shown on invalid panel', R, [("if (this.message && this.message[2] === state.view?.intent?.id) {","if (this.message && (state.invalid || this.message[2] === state.view?.intent?.id)) {")]),
 ('W7 R5 message shown on empty (no intents) panel', R, [("if (this.message && this.message[2] === state.view?.intent?.id) {","if (this.message && ((state.intents && !state.intents.length) || this.message[2] === state.view?.intent?.id)) {")]),
 ('W8 R6 draft cleared on any 200 even if different text', R, [("submittedDraft.value === note) {","true) {")]),
 ('W9 R8 draft cleared on non-200 too', R, [("if (status === 200 && submittedDraft","if (submittedDraft")]),
 ('W10 R13 reviewInFlight not reset on network failure path', R, [("    } finally {\n      this.reviewInFlight = false;\n","    } finally {\n      if (!this.message[1]) this.reviewInFlight = false;\n")]),
 ('W11 R11 rework kept by commit not VETO id', C, [("const kept = form ? form.reworks[String(r.id)] : '';","const kept = form ? Object.values(form.reworks).find((v) => v && v !== r.commitSha) || '' : '';")]),
 ('W12 R10 picked commit dropped when it is the oldest', C, [("if (form && linked.some((e) => e.target === form.commitSha))","if (form && linked.some((e, i) => i > 0 && e.target === form.commitSha))")]),
 ('W13 R12 form cleared on intent switch picker', R, [("select.addEventListener('change', () => { this.selectedId = select.value;","select.addEventListener('change', () => { this.reviewForm = null; this.selectedId = select.value;")]),
 ('W14 R9 draft cleared on intent switch picker', R, [("select.addEventListener('change', () => { this.selectedId = select.value;","select.addEventListener('change', () => { this.reviewNoteDraft = null; this.selectedId = select.value;")]),
 ('W15 R14 VETO posts reworks too', C, [("verdict === 'PASS' ? reworksOf() : []","reworksOf()")]),
 ('W16 R14 PASS posts all rework picks incl none', C, [("picks.filter((p) => p.value).map(","picks.map(")]),
 ('W17 R1 stale listing check after the selection write', R, [("      if (generation !== this.refreshGeneration) return;\n      if (listing.integrity","      if (listing.integrity"),("      this.selectedId = chosen.id;\n","      this.selectedId = chosen.id;\n      if (generation !== this.refreshGeneration) return;\n")]),
 ('W18 R4 stale failure check removed but no paint when message', R, [("    } catch (err) {\n      if (generation !== this.refreshGeneration) return;\n","    } catch (err) {\n      if (generation !== this.refreshGeneration && this.message) return;\n")]),
 ('W19 R6 posted note read from draft not input', C, [("select.value, note.value, verdict","select.value, (renderer.reviewNoteDraft && renderer.reviewNoteDraft.value) || '', verdict")]),
 ('W20 R7 draft clear when same text even if new object', R, [("this.reviewNoteDraft === submittedDraft &&","this.reviewNoteDraft && this.reviewNoteDraft.value === note &&")]),
 ('W22 R12 form not kept after a VETO completes (cleared on 200 VETO)', R, [("        this.reviewNoteDraft = null;\n      }\n","        this.reviewNoteDraft = null;\n      }\n      if (status === 200 && verdict === 'VETO') this.reviewForm = null;\n")]),
 ('W23 R12 form cleared after a 200 PASS only', R, [("        this.reviewNoteDraft = null;\n      }\n","        this.reviewNoteDraft = null;\n      }\n      if (status === 200 && verdict === 'PASS') this.reviewForm = null;\n")]),
 ('W24 R12 form commit reset after any completed review (reworks kept)', R, [("    } finally {\n      this.reviewInFlight = false;\n","    } finally {\n      if (this.reviewForm) this.reviewForm = { ...this.reviewForm, commitSha: null };\n      this.reviewInFlight = false;\n")]),
]
res=[]
for name,f,edits in M:
    p=os.path.join(E,f); orig=open(p,encoding='utf-8',newline='').read()
    nl='\r\n' if '\r\n' in orig else '\n'
    s=orig.replace(nl,'\n'); ok=True
    for a,b in edits:
        if s.count(a)!=1: ok=False; print('APPLY-FAIL',name,repr(a[:60]),s.count(a)); break
        s=s.replace(a,b)
    if not ok: continue
    open(p,'w',encoding='utf-8',newline='').write(s.replace('\n',nl))
    try:
        out=subprocess.run(['sh',os.path.join(S,'run703.sh'),E,'400'],capture_output=True,text=True).stdout
    finally:
        open(p,'w',encoding='utf-8',newline='').write(orig)
    m=re.search(r'(\d+) failing',out); pz=re.search(r'(\d+) passing',out)
    fails=re.findall(r'^\s+\d+\) .*\n\s+(.*):$',out,re.M)
    print(f"{'KILLED' if m else 'SURVIVED':9} {name} | {pz.group(1) if pz else '?'} pass {m.group(1) if m else 0} fail | {'; '.join(sorted(set(fails)))[:300]}", flush=True)
