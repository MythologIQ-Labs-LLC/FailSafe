const fs=require('fs'),os=require('os'),path=require('path');
(async()=>{ const d=fs.mkdtempSync(path.join(os.tmpdir(),'rma-')); fs.mkdirSync(path.join(d,'s')); fs.writeFileSync(path.join(d,'s','f'),'x'); fs.chmodSync(path.join(d,'s','f'),0o444);
 try { await fs.promises.rm(d,{recursive:true,force:true}); console.log(process.versions.node,'promises.rm removed',!fs.existsSync(d)); }
 catch(e){ console.log(process.versions.node,'promises.rm ERR',e.code); fs.chmodSync(path.join(d,'s','f'),0o666); fs.rmSync(d,{recursive:true,force:true}); } })();
