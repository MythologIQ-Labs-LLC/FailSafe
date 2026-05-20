// BicameralMcpClient parsers + runtime guards.
// Extracted from BicameralMcpClient.ts to keep that file under the Section 4
// razor when Phase 1 adds 11 deferred-tool wrappers.
//
// MCP results come back as either structuredContent (when server emits JSON)
// or content[].text (when server emits text blocks). Bicameral tools generally
// return JSON via content[0].text — we parse defensively.

import type {
  BicameralDecision,
  BicameralDriftStatus,
  BicameralFeatureBrief,
  BicameralPreflightResult,
} from './types';

export interface ToolCallResult {
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export function parseJsonContent(result: ToolCallResult): unknown {
  if (result.structuredContent !== undefined) return result.structuredContent;
  const first = result.content?.[0];
  if (!first || typeof first.text !== 'string') return null;
  try { return JSON.parse(first.text); } catch { return null; }
}

export function parseFeatureBriefs(result: ToolCallResult): BicameralFeatureBrief[] {
  const raw = parseJsonContent(result);
  if (!raw || typeof raw !== 'object') return [];
  const features = (raw as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];
  return features.filter((f): f is BicameralFeatureBrief => {
    return !!f && typeof f === 'object'
      && typeof (f as BicameralFeatureBrief).feature === 'string'
      && Array.isArray((f as BicameralFeatureBrief).decisions);
  });
}

export function parsePreflightResult(result: ToolCallResult): BicameralPreflightResult {
  const raw = parseJsonContent(result);
  const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  return {
    priorDecisions: asDecisionArray(obj.prior_decisions),
    drifted: asDriftArray(obj.drifted),
    openQuestions: asDecisionArray(obj.open_questions),
  };
}

export function parseDriftStatuses(result: ToolCallResult): BicameralDriftStatus[] {
  const raw = parseJsonContent(result);
  if (!raw || typeof raw !== 'object') return [];
  return asDriftArray((raw as { drift?: unknown }).drift);
}

function asDecisionArray(v: unknown): BicameralDecision[] {
  return Array.isArray(v)
    ? v.filter((d) => !!d && typeof d === 'object') as BicameralDecision[]
    : [];
}

function asDriftArray(v: unknown): BicameralDriftStatus[] {
  return Array.isArray(v)
    ? v.filter((d) => !!d && typeof d === 'object') as BicameralDriftStatus[]
    : [];
}

// ── Runtime guards for the 11 deferred tools ───────────────────────────────
// All deferred-tool wrappers parse via parseJsonContent then funnel through a
// per-tool guard that confirms the top-level shape matches the documented
// upstream v0.14 response. Each guard accepts the loose `unknown` from
// parseJsonContent and narrows to the specific result type.

import type {
  BicameralIngestResult,
  BicameralSearchResult,
  BicameralBriefResult,
  BicameralJudgeGapsResult,
  BicameralResolveComplianceResult,
  BicameralLinkCommitResult,
  BicameralUpdateResult,
  BicameralResetResult,
  BicameralDashboardResult,
  BicameralValidateSymbolsResult,
  BicameralGetNeighborsResult,
} from './types';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

export function isIngestResult(v: unknown): v is BicameralIngestResult {
  return isPlainObject(v) && typeof v.ingested === 'number';
}

export function isSearchResult(v: unknown): v is BicameralSearchResult {
  return isPlainObject(v) && Array.isArray(v.results);
}

export function isBriefResult(v: unknown): v is BicameralBriefResult {
  return isPlainObject(v) && typeof v.brief === 'string';
}

export function isJudgeGapsResult(v: unknown): v is BicameralJudgeGapsResult {
  return isPlainObject(v) && Array.isArray(v.gaps);
}

export function isResolveComplianceResult(v: unknown): v is BicameralResolveComplianceResult {
  return isPlainObject(v) && typeof v.resolved === 'boolean';
}

export function isLinkCommitResult(v: unknown): v is BicameralLinkCommitResult {
  return isPlainObject(v) && typeof v.linked === 'boolean';
}

export function isUpdateResult(v: unknown): v is BicameralUpdateResult {
  return isPlainObject(v) && typeof v.updated === 'boolean';
}

export function isResetResult(v: unknown): v is BicameralResetResult {
  return isPlainObject(v) && typeof v.reset === 'boolean';
}

export function isDashboardResult(v: unknown): v is BicameralDashboardResult {
  return isPlainObject(v);
}

export function isValidateSymbolsResult(v: unknown): v is BicameralValidateSymbolsResult {
  return isPlainObject(v) && Array.isArray(v.invalid);
}

export function isGetNeighborsResult(v: unknown): v is BicameralGetNeighborsResult {
  return isPlainObject(v) && Array.isArray(v.neighbors);
}
