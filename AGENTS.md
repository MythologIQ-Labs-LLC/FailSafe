# FailSafe Governance

## SHIELD Lifecycle
- Run `/qor-status` to check current governance state
- Follow S→H→I→E→L→D: Bootstrap → Plan → Audit → Implement → Substantiate → Release
- Never implement without a PASS verdict from /qor-audit
- Never release without a session seal from /qor-substantiate

## Skills
All governance skills are in `.claude/skills/qor-*/SKILL.md`.
Agent definitions are in `.claude/agents/qor-*.md`.

## Rules
- All writes are subject to EnforcementEngine (FailSafe Extension)
- Section 4 Razor: max 40 lines/function, 250 lines/file, nesting ≤3
