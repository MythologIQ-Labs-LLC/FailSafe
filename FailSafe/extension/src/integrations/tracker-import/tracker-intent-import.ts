/**
 * tracker-intent-import — the governed path from a fetched Jira or Linear issue
 * to a FailSafe intent draft (#480).
 *
 * The fetched issue is first shown as an unsaved preview document. An intent is
 * created only when the operator approves it in a modal, edits (or accepts) the
 * purpose and, in enforce mode, picks the plan it serves. The draft is written
 * to the canonical IntentService store (no second intent store); its CREATED
 * history entry carries the provenance (source, key, URL, fetch time, source
 * revision time, content hash). Nothing is ever written back to the tracker and
 * nothing is synced.
 *
 * Outcomes (the same words as the catalog and the READMEs):
 *   previewed        fetched and shown; FailSafe saved nothing
 *   draft_created    an intent in PULSE was created from the issue
 *   already_imported the active intent is this issue's draft and it is unchanged
 *   stale            the active intent is this issue's draft but the issue changed
 *   blocked          another intent is active, the history failed its integrity
 *                    check, or the write was refused
 *   not_authorized   integration disabled, no credential, or 401/403 (decided
 *                    by the command before this module runs)
 * `synced` is not offered.
 *
 * Provider text is untrusted: the preview places every provider string inside
 * fenced code blocks whose fence is longer than any backtick run in the text,
 * so the Markdown preview renders no link, image or HTML from it.
 */

import { createHash } from 'crypto';
import type { Intent, IntentType } from '../../governance/types/IntentTypes';
import type { ExternalRefLookup } from '../../governance/IntentService';
import type { JiraIntentPreview } from '../jira/jira-import';
import type { LinearIntentPreview } from '../linear/linear-import';

export type TrackerSource = 'jira' | 'linear';

export type TrackerImportOutcome =
  | 'previewed' | 'draft_created' | 'already_imported' | 'stale' | 'blocked' | 'not_authorized';

export interface TrackerIssue {
  source: TrackerSource;
  key: string;
  title: string;
  url?: string;
  description?: string;
  status?: string;
  priority?: string;
  assignee?: string;
  labels: string[];
  components: string[];
  issueType?: string;
  sourceUpdatedAt?: string;
}

export function fromJiraPreview(p: JiraIntentPreview): TrackerIssue {
  return {
    source: 'jira', key: p.key, title: p.summary, url: p.sourceUrl, description: p.description,
    status: p.status, priority: p.priority, assignee: p.assignee, labels: p.labels, components: p.components,
    issueType: p.issueType, sourceUpdatedAt: p.updated,
  };
}

export function fromLinearPreview(p: LinearIntentPreview): TrackerIssue {
  const priority = (p as LinearIntentPreview & { priorityLabel?: string }).priorityLabel;
  return {
    source: 'linear', key: p.identifier, title: p.title, url: p.url, description: p.description,
    status: p.state, priority, assignee: p.assignee, labels: p.labels, components: [],
    sourceUpdatedAt: p.updatedAt,
  };
}

const SOURCE_NAME: Record<TrackerSource, string> = { jira: 'Jira', linear: 'Linear' };

export const MAX_PURPOSE = 200;

export function externalRefFor(issue: TrackerIssue): string {
  return `${issue.source}:${issue.key}`;
}

/** A fence one backtick longer than the longest backtick run in `text` (at least three). */
export function fenceFor(text: string): string {
  const longest = Math.max(0, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length));
  return '`'.repeat(Math.max(3, longest + 1));
}

function codeBlock(text: string): string {
  const fence = fenceFor(text);
  return `${fence}text\n${text}\n${fence}`;
}

/** The fields that make up the draft's content; their hash detects a changed issue. */
function mappedContent(issue: TrackerIssue): Record<string, unknown> {
  return {
    source: issue.source, key: issue.key, title: issue.title, url: issue.url ?? null,
    description: issue.description ?? null, status: issue.status ?? null, priority: issue.priority ?? null,
    assignee: issue.assignee ?? null, labels: [...issue.labels], components: [...issue.components],
    issueType: issue.issueType ?? null,
  };
}

export function contentHash(issue: TrackerIssue): string {
  return createHash('sha256').update(JSON.stringify(mappedContent(issue)), 'utf8').digest('hex');
}

/** Truncate to the IntentSchema purpose limit without splitting a surrogate pair. */
export function truncatePurpose(text: string): string {
  if (text.length <= MAX_PURPOSE) return text;
  let cut = text.slice(0, MAX_PURPOSE);
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut;
}

export function intentTypeFor(issue: TrackerIssue): IntentType {
  if (issue.source === 'jira') return /^bug$/i.test(issue.issueType ?? '') ? 'bugfix' : 'feature';
  return issue.labels.some((l) => /^bug$/i.test(l)) ? 'bugfix' : 'feature';
}

export function tagsFor(issue: TrackerIssue): string[] {
  const labels = issue.labels
    .map((l) => l.replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 40))
    .filter((l) => /[A-Za-z0-9]/.test(l))
    .slice(0, 10)
    .map((l) => `label:${l}`);
  return [`source:${issue.source}`, ...labels];
}

export function previewMarkdown(issue: TrackerIssue, note?: string): string {
  const name = SOURCE_NAME[issue.source];
  const fields = [
    `Key: ${issue.key}`,
    `Title: ${issue.title}`,
    `Status: ${issue.status ?? '(none)'}`,
    `Priority: ${issue.priority ?? '(none)'}`,
    `Assignee: ${issue.assignee ?? '(none)'}`,
    `Labels: ${issue.labels.length ? issue.labels.join(', ') : '(none)'}`,
    ...(issue.source === 'jira' ? [`Components: ${issue.components.length ? issue.components.join(', ') : '(none)'}`] : []),
    ...(issue.issueType ? [`Type: ${issue.issueType}`] : []),
    `Source URL: ${issue.url ?? '(none)'}`,
    `Updated in ${name}: ${issue.sourceUpdatedAt ?? '(unknown)'}`,
  ].join('\n');
  return [
    `# ${name} issue preview`,
    '',
    'Preview — FailSafe saved nothing. This document is not saved by FailSafe, and nothing is written to ' +
      `${name}. To create a governed intent draft, answer the prompt that follows.`,
    ...(note ? ['', note] : []),
    '',
    '## Issue fields',
    '',
    codeBlock(fields),
    '',
    '## Description',
    '',
    codeBlock(issue.description ?? '(no description)'),
    '',
  ].join('\n');
}

export interface CreateIntentParams {
  type: IntentType;
  purpose: string;
  scope: { files: string[]; modules: string[]; riskGrade: 'L1' };
  planId?: string;
  metadata: { author: string; tags: string[]; externalRef: string };
  provenance: Record<string, unknown>;
}

export interface IntentSink {
  getActiveIntent(): Promise<Intent | null>;
  createIntent(params: CreateIntentParams): Promise<Intent>;
  findCreatedByExternalRef(externalRef: string): Promise<ExternalRefLookup>;
}

export interface ImportReviewUi {
  /** Open the preview as an unsaved, untitled document. */
  showPreview(markdown: string): Promise<void>;
  /** Modal question; true only for an explicit approval. */
  confirmCreate(message: string, detail: string): Promise<boolean>;
  /** Input box prefilled with the purpose; undefined when cancelled. */
  editPurpose(initial: string): Promise<string | undefined>;
  /** Plan picker for enforce mode; undefined when dismissed. */
  pickPlanId(): Promise<string | undefined>;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface TrackerImportDeps {
  intents: IntentSink;
  ui: ImportReviewUi;
  governanceMode: () => string;
  now?: () => Date;
}

export interface TrackerImportResult {
  outcome: TrackerImportOutcome;
  intentId?: string;
}

function dateOf(iso: string): string {
  return iso.slice(0, 10);
}

/** Preview, then create a governed intent draft only with explicit approval. */
export async function reviewAndImport(issue: TrackerIssue, deps: TrackerImportDeps): Promise<TrackerImportResult> {
  const { intents, ui } = deps;
  const name = SOURCE_NAME[issue.source];
  const ref = externalRefFor(issue);
  const hash = contentHash(issue);
  const saidNothing = 'FailSafe saved nothing.';

  const lookup = await intents.findCreatedByExternalRef(ref);
  const priors = lookup.integrity === 'valid' ? lookup.entries : [];
  const last = priors[priors.length - 1];
  const priorNote = last
    ? `Imported before as intent ${last.intentId} on ${dateOf(last.timestamp)}.`
    : undefined;
  await ui.showPreview(previewMarkdown(issue, priorNote));

  if (lookup.integrity === 'invalid') {
    ui.error(`The intent history failed its integrity check, so FailSafe did not create a draft for ${issue.key}. Nothing was saved.`);
    return { outcome: 'blocked' };
  }

  const active = await intents.getActiveIntent();
  if (active && active.metadata.externalRef === ref) {
    const importedHash = last && typeof last.provenance.contentSha256 === 'string' ? last.provenance.contentSha256 : undefined;
    if (importedHash && importedHash !== hash) {
      ui.warn(`${issue.key} changed in ${name} since it was imported on ${dateOf(last!.timestamp)}. FailSafe does not update intents from ${name}; review the preview. ${saidNothing}`);
      return { outcome: 'stale', intentId: active.id };
    }
    ui.info(`${issue.key} is already the active intent (${active.id}) and has not changed. ${saidNothing}`);
    return { outcome: 'already_imported', intentId: active.id };
  }
  if (active) {
    ui.warn(`Intent "${active.purpose}" is active. Seal it before importing another issue. ${saidNothing}`);
    return { outcome: 'blocked' };
  }

  const type = intentTypeFor(issue);
  const tags = tagsFor(issue);
  const detail = [
    'FailSafe will store, in this workspace\'s intent store:',
    `- purpose (you can edit it next), type ${type}, risk L1, no file scope`,
    `- tags: ${tags.join(', ')}`,
    `- source reference ${ref}, the source URL, the fetch time, the ${name} updated time and a hash of the fields shown`,
    'The description is not copied, no credential is stored, and nothing is written to ' + `${name}. The draft is not synced.`,
    ...(last ? [`${issue.key} was imported before as intent ${last.intentId} on ${dateOf(last.timestamp)}; that intent is sealed. This creates a new draft.`] : []),
  ].join('\n');
  if (!(await ui.confirmCreate(`Create a governed intent draft from ${issue.key}?`, detail))) {
    ui.info(`Previewed ${issue.key}. ${saidNothing}`);
    return { outcome: 'previewed' };
  }

  const edited = await ui.editPurpose(truncatePurpose(`${issue.key} — ${issue.title}`));
  const purpose = edited?.trim();
  if (!purpose) {
    ui.info(`Previewed ${issue.key}. ${saidNothing}`);
    return { outcome: 'previewed' };
  }
  if (purpose.length > MAX_PURPOSE) {
    ui.warn(`The purpose is longer than ${MAX_PURPOSE} characters. ${saidNothing}`);
    return { outcome: 'previewed' };
  }

  let planId: string | undefined;
  if (deps.governanceMode() === 'enforce') {
    planId = await ui.pickPlanId();
    if (!planId) {
      ui.info(`No plan was selected for ${issue.key}. ${saidNothing}`);
      return { outcome: 'previewed' };
    }
  }

  const fetchedAt = (deps.now?.() ?? new Date()).toISOString();
  const provenance: Record<string, unknown> = {
    source: issue.source, key: issue.key, externalRef: ref, url: issue.url ?? null, fetchedAt,
    sourceUpdatedAt: issue.sourceUpdatedAt ?? null, contentSha256: hash,
    mappedFields: ['purpose', 'type', 'tags', 'externalRef'],
    ...(last ? { reimportOf: last.intentId } : {}),
  };
  let created: Intent;
  try {
    created = await intents.createIntent({
      type, purpose, scope: { files: [], modules: [], riskGrade: 'L1' }, planId,
      metadata: { author: 'user', tags, externalRef: ref }, provenance,
    });
  } catch (e) {
    ui.error(`Intent draft not created from ${issue.key}: ${e instanceof Error ? e.message : String(e)}. ${saidNothing}`);
    return { outcome: 'blocked' };
  }
  const readBack = await intents.getActiveIntent();
  if (!readBack || readBack.id !== created.id || readBack.metadata.externalRef !== ref) {
    ui.error(`The intent draft for ${issue.key} could not be read back from the intent store.`);
    return { outcome: 'blocked' };
  }
  ui.info(`Created intent draft ${created.id} (PULSE) from ${issue.key}. It is not synced: changes in ${name} do not update it.`);
  return { outcome: 'draft_created', intentId: created.id };
}

/** What governance supplies to the commands: the intent store, the mode and the plan picker. */
export type TrackerIntentDeps = Omit<TrackerImportDeps, 'ui'> & { pickPlanId: () => Promise<string | undefined> };

/** For a fetch that found no issue: name the earlier import of that key, if any. */
export async function describeEarlierImport(intents: IntentSink, externalRef: string): Promise<string | undefined> {
  const lookup = await intents.findCreatedByExternalRef(externalRef);
  if (lookup.integrity !== 'valid' || lookup.entries.length === 0) return undefined;
  const last = lookup.entries[lookup.entries.length - 1];
  return `It was imported as intent ${last.intentId} on ${dateOf(last.timestamp)}; that intent is unchanged.`;
}

let trackerDeps: TrackerIntentDeps | null = null;

/** Installed once governance has started (wireIntegrationEvidence); null until then. */
export function setTrackerIntentDeps(deps: TrackerIntentDeps | null): void {
  trackerDeps = deps;
}

export function getTrackerIntentDeps(): TrackerIntentDeps | null {
  return trackerDeps;
}

export const DRAFTS_UNAVAILABLE = 'Intent drafts are not available yet; FailSafe saved nothing.';
