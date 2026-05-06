// FailSafe Command Center — Brainstorm Modal Audio Visualizer
// Renders a live waveform inside the Prep Bay modal canvas while the voice
// controller's analyser is producing data. Extracted from prep-bay.js per
// plan v4.10.1a (B129) so timing is driven by the analyser cache-and-replay
// stream rather than the modal's open/close lifecycle.

export function wireModalVisualizer(modal, voice, onActiveCheck) {
  const canvas = modal?.querySelector?.('.cc-bs-modal-visualizer');
  if (!canvas) return null;

  let active = true;
  const isActive = () => active && (!onActiveCheck || onActiveCheck());
  const unsubscribe = voice.addAnalyserListener((analyser) => {
    if (isActive() && analyser) {
      drawModalVisualizer(canvas, analyser, isActive);
    }
  });

  return () => {
    active = false;
    unsubscribe?.();
  };
}

export function drawModalVisualizer(canvas, analyser, isActive) {
  const ctx = canvas.getContext('2d');
  const buf = new Uint8Array(analyser.frequencyBinCount);
  canvas.width = canvas.clientWidth || 200;
  canvas.height = canvas.clientHeight || 24;
  const draw = () => {
    if (!isActive()) return;
    requestAnimationFrame(draw);
    analyser.getByteTimeDomainData(buf);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#10b981';
    ctx.beginPath();
    const sw = canvas.width / buf.length;
    let x = 0;
    for (let i = 0; i < buf.length; i++, x += sw) {
      const y = (buf[i] / 128.0) * canvas.height / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(canvas.width, canvas.height / 2);
    ctx.stroke();
  };
  draw();
}
