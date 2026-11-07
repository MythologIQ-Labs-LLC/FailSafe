const os=require('os'),path=require('path');
function trial(label, fs, setup) {
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'rmr2-')); setup(fs,d);
  try { fs.rmSync(d,{recursive:true,force:true,maxRetries:5}); console.log(label.padEnd(44), fs.existsSync(d)?'LEFT':'removed'); }
  catch(e){ console.log(label.padEnd(44), 'ERR', e.code); try{ require('child_process').execSync(`attrib -R "${d}\*" /S /D`); require('fs').rmSync(d,{recursive:true,force:true}); }catch{} }
}
const ro=(fs,d)=>{ fs.mkdirSync(path.join(d,'sub')); fs.writeFileSync(path.join(d,'sub','f'),'x'); fs.chmodSync(path.join(d,'sub','f'),0o444); };
const plain=(fs,d)=>{ fs.mkdirSync(path.join(d,'sub')); fs.writeFileSync(path.join(d,'sub','f'),'x'); };
console.log('node', process.versions.node, 'electron', process.versions.electron||'-');
trial('fs: plain files', require('fs'), plain);
trial('fs: one read-only file', require('fs'), ro);
if (process.versions.electron) { trial('original-fs: one read-only file', require('original-fs'), ro); }
