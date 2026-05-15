/**
 * RoadmapPersistenceStore - Owns roadmap.yaml load/save.
 *
 * Holds the CumulativeRoadmap aggregate (sprints + currentSprintId) and
 * persists it to .qorelogic/roadmap.yaml. Mutations are made via direct
 * accessors; callers invoke save() after mutating.
 */
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CumulativeRoadmap } from './types';

export class RoadmapPersistenceStore {
  private roadmap: CumulativeRoadmap | null = null;
  private readonly roadmapPath: string;

  constructor(workspaceRoot: string) {
    this.roadmapPath = path.join(workspaceRoot, '.qorelogic', 'roadmap.yaml');
    this.refresh();
  }

  refresh(): void {
    this.roadmap = null;
    if (!fs.existsSync(this.roadmapPath)) { return; }
    try {
      const content = fs.readFileSync(this.roadmapPath, 'utf8');
      const data = yaml.load(content) as CumulativeRoadmap | null;
      if (data) { this.roadmap = data; }
    } catch { /* Ignore load errors */ }
  }

  getRoadmap(): CumulativeRoadmap | null {
    return this.roadmap;
  }

  /**
   * Lazily create the roadmap aggregate with FailSafe defaults if missing.
   * Returns the (now non-null) roadmap.
   */
  ensureRoadmap(timestamp: string): CumulativeRoadmap {
    if (!this.roadmap) {
      this.roadmap = {
        projectId: crypto.randomUUID(),
        projectName: 'FailSafe',
        sprints: [],
        currentSprintId: null,
        createdAt: timestamp,
        updatedAt: timestamp
      };
    }
    return this.roadmap;
  }

  save(): void {
    if (!this.roadmap) { return; }
    const dir = path.dirname(this.roadmapPath);
    if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
    fs.writeFileSync(this.roadmapPath, yaml.dump(this.roadmap), 'utf8');
  }
}
