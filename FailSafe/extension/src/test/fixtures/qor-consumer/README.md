# qor-consumer fixtures (#233 FX892/FX893)

Six fixture workspaces for the Qor-logic consumer adapter tests: `supported`,
`missing-optional`, `stale`, `malformed`, `unsupported-version`,
`partial-migration`.

Layout note — two renames keep these fixtures out of the root `.gitignore`'s
unanchored patterns (`.qor/` at line 12 and `docs/` at line 63 both match at
ANY depth, which would silently drop fixture files from git):

- `ws-docs/`   -> materialized as `docs/`       (META_LEDGER.md, FEATURE_INDEX.md, roadmap/programs.yaml)
- `qor-gates/` -> materialized as `.qor/gates/` (audit.json)

The tests' `materialize()` helper copies a fixture set into a temp workspace
and performs both renames before invoking the adapter, so the adapter always
exercises the real artifact paths.
