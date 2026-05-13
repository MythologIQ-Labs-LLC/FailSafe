/** PlanManager facade - orchestrates PlanPersistenceStore, RoadmapPersistenceStore, PlanStateDeriver. */
import * as crypto from 'crypto';
import { Plan, PlanPhase, Blocker, Milestone, RiskLevel, RiskMarker, Sprint, CumulativeRoadmap } from './types';
import { EventBus } from '../../shared/EventBus';
import { PlanPersistenceStore } from './PlanPersistenceStore';
import { RoadmapPersistenceStore } from './RoadmapPersistenceStore';
import { deriveState, calculateSprintMetrics } from './PlanStateDeriver';

export type PlanEventType =
  | 'plan.created' | 'artifact.touched' | 'blocker.added'
  | 'blocker.resolved' | 'blocker.approval.requested' | 'phase.skipped' | 'phase.started'
  | 'milestone.added' | 'milestone.completed' | 'risk.identified' | 'risk.updated'
  | 'sprint.started' | 'sprint.completed' | 'sprint.archived';

export interface PlanEvent {
  id: string;
  planId: string;
  type: PlanEventType;
  timestamp: string;
  payload: Record<string, unknown>;
}

type SprintEventType = 'sprint.started' | 'sprint.completed' | 'sprint.archived';

function now(): string { return new Date().toISOString(); }
function generateId(): string { return crypto.randomUUID(); }

export class PlanManager {
  private plans: Map<string, Plan> = new Map();
  private readonly eventBus: EventBus;
  private readonly planStore: PlanPersistenceStore;
  private readonly roadmapStore: RoadmapPersistenceStore;

  constructor(workspaceRoot: string, eventBus: EventBus) {
    this.eventBus = eventBus;
    this.planStore = new PlanPersistenceStore(workspaceRoot);
    this.roadmapStore = new RoadmapPersistenceStore(workspaceRoot);
    for (const planId of this.planStore.getAllPlanIds()) {
      this.deriveState(planId);
    }
  }

  createPlan(intentId: string, title: string, phases: PlanPhase[]): Plan {
    const planId = generateId();
    this.emit(planId, 'plan.created', { intentId, title, phases });
    return this.getPlan(planId)!;
  }

  recordArtifactTouch(
    planId: string, phaseId: string, artifactPath: string,
    op: 'write' | 'create' | 'delete' | 'rename'
  ): void {
    this.emit(planId, 'artifact.touched', { phaseId, path: artifactPath, op });
  }

  addBlocker(planId: string, phaseId: string, reason: string): void {
    this.emit(planId, 'blocker.added', { blockerId: generateId(), phaseId, reason });
  }

  resolveBlocker(planId: string, blockerId: string): void {
    this.emit(planId, 'blocker.resolved', { blockerId });
  }

  requestBlockerApproval(planId: string, blockerId: string): void {
    const blocker = this.getBlocker(planId, blockerId);
    if (!blocker) { return; }
    this.emit(planId, 'blocker.approval.requested', { blockerId, phaseId: blocker.phaseId });
  }

  takeDetour(planId: string, blockerId: string): void {
    const blocker = this.getBlocker(planId, blockerId);
    if (!blocker || !blocker.detourPhaseId) { return; }
    this.emit(planId, 'phase.skipped', { phaseId: blocker.phaseId, reason: 'detour' });
    this.emit(planId, 'phase.started', { phaseId: blocker.detourPhaseId });
  }

  addMilestone(planId: string, phaseId: string, title: string, targetDate?: string, icon?: string): void {
    this.emit(planId, 'milestone.added', { milestoneId: generateId(), phaseId, title, targetDate, icon });
  }

  completeMilestone(planId: string, milestoneId: string): void {
    this.emit(planId, 'milestone.completed', { milestoneId });
  }

  getMilestones(planId: string): Milestone[] {
    return this.plans.get(planId)?.milestones || [];
  }

  identifyRisk(
    planId: string, phaseId: string, title: string,
    level: RiskLevel, description: string, mitigations?: string[]
  ): void {
    this.emit(planId, 'risk.identified', {
      riskId: generateId(), phaseId, title, level, description, mitigations: mitigations || []
    });
  }

  updateRisk(planId: string, riskId: string, level: RiskLevel, description?: string): void {
    this.emit(planId, 'risk.updated', { riskId, level, description });
  }

  getRisks(planId: string): RiskMarker[] {
    return this.plans.get(planId)?.risks || [];
  }

  getAllPlans(): Plan[] {
    return Array.from(this.plans.values());
  }

  getAllSprints(): Sprint[] {
    return this.roadmapStore.getRoadmap()?.sprints || [];
  }

  getCurrentSprint(): Sprint | undefined {
    return this.roadmapStore.getRoadmap()?.sprints.find(s => s.status === 'active');
  }

  getSprint(sprintId: string): Sprint | undefined {
    return this.roadmapStore.getRoadmap()?.sprints.find(s => s.id === sprintId);
  }

  startSprint(name: string, planId: string): Sprint {
    const currentSprint = this.getCurrentSprint();
    if (currentSprint) { this.archiveSprint(currentSprint.id); }

    const sprint: Sprint = {
      id: generateId(), name, planId, status: 'active', startedAt: now(),
      metrics: {
        phasesPlanned: 0, phasesCompleted: 0, phasesSkipped: 0,
        blockersEncountered: 0, blockersResolved: 0,
        risksIdentified: 0, milestonesAchieved: 0
      }
    };
    this.appendSprintEvent('sprint.started', sprint as unknown as Record<string, unknown>);
    return sprint;
  }

  completeSprint(sprintId: string): void {
    this.appendSprintEvent('sprint.completed', { sprintId });
  }

  archiveSprint(sprintId: string): void {
    const sprint = this.getSprint(sprintId);
    if (!sprint) { return; }
    if (sprint.status === 'active') { this.completeSprint(sprintId); }
    this.appendSprintEvent('sprint.archived', { sprintId });
  }

  getPlan(planId: string): Plan | undefined { return this.plans.get(planId); }

  getActivePlan(): Plan | undefined {
    for (const plan of this.plans.values()) {
      if (plan.phases.some(p => p.status === 'active')) { return plan; }
    }
    return undefined;
  }

  getPlanProgress(planId: string): { completed: number; total: number; blocked: boolean } {
    const plan = this.plans.get(planId);
    if (!plan) { return { completed: 0, total: 0, blocked: false }; }
    return {
      completed: plan.phases.filter(p => p.status === 'completed').length,
      total: plan.phases.length,
      blocked: plan.blockers.some(b => !b.resolvedAt)
    };
  }

  private getBlocker(planId: string, blockerId: string): Blocker | undefined {
    return this.plans.get(planId)?.blockers.find(b => b.id === blockerId);
  }

  private emit(planId: string, type: PlanEventType, payload: Record<string, unknown>): void {
    const event: PlanEvent = { id: generateId(), planId, type, timestamp: now(), payload };
    this.planStore.appendEvent(planId, event);
    this.deriveState(planId);
    this.eventBus.emit('genesis.streamEvent' as never, { planEvent: event });
  }

  private deriveState(planId: string): void {
    const plan = deriveState(this.planStore.getEvents(planId));
    if (plan) { this.plans.set(planId, plan); }
  }

  private appendSprintEvent(type: SprintEventType, payload: Record<string, unknown>): void {
    const roadmap = this.roadmapStore.ensureRoadmap(now());
    this.applySprintEvent(roadmap, type, payload);
    roadmap.updatedAt = now();
    this.roadmapStore.save();
    this.eventBus.emit('genesis.streamEvent' as never, { sprintEvent: { type, payload } });
  }

  private applySprintEvent(roadmap: CumulativeRoadmap, type: SprintEventType, payload: Record<string, unknown>): void {
    if (type === 'sprint.started') {
      const sprint = payload as unknown as Sprint;
      roadmap.sprints.push(sprint);
      roadmap.currentSprintId = sprint.id;
      return;
    }
    const sprint = roadmap.sprints.find(s => s.id === payload.sprintId);
    if (sprint && type === 'sprint.completed') {
      sprint.status = 'completed';
      sprint.completedAt = now();
      sprint.metrics = calculateSprintMetrics(this.getPlan(sprint.planId));
    } else if (sprint && type === 'sprint.archived') {
      if (!sprint.completedAt) { sprint.completedAt = now(); }
      sprint.metrics = calculateSprintMetrics(this.getPlan(sprint.planId));
      sprint.status = 'archived';
      sprint.archivedAt = now();
    }
    if (roadmap.currentSprintId === payload.sprintId) { roadmap.currentSprintId = null; }
  }
}
