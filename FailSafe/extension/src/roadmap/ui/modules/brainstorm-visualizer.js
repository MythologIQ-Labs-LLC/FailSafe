// FailSafe Command Center — Brainstorm Sidebar Visualizer
// Renders the side-panel waveform fed by the VoiceController analyser stream.
// Extracted from brainstorm.js to keep that file under the 250-line cap.

export function drawSidebarVisualizer(analyser, isVoiceActive) {
  const cvs = document.querySelector('.audio-visualizer-canvas');
  if (!cvs) return;
  const ctx = cvs.getContext('2d');
  const buf = new Uint8Array(analyser.frequencyBinCount);
  const rect = cvs.getBoundingClientRect();
  cvs.width = rect.width || 200;
  cvs.height = rect.height || 24;
  const draw = () => {
    if (!isVoiceActive()) { ctx.clearRect(0, 0, cvs.width, cvs.height); return; }
    requestAnimationFrame(draw);
    analyser.getByteTimeDomainData(buf);
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.lineWidth = 2; ctx.strokeStyle = '#10b981'; ctx.beginPath();
    const sw = cvs.width / buf.length;
    for (let i = 0, x = 0; i < buf.length; i++, x += sw) {
      const y = (buf[i] / 128.0) * cvs.height / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(cvs.width, cvs.height / 2);
    ctx.stroke();
  };
  draw();
}
