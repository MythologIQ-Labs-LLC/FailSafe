# Contributing to FailSafe

Thank you for your interest in contributing to FailSafe!

## How to Contribute

### Reporting Issues

1. Check existing issues first
2. Use the appropriate issue template
3. Provide clear reproduction steps

### Pull Requests

1. Fork the repository
2. Create a policy-compliant branch:
   - planning: `plan/<slug>`
   - implementation: `feat/<slug>` or `fix/<slug>`
   - release: `release/<version>`
3. Make your changes
4. Run required checks:
   - `npm run lint` (warnings allowed, errors are blocking)
   - `npm run compile`
   - `powershell -File validate.ps1 -SkipContainerValidation`
5. Commit with conventional commits: `git commit -m "feat: add feature"`
6. Push and create a PR
7. Complete PR evidence checklist in `.github/PULL_REQUEST_TEMPLATE.md`

### Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Test additions/changes
- `chore:` Maintenance tasks

### Code Style

- Follow existing patterns in the codebase
- Add tests for new functionality
- Update documentation as needed

### Review Process

1. All PRs require at least one review
2. CI checks must pass
3. No merge conflicts with main
4. Branch policy must pass (`validate-branch-policy.ps1`)

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/FailSafe.git

# Install dependencies
cd FailSafe/extension
npm install

# Run tests
npm test

# Build extension
npm run compile
```

## QoreLogic SHIELD Workflow

This project uses QoreLogic governance:

1. `/qor-status` - Check project state
2. `/qor-plan` - Create implementation plans
3. `/qor-audit` - Gate verification
4. `/qor-implement` - Build with Section 4 Razor
5. `/qor-substantiate` - Seal and merge

## Questions?

Open a discussion or reach out to maintainers.

---

_Licensed under Apache License 2.0 - see [LICENSE](LICENSE) for details._
