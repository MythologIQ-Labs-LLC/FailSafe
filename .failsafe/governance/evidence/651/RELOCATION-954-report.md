# Relocation of the report sealed by ledger Entry #954

- **Entry:** #954 (PASS, records-only confirmation check of PR #656 head `e48d1c65`).
- **Report as sealed:** `.agent/staging/AUDIT_REPORT-656-iter5-records.md`, content hash (LF-normalised SHA-256) `798e7f494d6fa0b82b23fb64aeede4667c96e3f818dfb76a1c851395c3c3d85d`, committed in `0ebf2032`.
- **Moved to:** `.failsafe/governance/evidence/651/AUDIT_REPORT-656-iter5-records.md`, unchanged (same git blob).
- **Why:** the report quotes the name of a test in `FailSafe/extension/src/test/docs/pro-retirement.test.cjs`, and that name mentions the retired product. That guard scans every tracked file and exempts historical records only under `.failsafe/`, so CI run 43156370765 on `0ebf2032` failed on it. The same happened to a raw CI log in `888ced6f`, which was moved the same way in `e48d1c65`.
- **Not changed:** Entry #954 is left exactly as sealed. Its Report field names the original path, which was true when it was sealed. This file is the record of the move.
- **Process error:** the implementer pushed `0ebf2032` without running `npm run test:node` locally first, contrary to the repository's CI-budget rule. This relocation was validated locally before it was pushed.
