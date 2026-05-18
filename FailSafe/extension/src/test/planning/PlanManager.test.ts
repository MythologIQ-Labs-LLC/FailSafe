import { describe, it, beforeEach, afterEach } from 'mocha';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PlanManager } from '../../qorelogic/planning/PlanManager';
import { EventBus } from '../../shared/EventBus';
import { PlanPhase } from '../../qorelogic/planning/types';
import { detectDependencyCycles, topologicalSort } from '../../qorelogic/planning/validation';

describe('PlanManager', function () {
  this.timeout(10000);
  let planManager: PlanManager;
  let eventBus: EventBus;
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for test storage
    tempDir = path.join(os.tmpdir(), 'failsafe-test-' + Date.now() + '-' + Math.random().toString(36).slice(2));
    fs.mkdirSync(tempDir, { recursive: true });
    eventBus = new EventBus();
    planManager = new PlanManager(tempDir, eventBus);
  });

  afterEach(() => {
    // Clean up temp directory
    eventBus.dispose();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // CREATE PLAN TESTS
  // =========================================================================
  describe('createPlan', () => {
    it('should create a plan with phases', () => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Setup',
        description: 'Initial setup',
        status: 'pending',
        progress: 0,
        estimatedScope: 20,
        dependencies: [],
        artifacts: [{ path: 'src/setup.ts', weight: 1 }]
      }];

      // Act
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);

      // Assert
      assert.ok(plan, 'Plan should be created');
      assert.strictEqual(plan.title, 'Test Plan');
      assert.strictEqual(plan.phases.length, 1);
      assert.strictEqual(plan.intentId, 'intent-1');
    });

    it('should create a plan with multiple phases', () => {
      // Arrange
      const phases: PlanPhase[] = [
        {
          id: 'phase-1',
          title: 'Foundation',
          description: 'Build foundation',
          status: 'pending',
          progress: 0,
          estimatedScope: 30,
          dependencies: [],
          artifacts: [{ path: 'src/foundation.ts', weight: 1 }]
        },
        {
          id: 'phase-2',
          title: 'Core Features',
          description: 'Implement core',
          status: 'pending',
          progress: 0,
          estimatedScope: 50,
          dependencies: ['phase-1'],
          artifacts: [{ path: 'src/core.ts', weight: 2 }]
        },
        {
          id: 'phase-3',
          title: 'Polish',
          description: 'Final polish',
          status: 'pending',
          progress: 0,
          estimatedScope: 20,
          dependencies: ['phase-2'],
          artifacts: [{ path: 'src/polish.ts', weight: 1 }]
        }
      ];

      // Act
      const plan = planManager.createPlan('intent-2', 'Multi-Phase Plan', phases);

      // Assert
      assert.strictEqual(plan.phases.length, 3);
      assert.strictEqual(plan.phases[0].dependencies.length, 0);
      assert.strictEqual(plan.phases[1].dependencies[0], 'phase-1');
    });

    it('should generate unique plan IDs', () => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Test',
        description: 'Test phase',
        status: 'pending',
        progress: 0,
        estimatedScope: 10,
        dependencies: [],
        artifacts: []
      }];

      // Act
      const plan1 = planManager.createPlan('intent-1', 'Plan 1', phases);
      const plan2 = planManager.createPlan('intent-2', 'Plan 2', phases);

      // Assert
      assert.ok(plan1.id, 'Plan 1 should have an ID');
      assert.ok(plan2.id, 'Plan 2 should have an ID');
      assert.notStrictEqual(plan1.id, plan2.id, 'Plan IDs should be unique');
    });

    it('should set the first phase as currentPhaseId', () => {
      // Arrange
      const phases: PlanPhase[] = [
        { id: 'first', title: 'First', description: '', status: 'pending', progress: 0, estimatedScope: 10, dependencies: [], artifacts: [] },
        { id: 'second', title: 'Second', description: '', status: 'pending', progress: 0, estimatedScope: 10, dependencies: [], artifacts: [] }
      ];

      // Act
      const plan = planManager.createPlan('intent-1', 'Test', phases);

      // Assert
      assert.strictEqual(plan.currentPhaseId, 'first');
    });
  });

  // =========================================================================
  // DEPENDENCY CYCLE DETECTION TESTS (using validation module)
  // =========================================================================
  describe('dependency cycle detection', () => {
    it('should detect direct dependency cycles', () => {
      // Arrange
      const phases: PlanPhase[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', progress: 0, estimatedScope: 10, dependencies: ['b'], artifacts: [] },
        { id: 'b', title: 'B', description: '', status: 'pending', progress: 0, estimatedScope: 10, dependencies: ['a'], artifacts: [] }
      ];

      // Act
      const cycle = detectDependencyCycles(phases);

      // Assert
      assert.ok(cycle, 'Should detect cycle');
      assert.ok(cycle.includes('a'), 'Cycle should include phase a');
      assert.ok(cycle.includes('b'), 'Cycle should include phase b');
    });

    it('should detect transitive dependency cycles', () => {
      // Arrange
      const phases: PlanPhase[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', progress: 0, estimatedScope: 10, dependencies: ['b'], artifacts: [] },
        { id: 'b', title: 'B', description: '', status: 'pending', progress: 0, estimatedScope: 10, dependencies: ['c'], artifacts: [] },
        { id: 'c', title: 'C', description: '', status: 'pending', progress: 0, estimatedScope: 10, dependencies: ['a'], artifacts: [] }
      ];

      // Act
      const cycle = detectDependencyCycles(phases);

      // Assert
      assert.ok(cycle, 'Should detect transitive cycle');
    });

    it('should return null when no cycles exist', () => {
      // Arrange
      const phases: PlanPhase[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', progress: 0, estimatedScope: 10, dependencies: [], artifacts: [] },
        { id: 'b', title: 'B', description: '', status: 'pending', progress: 0, estimatedScope: 10, dependencies: ['a'], artifacts: [] },
        { id: 'c', title: 'C', description: '', status: 'pending', progress: 0, estimatedScope: 10, dependencies: ['a', 'b'], artifacts: [] }
      ];

      // Act
      const cycle = detectDependencyCycles(phases);

      // Assert
      assert.strictEqual(cycle, null, 'Should not detect cycle in valid DAG');
    });

    it('should throw error on topological sort with cycles', () => {
      // Arrange
      const phases: PlanPhase[] = [
        { id: 'a', title: 'A', description: '', status: 'pending', progress: 0, estimatedScope: 10, dependencies: ['b'], artifacts: [] },
        { id: 'b', title: 'B', description: '', status: 'pending', progress: 0, estimatedScope: 10, dependencies: ['a'], artifacts: [] }
      ];

      // Act & Assert
      assert.throws(
        () => topologicalSort(phases),
        /cycle/i,
        'Should throw error mentioning cycle'
      );
    });
  });

  // =========================================================================
  // PHASE LIFECYCLE TESTS
  // =========================================================================
  describe('phase lifecycle', () => {
    it('should record artifact touches', () => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Development',
        description: 'Development phase',
        status: 'active',
        progress: 0,
        estimatedScope: 20,
        dependencies: [],
        artifacts: [
          { path: 'src/module.ts', weight: 1 },
          { path: 'src/helper.ts', weight: 1 }
        ]
      }];
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);

      // Act
      planManager.recordArtifactTouch(plan.id, 'phase-1', 'src/module.ts', 'write');

      // Assert
      const updatedPlan = planManager.getPlan(plan.id);
      assert.ok(updatedPlan, 'Plan should exist');
      const artifact = updatedPlan.phases[0].artifacts.find(a => a.path === 'src/module.ts');
      assert.ok(artifact, 'Artifact should exist');
      assert.strictEqual(artifact.touched, true, 'Artifact should be marked as touched');
    });

    it('should track phase progress based on artifacts', () => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Development',
        description: 'Development phase',
        status: 'active',
        progress: 0,
        estimatedScope: 20,
        dependencies: [],
        artifacts: [
          { path: 'src/file1.ts', weight: 1, touched: false },
          { path: 'src/file2.ts', weight: 1, touched: false }
        ]
      }];
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);

      // Act
      planManager.recordArtifactTouch(plan.id, 'phase-1', 'src/file1.ts', 'write');

      // Assert
      const updatedPlan = planManager.getPlan(plan.id);
      assert.ok(updatedPlan, 'Plan should exist');
      const touchedCount = updatedPlan.phases[0].artifacts.filter(a => a.touched).length;
      assert.strictEqual(touchedCount, 1, 'One artifact should be touched');
    });

    it('should track multiple artifact operations', () => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Development',
        description: 'Development phase',
        status: 'active',
        progress: 0,
        estimatedScope: 20,
        dependencies: [],
        artifacts: [
          { path: 'src/create.ts', weight: 1 },
          { path: 'src/modify.ts', weight: 1 },
          { path: 'src/delete.ts', weight: 1 }
        ]
      }];
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);

      // Act
      planManager.recordArtifactTouch(plan.id, 'phase-1', 'src/create.ts', 'create');
      planManager.recordArtifactTouch(plan.id, 'phase-1', 'src/modify.ts', 'write');
      planManager.recordArtifactTouch(plan.id, 'phase-1', 'src/delete.ts', 'delete');

      // Assert
      const updatedPlan = planManager.getPlan(plan.id);
      assert.ok(updatedPlan, 'Plan should exist');
      const allTouched = updatedPlan.phases[0].artifacts.every(a => a.touched);
      assert.strictEqual(allTouched, true, 'All artifacts should be touched');
    });
  });

  // =========================================================================
  // BLOCKER TESTS
  // =========================================================================
  describe('blockers', () => {
    it('should add blockers', () => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Development',
        description: 'Development phase',
        status: 'active',
        progress: 0,
        estimatedScope: 20,
        dependencies: [],
        artifacts: []
      }];
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);

      // Act
      planManager.addBlocker(plan.id, 'phase-1', 'Missing API credentials');

      // Assert
      const updatedPlan = planManager.getPlan(plan.id);
      assert.ok(updatedPlan, 'Plan should exist');
      assert.strictEqual(updatedPlan.blockers.length, 1, 'Should have one blocker');
      assert.strictEqual(updatedPlan.blockers[0].reason, 'Missing API credentials');
    });

    it('should set phase status to blocked when blocker is added', () => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Development',
        description: 'Development phase',
        status: 'active',
        progress: 0,
        estimatedScope: 20,
        dependencies: [],
        artifacts: []
      }];
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);

      // Act
      planManager.addBlocker(plan.id, 'phase-1', 'External dependency unavailable');

      // Assert
      const updatedPlan = planManager.getPlan(plan.id);
      assert.ok(updatedPlan, 'Plan should exist');
      assert.strictEqual(updatedPlan.phases[0].status, 'blocked', 'Phase should be blocked');
    });

    it('should resolve blockers', () => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Development',
        description: 'Development phase',
        status: 'active',
        progress: 0,
        estimatedScope: 20,
        dependencies: [],
        artifacts: []
      }];
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);
      planManager.addBlocker(plan.id, 'phase-1', 'Dependency issue');
      const blockedPlan = planManager.getPlan(plan.id);
      const blockerId = blockedPlan!.blockers[0].id;

      // Act
      planManager.resolveBlocker(plan.id, blockerId);

      // Assert
      const updatedPlan = planManager.getPlan(plan.id);
      assert.ok(updatedPlan, 'Plan should exist');
      assert.ok(updatedPlan.blockers[0].resolvedAt, 'Blocker should have resolvedAt timestamp');
    });

    it('should set phase status to active when blocker is resolved', () => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Development',
        description: 'Development phase',
        status: 'active',
        progress: 0,
        estimatedScope: 20,
        dependencies: [],
        artifacts: []
      }];
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);
      planManager.addBlocker(plan.id, 'phase-1', 'Temporary issue');
      const blockedPlan = planManager.getPlan(plan.id);
      const blockerId = blockedPlan!.blockers[0].id;

      // Act
      planManager.resolveBlocker(plan.id, blockerId);

      // Assert
      const updatedPlan = planManager.getPlan(plan.id);
      assert.ok(updatedPlan, 'Plan should exist');
      assert.strictEqual(updatedPlan.phases[0].status, 'active', 'Phase should be active after blocker resolution');
    });

    it('should calculate blocked status correctly', () => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Development',
        description: 'Development phase',
        status: 'active',
        progress: 0,
        estimatedScope: 20,
        dependencies: [],
        artifacts: []
      }];
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);

      // Act - add blocker
      planManager.addBlocker(plan.id, 'phase-1', 'Issue found');
      const progressBlocked = planManager.getPlanProgress(plan.id);

      // Assert
      assert.strictEqual(progressBlocked.blocked, true, 'Should report blocked status');

      // Act - resolve blocker
      const blockedPlan = planManager.getPlan(plan.id);
      planManager.resolveBlocker(plan.id, blockedPlan!.blockers[0].id);
      const progressUnblocked = planManager.getPlanProgress(plan.id);

      // Assert
      assert.strictEqual(progressUnblocked.blocked, false, 'Should report unblocked status after resolution');
    });

    it('should add multiple blockers to a phase', () => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Development',
        description: 'Development phase',
        status: 'active',
        progress: 0,
        estimatedScope: 20,
        dependencies: [],
        artifacts: []
      }];
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);

      // Act
      planManager.addBlocker(plan.id, 'phase-1', 'First issue');
      planManager.addBlocker(plan.id, 'phase-1', 'Second issue');

      // Assert
      const updatedPlan = planManager.getPlan(plan.id);
      assert.ok(updatedPlan, 'Plan should exist');
      assert.strictEqual(updatedPlan.blockers.length, 2, 'Should have two blockers');
    });
  });

  // =========================================================================
  // DETOUR (V2 REMEDIATION) TESTS
  // =========================================================================
  describe('detour (V2 remediation)', () => {
    it('should skip blocked phase when taking detour', () => {
      // Arrange
      const phases: PlanPhase[] = [
        { id: 'phase-1', title: 'Main Path', description: '', status: 'active', progress: 0, estimatedScope: 30, dependencies: [], artifacts: [] },
        { id: 'detour-1', title: 'Detour Path', description: '', status: 'pending', progress: 0, estimatedScope: 20, dependencies: [], artifacts: [] }
      ];
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);

      // Manually create a blocker with detour
      // Note: The PlanManager addBlocker doesn't set detourPhaseId, so we test the takeDetour mechanism
      // by directly modifying the blocker after creation
      planManager.addBlocker(plan.id, 'phase-1', 'Cannot proceed');
      const blockedPlan = planManager.getPlan(plan.id);
      assert.ok(blockedPlan, 'Plan should exist');

      // Manually add detourPhaseId to the blocker for testing
      blockedPlan.blockers[0].detourPhaseId = 'detour-1';

      // For this test to work, we need to get the blockerId from the actual blocker
      const blockerId = blockedPlan.blockers[0].id;

      // Act
      planManager.takeDetour(plan.id, blockerId);

      // Assert
      const updatedPlan = planManager.getPlan(plan.id);
      assert.ok(updatedPlan, 'Plan should exist after detour');
      const mainPhase = updatedPlan.phases.find(p => p.id === 'phase-1');
      assert.strictEqual(mainPhase?.status, 'skipped', 'Main phase should be skipped');
    });

    it('should activate detour phase', () => {
      // Arrange
      const phases: PlanPhase[] = [
        { id: 'phase-1', title: 'Main Path', description: '', status: 'active', progress: 0, estimatedScope: 30, dependencies: [], artifacts: [] },
        { id: 'detour-1', title: 'Detour Path', description: '', status: 'pending', progress: 0, estimatedScope: 20, dependencies: [], artifacts: [] }
      ];
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);

      planManager.addBlocker(plan.id, 'phase-1', 'Critical blocker');
      const blockedPlan = planManager.getPlan(plan.id);
      assert.ok(blockedPlan, 'Plan should exist');

      // Set detour path
      blockedPlan.blockers[0].detourPhaseId = 'detour-1';
      const blockerId = blockedPlan.blockers[0].id;

      // Act
      planManager.takeDetour(plan.id, blockerId);

      // Assert
      const updatedPlan = planManager.getPlan(plan.id);
      assert.ok(updatedPlan, 'Plan should exist after detour');
      const detourPhase = updatedPlan.phases.find(p => p.id === 'detour-1');
      assert.strictEqual(detourPhase?.status, 'active', 'Detour phase should be active');
    });

    it('should update currentPhaseId to detour phase', () => {
      // Arrange
      const phases: PlanPhase[] = [
        { id: 'phase-1', title: 'Main Path', description: '', status: 'active', progress: 0, estimatedScope: 30, dependencies: [], artifacts: [] },
        { id: 'detour-1', title: 'Detour Path', description: '', status: 'pending', progress: 0, estimatedScope: 20, dependencies: [], artifacts: [] }
      ];
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);

      planManager.addBlocker(plan.id, 'phase-1', 'Blocker');
      const blockedPlan = planManager.getPlan(plan.id);
      blockedPlan!.blockers[0].detourPhaseId = 'detour-1';

      // Act
      planManager.takeDetour(plan.id, blockedPlan!.blockers[0].id);

      // Assert
      const updatedPlan = planManager.getPlan(plan.id);
      assert.strictEqual(updatedPlan?.currentPhaseId, 'detour-1', 'Current phase should be detour');
    });

    it('should not take detour if no detourPhaseId is set', () => {
      // Arrange
      const phases: PlanPhase[] = [
        { id: 'phase-1', title: 'Main Path', description: '', status: 'active', progress: 0, estimatedScope: 30, dependencies: [], artifacts: [] }
      ];
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);

      planManager.addBlocker(plan.id, 'phase-1', 'Blocker without detour');
      const blockedPlan = planManager.getPlan(plan.id);
      const blockerId = blockedPlan!.blockers[0].id;

      // Act
      planManager.takeDetour(plan.id, blockerId);

      // Assert - phase should still be blocked (detour had no effect)
      const updatedPlan = planManager.getPlan(plan.id);
      assert.strictEqual(updatedPlan?.phases[0].status, 'blocked', 'Phase should remain blocked when no detour available');
    });
  });

  // =========================================================================
  // PROGRESS CALCULATION TESTS
  // =========================================================================
  describe('progress calculation', () => {
    it('should calculate completed phase count correctly', () => {
      // Arrange
      const phases: PlanPhase[] = [
        { id: 'phase-1', title: 'Phase 1', description: '', status: 'completed', progress: 100, estimatedScope: 30, dependencies: [], artifacts: [] },
        { id: 'phase-2', title: 'Phase 2', description: '', status: 'completed', progress: 100, estimatedScope: 30, dependencies: [], artifacts: [] },
        { id: 'phase-3', title: 'Phase 3', description: '', status: 'active', progress: 50, estimatedScope: 40, dependencies: [], artifacts: [] }
      ];
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);

      // Act
      const progress = planManager.getPlanProgress(plan.id);

      // Assert
      assert.strictEqual(progress.completed, 2, 'Should have 2 completed phases');
      assert.strictEqual(progress.total, 3, 'Should have 3 total phases');
    });

    it('should report blocked status when plan has unresolved blockers', () => {
      // Arrange
      const phases: PlanPhase[] = [
        { id: 'phase-1', title: 'Phase 1', description: '', status: 'active', progress: 0, estimatedScope: 50, dependencies: [], artifacts: [] },
        { id: 'phase-2', title: 'Phase 2', description: '', status: 'pending', progress: 0, estimatedScope: 50, dependencies: [], artifacts: [] }
      ];
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);

      // Act
      planManager.addBlocker(plan.id, 'phase-1', 'Critical issue');
      const progress = planManager.getPlanProgress(plan.id);

      // Assert
      assert.strictEqual(progress.blocked, true, 'Should report blocked when unresolved blockers exist');
    });

    it('should report unblocked status when all blockers are resolved', () => {
      // Arrange
      const phases: PlanPhase[] = [
        { id: 'phase-1', title: 'Phase 1', description: '', status: 'active', progress: 0, estimatedScope: 50, dependencies: [], artifacts: [] }
      ];
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);

      // Add and resolve blocker
      planManager.addBlocker(plan.id, 'phase-1', 'Temporary issue');
      const blockedPlan = planManager.getPlan(plan.id);
      planManager.resolveBlocker(plan.id, blockedPlan!.blockers[0].id);

      // Act
      const progress = planManager.getPlanProgress(plan.id);

      // Assert
      assert.strictEqual(progress.blocked, false, 'Should report unblocked when all blockers resolved');
    });

    it('should return zero progress for non-existent plan', () => {
      // Act
      const progress = planManager.getPlanProgress('non-existent-plan-id');

      // Assert
      assert.strictEqual(progress.completed, 0);
      assert.strictEqual(progress.total, 0);
      assert.strictEqual(progress.blocked, false);
    });

    it('should track progress across multiple phases', () => {
      // Arrange
      const phases: PlanPhase[] = [
        { id: 'phase-1', title: 'Phase 1', description: '', status: 'completed', progress: 100, estimatedScope: 25, dependencies: [], artifacts: [] },
        { id: 'phase-2', title: 'Phase 2', description: '', status: 'completed', progress: 100, estimatedScope: 25, dependencies: [], artifacts: [] },
        { id: 'phase-3', title: 'Phase 3', description: '', status: 'completed', progress: 100, estimatedScope: 25, dependencies: [], artifacts: [] },
        { id: 'phase-4', title: 'Phase 4', description: '', status: 'active', progress: 50, estimatedScope: 25, dependencies: [], artifacts: [] }
      ];
      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);

      // Act
      const progress = planManager.getPlanProgress(plan.id);

      // Assert
      assert.strictEqual(progress.completed, 3, 'Should have 3 completed phases');
      assert.strictEqual(progress.total, 4, 'Should have 4 total phases');
    });
  });

  // =========================================================================
  // SPRINT LIFECYCLE TESTS
  // =========================================================================
  describe('sprint lifecycle', () => {
    it('should start a sprint and set it as current', () => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Phase 1',
        description: '',
        status: 'active',
        progress: 50,
        estimatedScope: 100,
        dependencies: [],
        artifacts: []
      }];
      const plan = planManager.createPlan('intent-1', 'Sprint Plan', phases);

      // Act
      const sprint = planManager.startSprint('Sprint 3.1', plan.id);

      // Assert
      assert.strictEqual(planManager.getCurrentSprint()?.id, sprint.id);
      assert.strictEqual(planManager.getAllSprints().length, 1);
      assert.strictEqual(planManager.getAllSprints()[0].status, 'active');
    });

    it('should complete and archive active sprint with calculated metrics', () => {
      // Arrange
      const phases: PlanPhase[] = [
        {
          id: 'phase-1',
          title: 'Phase 1',
          description: '',
          status: 'completed',
          progress: 100,
          estimatedScope: 40,
          dependencies: [],
          artifacts: []
        },
        {
          id: 'phase-2',
          title: 'Phase 2',
          description: '',
          status: 'skipped',
          progress: 0,
          estimatedScope: 60,
          dependencies: [],
          artifacts: []
        }
      ];
      const plan = planManager.createPlan('intent-1', 'Sprint Plan', phases);
      planManager.addBlocker(plan.id, 'phase-2', 'Dependency unavailable');
      const blockerId = planManager.getPlan(plan.id)!.blockers[0].id;
      planManager.resolveBlocker(plan.id, blockerId);
      planManager.identifyRisk(plan.id, 'phase-1', 'Delivery risk', 'caution', 'Potential schedule slip');
      planManager.addMilestone(plan.id, 'phase-1', 'Milestone 1');
      const milestoneId = planManager.getPlan(plan.id)!.milestones[0].id;
      planManager.completeMilestone(plan.id, milestoneId);

      const sprint = planManager.startSprint('Sprint 3.1', plan.id);

      // Act
      planManager.archiveSprint(sprint.id);

      // Assert
      const archived = planManager.getSprint(sprint.id);
      assert.ok(archived);
      assert.strictEqual(archived!.status, 'archived');
      assert.ok(archived!.completedAt);
      assert.ok(archived!.archivedAt);
      assert.strictEqual(archived!.metrics.phasesPlanned, 2);
      assert.strictEqual(archived!.metrics.phasesCompleted, 1);
      assert.strictEqual(archived!.metrics.phasesSkipped, 0);
      assert.strictEqual(archived!.metrics.blockersEncountered, 1);
      assert.strictEqual(archived!.metrics.blockersResolved, 1);
      assert.strictEqual(archived!.metrics.risksIdentified, 1);
      assert.strictEqual(archived!.metrics.milestonesAchieved, 1);
      assert.strictEqual(planManager.getCurrentSprint(), undefined);
    });

    it('should archive existing active sprint before starting a new sprint', () => {
      // Arrange
      const phasesA: PlanPhase[] = [{
        id: 'a-1',
        title: 'A1',
        description: '',
        status: 'active',
        progress: 0,
        estimatedScope: 100,
        dependencies: [],
        artifacts: []
      }];
      const phasesB: PlanPhase[] = [{
        id: 'b-1',
        title: 'B1',
        description: '',
        status: 'active',
        progress: 0,
        estimatedScope: 100,
        dependencies: [],
        artifacts: []
      }];
      const planA = planManager.createPlan('intent-a', 'Plan A', phasesA);
      const planB = planManager.createPlan('intent-b', 'Plan B', phasesB);
      const sprintA = planManager.startSprint('Sprint A', planA.id);

      // Act
      const sprintB = planManager.startSprint('Sprint B', planB.id);

      // Assert
      const allSprints = planManager.getAllSprints();
      const archivedSprintA = allSprints.find(s => s.id === sprintA.id);
      const activeSprintB = allSprints.find(s => s.id === sprintB.id);
      assert.ok(archivedSprintA);
      assert.ok(activeSprintB);
      assert.strictEqual(archivedSprintA!.status, 'archived');
      assert.strictEqual(activeSprintB!.status, 'active');
      assert.strictEqual(planManager.getCurrentSprint()?.id, sprintB.id);
    });
  });

  // =========================================================================
  // EVENT BUS INTEGRATION TESTS
  // =========================================================================
  describe('event bus integration', () => {
    it('should emit events when plan is created', (done) => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Test',
        description: '',
        status: 'pending',
        progress: 0,
        estimatedScope: 10,
        dependencies: [],
        artifacts: []
      }];

      let eventReceived = false;
      eventBus.on('genesis.streamEvent' as never, () => {
        eventReceived = true;
        assert.ok(eventReceived, 'Event should be received');
        done();
      });

      // Act
      planManager.createPlan('intent-1', 'Test Plan', phases);
    });

    it('should emit events when artifact is touched', (done) => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Test',
        description: '',
        status: 'active',
        progress: 0,
        estimatedScope: 10,
        dependencies: [],
        artifacts: [{ path: 'src/test.ts', weight: 1 }]
      }];

      eventBus.on('genesis.streamEvent' as never, (event: unknown) => {
        const streamEvent = event as { payload?: { planEvent?: { type?: string } } };
        if (streamEvent?.payload?.planEvent?.type === 'artifact.touched') {
          done();
        }
      });

      const plan = planManager.createPlan('intent-1', 'Test Plan', phases);

      // Act
      planManager.recordArtifactTouch(plan.id, 'phase-1', 'src/test.ts', 'write');
    });
  });

  // =========================================================================
  // PERSISTENCE TESTS
  // =========================================================================
  describe('persistence', () => {
    it('should persist plan to disk', () => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Persistent Phase',
        description: 'This should persist',
        status: 'pending',
        progress: 0,
        estimatedScope: 10,
        dependencies: [],
        artifacts: []
      }];

      // Act
      planManager.createPlan('intent-1', 'Persistent Plan', phases);

      // Assert
      const yamlPath = path.join(tempDir, '.failsafe', 'plans.yaml');
      assert.ok(fs.existsSync(yamlPath), 'YAML file should exist');
    });

    it('should observe externally-written plans on refreshFromWorkspace()', () => {
      // Arrange - create a plan via PlanManager API
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Original Phase',
        description: '',
        status: 'pending',
        progress: 0,
        estimatedScope: 10,
        dependencies: [],
        artifacts: []
      }];
      const original = planManager.createPlan('intent-original', 'Original Plan', phases);

      // Sanity: in-memory state contains the original plan
      const before = planManager.getAllPlans();
      assert.strictEqual(before.length, 1, 'Should start with one plan');
      assert.ok(before.find(p => p.id === original.id), 'Original plan should be present');

      // Externally mutate plans.yaml: synthesize a second plan's event log
      // alongside the existing one. We write YAML directly, bypassing PlanManager.
      const yaml = require('js-yaml') as { load: (s: string) => unknown; dump: (o: unknown) => string };
      const yamlPath = path.join(tempDir, '.failsafe', 'plans.yaml');
      const raw = fs.readFileSync(yamlPath, 'utf8');
      const data = yaml.load(raw) as { events: Record<string, unknown[]> };
      const externalPlanId = 'external-plan-id-xyz';
      data.events[externalPlanId] = [{
        id: 'evt-external-1',
        planId: externalPlanId,
        type: 'plan.created',
        timestamp: new Date().toISOString(),
        payload: {
          intentId: 'intent-external',
          title: 'External Plan',
          phases: [{
            id: 'ext-phase-1',
            title: 'External Phase',
            description: '',
            status: 'pending',
            progress: 0,
            estimatedScope: 5,
            dependencies: [],
            artifacts: []
          }]
        }
      }];
      fs.writeFileSync(yamlPath, yaml.dump(data), 'utf8');

      // Pre-condition: without refresh, the new plan is still invisible
      const stale = planManager.getAllPlans();
      assert.strictEqual(stale.length, 1, 'Plan list should remain stale before refresh');

      // Act - invoke the unit under test
      planManager.refreshFromWorkspace();

      // Assert - new plan now observable via getAllPlans()
      const after = planManager.getAllPlans();
      assert.strictEqual(after.length, 2, 'Should observe both original and externally-written plans');
      const externalPlan = after.find(p => p.id === externalPlanId);
      assert.ok(externalPlan, 'Externally-written plan should be observable');
      assert.strictEqual(externalPlan!.title, 'External Plan');
    });

    it('should reload plans from disk', () => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Reloadable Phase',
        description: 'This should be reloaded',
        status: 'pending',
        progress: 0,
        estimatedScope: 10,
        dependencies: [],
        artifacts: []
      }];
      const plan = planManager.createPlan('intent-1', 'Reloadable Plan', phases);
      const planId = plan.id;

      // Act - create new PlanManager instance to reload from disk
      const newPlanManager = new PlanManager(tempDir, eventBus);

      // Assert
      const reloadedPlan = newPlanManager.getPlan(planId);
      assert.ok(reloadedPlan, 'Reloaded plan should exist');
      assert.strictEqual(reloadedPlan.title, 'Reloadable Plan');
    });
  });

  // =========================================================================
  // ACTIVE PLAN TESTS
  // =========================================================================
  describe('getActivePlan', () => {
    it('should return plan with active phase', () => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Active Phase',
        description: '',
        status: 'active',
        progress: 50,
        estimatedScope: 10,
        dependencies: [],
        artifacts: []
      }];
      planManager.createPlan('intent-1', 'Active Plan', phases);

      // Act
      const activePlan = planManager.getActivePlan();

      // Assert
      assert.ok(activePlan, 'Should return active plan');
      assert.strictEqual(activePlan.title, 'Active Plan');
    });

    it('should return undefined when no active plans exist', () => {
      // Arrange
      const phases: PlanPhase[] = [{
        id: 'phase-1',
        title: 'Pending Phase',
        description: '',
        status: 'pending',
        progress: 0,
        estimatedScope: 10,
        dependencies: [],
        artifacts: []
      }];
      planManager.createPlan('intent-1', 'Pending Plan', phases);

      // Act
      const activePlan = planManager.getActivePlan();

      // Assert
      assert.strictEqual(activePlan, undefined, 'Should return undefined when no active plans');
    });
  });

  // FX499 — WorkspaceMutationBus subscription (B192 remediation, plan Phase 2)
  describe('FX499 PlanManager — WorkspaceMutationBus subscription', () => {
    it('construction without mutationBus dep does not throw (back-compat)', () => {
      // The default beforeEach already constructs PlanManager without a bus;
      // assert it succeeded and basic operations still work.
      assert.ok(planManager, 'planManager constructed without bus');
      assert.doesNotThrow(() => planManager.getActivePlan());
    });

    it('construction with bus dep registers watchers on plans.yaml + roadmap.yaml', () => {
      const registeredPaths: string[] = [];
      const fakeBus = {
        registerWatcher: (absPath: string, _onMutation: () => void): { dispose: () => void } => {
          registeredPaths.push(absPath);
          return { dispose: () => {} };
        },
      };

      const pm = new PlanManager(tempDir, eventBus, fakeBus as unknown as import('../../shared/WorkspaceMutationBus').WorkspaceMutationBus);
      try {
        const expectedPlans = path.join(tempDir, '.failsafe', 'plans.yaml');
        const expectedRoadmap = path.join(tempDir, '.qorelogic', 'roadmap.yaml');
        assert.ok(registeredPaths.includes(expectedPlans), `registered plans.yaml: ${registeredPaths}`);
        assert.ok(registeredPaths.includes(expectedRoadmap), `registered roadmap.yaml: ${registeredPaths}`);
      } finally {
        pm.dispose();
      }
    });

    it('bus-emitted mutation event triggers refreshFromWorkspace', () => {
      let captured: (() => void) | null = null;
      const fakeBus = {
        registerWatcher: (_absPath: string, onMutation: () => void): { dispose: () => void } => {
          // Capture the first registered handler so the test can fire it.
          if (!captured) captured = onMutation;
          return { dispose: () => {} };
        },
      };

      const pm = new PlanManager(tempDir, eventBus, fakeBus as unknown as import('../../shared/WorkspaceMutationBus').WorkspaceMutationBus);
      try {
        const mutationCallback = captured as (() => void) | null;
        assert.ok(mutationCallback, 'a mutation handler was registered');
        let refreshCalled = 0;
        const original = pm.refreshFromWorkspace.bind(pm);
        pm.refreshFromWorkspace = () => { refreshCalled += 1; original(); };
        mutationCallback!();
        assert.strictEqual(refreshCalled, 1, 'refreshFromWorkspace fired once per mutation event');
      } finally {
        pm.dispose();
      }
    });

    it('dispose() releases all bus subscriptions', () => {
      const disposeCounts: number[] = [];
      const fakeBus = {
        registerWatcher: (_absPath: string, _onMutation: () => void): { dispose: () => void } => {
          const idx = disposeCounts.length;
          disposeCounts.push(0);
          return { dispose: () => { disposeCounts[idx] += 1; } };
        },
      };

      const pm = new PlanManager(tempDir, eventBus, fakeBus as unknown as import('../../shared/WorkspaceMutationBus').WorkspaceMutationBus);
      pm.dispose();
      assert.ok(disposeCounts.length >= 2, `at least 2 subscriptions registered (plans + roadmap); got ${disposeCounts.length}`);
      for (const c of disposeCounts) {
        assert.strictEqual(c, 1, 'each subscription disposed exactly once');
      }
    });
  });
});
