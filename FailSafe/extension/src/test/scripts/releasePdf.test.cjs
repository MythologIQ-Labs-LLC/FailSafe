"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const {chromium}=require("@playwright/test");
const {
  requireVersion,sectionsFor,readLogos,htmlFor,generate
}=require("../../../scripts/build-release-notes-pdf.cjs");

const VERSION="6.0.12";
const changes="# Changelog\n\n## [Unreleased]\n\n## [6.0.12]\n\n"+
  "### Security\n- Refuse a request with missing governance proof.\n\n"+
  "### Fixed\n- Keep the Monitor theme when reopened.\n\n"+
  "### Known Limitations\n- Agent execution outside an isolated environment is not blocked.\n\n"+
  "## [6.0.11]\n\n### Fixed\n- Older item.\n";

test("#616 requires exact SemVer",()=>{
  requireVersion(VERSION);
  requireVersion("6.0.12-rc.1");
  assert.throws(()=>requireVersion("6.0.x"),/semantic/);
  assert.throws(()=>requireVersion("6.0.12-"),/semantic/);
  assert.throws(()=>requireVersion(""),/semantic/);
});
test("#616 parser reads only exact version section and preserves sections in customer order",()=>{
  const sections=sectionsFor(changes,VERSION);
  assert.deepEqual(sections.map((x)=>x.heading),["Security","Fixed","Known Limitations"]);
  assert.deepEqual(sections.map((x)=>x.items.length),[1,1,1]);
  assert.ok(!sections.flatMap((x)=>x.items).some((s)=>s.includes("Older item")));
});
test("#616 missing, duplicate, placeholder and unclassified release copy is refused",()=>{
  assert.throws(()=>sectionsFor(changes,"6.0.13"),/exactly one/);
  assert.throws(()=>sectionsFor(changes+"\n## [6.0.12]\n### Fixed\n- Duplicated\n",VERSION),/exactly one/);
  assert.throws(()=>sectionsFor(changes.replace("Refuse a request","TODO: refuse a request"),VERSION),/Placeholder/);
  assert.throws(()=>sectionsFor(changes.replace("### Security","### Magic"),VERSION),/Unexpected release note category/);
  assert.throws(()=>sectionsFor(changes.replace("### Security\n",""),VERSION),/Uncategorized changelog bullet/);
  assert.throws(()=>sectionsFor("# Changelog\n\n## [6.0.12]\n",VERSION),/Missing or duplicate/);
});
test("#616 branding uses byte-pinned current studio assets, not substitutes",()=>{
  const logos=readLogos();
  assert.equal(logos.length,2);
  assert.ok(logos[0].data.startsWith("data:image/webp;base64,UklGR"));
  assert.ok(logos[1].data.startsWith("data:image/png;base64,iVBORw0KGgo"));
  assert.equal(logos[0].sha256, "c0141a60b03cc6b96750cb17ac3b8ca77b5d650539787cdf8fb83ef7ce9694b2");
  assert.equal(logos[1].sha256, "74d5e8c639e964db764a5f8fa1f631664d793ae2da477e849545dc1e80f53cb0");
  assert.notEqual(logos[0].sha256,logos[1].sha256);
});
test("#616 substituted logo bytes fail closed",()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"release-branding-"));
  const original=path.resolve(__dirname,"../../../assets/release-branding");
  try{
    for(const name of ["source-mythologiq-studio.webp","source-failsafe-studio.png"]) fs.copyFileSync(path.join(original,name),path.join(dir,name));
    fs.appendFileSync(path.join(dir,"source-failsafe-studio.png"),Buffer.from("altered"));
    assert.throws(()=>readLogos(dir),/Canonical logo bytes changed/);
    fs.copyFileSync(path.join(original,"source-failsafe-studio.png"),path.join(dir,"source-failsafe-studio.png"));
    fs.appendFileSync(path.join(dir,"source-mythologiq-studio.webp"),Buffer.from("altered"));
    assert.throws(()=>readLogos(dir),/Canonical logo bytes changed/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("#616 PDF layout places both studio logos above exact-version customer copy, with links",()=>{
  const html=htmlFor(VERSION,sectionsFor(changes,VERSION),readLogos());
  assert.match(html,/<title>FailSafe v6.0.12 \| Release Notes<\/title>/);
  assert.match(html,/<img alt="MythologIQ Labs"/);
  assert.match(html,/<img alt="FailSafe"/);
  assert.ok(html.indexOf("MythologIQ Labs")<html.indexOf("Release and installers"));
  assert.match(html,/missing governance proof/);
  assert.match(html,/Known Limitations/);
  assert.match(html,/releases\/tag\/v6.0.12/);
  assert.ok(!html.includes("Older item"));
  assert.ok(!html.includes("PROPOSED RELEASE SCOPE"));
});
test("#616 unaccepted release source cannot write a PDF or alter checksums",async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"release-pdf-neg-"));
  try{
    fs.writeFileSync(path.join(tmp,"package.json"),JSON.stringify({version:VERSION}));
    fs.writeFileSync(path.join(tmp,"changelog.md"),"# Changelog\n## [Unreleased]\n");
    fs.writeFileSync(path.join(tmp,"SHA256SUMS.txt"),"canonical\n");
    await assert.rejects(generate({version:VERSION,manifest:path.join(tmp,"package.json"),changelog:path.join(tmp,"changelog.md"),out:tmp}),/exactly one versioned/);
    assert.equal(fs.readFileSync(path.join(tmp,"SHA256SUMS.txt"),"utf8"),"canonical\n");
    assert.ok(!fs.readdirSync(tmp).some((x)=>x.endsWith(".pdf")));
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test("#616 browser render embeds logos and appends PDF checksum without touching VSIX set",{skip: !fs.existsSync(chromium.executablePath())},async()=>{
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"release-pdf-positive-"));
  try{
    fs.writeFileSync(path.join(tmp,"package.json"),JSON.stringify({version:VERSION}));
    fs.writeFileSync(path.join(tmp,"changelog.md"),changes);
    fs.writeFileSync(path.join(tmp,"SHA256SUMS.txt"),"existing-vsix-sums\n");
    const result=await generate({version:VERSION,manifest:path.join(tmp,"package.json"),changelog:path.join(tmp,"changelog.md"),out:tmp});
    const bytes=fs.readFileSync(path.join(tmp,result.name));
    assert.ok(bytes.length>4096);
    assert.match(bytes.subarray(0,8).toString("ascii"),/^%PDF/);
    assert.match(bytes.subarray(-128).toString("latin1"),/%%EOF\s*$/);
    assert.ok(fs.readFileSync(path.join(tmp,"SHA256SUMS.txt"),"utf8").startsWith("existing-vsix-sums\n"));
    assert.ok(fs.readFileSync(path.join(tmp,"SHA256SUMS.txt"),"utf8").includes(result.name));
    assert.equal(result.logoSources.length,2);
    await assert.rejects(generate({version:VERSION,manifest:path.join(tmp,"package.json"),changelog:path.join(tmp,"changelog.md"),out:tmp}),/Existing or unexpected PDF/);
  }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});

test("the footer prints in each page's bottom margin, never as a fixed element over the body (#917 PDF layout)", () => {
  const gen = require(path.join(__dirname, "..", "..", "..", "scripts", "build-release-notes-pdf.cjs"));
  const html = gen.htmlFor("6.0.12", [{ heading: "Fixed", items: ["one (#1)"] }], gen.readLogos(path.join(__dirname, "..", "..", "..", "assets", "release-branding")));
  assert.doesNotMatch(html, /<footer|position:\s*fixed/);
  assert.match(gen.footerFor("6.0.12"), /MythologIQ Labs \| FailSafe v6\.0\.12/);
  assert.match(gen.footerFor("6.<b>"), /6\.&lt;b&gt;/);
  const src = require("fs").readFileSync(path.join(__dirname, "..", "..", "..", "scripts", "build-release-notes-pdf.cjs"), "utf8");
  assert.match(src, /displayHeaderFooter:true,headerTemplate:"<span><\/span>",footerTemplate:footerFor\(version\)/);
});
