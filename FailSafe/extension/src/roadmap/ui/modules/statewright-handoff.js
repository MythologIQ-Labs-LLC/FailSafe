/**
 * #652: Statewright website-first handoff for the Integrations Catalog.
 *
 * Static markup only. There is no adapter, credential, provider data, status
 * probe or connection claim: the only way to reach Statewright from here is the
 * operator activating the one link below. The address is also shown as text so
 * it can be copied where a new tab cannot be opened.
 */

export const STATEWRIGHT_RUNS_URL = 'https://statewright.ai/runs';

export const STATEWRIGHT_STYLES = `
.cc-intcat-statewright { background:linear-gradient(180deg,#182332,#111a25); border:1px solid #425168; border-radius:10px; padding:14px; }
.cc-intcat-statewright p { color:#a9b8cb; margin:0 0 10px; font-size:.88rem; }
.cc-intcat-web-link { display:inline-block; background:#141a22; color:#f1efe7; border:1px solid #5fb0d8; border-radius:8px; padding:7px 14px; font:inherit; text-decoration:none; }
.cc-intcat-web-link:hover, .cc-intcat-web-link:focus-visible { border-color:#9fdcff; color:#fff; text-decoration:underline; }
.cc-intcat-web-url { color:#7f8aa0; font-size:.8rem; user-select:all; }
`;

export const STATEWRIGHT_HANDOFF = `
  <section class="cc-intcat-statewright" data-id="statewright" aria-label="Statewright AI website integration">
    <div class="cc-intcat-head"><strong>Statewright AI</strong><span class="cc-intcat-pill">Website handoff</span></div>
    <p>View your workflow runs and transition history on Statewright's website. Statewright handles sign-in and run data. FailSafe does not read Statewright history or enforce Statewright workflows.</p>
    <div class="cc-intcat-actions">
      <a class="cc-intcat-web-link" href="${STATEWRIGHT_RUNS_URL}" target="_blank" rel="noopener noreferrer">Open Statewright Run History</a>
      <span class="cc-intcat-web-url">${STATEWRIGHT_RUNS_URL}</span>
    </div>
  </section>`;
