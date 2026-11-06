#!/usr/bin/env node
"use strict";
/**
 * #616: Build release notes from the exact extension manifest, matching
 * versioned CHANGELOG section and original checked-in PNG logos.
 * This produces no content from inference or unapproved fallback sources.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium } = require("@playwright/test");

const ROOT = path.resolve(__dirname, "../../..");
const EXT = path.resolve(__dirname, "..");
const BRAND = path.join(EXT, "assets/release-branding");
const LOGOS = [
  ["mythologiq-labs.png", "46f10ebebf134ae6a63f36c64913fc7950567e09", "Knapp-Kevin/MythologIQ:src/assets/softlogo.png"],
  ["failsafe.png", "8401110b23f402a1bc11967e13525af73a8d2023", "Knapp-Kevin/MythologIQ:public/assets/products/failsafe-logo.png"],
];
const CATEGORIES = new Set(["Added","Changed","Fixed","Security","Dependencies","Compatibility","Known Limitations","Deprecated","Removed"]);
const sha = (bytes, algorithm="sha256") => crypto.createHash(algorithm).update(bytes).digest("hex");
const gitSha = (bytes) => sha(Buffer.concat([Buffer.from("blob "+bytes.length+"\0"),bytes]), "sha1");
const fileName = (version) => "FailSafe-v"+version+"-Release-Notes.pdf";
const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const argvValue = (argv, flag) => { const i=argv.indexOf(flag); return i === -1 ? undefined : argv[i+1]; };
const plain = (s) => s.replace(/\[([^\]]+)\]\([^)]+\)/g,"$1").replace(/\*\*/g,"").replace(/__/g,"").replace(new RegExp(String.fromCharCode(96),"g"),"");

function requireVersion(version) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version||"")) {
    throw Error("Expected full semantic release version");
  }
}
function sectionsFor(text, version) {
  const headings = [...text.matchAll(/^## \[([^\]]+)\](?:\s+-\s+[^\n]+)?$/gm)];
  const match = headings.filter((h) => h[1] === version);
  if (match.length !== 1) throw Error("Expected exactly one versioned CHANGELOG heading for "+version);
  const start = match[0].index + match[0][0].length;
  const next = headings.find((h) => h.index > start);
  const lines = text.slice(start,next?.index).split(/\r?\n/);
  const groups = []; let current = null;
  for (const line of lines) {
    const section=/^### (.+?)\s*$/.exec(line);
    if (section) {
      if (!CATEGORIES.has(section[1])) throw Error("Unexpected release note category "+section[1]);
      current={ heading:section[1], items:[] }; groups.push(current); continue;
    }
    const bullet=/^-\s+(.+)$/.exec(line);
    if (bullet) {
      if (!current) throw Error("Uncategorized changelog bullet");
      current.items.push(bullet[1].trim()); continue;
    }
    const continuation=/^\s{2,}(\S.+)$/.exec(line);
    if (continuation && current?.items.length) {
      current.items[current.items.length-1] += " "+continuation[1].trim();
    } else if (line.trim() && !line.trim().startsWith("<!--")) {
      throw Error("Unparsed changelog content: "+line.slice(0,90));
    }
  }
  const used=groups.filter((g)=>g.items.length);
  if (!used.length || new Set(groups.map((g)=>g.heading)).size !== groups.length) throw Error("Missing or duplicate release sections");
  for (const g of used) for(const item of g.items) {
    if (/\b(TODO|TBD|FIXME|PLACEHOLDER)\b/i.test(item)) throw Error("Placeholder release note refused");
    if (item.length > 1200) throw Error("Oversized customer note in "+g.heading);
  }
  return used;
}
function readLogos(dir=BRAND) {
  return LOGOS.map(([name,sourceSha,provenance]) => {
    const bytes=fs.readFileSync(path.join(dir,name));
    if (gitSha(bytes)!==sourceSha) throw Error("Canonical logo bytes changed: "+name);
    if (!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw Error("Expected PNG: "+name);
    return {name,provenance,sha256:sha(bytes),data:"data:image/png;base64,"+bytes.toString("base64")};
  });
}
function htmlFor(version, groups, logos) {
  const notes=groups.map((g)=>'<section><h2>'+esc(g.heading)+'</h2><ul>'+
    g.items.map((item)=>'<li>'+esc(plain(item))+'</li>').join("")+'</ul></section>').join("");
  const link="https://github.com/MythologIQ-Labs-LLC/FailSafe/releases/tag/v"+encodeURIComponent(version);
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">'+
    '<title>FailSafe v'+esc(version)+' | Release Notes</title><style>'+
    '@page{size:Letter;margin:0.7in 0.72in 0.66in}'+
    '*{box-sizing:border-box}body{margin:0;font:11pt/1.44 Arial,Helvetica,sans-serif;color:#26334b}'+
    'header{display:flex;gap:21px;align-items:center;border-bottom:2px solid #d9aa60;padding-bottom:19px}'+
    '.logos{display:flex;gap:10px}.logos img{height:72px;width:72px;object-fit:contain}'+
    '.brand{font-size:8pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#526179}'+
    'h1{margin:4px 0 3px;font-size:28pt;line-height:1.1;color:#1b3258}'+
    '.version{font-size:11pt;font-weight:600;color:#515c6f}'+
    '.overview{background:#f3f6fb;border-left:3px solid #d8b16d;padding:13px 16px;margin:19px 0 20px}'+
    'section{break-inside:avoid;margin:0 0 17px}h2{font-size:14pt;color:#18345d;margin:0 0 8px;border-bottom:1px solid #dfe6f0;padding-bottom:4px}'+
    'ul{margin:0;padding-left:20px}li{padding-left:3px;padding-bottom:6px;overflow-wrap:anywhere}'+
    '.links{border-top:1px solid #e2e6ef;margin-top:15px;padding-top:11px;font-size:9pt;overflow-wrap:anywhere}'+
    'a{color:#24518b}footer{position:fixed;right:0;bottom:-.40in;color:#738095;font-size:8pt}'+
    '</style></head><body><header><div class="logos">'+
    '<img alt="MythologIQ Labs" src="'+logos[0].data+'"><img alt="FailSafe" src="'+logos[1].data+'"></div>'+
    '<div><div class="brand">MythologIQ Labs | Product release</div><h1>FailSafe</h1>'+
    '<div class="version">Version '+esc(version)+' | Release notes</div></div></header>'+
    '<p class="overview">A summary of what changed, what was fixed, and any limits to know about.</p>'+
    notes+'<div class="links"><b>Release and installers</b><br><a href="'+link+'">'+esc(link)+'</a><br>'+
    '<a href="https://marketplace.visualstudio.com/items?itemName=MythologIQ.mythologiq-failsafe">VS Code Marketplace</a> | '+
    '<a href="https://open-vsx.org/extension/MythologIQ/mythologiq-failsafe">Open VSX</a></div>'+
    '<footer>MythologIQ Labs | FailSafe v'+esc(version)+'</footer></body></html>';
}
async function generate({version, changelog, out, logosDir=BRAND, manifest=path.join(EXT,"package.json")}) {
  requireVersion(version);
  const pkg=JSON.parse(fs.readFileSync(manifest,"utf8"));
  if (pkg.version!==version) throw Error("Extension manifest version differs: "+pkg.version+" vs "+version);
  const groups=sectionsFor(fs.readFileSync(changelog,"utf8"),version);
  const logos=readLogos(logosDir);
  const sumsFile=path.join(out,"SHA256SUMS.txt");
  if (!fs.existsSync(sumsFile)) throw Error("No authoritative VSIX SHA256SUMS.txt");
  const name=fileName(version), target=path.join(out,name);
  const sums=fs.readFileSync(sumsFile,"utf8");
  if(sums.includes(name)||fs.existsSync(target)||fs.readdirSync(out).some((x)=>x.endsWith(".pdf"))) {
    throw Error("Existing or unexpected PDF asset; refuse replacement");
  }
  const browser=await chromium.launch({headless:true});
  let bytes;
  try {
    const page=await browser.newPage();
    await page.setContent(htmlFor(version,groups,logos),{waitUntil:"load"});
    await page.evaluate(()=>document.fonts.ready);
    bytes=await page.pdf({format:"Letter",printBackground:true,preferCSSPageSize:true,tagged:true});
  } finally { await browser.close(); }
  if(bytes.length<4096||!bytes.subarray(0,8).toString("ascii").startsWith("%PDF-")||!/%%EOF\s*$/.test(bytes.subarray(-128).toString("latin1"))) {
    throw Error("Invalid generated PDF");
  }
  fs.writeFileSync(target,bytes,{flag:"wx"});
  try { fs.appendFileSync(sumsFile,sha(bytes)+"  "+name+"\n"); }
  catch(error){fs.rmSync(target,{force:true});throw error;}
  return {name,sha256:sha(bytes),sections:groups.map((g)=>g.heading),logoSources:logos.map(({name,provenance,sha256})=>({name,provenance,sha256}))};
}
async function main(args) {
  const version=argvValue(args,"--version"),out=argvValue(args,"--out");
  if(!version||!out) throw Error("Usage: --version <semver> --out <dist-vsix>");
  return generate({version,out:path.resolve(out),changelog:path.resolve(argvValue(args,"--changelog")||path.join(ROOT,"CHANGELOG.md"))});
}
if(require.main===module) main(process.argv.slice(2)).then((v)=>console.log(JSON.stringify(v)),(e)=>{console.error("[FAIL] "+e.message);process.exitCode=1;});
module.exports={LOGOS,requireVersion,sectionsFor,readLogos,htmlFor,generate,main};
