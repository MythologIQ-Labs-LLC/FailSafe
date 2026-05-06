# Project Governance

## Overview

FailSafe is maintained by MythologIQ. This document describes how the project is governed.

## Roles

### Maintainers

Maintainers have write access and are responsible for:

- Reviewing and merging pull requests
- Managing releases
- Enforcing code of conduct
- Setting project direction

### Contributors

Anyone who contributes code, documentation, or other improvements.

### Users

Anyone who uses the project and may report issues or request features.

## Decision Making

### Consensus

Most decisions are made through discussion and consensus:

1. Proposal raised in issue or discussion
2. Community feedback gathered
3. Maintainers make final decision

### Voting

For significant changes:

- Maintainers vote
- Simple majority required
- Voting period: 1 week minimum

## Contributions

All contributions follow the process in [CONTRIBUTING.md](CONTRIBUTING.md).

## Branch and Merge Standards

FailSafe enforces branch-first and PR-first development:

- Allowed branch taxonomy:
  - `plan/*`
  - `feat/*`
  - `fix/*`
  - `release/*`
  - `hotfix/*`
- Protected branch rule:
  - `main` is protected and should not receive direct implementation commits in normal flow.
- Merge rule:
  - changes to protected branches must go through pull requests with required checks.
- Evidence rule:
  - PRs must include reliability and validation evidence when applicable.

Validation entrypoints:

- `powershell -File tools/reliability/validate-branch-policy.ps1`
- `powershell -File validate.ps1 -SkipContainerValidation`

## QoreLogic Governance (The SHIELD Framework)

This project uses the QoreLogic SHIELD physical lifecycle for AI-assisted development governance:

| Phase | Acronym       | Command            | Description                                             |
| ----- | ------------- | ------------------ | ------------------------------------------------------- |
| S     | SECURE INTENT | `/qor-bootstrap`    | Seed project DNA, document the Why                      |
| H     | HYPOTHESIZE   | `/qor-plan`         | Create blueprints with risk grades and Section 4 limits |
| I     | INTERROGATE   | `/qor-audit`        | Adversarial tribunal checks for drift; PASS or VETO     |
| E     | EXECUTE       | `/qor-implement`    | Build under strict code complexity constraints          |
| L     | LOCK PROOF    | `/qor-substantiate` | Verify Reality matches Promise with Merkle hash seal    |
| D     | DELIVER       | `/qor-release`      | Deploy, inspect packaged artifacts before publish, and monitor for operational drift |

All changes to security-critical components (L3) require mandatory audit.

## Releases

- Semantic versioning (MAJOR.MINOR.PATCH)
- Release notes in CHANGELOG.md
- Maintainers approve releases
- Tags created only on main after merge

## Amendments

This governance model may be amended by maintainer consensus.

---

_Last updated: 2026_
