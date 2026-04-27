/**
 * DashboardRoadmapCard - Mini roadmap visualization for Dashboard.
 * Extracted for Section 4 Razor compliance.
 */

import { Plan, PlanPhase } from '../../../qorelogic/planning/types';
import { escapeHtml } from '../../../shared/utils/htmlSanitizer';

type PlanProgress = { completed: number; total: number; blocked: boolean } | null;

/** Status colors matching RoadmapSvgView */
const STATUS_COLORS: Record<string, string> = {
    completed: 'var(--vscode-charts-green)',
    active: 'var(--vscode-charts-blue)',
    blocked: 'var(--vscode-charts-red)',
    pending: 'var(--vscode-disabledForeground)',
    skipped: 'var(--vscode-charts-orange)'
};

function renderMiniRoadmapSvg(phases: PlanPhase[]): string {
    if (phases.length === 0) return '';
    const total = phases.length;
    const segWidth = 100 / total;
    const rects = phases.map((p, i) => {
        const fill = STATUS_COLORS[p.status] || STATUS_COLORS.pending;
        return `<rect x="${i * segWidth}%" width="${segWidth - 1}%" height="20" fill="${fill}" rx="2"><title>${escapeHtml(p.title)}</title></rect>`;
    }).join('');
    return `<svg class="mini-roadmap" viewBox="0 0 100 24" style="width:100%;height:24px;margin:8px 0;">${rects}</svg>`;
}

export function renderRoadmapCard(
    plan: Plan | null,
    planProgress: PlanProgress
): string {
    if (!plan) {
        return `<div class="card">
            <div class="card-title">Active Plan</div>
            <div style="color: var(--vscode-descriptionForeground); font-style: italic; margin-bottom: 12px;">
                No active plan. Use <code>/qor-plan</code> to create one.
            </div>
            <button class="action-btn secondary" onclick="showPlanningHub()">Open Planning Hub</button>
        </div>`;
    }

    const pct = planProgress
        ? Math.round((planProgress.completed / Math.max(planProgress.total, 1)) * 100)
        : 0;
    const blockedBadge = planProgress?.blocked
        ? ' <span style="background:var(--vscode-charts-red);color:#fff;padding:2px 6px;border-radius:10px;font-size:9px;margin-left:6px;">BLOCKED</span>'
        : '';
    const miniSvg = renderMiniRoadmapSvg(plan.phases);

    return `<div class="card">
        <div class="card-title">Active Plan${blockedBadge}</div>
        <div style="font-weight:600;margin-bottom:8px;">${escapeHtml(plan.title)}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <div style="flex:1;height:6px;background:var(--vscode-progressBar-background);border-radius:4px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:var(--vscode-charts-blue);"></div>
            </div>
            <span style="font-size:11px;color:var(--vscode-descriptionForeground);">${pct}%</span>
        </div>
        ${miniSvg}
        <div style="display:flex;gap:8px;">
            <button class="action-btn" onclick="showPlanningHub()">View Details</button>
            <button class="action-btn secondary" onclick="openRoadmap()">Open in Browser</button>
        </div>
    </div>`;
}
