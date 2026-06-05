/**
 * tracker-manifest-command — registers `failsafe.generateTrackerManifest` (GH #174).
 *
 * Scaffolds a Development Tracker planning manifest (docs/roadmap/programs.yaml)
 * from the repo's merged PRs + CHANGELOG (+ Bicameral decisions when connected),
 * so a repo without a hand-authored manifest gets a real, detailed tracker
 * (programs, phases, verticals, decisions) instead of a bare timeline.
 *
 * Programs and verticals are a TAXONOMY — a human judgment about how THIS operator
 * slices their work, which the machine can only guess at from commit scopes. So
 * the generated programs/verticals are routed through an interactive confirm step
 * (keep / drop / rename / fold) before the file is written: the categorical
 * decision belongs to the operator, not the heuristic. The output is an explicitly
 * -labelled DRAFT. Never overwrites an existing manifest without confirmation.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { gatherManifestSources, gatherBicameralBriefs } from '../roadmap/tracker/manifest-sources';
import { generateTrackerManifest } from '../roadmap/tracker/manifest-generator';
import { enrichManifestWithBicameral } from '../roadmap/tracker/manifest-bicameral';
import { applyCategoryDecisions } from '../roadmap/tracker/manifest-categorize';
import type { CategoryDecisions } from '../roadmap/tracker/manifest-categorize';
import type { TrackerManifest } from '../roadmap/tracker/tracker-model';
import type { BicameralMcpClient } from '../integrations/bicameral';

/** QuickPick item carrying the underlying category key. */
interface KeyedPick extends vscode.QuickPickItem { key: string }

/**
 * Interactive operator-decision step (GH #174). Routes the generated program +
 * vertical taxonomy through keep/drop/rename/fold pickers. Returns the collected
 * decisions, or `null` if the operator cancelled (escaped a required picker) — in
 * which case the caller writes nothing. The fast path is two Enter presses: every
 * category is pre-checked, and the rename steps default to "skip".
 */
export async function collectCategoryDecisions(m: TrackerManifest): Promise<CategoryDecisions | null> {
  const programs = m.programs ?? [];
  const phases = m.phases ?? [];
  const verticals = m.verticals ?? [];
  const phaseCount = (key: string): number => phases.filter((p) => p.prog === key).length;

  // --- Programs: keep / drop -------------------------------------------------
  let keptPrograms: Array<{ key: string; name: string }> = programs.map((p) => ({ key: p.key, name: p.name }));
  const folds: Array<{ from: string; into: string }> = [];

  if (programs.length) {
    const progItems: KeyedPick[] = programs.map((p) => ({
      label: p.name, description: `${phaseCount(p.key)} phase(s) · key: ${p.key}`, picked: true, key: p.key,
    }));
    const keptPick = await vscode.window.showQuickPick(progItems, {
      canPickMany: true,
      title: 'Tracker programs — your call. Uncheck any to drop.',
      placeHolder: 'These are guesses from commit scopes. Confirm the categories YOU track by.',
    });
    if (!keptPick) return null; // cancelled
    const keptKeys = new Set(keptPick.map((i) => i.key));
    const dropped = programs.filter((p) => !keptKeys.has(p.key));

    // For each dropped program with phases, the operator picks where they go.
    for (const dropProg of dropped) {
      if (phaseCount(dropProg.key) === 0) { folds.push({ from: dropProg.key, into: 'other' }); continue; }
      const targets: KeyedPick[] = [
        ...keptPick.map((i) => ({ label: i.label, key: i.key })),
        { label: 'Other (uncategorized)', key: 'other' },
      ];
      const target = await vscode.window.showQuickPick(targets, {
        title: `Fold ${phaseCount(dropProg.key)} phase(s) from dropped “${dropProg.name}” into…`,
        placeHolder: 'Where should these phases be tracked?',
      });
      if (!target) return null; // cancelled
      folds.push({ from: dropProg.key, into: target.key });
    }

    // Optional rename of kept programs (skipping is the default).
    const renameSel = await vscode.window.showQuickPick(
      keptPick.map((i) => ({ label: i.label, description: 'pick to rename', key: i.key } as KeyedPick)),
      { canPickMany: true, title: 'Rename any kept programs? (or press Enter to skip)', placeHolder: 'Leave all unchecked to keep the suggested names.' },
    );
    const renames = new Map<string, string>();
    for (const r of renameSel ?? []) {
      const nn = await vscode.window.showInputBox({ value: r.label, prompt: `New name for program “${r.label}”` });
      if (nn && nn.trim()) renames.set(r.key, nn.trim());
    }
    keptPrograms = keptPick.map((i) => ({ key: i.key, name: renames.get(i.key) ?? i.label }));
  }

  // --- Verticals: keep / drop ------------------------------------------------
  let keptVerticals: Array<{ key: string; name: string }> = verticals.map((v) => ({ key: v.key, name: v.name }));
  if (verticals.length) {
    const vItems: KeyedPick[] = verticals.map((v) => ({ label: v.name, description: `key: ${v.key}`, picked: true, key: v.key }));
    const vPick = await vscode.window.showQuickPick(vItems, {
      canPickMany: true,
      title: 'Tracker verticals — uncheck any that don’t match how you slice the product.',
      placeHolder: 'Capability / area groupings — your call.',
    });
    if (!vPick) return null; // cancelled
    const vRenameSel = await vscode.window.showQuickPick(
      vPick.map((i) => ({ label: i.label, description: 'pick to rename', key: i.key } as KeyedPick)),
      { canPickMany: true, title: 'Rename any kept verticals? (or press Enter to skip)' },
    );
    const vRenames = new Map<string, string>();
    for (const r of vRenameSel ?? []) {
      const nn = await vscode.window.showInputBox({ value: r.label, prompt: `New name for vertical “${r.label}”` });
      if (nn && nn.trim()) vRenames.set(r.key, nn.trim());
    }
    keptVerticals = vPick.map((i) => ({ key: i.key, name: vRenames.get(i.key) ?? i.label }));
  }

  return { programs: keptPrograms, folds, verticals: keptVerticals };
}

export function registerGenerateTrackerManifestCommand(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  /** Layer 3: resolve the live Bicameral client (null when not connected). */
  getBicameralClient: () => BicameralMcpClient | null = () => null,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('failsafe.generateTrackerManifest', async () => {
      const target = path.join(workspaceRoot, 'docs', 'roadmap', 'programs.yaml');
      if (fs.existsSync(target)) {
        const choice = await vscode.window.showWarningMessage(
          'docs/roadmap/programs.yaml already exists. Overwrite it with a freshly generated draft?',
          { modal: true },
          'Overwrite',
        );
        if (choice !== 'Overwrite') return;
      }

      const sources = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'FailSafe: gathering merged PRs + CHANGELOG…' },
        async () => gatherManifestSources(workspaceRoot),
      );
      if (!sources.repo) {
        await vscode.window.showWarningMessage('No GitHub origin remote found — cannot generate a tracker manifest from PRs.');
        return;
      }
      if (!sources.prs.length && !sources.changelog.trim()) {
        await vscode.window.showWarningMessage(`No merged PRs (via gh) or CHANGELOG found for ${sources.repo}.`);
        return;
      }

      const base = generateTrackerManifest(sources);
      // Layer 3: deepen with the Bicameral decision graph when connected. This runs
      // BEFORE the operator-confirm step so the operator confirms the FINAL taxonomy
      // (Bicameral-derived verticals when present, CHANGELOG-derived otherwise).
      const briefs = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'FailSafe: enriching from Bicameral decisions (if connected)…' },
        async () => gatherBicameralBriefs(getBicameralClient(), workspaceRoot),
      );
      const enriched = briefs.length;
      const draft = enriched ? enrichManifestWithBicameral(base, briefs) : base;

      // Operator-decision step: programs + verticals are a human taxonomy, not a
      // machine fact. Route them through keep/drop/rename/fold before writing.
      const decisions = await collectCategoryDecisions(draft);
      if (!decisions) return; // operator cancelled — write nothing
      const manifest = applyCategoryDecisions(draft, decisions);

      const banner = '# Generated by FailSafe — "FailSafe: Generate Tracker Manifest" (GH #174).\n'
        + `# A DRAFT from merged PRs + CHANGELOG${enriched ? ' + Bicameral decisions' : ''}, `
        + 'with programs + verticals confirmed by the operator. Review + refine.\n';
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, banner + yaml.dump(manifest, { lineWidth: 120 }), 'utf-8');

      const open = await vscode.window.showInformationMessage(
        `Generated docs/roadmap/programs.yaml — ${manifest.programs?.length ?? 0} programs, `
        + `${manifest.phases?.length ?? 0} phases, ${manifest.verticals?.length ?? 0} verticals`
        + `${enriched ? ', Bicameral-enriched' : ''}. Reload the Development Tracker to see it.`,
        'Open',
      );
      if (open === 'Open') {
        const doc = await vscode.workspace.openTextDocument(target);
        await vscode.window.showTextDocument(doc);
      }
    }),
  );
}
