#!/usr/bin/env node
/**
 * FailSafe v6.0.12 RC1 non-publishing, source-pinned qualifier.
 * Does not issue a SHIELD audit PASS, seal a session, merge, tag or publish.
 * Usage: node failsafe_v6012_rc1_qualify_v2.mjs --repo <checkout> [--full] [--package]
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export const SOURCE_SHA = '3d722d02721015ccf6307dc5adb74513814dc8e4';
const VERSION = '6.0.12';
export const CANDIDATE_BRANCH='release/v6.0.12-rc1-candidate-20261108-no-ci';
const GIT_REMOTES = [
  /^https:\/\/github\.com\/MythologIQ-Labs-LLC\/FailSafe(?:\.git)?\/?$/i,
  /^git@github\.com:MythologIQ-Labs-LLC\/FailSafe(?:\.git)?$/i,
  /^ssh:\/\/git@github\.com\/MythologIQ-Labs-LLC\/FailSafe(?:\.git)?$/i,
];
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const command = (exe,args,cwd) => spawnSync(exe,args,{cwd,encoding:'utf8',windowsHide:true,shell:false,timeout:30000});
const abort = reason => { console.error(`BLOCKED: ${reason}`); process.exitCode=2; };
const cleanPath = p => path.resolve(p);

export function parseOptions(argv) {
  let repo;
  const o={full:false,package:false,help:false};
  for(let i=0;i<argv.length;i++) {
    const a=argv[i];
    if(a==='--repo') {
      if (repo || !argv[i+1] || argv[i+1].startsWith('--')) throw Error('one non-empty --repo path required');
      repo=argv[++i];
    } else if(a==='--full') o.full=true;
    else if(a==='--package') o.package=true;
    else if(a==='--help') o.help=true;
    else throw Error(`unknown option ${a}`);
  }
  if(o.package && !o.full) throw Error('--package requires --full');
  o.repo=cleanPath(repo??process.cwd());
  return o;
}

export function findNpmCli(nodeExe=process.execPath, env=process.env) {
  const bin=path.dirname(nodeExe);
  const candidates=[env.npm_execpath,
    path.join(bin,'node_modules','npm','bin','npm-cli.js'),
    path.join(bin,'..','lib','node_modules','npm','bin','npm-cli.js'),
    path.join(bin,'..','node_modules','npm','bin','npm-cli.js')];
  return candidates.find(p=>p && path.isAbsolute(p) && path.basename(p)==='npm-cli.js' && fs.existsSync(p));
}

export function assertPackageMetadata(pkg,lock,changelog) {
  if(pkg.version!==VERSION || lock.version!==VERSION) throw Error('manifest and lockfile must both be 6.0.12');
  if(lock.packages?.['']?.version && lock.packages[''].version!==VERSION) throw Error('lockfile root package has different version');
  if(!/^## \[6\.0\.12\] - \d{4}-\d{2}-\d{2}$/m.test(changelog)) throw Error('root changelog does not contain a dated 6.0.12 section');
}

export function acceptRemote(url) {
  return GIT_REMOTES.some(re=>re.test(url.trim()));
}

export function hasHiddenIndexEntries(value) {
  return value.split('\0').some(s=>s.length>2 && (s[0]==='S' || /[a-z]/.test(s[0])));
}

function requireSnapshot(repo){
  if(!fs.existsSync(path.join(repo,'.git'))) throw Error('checkout root with .git required');
  const head=command('git',['rev-parse','HEAD'],repo);
  if(head.status!==0||head.stdout.trim()!==SOURCE_SHA) throw Error(`wrong commit: expected ${SOURCE_SHA}, got ${head.stdout?.trim()||'unknown'}`);
  const root=command('git',['rev-parse','--show-toplevel'],repo);
  if(root.status!==0||path.resolve(root.stdout.trim())!==repo) throw Error('the provided path is not the checkout root');
  const tracked=command('git',['ls-files','-v','-z'],repo);
  if(tracked.status!==0 || hasHiddenIndexEntries(tracked.stdout)) throw Error('Git skip-worktree or assume-unchanged hides tracked content');
  const tree=command('git',['status','--porcelain','--untracked-files=all'],repo);
  if(tree.status!==0 || tree.stdout.trim()) throw Error('tracked or untracked changes found');
  const rem=command('git',['remote','get-url','origin'],repo);
  if(rem.status!==0||!acceptRemote(rem.stdout.trim())) throw Error('Git origin is not canonical FailSafe repository');
  const branch=command('git',['symbolic-ref','--quiet','--short','HEAD'],repo);
  return {head:head.stdout.trim(),origin:rem.stdout.trim(),branch:branch.status===0?branch.stdout.trim():null};
}

export function testPlan({full,package:pack},ext,out) {
  const npm=n=>({label:n,script:'npm',args:['run',n]});
  const node=(label,file,args=[])=>({label,script:'node',args:[path.join(ext,'scripts',file),...args]});
  const tasks=[npm('compile'),npm('lint'),npm('test:runner-coverage'),npm('test:citation-parity'),npm('test:node')];
  if(full) tasks.push(npm('test'),npm('test:ui'));
  tasks.push(node('release-preflight','release-gate.cjs',['--preflight']));
  if(pack){
    const dist=path.join(out,'dist-vsix');
    tasks.push(node('eight-target-package','package-all-targets.cjs',['--out',dist,'--version',VERSION]));
    tasks.push(node('release-artifact-verify','release-artifacts.cjs',['verify-set',dist,'--version',VERSION]));
    tasks.push(node('nonpublishing-release-rehearsal','release-artifacts.cjs',['rehearse',dist,'--tag','v'+VERSION]));
  }
  return tasks;
}

async function runLogged(exe,args,cwd,logPath,timeoutMs,env=process.env){
  return await new Promise(resolve=>{
    const hash=crypto.createHash('sha256');
    const log=fs.createWriteStream(logPath,{flags:'wx',mode:0o600});
    let done=false, timedOut=false, error=null;
    const started=Date.now();
    const child=spawn(exe,args,{cwd,env,windowsHide:true,shell:false,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
    function write(label,chunk){const prefix=Buffer.from(label);hash.update(prefix);hash.update(chunk);log.write(prefix);log.write(chunk);}
    child.stdout?.on('data',x=>write('OUT ',x));
    child.stderr?.on('data',x=>write('ERR ',x));
    child.on('error',e=>{error=e.message;});
    const timer=setTimeout(()=>{
      timedOut=true;
      if(process.platform==='win32') spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});
      else if(child.pid) {try{process.kill(-child.pid,'SIGKILL');}catch{try{child.kill('SIGKILL');}catch{}}}
    },timeoutMs);
    child.on('close',(code,signal)=>{
      if(done)return;done=true;clearTimeout(timer);
      log.end(()=>resolve({exitCode:code,signal,timedOut,error,elapsedMs:Date.now()-started,sha256:hash.digest('hex')}));
    });
  });
}

function artifacts(dist) {
  const report=[];
  if(!fs.existsSync(dist)) throw Error('packaging did not produce artifact folder');
  for(const file of fs.readdirSync(dist)) {
    const abs=path.join(dist,file), stat=fs.lstatSync(abs);
    if(!stat.isFile()||stat.isSymbolicLink()) throw Error(`non-regular release artifact ${file}`);
    const data=fs.readFileSync(abs);
    report.push({name:file,bytes:stat.size,sha256:sha256(data)});
  }
  const vsix=report.filter(x=>x.name.endsWith('.vsix'));
  if(vsix.length!==8||!report.some(x=>x.name==='SHA256SUMS.txt')||!report.some(x=>x.name==='targets.json')) throw Error('not exactly eight VSIX plus checksum and target manifests');
  return report;
}

async function main(){
  let opts;
  try{opts=parseOptions(process.argv.slice(2));}catch(e){abort(e.message);return;}
  if(opts.help){console.log('node failsafe_v6012_rc1_qualify_v2.mjs --repo <clean checkout> [--full] [--package]');return;}
  let original;
  try{
    if(Number(process.versions.node.split('.')[0])<22)throw Error('Node 22+ required');
    original=requireSnapshot(opts.repo);
    if(opts.package && original.branch!==CANDIDATE_BRANCH) throw Error('packaging needs the exact RC branch checked out, not a detached or renamed ref');
  }catch(e){abort(e.message);return;}
  const ext=path.join(opts.repo,'FailSafe','extension');
  let npmCli;
  try {
    if(!fs.existsSync(path.join(ext,'node_modules')))throw Error('node_modules absent: run approved npm ci before qualification');
    assertPackageMetadata(
      JSON.parse(fs.readFileSync(path.join(ext,'package.json'),'utf8')),
      JSON.parse(fs.readFileSync(path.join(ext,'package-lock.json'),'utf8')),
      fs.readFileSync(path.join(opts.repo,'CHANGELOG.md'),'utf8'));
    npmCli=findNpmCli();
    if(!npmCli)throw Error('could not find npm-cli.js beside Node or in npm_execpath');
  }catch(e){abort(e.message);return;}
  const base=path.join(os.tmpdir(),'failsafe-rc-qualification',SOURCE_SHA);
  fs.mkdirSync(base,{recursive:true,mode:0o700});
  const out=fs.mkdtempSync(path.join(base,'run-'));
  const plan=testPlan(opts,ext,out);
  const report={schema:'failsafe.rc-qualification/v2',sourceSha:SOURCE_SHA,gitOrigin:original.origin,version:VERSION,
    startedAt:new Date().toISOString(),environment:{os:process.platform,arch:process.arch,node:process.version},
    localCandidateRefContext: opts.package?CANDIDATE_BRANCH:null,
    qualification:'INCOMPLETE',governance:'NOT_ATTESTED',release:'NO_GO',publishActions:0,
    tests:[],artifacts:[],blockedBy:['#463','#475','#467','#619','current VS Code stable host verification','native SHIELD seal']};
  const finalize=()=>{
    report.finishedAt=new Date().toISOString();
    const f=path.join(out,'qualification.json');
    fs.writeFileSync(f,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({report:f,qualification:report.qualification,governance:report.governance,release:report.release,results:report.tests.map(x=>({name:x.name,ok:x.ok}))},null,2));
  };
  for(const t of plan){
    const exe=t.script==='npm'?process.execPath:process.execPath;
    const args=t.script==='npm'?[npmCli,...t.args]:t.args;
    const file=path.join(out,t.label.replace(/[^a-z0-9-]/gi,'_')+'.log');
    // Local VSIX qualification mirrors the real, SHA-verified release branch
    // solely for release-marker validation; it does not claim a GitHub event.
    const env=opts.package && ['eight-target-package','release-artifact-verify','nonpublishing-release-rehearsal'].includes(t.label)
      ? {...process.env,GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/'+CANDIDATE_BRANCH}
      : process.env;
    const result=await runLogged(exe,args,ext,file,t.label==='test'?75*60*1000:45*60*1000,env);
    const entry={name:t.label,ok:result.exitCode===0&&!result.timedOut&&!result.error,log:path.basename(file),...result};
    report.tests.push(entry);
    try{requireSnapshot(opts.repo);}catch(e){entry.ok=false;entry.sourceMutated=e.message;report.qualification='FAIL_SOURCE_MUTATED';finalize();process.exitCode=1;return;}
    if(!entry.ok){report.qualification='FAIL';finalize();process.exitCode=1;return;}
  }
  if(opts.package){
    try {report.artifacts=artifacts(path.join(out,'dist-vsix'));}
    catch(e){report.qualification='FAIL_ARTIFACTS';report.artifactError=e.message;finalize();process.exitCode=1;return;}
  }
  report.qualification='TESTS_PASS_ONLY';
  finalize();
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(e=>{console.error('BLOCKED: '+e.message);process.exitCode=2;});
