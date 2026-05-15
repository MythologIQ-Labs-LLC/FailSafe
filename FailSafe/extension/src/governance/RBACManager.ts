import type { CheckpointDb } from "../shared/types/database";

type Role = 'admin' | 'developer' | 'viewer';
type Permission = 'read' | 'write' | 'approve' | 'configure' | 'export';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ['read', 'write', 'approve', 'configure', 'export'],
  developer: ['read', 'write'],
  viewer: ['read'],
};

export class RBACManager {
  private assignments = new Map<string, { agentDid: string; role: Role; assignedAt: string }>();
  private db: CheckpointDb = null;

  /** Deferred setter — called from main.ts after bootstrapQorLogic provides ledgerManager */
  setDatabase(db: CheckpointDb): void {
    this.db = db;
    this.loadFromDb();
  }

  private loadFromDb(): void {
    if (!this.db) return;
    try {
      const rows = this.db.prepare(
        "SELECT agent_did, role, assigned_at FROM agent_rbac"
      ).all() as Array<{ agent_did: string; role: string; assigned_at: string }>;
      for (const r of rows) {
        this.assignments.set(r.agent_did, {
          agentDid: r.agent_did, role: r.role as Role, assignedAt: r.assigned_at,
        });
      }
    } catch { /* table may not exist yet */ }
  }

  assign(agentDid: string, role: Role): void {
    const assignedAt = new Date().toISOString();
    this.assignments.set(agentDid, { agentDid, role, assignedAt });
    if (!this.db) return;
    try {
      this.db.prepare(
        "INSERT OR REPLACE INTO agent_rbac (agent_did, role, assigned_at) VALUES (?, ?, ?)"
      ).run(agentDid, role, assignedAt);
    } catch { /* non-fatal */ }
  }

  getRole(agentDid: string): Role | undefined {
    return this.assignments.get(agentDid)?.role;
  }

  hasPermission(agentDid: string, permission: Permission): boolean {
    const a = this.assignments.get(agentDid);
    if (!a) return false;
    return ROLE_PERMISSIONS[a.role].includes(permission);
  }

  getAllAssignments(): Array<{ agentDid: string; role: Role; assignedAt: string }> {
    return Array.from(this.assignments.values());
  }
}
