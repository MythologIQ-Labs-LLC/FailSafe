// Monitor compact-sidebar viewport-fit scaler.
// Operator request 2026-05-14: "all of the contents of the monitor need to
// scale as well to match" the no-outer-scroll constraint added in commit
// 3744ba4. Approach: apply CSS `zoom` to .stack so its content reflows at
// the scaled size and fits the viewport without clipping.
//
// `zoom` is non-standard but supported in Chromium (VS Code is Electron →
// Chromium). It affects layout (unlike `transform: scale`), so the scaled
// stack actually fits the viewport instead of overlapping siblings.

const MIN_SCALE = 0.5;
const VIEWPORT_PADDING = 24;

let rafHandle = 0;

export function fitMonitorToViewport() {
  if (rafHandle) cancelAnimationFrame(rafHandle);
  rafHandle = requestAnimationFrame(measureAndApply);
}

function measureAndApply() {
  rafHandle = 0;
  const stack = document.querySelector('.stack');
  if (!(stack instanceof HTMLElement)) return;
  // Reset to natural size before measuring so we don't observe a previously
  // zoomed scrollHeight (which would oscillate toward 0).
  stack.style.zoom = '1';
  const naturalHeight = stack.scrollHeight;
  if (naturalHeight <= 0) return;
  const viewportHeight = window.innerHeight - VIEWPORT_PADDING;
  const rawScale = viewportHeight / naturalHeight;
  const scale = Math.max(MIN_SCALE, Math.min(1, rawScale));
  // Single-decimal precision avoids subpixel re-renders that can re-fire
  // the ResizeObserver and produce visible flicker.
  stack.style.zoom = scale.toFixed(2);
}

export function installMonitorViewportFit() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const run = () => fitMonitorToViewport();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
  window.addEventListener('resize', run);
  // Re-fit when WebSocket updates change card content (queue grows, etc.).
  // Listener attaches to `hub.refresh` DOM event broadcast by roadmap.js.
  window.addEventListener('hub.refresh', run);
}
