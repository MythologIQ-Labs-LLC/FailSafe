const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
const {removeTempTree}=require('C:/dev/mythologiq/FailSafe-6012n/FailSafe/extension/src/test/shared/removeTempTree.cjs');
const d=fs.mkdtempSync(path.join(os.tmpdir(),'rmrepro-'));
cp.execFileSync('git',['init','-q'],{cwd:d}); fs.writeFileSync(path.join(d,'a.txt'),'a');
cp.execFileSync('git',['add','.'],{cwd:d}); cp.execFileSync('git',['-c','user.name=t','-c','user.email=t@t','commit','-qm','a'],{cwd:d});
try{ removeTempTree(d); console.log(process.versions.node, 'electron', process.versions.electron||'-', 'removed', !fs.existsSync(d)); }
catch(e){ console.log(process.versions.node, 'electron', process.versions.electron||'-', 'ERR', e.code, e.message.slice(0,120)); }
