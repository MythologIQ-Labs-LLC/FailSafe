---
name: ql-help
description: >
  Command Summary
user-invocable: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash
---

---
name: ql-help
description: Quick reference that summarizes the purpose and usage of all QoreLogic commands. Use when: (1) Need to understand available commands, (2) Unsure which command to use, or (3) Looking for command overview.
---

# /qor-help - Command Summary

<skill>
  <trigger>/qor-help</trigger>
  <phase>ANY</phase>
  <persona>Governor</persona>
  <output>Concise summary of available QoreLogic commands</output>
</skill>

## Quick Reference

| Command | Phase | Purpose |
|---------|-------|---------|
| `/qor-status` | ANY | Check lifecycle state and next action |
| `/qor-research` | SECURE INTENT | Investigate before planning |
| `/qor-plan` | HYPOTHESIZE | Create implementation plan |
| `/qor-audit` | INTERROGATE | Adversarial audit (PASS/VETO) |
| `/qor-implement` | EXECUTE | Build from audited plan |
| `/qor-substantiate` | LOCK PROOF | Verify and seal session |
| `/qor-repo-release` | DELIVER | Tag and push to pipeline |
| `/qor-debug` | ANY | Diagnose failures |
| `/qor-refactor` | EXECUTE | Post-implementation cleanup |
| `/qor-validate` | ANY | Verify Merkle chain integrity |
| `/qor-compliance` | ANY | Repository isolation audit |
| `/qor-organize` | ANY | Repository structure cleanup |
| `/qor-repo-audit` | ANY | Full governance audit |
| `/qor-repo-scaffold` | ANY | Generate missing governance files |
| `/qor-document` | ANY | Author verified technical documentation |

## Workflow Chains

**Standard feature**: `/qor-research` â†’ `/qor-plan` â†’ `/qor-audit` â†’ `/qor-implement` â†’ `/qor-substantiate` â†’ `/qor-repo-release`

**Quick fix (L1)**: `/qor-plan` â†’ `/qor-implement` â†’ `/qor-substantiate`

**Diagnostics**: `/qor-status` â†’ (routes to next action)

Full routing table: `.claude/commands/references/qor-skill-routing.md`


