// Builds the English WebVTT captions from the narration cue sheet. Sentence boundaries come from the measured
// paragraph pauses inside each selected take (ffmpeg silencedetect), so cue times follow the recorded speech.
//   node make_captions.cjs <package dir>
const { execFileSync, spawnSync } = require('child_process'); const fs = require('fs'); const path = require('path');
const P = process.argv[2];
const cues = JSON.parse(fs.readFileSync(path.join(P, 'audio/mix/cues.json'), 'utf8'));
const NL = String.fromCharCode(10);
const dur = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { encoding: 'utf8' }));
const pauses = (f) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', f, '-af', 'silencedetect=noise=-38dB:d=0.4', '-f', 'null', '-'], { encoding: 'utf8' });
  const s = [...r.stderr.matchAll(/silence_start: ([0-9.]+)/g)].map((m) => +m[1]); const e = [...r.stderr.matchAll(/silence_end: ([0-9.]+)/g)].map((m) => +m[1]);
  return s.map((v, i) => ({ start: v, end: e[i] })).filter((g) => g.end - g.start >= 0.7);
};
const ts = (t) => { const ms = Math.round(t * 1000); const p = (n, l = 2) => String(n).padStart(l, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`; };
const wrap = (text) => { if (text.length <= 44) return text; const mid = text.length / 2; let best = -1; for (let i = 0; i < text.length; i++) if (text[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i; return text.slice(0, best) + NL + text.slice(best + 1); };
const out = []; const report = [];
for (const cue of cues) {
  const sentences = cue.text.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);   // "6.0.12" stays whole
  const total = dur(cue.file); const gaps = pauses(cue.file);
  let spans;
  if (gaps.length === sentences.length - 1) {
    const edges = [0, ...gaps.flatMap((g) => [g.start, g.end]), total]; spans = sentences.map((s, i) => [edges[i * 2], edges[i * 2 + 1]]);
  } else { // fall back to character-proportional timing
    const chars = sentences.reduce((n, s) => n + s.length, 0); let t = 0; spans = sentences.map((s) => { const a = t; t += total * s.length / chars; return [a, t]; });
  }
  report.push({ scene: cue.scene, take: cue.take, sentences: sentences.length, pauses_found: gaps.length, method: gaps.length === sentences.length - 1 ? 'measured pauses' : 'proportional' });
  sentences.forEach((s, i) => {
    let [a, b] = spans[i];
    const parts = [];
    if (s.length > 88) { // two cues, split at the comma nearest the middle
      const commas = [...s.matchAll(/, /g)].map((m) => m.index + 1); const mid = s.length / 2;
      const at = commas.length ? commas.reduce((x, y) => (Math.abs(y - mid) < Math.abs(x - mid) ? y : x)) : s.lastIndexOf(' ', mid);
      const t = a + (b - a) * at / s.length; parts.push([a, t, s.slice(0, at).trim()], [t, b, s.slice(at).trim()]);
    } else parts.push([a, b, s]);
    for (const [x, y, text] of parts) out.push({ start: cue.start + x, end: cue.start + y + 0.25, text });
  });
}
for (let i = 0; i < out.length - 1; i++) out[i].end = Math.min(out[i].end, out[i + 1].start - 0.04);
const vtt = 'WEBVTT' + NL + NL + 'NOTE FailSafe: From Change to Confidence (v6.0.12). Narration: synthetic voice, generated locally in Sonic Rift.' + NL + NL +
  out.map((c, i) => `${i + 1}${NL}${ts(c.start)} --> ${ts(c.end)}${NL}${wrap(c.text)}${NL}`).join(NL);
fs.writeFileSync(path.join(P, 'video/failsafe-6.0.12-from-change-to-confidence.en.vtt'), vtt);
fs.writeFileSync(path.join(P, 'audio/mix/caption-timing-report.json'), JSON.stringify({ cues: out, report }, null, 1));
console.log(out.length, 'cues;', report.map((r) => `${r.scene}:${r.method === 'measured pauses' ? 'ok' : 'PROPORTIONAL'}`).join(' '));
