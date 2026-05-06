// FailSafe — Piper TTS vendor copy script
// Mirrors the Whisper-vendor pattern: bumping piper-tts-web in package.json
// triggers a re-run of `npm run vendor:piper`, which copies the runtime
// artifacts from node_modules into the committed vendor directory so the
// extension ships without npm dependencies at load time.

'use strict';

const fs = require('fs');
const path = require('path');

// Source-relative-to-dist → destination-filename pairs. Plan v4.10.1a names the
// main JS bundle `piper.min.js`; the upstream package ships it as
// `piper-tts-web.js` so we rename on copy. The phonemize artifacts live under
// `dist/piper/` in the upstream layout.
const FILES = [
  { src: ['piper-tts-web.js'], dst: 'piper.min.js' },
  { src: ['piper', 'piper_phonemize.wasm'], dst: 'piper_phonemize.wasm' },
  { src: ['piper', 'piper_phonemize.data'], dst: 'piper_phonemize.data' },
];

function main() {
  const destDir = path.resolve(__dirname, '..', 'src', 'roadmap', 'ui', 'vendor', 'piper');
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  let copied = 0;
  for (const entry of FILES) {
    const src = path.resolve(__dirname, '..', 'node_modules', 'piper-tts-web', 'dist', ...entry.src);
    const dst = path.resolve(destDir, entry.dst);
    if (!fs.existsSync(src)) {
      console.error(`[vendor-piper] missing source: ${src}`);
      process.exit(1);
    }
    fs.copyFileSync(src, dst);
    console.log(`[vendor-piper] copied ${entry.dst}`);
    copied += 1;
  }
  console.log(`[vendor-piper] done (${copied} file(s))`);
}

main();
