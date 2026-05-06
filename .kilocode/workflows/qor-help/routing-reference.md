# QoreLogic Skill Routing

## SHIELD Lifecycle Flow

S → H → I → E → L → D

| Phase | Primary Skill | Predecessor | Successor | Fallback |
|-------|--------------|-------------|-----------|----------|
| SECURE INTENT | `/qor-research` | (entry point) | `/qor-plan` | — |
| HYPOTHESIZE | `/qor-plan` | `/qor-research` | `/qor-audit` | — |
| INTERROGATE | `/qor-audit` | `/qor-plan` | `/qor-implement` (PASS) | Fix + re-audit (VETO) |
| EXECUTE | `/qor-implement` | `/qor-audit` PASS | `/qor-substantiate` | `/qor-debug` (on failure) |
| LOCK PROOF | `/qor-substantiate` | `/qor-implement` | `/qor-repo-release` | Fail → fix → re-substantiate |
| DELIVER | `/qor-repo-release` | `/qor-substantiate` | (cycle complete) | — |

## Support Skills (Any Phase)

| Skill | When to Suggest |
|-------|----------------|
| `/qor-status` | User is lost or resuming work |
| `/qor-validate` | Before handoff, after manual ledger edits |
| `/qor-compliance` | Before release, after restructuring |
| `/qor-organize` | Repository structure needs cleanup |
| `/qor-debug` | Implementation fails or produces unexpected results |
| `/qor-refactor` | Post-implementation maintenance |
| `/qor-repo-audit` | New workspace or governance gap suspected |
| `/qor-repo-scaffold` | Missing governance files detected |
| `/qor-document` | Release metadata authoring during `/qor-repo-release`, or standalone documentation |

## Proactive Suggestion Signals

Context-aware recommendations. An agent SHOULD suggest a skill when:

| Signal | Detected When | Suggest |
|--------|--------------|---------|
| No research brief | User says "new feature" and no `.failsafe/governance/RESEARCH_BRIEF.md` | `/qor-research` |
| Prior research exists | Topic matches an entry in `docs/research/INDEX.md` | Load prior brief before `/qor-research` |
| Plan exists, no audit | `plan-*.md` exists but no AUDIT_REPORT | `/qor-audit` |
| PASS verdict, no implementation | AUDIT_REPORT shows PASS, no impl ledger entry | `/qor-implement` |
| Implementation done, no seal | Impl entry exists, no SUBSTANTIATE entry | `/qor-substantiate` |
| Sealed, not released | SUBSTANTIATE entry exists, no DELIVER entry | `/qor-repo-release` |
| Chain unverified | Multiple sessions since last `/qor-validate` | `/qor-validate` |
| Files at repo root | Source files outside app container | `/qor-organize` |
