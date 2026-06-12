/**
 * TrackerEmbedRenderer — Workspace-tab sub-view that embeds the Development
 * Tracker dashboard inline (via an iframe to /console/tracker, which isolates
 * the dashboard's own fonts/aurora/styles from the console shell) plus a
 * "Pop out ↗" affordance that opens the full dashboard in a new browser tab.
 *
 * The dashboard itself is the premium single-file engine served at
 * /console/tracker; this renderer is just the in-Workspace mount + pop-out.
 */

const STYLE_ID = 'cc-tracker-embed-style';
const STYLE = `
.cc-trk { display:flex; flex-direction:column; gap:10px; height:100%; min-height:0; flex:1; }
.cc-trk-bar { display:flex; align-items:center; justify-content:space-between; gap:10px; }
.cc-trk-bar h3 { margin:0; font-size:1.02rem; }
.cc-trk-bar .cc-trk-sub { color:#9aa5b4; font-size:.84rem; }
.cc-trk-popout { background:#141a22; color:#f1efe7; border:1px solid #3a4658; border-radius:8px;
  padding:5px 12px; cursor:pointer; font:inherit; font-size:.85rem; text-decoration:none; white-space:nowrap; }
.cc-trk-popout:hover { border-color:#68d391; }
.cc-trk-frame { flex:1; width:100%; min-height:0; border:1px solid #202938; border-radius:10px; background:#0c0f14; }
`;

export class TrackerEmbedRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
  }

  ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = STYLE;
    document.head.appendChild(el);
  }

  render() {
    if (!this.container) return;
    this.ensureStyle();
    const url = '/console/tracker';

    // FX886: idempotent. If the same-src iframe is already mounted, keep the
    // live document (do NOT replace innerHTML — that reloaded the dashboard on
    // every hub refresh). Refresh only the heading chrome and return.
    const existing = this.container.querySelector('iframe.cc-trk-frame');
    if (existing && (existing.getAttribute('src') || '').endsWith(url)) {
      const h3 = this.container.querySelector('.cc-trk-bar h3');
      if (h3) h3.textContent = 'Development Tracker';
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'cc-trk';

    const bar = document.createElement('div');
    bar.className = 'cc-trk-bar';
    const heading = document.createElement('div');
    const h3 = document.createElement('h3');
    h3.textContent = 'Development Tracker';
    const sub = document.createElement('span');
    sub.className = 'cc-trk-sub';
    sub.textContent = ' release timeline + program progress, generated from the repo';
    heading.appendChild(h3);
    heading.appendChild(sub);
    const popout = document.createElement('a');
    popout.className = 'cc-trk-popout';
    popout.href = url;
    popout.target = '_blank';
    popout.rel = 'noopener noreferrer';
    popout.textContent = 'Pop out ↗';
    bar.appendChild(heading);
    bar.appendChild(popout);

    const frame = document.createElement('iframe');
    frame.className = 'cc-trk-frame';
    frame.src = url;
    frame.title = 'Development Tracker';
    frame.setAttribute('loading', 'lazy');

    wrap.appendChild(bar);
    wrap.appendChild(frame);
    this.container.innerHTML = '';
    this.container.appendChild(wrap);
  }

  // No WS event stream for the embedded tracker — accept + ignore for TabGroup parity.
  onEvent() {}
}
