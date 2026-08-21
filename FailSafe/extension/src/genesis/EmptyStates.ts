import { escapeHtml } from '../shared/utils/htmlSanitizer';

type EmptyStateType = 'no-workspace' | 'no-runs' | 'no-skills' | 'no-failures' | 'shadow-genome-unavailable';

const EMPTY_STATE_MESSAGES: Record<EmptyStateType, { title: string; message: string }> = {
  'no-workspace': {
    title: 'No Workspace',
    message: 'Open a workspace folder to begin.',
  },
  'no-runs': {
    title: 'No Plans',
    message: 'No governance plans found. Create an intent to get started.',
  },
  'no-skills': {
    title: 'No Skills Installed',
    message: 'No skills registered in the skill registry.',
  },
  'no-failures': {
    title: 'No Failures',
    message: 'The Shadow Genome has no recorded failure patterns.',
  },
  'shadow-genome-unavailable': {
    title: 'Shadow Genome Unavailable',
    message: 'The Shadow Genome could not be read. This is not the same as having no recorded failures.',
  },
};

/**
 * `detail`, when given, is rendered as an extra escaped paragraph — used to
 * carry a specific, non-static reason (e.g. a schema-version mismatch) that
 * the static per-type message above cannot express.
 */
export function renderEmptyState(type: EmptyStateType, detail?: string): string {
  const state = EMPTY_STATE_MESSAGES[type];
  const detailHtml = detail ? `<p class="detail">${escapeHtml(detail)}</p>` : '';
  return `<!DOCTYPE html><html><head><title>${state.title}</title></head><body>
    <h1>${state.title}</h1>
    <p>${state.message}</p>
    ${detailHtml}
    <a href="/console/home">Back to Dashboard</a>
  </body></html>`;
}
