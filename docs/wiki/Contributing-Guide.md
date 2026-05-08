# Contributing Guide

Thank you for contributing to FailSafe! This guide covers the development setup, branch policy, and PR process.

## Development Setup

### Prerequisites

- Node.js 18+ (v20.18.1 recommended, see `.nvmrc`)
- VS Code 1.90.0+
- Git
- Python 3.8+ (for qor-logic development)

### Clone and Build

```bash
git clone https://github.com/MythologIQ-Labs-LLC/FailSafe.git
cd FailSafe/FailSafe/extension
npm install
npm run compile
```

### Development Workflow

```bash
# Watch mode (auto-recompile on changes)
npm run watch

# Run tests
npm test

# Run E2E tests
npm run test:e2e

# Run linter
npm run lint

# Full validation
npm run lint && npm test && npm run compile
```

Press `F5` in VS Code to launch the Extension Development Host.

## Branch Policy

FailSafe enforces branch-first, PR-first development:

### Allowed Branch Prefixes

| Prefix | Purpose |
|--------|---------|
| `plan/*` | Planning and design work |
| `feat/*` | New features |
| `fix/*` | Bug fixes |
| `release/*` | Release preparation |
| `hotfix/*` | Emergency fixes |

### Protected Branches

- `main` is protected
- No direct commits to `main`
- All changes must go through pull requests with required checks

### Branch Validation

```bash
powershell -File tools/reliability/validate-branch-policy.ps1
```

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

| Prefix | Usage |
|--------|-------|
| `feat:` | New features |
| `fix:` | Bug fixes |
| `docs:` | Documentation changes |
| `refactor:` | Code refactoring |
| `test:` | Test additions/changes |
| `chore:` | Maintenance tasks |

## Section 4 Razor

All contributions must follow the Section 4 Razor:

- **40 lines** maximum per function
- **250 lines** maximum per file
- **3 levels** maximum nesting depth

When a module exceeds these limits, decompose it into smaller modules. This is enforced by the EnforcementEngine at save-time in governance modes.

## SHIELD Workflow for Contributors

This project uses the QoreLogic SHIELD governance lifecycle:

1. **`/qor-status`** — Check current project state
2. **`/qor-plan`** — Create implementation plans with risk grades
3. **`/qor-audit`** — Gate verification (PASS or VETO)
4. **`/qor-implement`** — Build with Section 4 Razor constraints
5. **`/qor-substantiate`** — Seal and merge
6. **`/qor-release`** — Deploy with traceability

All changes to security-critical components (L3) require mandatory audit.

## Pull Request Process

1. Fork the repository
2. Create a policy-compliant branch (`feat/`, `fix/`, etc.)
3. Make your changes
4. Run required checks:

```bash
npm run lint
npm run compile
npm test
powershell -File ../../validate.ps1 -SkipContainerValidation
```

5. Commit with conventional commits
6. Push and create a PR
7. Complete the PR evidence checklist

### PR Evidence Checklist

- [ ] QoreLogic compliance (plan, audit, Section 4)
- [ ] Branch and merge policy compliance
- [ ] Risk assessment (L1/L2/L3)
- [ ] Testing (unit, integration, manual)
- [ ] Linked run IDs and artifact paths
- [ ] Documentation updated

### Review Requirements

- At least one reviewer approval
- All CI checks green
- No merge conflicts with main
- Branch policy validation passes

## Code Style

- Follow existing patterns in the codebase
- Use TypeScript strict mode
- No `console.log` in production code (use the Logger)
- No comments unless asked
- Add tests for new functionality
- Update documentation as needed

## Testing

### Unit Tests

```bash
npm test
```

Mocha-based test suite (959+ passing tests).

### E2E Tests

```bash
npm run test:e2e
```

Playwright-based E2E tests covering Monitor, Command Center, and SHIELD phases.

### E2E Coverage Gate

When the active plan's `change_class` is `feature` or `breaking`, the pre-push hook requires a corresponding `*.spec.ts` for staged surface files.

```bash
npm run test:e2e:coverage
```

## Release Process

Releases follow semantic versioning (MAJOR.MINOR.PATCH):

- Maintainers approve releases
- Tags created only on `main` after merge
- Release notes in CHANGELOG.md

## Questions?

Open a discussion at https://github.com/MythologIQ-Labs-LLC/FailSafe/discussions

## License

By contributing, you agree to license your contributions under the Apache License 2.0.
