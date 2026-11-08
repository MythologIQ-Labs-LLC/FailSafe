import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {parseOptions,findNpmCli,testPlan,acceptRemote,assertPackageMetadata,hasHiddenIndexEntries,SOURCE_SHA} from './failsafe-v6012-rc1.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'failsafe-rc-qualifier-tests-'));
test.after(()=>fs.rmSync(root,{recursive:true,force:true}));

test('pinned source identity is the frozen PR #631 head',()=>{
  assert.equal(SOURCE_SHA,'3d722d02721015ccf6307dc5adb74513814dc8e4');
});
test('parse rejects unknown/missing flags and packaging without full tests',()=>{
  assert.throws(()=>parseOptions(['--repo']),/required/);
  assert.throws(()=>parseOptions(['--repo','--full']),/required/);
  assert.throws(()=>parseOptions(['--repo','a','--repo','b']),/one non-empty/);
  assert.throws(()=>parseOptions(['--foo']),/unknown/);
  assert.throws(()=>parseOptions(['--package']),/requires/);
  assert.equal(parseOptions(['--repo','C:/safe','--full','--package']).full,true);
});
test('only authenticated source URI syntaxes accepted',()=>{
  for(const url of ['https://github.com/MythologIQ-Labs-LLC/FailSafe.git','git@github.com:MythologIQ-Labs-LLC/FailSafe','ssh://git@github.com/MythologIQ-Labs-LLC/FailSafe']) assert.equal(acceptRemote(url),true);
  for(const url of ['https://attacker@gIthub.com/MythologIQ-Labs-LLC/FailSafe','https://github.com.evil/owner/repo','https://github.com/MythologIQ-Labs-LLC/FailSafe/other','https://token@github.com/MythologIQ-Labs-LLC/FailSafe'])assert.equal(acceptRemote(url),false,url);
});
test('npm CLI lookup resolves both Windows-adjacent and nvm lib layouts',()=>{
  const bin=path.join(root,'node');fs.mkdirSync(bin,{recursive:true});
  const winCli=path.join(bin,'node_modules','npm','bin','npm-cli.js');fs.mkdirSync(path.dirname(winCli),{recursive:true});fs.writeFileSync(winCli,'');
  assert.equal(findNpmCli(path.join(bin,'node.exe'),{}),winCli);
  fs.rmSync(path.join(bin,'node_modules'),{recursive:true});
  const unixCli=path.join(root,'lib','node_modules','npm','bin','npm-cli.js');fs.mkdirSync(path.dirname(unixCli),{recursive:true});fs.writeFileSync(unixCli,'');
  assert.equal(findNpmCli(path.join(bin,'node'),{}),unixCli);
});
test('package metadata must bind exact version and changelog',()=>{
  const good={version:'6.0.12'};const lock={version:'6.0.12',packages:{'':{version:'6.0.12'}}};const text='## [6.0.12] - 2026-11-06';
  assert.doesNotThrow(()=>assertPackageMetadata(good,lock,text));
  assert.throws(()=>assertPackageMetadata({...good,version:'6.0.13'},lock,text),/manifest and lockfile/);
  assert.throws(()=>assertPackageMetadata(good,{...lock,packages:{'':{version:'6.0.11'}}},text),/root package/);
  assert.throws(()=>assertPackageMetadata(good,lock,'## [6.0.12]'),/changelog/);
});
test('no duplicate full suite and artifact validation uses 8 target packager + set verifier',()=>{
  const p=testPlan({full:true,package:true},'/tmp/repo/FailSafe/extension','/tmp/receipts');
  assert.equal(p.filter(x=>x.label==='test:all').length,0);
  assert.equal(p.filter(x=>x.label==='test').length,1);
  assert.equal(p.filter(x=>x.label==='test:ui').length,1);
  assert.equal(p.filter(x=>x.label==='test:node').length,1);
  assert.deepEqual(p.slice(-3).map(x=>x.label),['eight-target-package','release-artifact-verify','nonpublishing-release-rehearsal']);
  assert.equal(p.find(x=>x.label==='release-artifact-verify').args[2],'/tmp/receipts/dist-vsix');
  assert.equal(p.some(x=>x.label==='validate:vsix'),false);
});
test('non-publishing smoke plan has no VS Code hosts, Playwright or packaging',()=>{
  const p=testPlan({full:false,package:false},'/tmp/ext','/tmp/out');
  for(const name of ['test','test:ui','eight-target-package','nonpublishing-release-rehearsal']) assert.equal(p.some(x=>x.label===name),false);
  assert.equal(p.some(x=>x.label==='test:node'),true);
});

test('skip-worktree and assume-unchanged are not accepted as clean source',()=>{
  assert.equal(hasHiddenIndexEntries('H file.ts\0H other.ts\0'),false);
  assert.equal(hasHiddenIndexEntries('S hidden.ts\0'),true);
  assert.equal(hasHiddenIndexEntries('h untrusted.ts\0'),true);
});
