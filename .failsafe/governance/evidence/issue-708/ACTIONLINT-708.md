# actionlint validation for #708 (2026-11-25)

**Tool**: rhysd/actionlint **v1.7.12** (release published 2026-03-30), asset `actionlint_1.7.12_windows_amd64.zip` (2,479,065 bytes) downloaded with `gh release download v1.7.12 --repo rhysd/actionlint` into an isolated scratch directory. SHA-256 `6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9`, equal to the entry in the release's published `actionlint_1.7.12_checksums.txt`. Extracted executable `actionlint.exe` sha256 `54ca21be3de4c7cfa26914aa8b61bd76bf573ef3caac5f80d110558cdf241718`; `actionlint -version` -> `1.7.12`, "installed by downloading from release page", built with go1.26.1 for windows/amd64. Not installed globally; PATH, repository dependencies and CI workflows unchanged.

**Inputs** (exact blobs written to scratch trees with `git show <rev>:<path>`):
- baseline `origin/main@7863a29e`: `.github/workflows/pr-full-test.yml`, `repo-standards-enforcement.yml`, `vsix-proprietary-guardrails.yml`
- candidate `candidate/708-ci-timeouts-unreviewed@b18741701384c08f179444fb344e6d3c841d602e`: the same three files. `diff -r` between the trees shows only the three added job-level lines: `timeout-minutes: 30` (full-test), `timeout-minutes: 10` (standards), `timeout-minutes: 10` (verify-vsix-guardrails).
- #721 candidate `repo-standards-enforcement.yml` (scratch prototype of plan-721 iteration 2), and that file with #708's `timeout-minutes: 10` added to its `standards` job (the composition after both merge).

**Commands and results** (run from each scratch tree root, `-no-color`):

| Tree | Command | Exit | Findings |
|---|---|---|---|
| baseline main | `actionlint .github/workflows/pr-full-test.yml .github/workflows/repo-standards-enforcement.yml .github/workflows/vsix-proprietary-guardrails.yml` | 0 | none |
| #708 candidate | same | 0 | none |
| #721 candidate | `actionlint .github/workflows/repo-standards-enforcement.yml` | 0 | none |
| #721 + #708 composition | same | 0 | none |

**Classification**: no existing workflow defect reported in the three files; no regression introduced by the timeout lines (baseline and candidate findings are identical: empty).

**Limits**: actionlint's optional script linters were absent (`shellcheck` and `pyflakes` not on this host), so the bodies of `run:` steps were not linted; the `pwsh` step is never linted by actionlint. Budgets vs observed duration (last successful runs): Repo Standards up to 141 s vs 10 min; VSIX Guardrails up to 103 s vs 10 min; PR Full Test up to 966 s vs 30 min.
