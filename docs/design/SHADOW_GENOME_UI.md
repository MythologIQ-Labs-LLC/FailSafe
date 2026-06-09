# Shadow Genome UI Design

**Issue:** #196  
**Status:** Design reference for implementation  
**Surface:** FailSafe Command Center  
**Theme baseline:** Mythiq, with compatibility across existing FailSafe themes

## 1. Purpose

The Shadow Genome UI visualizes the negative architecture that develops alongside a project.

As an application gains capabilities, dependencies, workflows, permissions, integrations, and governance boundaries, it also gains new ways to fail. Individual incidents reveal portions of that error surface. Accumulated and causally linked failures form the project's Shadow Genome.

The UI must therefore support two valid and complementary uses:

1. **Structural understanding:** show how the project's functional architecture casts an evolving failure surface.
2. **Operational response:** show concrete incidents, their current status, causes, remediation, recurrence, and ownership.

The Shadow Genome is not an agent personality profile, a decorative DNA metaphor, or a generic incident log. It is the project's discovered error topology, derived from append-only causal evidence.

## 2. Design statement

> As the project takes shape, so too does its error surface. The Shadow Genome is the accumulated, evolving record of that surface as it is discovered through failure.

A useful distinction:

- **The project map shows what the system can do.**
- **The Shadow Genome shows how those capabilities have failed, can fail, or have become structurally vulnerable.**
- **The incident view shows the events from which that understanding was derived.**

Incidents are observations. The Shadow Genome is the durable structure inferred from those observations.

## 3. Scope from issue #196

The design consumes the shipped `loadShadowGenome` and `governanceSubgraph` data layer. It must provide:

- Shadow Genome dashboard surfaces
- A console route over the existing data layer
- Governance causal graph visualization
- Trust-level transition visualization
- Federation status and causal provenance
- Playwright visual-gate coverage
- A stable design reference for implementation review

The UI must not create a second graph store, reinterpret canonical node or edge semantics, or invent unsupported causal relationships.

## 4. Canonical information model

The UI is based on the canonical causal graph from QorLogic:

### Node types

- `checkpoint`
- `state`
- `failure`
- `governance`

### Edge types

- `produced`
- `occurred_during`
- `triggered_by`
- `applies_to`

### Derived UI concepts

The UI may derive visual summaries without changing canonical semantics:

- project component
- failure family
- recurrence count
- remediation maturity
- trust transition
- federation origin
- causal depth
- affected surface
- unresolved constraint

Derived values must remain traceable to source nodes and edges.

## 5. Navigation model

The Shadow Genome is one Command Center domain with four linked modes:

1. **Genome Map**
2. **Incidents**
3. **Trust Transitions**
4. **Federation**

These are not separate data products. They are views over the same causal graph.

The following context must persist when moving between modes:

- selected node or incident
- project component filter
- time range
- failure mode filter
- remediation state
- federation origin

## 6. Genome Map

### 6.1 Purpose

The Genome Map shows the project through the shape of its discovered failures.

It places project capabilities and failure surfaces in the same visual field so users can see:

- which parts of the project generate the most failure evidence
- where multiple failure classes converge
- which failure patterns cross component boundaries
- which areas are growing faster than their safeguards
- whether remediation has changed recurrence

### 6.2 Visual grammar

#### Project capability nodes

- Primary color: `var(--primary)`
- Stable circular or rounded nodes
- Label represents a functional component, module, or governed surface
- Size reflects structural scope or number of associated causal relationships, not severity

Examples:

- Planning
- UI Surface
- Agent Runtime
- Governance
- Integrations
- Deployment

#### Failure-surface nodes

- Red: active or severe recurrence
- Orange: repeated architectural or execution defect
- Gold: emerging or unresolved pattern
- Cyan: informational, environmental, or low-severity observed pattern
- Green: verified remediation or protected state

Failure-node size reflects accumulated supporting incidents. Border thickness reflects recurrence after remediation. A dashed border indicates insufficient evidence or an unresolved classification.

#### Edges

Edges must represent canonical graph relationships. Visual styling may distinguish edge type:

- solid: `produced`
- dotted: `occurred_during`
- arrowed: `triggered_by`
- thin governed link: `applies_to`

Hover and keyboard focus must reveal the exact relationship label.

### 6.3 Required interactions

Selecting a project node must:

- highlight associated failure nodes
- show incident count and recurrence trend
- filter the incident rail
- expose unresolved negative constraints

Selecting a failure node must:

- show incidents that formed the pattern
- show causal roots and affected project surfaces
- show remediation maturity
- show whether recurrence occurred after remediation

Selecting an edge must:

- show source and target
- show canonical relationship type
- show originating evidence
- provide `Trace causal chain`

### 6.4 Layout behavior

The graph must not depend on a single fixed spatial arrangement. Use deterministic layout inputs so Playwright screenshots remain stable.

Recommended desktop layout:

- graph canvas: approximately 65 percent width
- operational rail: approximately 35 percent width
- summary cards above
- learning and federation summaries below

At narrower widths, the operational rail moves below the graph. The graph must retain pan, zoom, reset, and fit-to-selection controls.

## 7. Incident View

### 7.1 Purpose

The incident view is the operational counterpart to the structural map. It answers:

- what failed
- when it failed
- where it failed
- why it failed
- how severe it is
- whether it has happened before
- what remediation exists
- who or what owns the next action

### 7.2 Required fields

Each incident row or card should expose:

- entry or verdict identifier
- timestamp
- failure mode
- affected component
- decision rationale
- causal vector summary
- negative constraint
- remediation status
- recurrence count
- ledger reference
- agent DID or originating actor, where authorized
- federation origin, where applicable

### 7.3 Incident detail drawer

Opening an incident displays:

1. What failed
2. Why it failed
3. Pattern to avoid
4. Environmental context
5. Causal chain
6. Negative constraint
7. Remediation state and notes
8. Related incidents
9. Trust consequence, if any
10. Ledger and provenance references

The detail drawer must provide a `Locate in Genome` action that returns to the Genome Map and highlights the relevant project and failure nodes.

## 8. Learning maturity

Recording a failure is not equivalent to learning from it. The UI must make this distinction explicit.

Use the following maturity progression:

1. **Observed**: a failure event exists
2. **Classified**: a stable failure mode has been assigned
3. **Constraint extracted**: a reusable negative constraint exists
4. **Detectable**: a rule, query, or evaluator can identify recurrence
5. **Enforced**: a gate can prevent or block recurrence
6. **Verified**: remediation has been tested and recurrence has not reappeared within the configured evidence window

The dashboard should summarize counts at each stage. Selecting a stage filters the corresponding incidents and patterns.

A pattern that recurs after reaching Enforced or Verified must be visually elevated because it signals governance failure rather than ordinary discovery.

## 9. Trust Transitions

### 9.1 Purpose

Trust-level changes must be shown as evidence-backed causal transitions, not as unexplained status changes.

Supported levels:

- CBT
- KBT
- IBT

### 9.2 Transition chain

Each promotion or demotion should render as:

```text
Triggering evidence
    -> governance decision
    -> trust transition
    -> resulting state
```

The transition detail must show:

- previous level
- resulting level
- direction: promotion or demotion
- triggering failures or verified remediations
- governance node responsible for the change
- timestamp
- affected permissions or autonomy
- review state

Trust color must not override severity color. Trust level should use labels, line position, and a dedicated accent treatment so a severe failure remains visibly severe.

## 10. Federation

### 10.1 Purpose

Federation shows how causal knowledge is shared across FailSafe, QorLogic, and other authorized modules or instances.

It must answer:

- which peers are connected
- when they last synchronized
- which nodes originated locally or remotely
- whether schemas are compatible
- whether causal histories conflict
- whether a peer is degraded or stale

### 10.2 Peer states

- Synced
- Syncing
- Stale
- Degraded
- Incompatible
- Unauthorized
- Offline

### 10.3 Provenance

Every federated node must preserve its origin. The UI must never make remote evidence appear locally observed.

Selecting a peer filters the Genome Map and Incident View to evidence originating from that peer.

The federation surface must remain useful before the final gossip-versus-centralized-store architecture is settled. It should consume an adapter-level peer status model rather than binding the UI directly to one transport strategy.

## 11. Dashboard summary

The initial summary row should include:

- failure node count
- causal edge count
- unresolved incident count
- recurring pattern count
- trust transition count
- federation health

These are navigation aids, not vanity metrics. Selecting a metric applies the relevant filter.

Avoid a single composite health score. Collapsing error topology, remediation maturity, trust, and federation into one number would create false precision and conceal the reason attention is required.

## 12. Console route

Provide a read-only route for the shipped data layer.

Recommended route:

```text
/api/qor/governance-dashboard
```

The response should include:

```ts
interface GovernanceDashboardResponse {
  generatedAt: string;
  summary: {
    nodeCount: number;
    edgeCount: number;
    unresolvedCount: number;
    recurringPatternCount: number;
    trustTransitionCount: number;
  };
  typeDistribution: Record<string, number>;
  recentChains: GovernanceChainSummary[];
  projectSurfaces: ProjectSurfaceSummary[];
  trustTransitions: TrustTransitionSummary[];
  federation: FederationSummary;
}
```

This route must derive its response from `loadShadowGenome` and `governanceSubgraph`. It must not maintain separate persistence.

## 13. Component model

Recommended UI modules:

```text
ShadowGenomeView
  ShadowGenomeHeader
  ShadowGenomeTabs
  GenomeSummaryCards
  GenomeMap
    GenomeCanvas
    GenomeControls
    GenomeLegend
    GenomeSelectionInspector
  IncidentRail
  IncidentTable
  IncidentDetailDrawer
  LearningMaturityPanel
  TrustTransitionPanel
  FederationPanel
```

Shared state should live in a view-level controller or store rather than being duplicated inside each renderer.

## 14. Empty, loading, and degraded states

### Empty genome

Message:

> No failure evidence has been recorded. The Shadow Genome will take shape as governed failures and causal relationships are observed.

Do not imply the project has no error potential. It only means no evidence has yet been accumulated.

### Loading

Use stable skeletons matching the final geometry. Avoid animated graph nodes that shift the screenshot baseline.

### Degraded data layer

Show the last successful snapshot timestamp and the failing source. Preserve read-only access to cached data when safe.

### Partial federation

Local graph data remains available. Remote-origin nodes should show stale provenance rather than disappearing silently.

## 15. Accessibility

The graph cannot be the only way to access information.

Required accessibility behavior:

- keyboard-navigable node list
- text alternative for the current graph selection
- table representation of visible nodes and edges
- visible focus indicators
- no color-only state distinctions
- reduced-motion support
- screen-reader labels for relationship types
- zoom controls with accessible names
- minimum WCAG AA contrast across all supported themes

The graph must expose a `View as table` mode.

## 16. Theme compatibility

Use existing FailSafe design tokens rather than hard-coded colors:

- `--bg-dark`
- `--bg-panel`
- `--bg-deep`
- `--primary`
- `--primary-glow`
- `--accent-cyan`
- `--accent-gold`
- `--accent-green`
- `--accent-red`
- `--accent-orange`
- `--text-main`
- `--text-muted`
- `--border-rim`

Mythiq is the visual reference theme. Pegasus, Midnight, Aurora, Crimson, and Atmosphere must remain legible and functional.

## 17. Visual-gate requirements

Playwright visual tests must cover:

1. Mythiq default Genome Map
2. Selected project node
3. Selected failure node with incident rail filtered
4. Incident detail drawer
5. Trust transition detail
6. Federation degraded state
7. Empty genome
8. Pegasus light theme
9. Narrow responsive layout
10. Reduced-motion mode

Test fixtures must use deterministic node identifiers, fixed timestamps, and a deterministic graph layout seed.

Screenshot tests should assert composition and regression, while semantic tests assert labels, counts, relationships, and keyboard behavior.

## 18. Non-goals

This issue does not:

- redefine the QorLogic Shadow Genome schema
- introduce agent identity or personality visualization
- infer causal edges without canonical evidence
- provide mutating remediation controls unless separately authorized
- settle the federation transport architecture
- replace the append-only ledger
- convert the Shadow Genome into a generalized observability product

## 19. Acceptance criteria

- [ ] Genome Map visibly pairs project capabilities with their discovered failure surface.
- [ ] Incident View supports operational investigation and remediation tracking.
- [ ] Selection is bidirectional between map and incident surfaces.
- [ ] All displayed relationships map to canonical node and edge semantics.
- [ ] Learning maturity distinguishes recorded failures from enforced prevention.
- [ ] Trust transitions display their triggering causal evidence.
- [ ] Federation displays peer health and preserves evidence origin.
- [ ] The dashboard API reads from the existing Shadow Genome data layer only.
- [ ] All primary information is available without relying solely on the graph.
- [ ] Existing FailSafe themes remain supported.
- [ ] Playwright visual and semantic coverage passes.

## 20. Implementation sequence

### Phase 1: contract and route

- define dashboard response types
- implement read-only governance dashboard route
- provide deterministic fixtures

### Phase 2: shared view state

- implement filters, selection, and tab persistence
- establish bidirectional map-to-incident selection

### Phase 3: operational surface

- implement summary cards
- implement incident rail, table, and detail drawer
- implement learning maturity panel

### Phase 4: structural map

- implement deterministic graph layout
- render canonical node and edge types
- add selection inspector and table alternative

### Phase 5: trust and federation

- implement trust transition chains
- implement federation peer health and provenance filtering

### Phase 6: visual gate and accessibility

- add Playwright screenshots
- add keyboard and semantic tests
- validate all supported themes and reduced motion

## 21. Final product principle

The interface should make one relationship unmistakable:

> The application is the architecture of intended capability. The Shadow Genome is the architecture of discovered consequence.

The incident dashboard shows what happened. The Genome Map shows what those incidents have taught FailSafe about the shape of the system.