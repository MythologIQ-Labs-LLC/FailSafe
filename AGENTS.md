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

## Agent skills

Beyond the qor-* governance skills, this workspace vendors the MIT-licensed
engineering pack from https://github.com/mattpocock/skills (see
`.claude/skills/MATTPOCOCK-SKILLS-LICENSE` for the pinned commit):
engineering: `wayfinder`, `grill-with-docs`, `domain-modeling`, `research`,
`prototype`, `to-spec`, `to-tickets`, `setup-matt-pocock-skills`; productivity:
`grilling` (a wayfinder dependency), `grill-me`, `handoff`, `teach`,
`to-questionnaire`, `wait-what`, `writing-for-agents`.

- `/wayfinder` charts a big, foggy effort as a `wayfinder:map` GitHub issue
  with child decision tickets, then resolves ONE ticket per session ("plan,
  don't do"). Tracker contract: `docs/agents/issue-tracker.md` ("Wayfinding
  operations").
- The qor governance rules above take precedence: map/ticket issues are
  planning artifacts; any implementation a map hands off still enters
  `/qor-plan` → `/qor-audit` → `/qor-implement`.
