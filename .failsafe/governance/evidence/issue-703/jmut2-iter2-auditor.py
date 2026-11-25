import subprocess, sys, os, re
E=sys.argv[1]; S=sys.argv[2]
R='src/roadmap/ui/modules/delivery-assessment-renderer.js'
C='src/roadmap/ui/modules/delivery-review-controls.js'
M=[
 ('J13 draft clear ignores commit', R, [("submittedDraft.intentId === intentId && submittedDraft.commitSha === commitSha && submittedDraft.value === note","submittedDraft.intentId === intentId && submittedDraft.value === note")]),
 ('J14 draft clear ignores text', R, [(" && submittedDraft.value === note) {",") {")]),
 ('J15 draft clear ignores intent', R, [("submittedDraft.intentId === intentId && submittedDraft.commitSha","submittedDraft.commitSha")]),
 ('J16 draft clear by identity only', R, [("submittedDraft.intentId === intentId && submittedDraft.commitSha === commitSha && submittedDraft.value === note","true")]),
 ('J17 reviewInFlight reset before POST settles', R, [("const submittedDraft = this.reviewNoteDraft;","const submittedDraft = this.reviewNoteDraft; this.reviewInFlight = false;")]),
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
