# Compare normalized assert statements and test names: baseline test file vs the set of new files.
import re,sys,subprocess
wt=sys.argv[1]
base=subprocess.run(['git','-C',wt,'show','c38f970d:FailSafe/extension/src/test/roadmap/delivery-assessment-renderer.test.ts'],capture_output=True,text=True,encoding='utf-8').stdout
files=['delivery-assessment-renderer.test.ts','delivery-assessment-renderer.refresh.test.ts','delivery-assessment-renderer.review.test.ts','delivery-assessment-renderer.switch.test.ts']
new=''.join(open(f'{wt}/FailSafe/extension/src/test/roadmap/{f}',encoding='utf-8').read() for f in files)
def asserts(t):
    out=[];i=0
    for m in re.finditer(r'assert\.\w+\(',t):
        j=m.end();d=1
        while d: d+= {'(':1,')':-1}.get(t[j],0); j+=1
        s=re.sub(r'\s+',' ',t[m.start():j])
        # normalize helper-equivalent spellings
        s=re.sub(r"\(ctx\.doc\.querySelector\('([^']+)'\) as (\w+)\)",r"q<\2>(ctx.doc, '\1')",s)
        s=re.sub(r"\(d\.querySelector\('([^']+)'\) as (\w+)\)",r"q<\2>(d, '\1')",s)
        s=s.replace("'/api/actions/delivery/review'","REVIEW").replace('renderer.','R.').replace('r.','R.')
        out.append(s)
    return out
def names(t): return re.findall(r"test\(['`](.*?)['`],",t)
b=asserts(base); n=asserts(new)
from collections import Counter
cb,cn=Counter(b),Counter(n)
missing=cb-cn; added=cn-cb
print('baseline asserts',len(b),'new asserts',len(n))
print('baseline asserts not found verbatim in new files:',sum(missing.values()))
for k,v in missing.items(): print('  -',v,'x',k[:200])
print('asserts added:',sum(added.values()))
for k,v in added.items(): print('  +',v,'x',k[:200])
bn,nn=set(names(base)),set(names(new))
print('test names removed:',sorted(bn-nn)); print('test names added:',sorted(nn-bn))
