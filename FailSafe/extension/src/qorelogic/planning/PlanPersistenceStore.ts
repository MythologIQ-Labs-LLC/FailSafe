/**
 * PlanPersistenceStore - Owns plans.yaml load/save and the in-memory event log.
 *
 * Plans themselves are derived from the event log by PlanStateDeriver; this
 * store only persists the event stream keyed by planId.
 */
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { PlanEvent } from './PlanManager';

export class PlanPersistenceStore {
  private events: Map<string, PlanEvent[]> = new Map();
  private readonly storagePath: string;

  constructor(workspaceRoot: string) {
    this.storagePath = path.join(workspaceRoot, '.failsafe', 'plans.yaml');
    this.refresh();
  }

  refresh(): void {
    this.events = new Map();
    if (!fs.existsSync(this.storagePath)) { return; }
    try {
      const content = fs.readFileSync(this.storagePath, 'utf8');
      const data = yaml.load(content) as { events: Record<string, PlanEvent[]> } | null;
      if (data?.events) {
        for (const [planId, planEvents] of Object.entries(data.events)) {
          this.events.set(planId, planEvents);
        }
      }
    } catch { /* Ignore load errors */ }
  }

  getEvents(planId: string): PlanEvent[] {
    return this.events.get(planId) || [];
  }

  getAllPlanIds(): string[] {
    return Array.from(this.events.keys());
  }

  appendEvent(planId: string, event: PlanEvent): void {
    if (!this.events.has(planId)) { this.events.set(planId, []); }
    this.events.get(planId)!.push(event);
    this.save();
  }

  private save(): void {
    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    const data = { events: Object.fromEntries(this.events) };
    fs.writeFileSync(this.storagePath, yaml.dump(data), 'utf8');
  }
}
