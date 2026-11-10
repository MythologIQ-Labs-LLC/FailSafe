// Starts/stops one ffmpeg per window (Windows.Graphics.Capture via ffmpeg's gfxcapture). Frames are stamped with
// wall-clock time relative to a shared T0, so the two recordings stay in sync; static stretches produce no frames
// (WGC only delivers on change) and are filled when the editor converts to constant 30 fps.
const { spawn, execFileSync } = require('child_process'); const path = require('path'); const fs = require('fs');
const NL = String.fromCharCode(10);
function hwnd(titleLike, exeLike, place) {
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'winpos.ps1'), '-TitleLike', titleLike, '-ExeLike', exeLike];
  if (place) args.push('-X', String(place.x), '-Y', String(place.y), '-Width', String(place.w), '-Height', String(place.h));
  const out = execFileSync('powershell', args, { encoding: 'utf8' }); const m = out.match(/hwnd=(\d+).*rect=([-\d,]+)/);
  if (!m) throw new Error('winpos: ' + out); return { hwnd: m[1], rect: m[2] };
}
const stage = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'stage.json'), 'utf8'));
const WINDOWS = {
  // stage.cjs sizes both windows so the captured content is exactly 1920x1080
  vscode: () => ({ ...hwnd('*tasklet*Visual Studio Code*', 'Code'), crop: '' }),
  // Chrome: tab strip + toolbar are cropped; the recording is the Console page itself
  console: () => ({ ...hwnd('*FAILSAFE Console*', 'chrome'), crop: ':crop_top=' + stage().console.cropTop }),
};
function start(outDir, t0us, which = ['vscode', 'console'], tag = '') {
  fs.mkdirSync(outDir, { recursive: true });
  const procs = {};
  for (const name of which) {
    const w = WINDOWS[name]();
    const vf = `gfxcapture=hwnd=${w.hwnd}:capture_cursor=0:max_framerate=30${w.crop},hwdownload,format=bgra,setpts=(RTCTIME-${t0us})/(TB*1000000),format=yuv444p`;
    const file = path.join(outDir, `${name}${tag}.mkv`);
    const p = spawn('ffmpeg', ['-hide_banner', '-y', '-loglevel', 'warning', '-nostats', '-f', 'lavfi', '-i', vf, '-copyts', '-fps_mode', 'passthrough', '-enc_time_base', '1:1000',
      '-c:v', 'libx264', '-qp', '0', '-preset', 'ultrafast', '-tune', 'zerolatency', '-g', '30', '-flush_packets', '1', file], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { err += d; });
    procs[name] = { p, file, rect: w.rect, hwnd: w.hwnd, err: () => err };
  }
  return {
    procs,
    // 'q' is only seen when the next frame arrives, so after asking ffmpeg to quit the caller's nudge() must make
    // each window repaint (a pointer hover); those trailing frames are past the end of the take.
    stop: async (nudge) => {
      const exits = Object.values(procs).map(({ p }) => new Promise((res) => { p.on('exit', res); try { p.stdin.write('q' + NL); } catch { /* gone */ } }));
      for (let i = 0; i < 25; i++) {
        if (nudge) await nudge(i);
        const done = await Promise.race([Promise.all(exits).then(() => true), new Promise((r) => setTimeout(() => r(false), 400))]);
        if (done) return true;
      }
      for (const { p } of Object.values(procs)) { try { p.kill(); } catch { /* gone */ } }
      return false;
    },
  };
}
module.exports = { start, hwnd, WINDOWS };
