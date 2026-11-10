// Writes manifest.json: every file in the package with size, SHA-256, role and whether the media branch carries it.
//   node make_manifest.cjs <package dir>            write
//   node make_manifest.cjs <package dir> --verify   re-hash and compare (add --in-git on the media branch, which carries only those files)
const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const P = path.resolve(process.argv[2]); const VERIFY = process.argv.includes('--verify');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const rel = (f) => path.relative(P, f).split(path.sep).join('/');
const LOCAL_ONLY = [/^audio\/music-candidates\/[^/]+\.wav$/,/^source\/captures\/.*\.mkv$/, /^audio\/narration-takes\//, /^audio\/mix\/export\//, /^audio\/[^/]+-mix\.wav$/];
const role = (r) => {
  if (/^video\/.*-silent-captioned\.mp4$/.test(r)) return 'silent captioned variant';
  if (/^video\/.*\.mp4$/.test(r)) return 'primary narrated film';
  if (/^video\/.*poster/.test(r)) return 'poster';
  if (/\.vtt$/.test(r)) return 'captions (WebVTT, English)';
  if (/^screenshots\/full\/06-homepage/.test(r)) return 'homepage image (composite of two simultaneous recordings)';
  if (/^screenshots\/source-frames\//.test(r)) return 'unedited source frame for a composite';
  if (/^screenshots\//.test(r)) return 'screenshot';
  if (/^audio\/narration\//.test(r)) return 'selected narration take (unprocessed)';
  if (/^audio\/narration-takes\/round1/.test(r)) return 'narration take, earlier voice, round 1 (not used)';
  if (/^audio\/narration-takes\/.*_m3-.*\.wav$/.test(r)) return 'narration take, final voice';
  if (/^audio\/narration-takes\/.*\.wav$/.test(r)) return 'narration take, earlier voice, round 2 (not used)';
  if (/^audio\/voice-candidates\/.*-sample\.wav$/.test(r)) return 'narrator voice candidate: sample line';
  if (/^audio\/voice-candidates\/.*\.wav$/.test(r)) return 'narrator voice candidate: design clip';
  if (/^audio\/music-candidates\/previews\//.test(r)) return 'music bed candidate: 36 s preview under narration';
  if (/^audio\/music-candidates\/.*\.wav$/.test(r)) return 'music bed candidate (take C is used)';
  if (/^audio\/mix\/export\/master\.wav$/.test(r)) return 'Sonic Rift Studio export: master';
  if (/^audio\/mix\/export\/stems\//.test(r)) return 'Sonic Rift Studio export: stem';
  if (/^audio\/[^/]+-mix\.wav$/.test(r)) return 'final mixed audio (film length)';
  if (/^source\/captures\/.*\.mkv$/.test(r)) return 'raw window recording (lossless)';
  if (/^source\/captures\//.test(r)) return 'capture log / evidence';
  if (/^source\/capture-rig\//.test(r)) return 'capture rig';
  if (/^source\/tools\//.test(r)) return 'production script';
  return 'document / production input';
};
const files = walk(P).map(rel).filter((r) => r !== 'manifest.json').sort();
if (VERIFY) {
  const m = JSON.parse(fs.readFileSync(path.join(P, 'manifest.json'), 'utf8')); let bad = 0;
  const IN_GIT = process.argv.includes('--in-git'); m.files = m.files.filter((f) => !IN_GIT || f.in_git);
  for (const f of m.files) { const full = path.join(P, f.path); if (!fs.existsSync(full) || sha(full) !== f.sha256) { bad++; console.log('MISMATCH', f.path); } }
  const extra = files.filter((r) => !m.files.some((f) => f.path === r));
  console.log(`verified ${m.files.length} files, ${bad} mismatched, ${extra.length} not listed`); process.exit(bad || extra.length ? 1 : 0);
}
const rows = files.map((r) => ({ path: r, bytes: fs.statSync(path.join(P, r)).size, sha256: sha(path.join(P, r)), role: role(r), in_git: !LOCAL_ONLY.some((x) => x.test(r)) }));
const sum = (f) => rows.filter(f).reduce((n, r) => n + r.bytes, 0);
const manifest = {
  title: 'FailSafe: From Change to Confidence', tagline: 'Build with AI. Know what changed.', product_version: '6.0.12', produced: '2026-11-10',
  approval_status: 'PENDING OWNER REVIEW', tracking: ['MythologIQ-Labs-LLC/FailSafe#645', 'MythologIQ-Labs-LLC/FailSafe#589', 'Knapp-Kevin/MythologIQ#175'],
  film: { file: 'video/failsafe-6.0.12-from-change-to-confidence.mp4', seconds: 113.5, width: 1920, height: 1080, fps: 30, video: 'H.264 High, yuv420p', audio: 'AAC-LC 48 kHz stereo',
    integrated_lufs: -16.1, true_peak_dbfs: -1.1, loudness_range_lu: 4.9 },
  provenance: {
    product_package: { file: 'mythologiq-failsafe-6.0.12-win32-x64.vsix', sha256: 'c247052b08b3c5edf7521900e83a2eabeec934705fb27a36cfbb7bc3cc8f2fae', source: 'https://github.com/MythologIQ-Labs-LLC/FailSafe/releases/tag/v6.0.12', tag_commit: '0e70e53956e893cda40c7eea01722dfc25db7cf0' },
    editor: 'VS Code 1.145.2 (c4453f8ea430795f941c1b2ff6c9321135a74a02), isolated profile', os: 'Windows 11 Pro 10.0.26300', browser: 'Chrome 157.0.8103.38, disposable profile',
    fixture: 'fictional Tasklet repository, failsafe-demo-workspace@demo-baseline (86c12f875d632dd9e21ca46e5afa83e7e8035060) + docs/CONCEPT.md',
    capture: 'ffmpeg 9.0.1 gfxcapture (Windows.Graphics.Capture), two windows, lossless', narration: 'Sonic Rift 0.9.1: synthetic male narrator from Qwen3 voice design (owner-chosen candidate 3), lines by Qwen3 voice cloning, generated locally',
    music: 'Sonic Rift 0.9.1 Music page (ACE-Step 1.5, MIT), original instrumental, owner-chosen take C', mix: 'Sonic Rift Studio export engine: music bed ducked under narration, -16 LUFS target', data_classification: 'fictional demo data; no personal data', rights: 'first-party capture and branding; synthetic narration; DM Sans under OFL',
    details: 'PROVENANCE.md' },
  storage: { in_git_bytes: sum((r) => r.in_git), local_only_bytes: sum((r) => !r.in_git), local_only_location: 'C:\\dev\\mythologiq\\failsafe\\docs\\marketing\\failsafe-v6.0.12 (owner workstation)' },
  files: rows,
};
fs.writeFileSync(path.join(P, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`${rows.length} files; in git ${(manifest.storage.in_git_bytes / 1e6).toFixed(1)} MB; local only ${(manifest.storage.local_only_bytes / 1e6).toFixed(1)} MB`);
