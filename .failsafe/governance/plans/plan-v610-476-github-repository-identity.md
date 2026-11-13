# Prospective security plan: bind GitHub repository identity before publishing (#476, v6.1.0)

**Status:** PROPOSED; security regression evidence only; native `/qor-plan`, independent `/qor-audit` PASS and implementation authorization **not yet obtained**.
**Source base:** `main@4157b5a2bb775bf09d08f54e8652bde7fbaa4425`, 2026-11-13. **Proposed risk:** L3, because a Checks API POST can change branch gate results. **Owner:** solo FailSafe maintainer. **Bound issues:** #476 (SHIELD truth), #474 (integration conformance), #679 (v6.1.0), #538 (GitHub token host affinity).
**This PR contains only the plan and intentionally failing security-characterization tests.** No runtime protection, release/governance ledger, artifact, tag or published version is modified. Red tests must NOT be merged into main as-is.

## Source-verified defect and limits

- `FailSafe/extension/src/integrations/github-checks/github-checks-map.ts:parseRepoSlug` uses an unanchored *prefix* regexp whose final `owner/repo` suffix may appear after any host and any number of path components. It admits a `file://` URL, GitHub lookalike domains, arbitrary Git hosts, and an extra path prefix. A local zero-network replay of that exact source regexp accepted `https://evil.example/acme/failsafe.git`, `https://github.com.evil.example/acme/failsafe.git`, `https://github.com/unrelated/path/acme/failsafe.git`, and `file:///tmp/acme/failsafe.git`, each as `acme/failsafe`.
- `github-checks-client.ts:publishCheckRunPayload` resolves its repository from that parser but does **not** compare `wire.head_sha` to `ctx.headSha` before POST. The manual advisory and PR-linkage routes are allowed names; a subject mismatch should never be accepted merely because the name is not SHIELD.
- `shield-check-publish.ts:sameRepo` compares *only* case-folded `owner/repo` slugs from the command context and the independently sourced repository remote. Two different hosts with the same slug therefore compare equal. `shield-evidence.ts:repoOf` independently drops the host. A valid SHA / session receipt and API-host field are required for verified SHIELD; this report does **not** claim those checks can be bypassed by an unprivileged actor.
- Existing `github-host-affinity.ts` correctly restricts **token egress** to the configured API URL origin. It does **not** prove the repository named by an untrusted remote actually belongs to that origin. Do not regress the existing no-cross-origin-token safeguard while fixing identity.
- GitHub Enterprise Server is an existing supported configuration (`github-token-egress.test.ts` uses `ghe.example`). Do not "fix" this by rejecting all non-`github.com` hosts, blindly equating an arbitrary API domain to an arbitrary Git remote, or silently disabling GHES.

## Prospective contract (for native audit before implementing)

1. Parse a **full, exact** repository remote identity: `{host, owner, repo}` only for reviewed HTTPS and SSH/scp forms; enforce exactly two repository path components plus optional `.git`, no query/fragment/path smuggling, credentials/port/scheme checked by host policy. Retain valid GitHub Enterprise identities; do not follow redirects.
2. For public GitHub publishing, the remote's canonical host must be `github.com` and the API base `api.github.com`. For GHES, require an **explicit, user-controlled binding** between its remote host and the operator-approved API base. A workspace-controlled git remote or tool output cannot silently define that trust binding. Loopback test cases need an explicit reviewed exception, never production wildcard trust.
3. For any generic Check Run, require the checked immutable wire payload's SHA to equal the resolved live `GitContext.headSha`. Reject mismatch **before** token/network use; do not weaken reserved SHIELD receipt requirements. For PR linkage, compare requested owner/repo and PR head SHA with the authorized remote/source rather than trusting caller arguments.
4. For verified SHIELD, compare host-aware command and evidence repository identities, and bind the receipt's repository/API host to the same accepted target. Continue exact-HEAD re-read, verified receipt, trusted chain and 201 confirmation checks. Never turn rejected/neutral evidence into successful SHIELD.
5. Preserve current fail-closed/local-only UX for missing configuration and the existing redaction of credentials; no default auto-publish or new token use.

## Falsification matrix (test names: GRB-01..08)

| ID | Positive / negative case | Expected before any network or authority mutation |
| --- | --- | --- |
| GRB-01 | GitHub public HTTPS, SSH/scp, and valid GHES remote | Exact owner/repo parsed without mutilating .git suffix |
| GRB-02 | File URL, lookalike host, 3+ path segments, query/fragment and unsupported scheme | Parser returns null or refuses binding, never a real repo |
| GRB-03 | `api.github.com` default with `evil.example/acme/failsafe` remote | Manual advisory returns non-published/local-only; 0 POST |
| GRB-04 | Authorized GHES remote/API pair versus unrelated GHES remote host | Authorized pair can publish, unrelated host refused before GET/POST |
| GRB-05 | Generic advisory `payload.head_sha != ctx.headSha` | Explicit failure, 0 POST |
| GRB-06 | SHIELD command context remote host differs from evidence source, slug identical | `context-mismatch`/refusal, 0 SHIELD POST |
| GRB-07 | Caller asks PR-linkage auditor to fetch one repository's PR/issues while Check Run publisher targets another repository | Refuse before any GET/POST; never post a falsely clean PR-linkage result |
| GRB-08 | Existing verified GitHub SHA/host/receipt, 201 echo, token secrets, fork, local-only | No regression: truthful allowed/refused outcomes and no token exposure |

## Implementation and proof gates

- First register this exact prospective plan via native Qor governance and obtain an **independent L3 /qor-audit PASS** tied to the source revision, current head, host policy, and exact approved write set. The hosted Qortara demo tools do not substitute for a native audit.
- Keep this PR's red tests separate from the eventual bounded `fix/` implementation PR. After approval, implement minimal shared identity parsing and comparison, not an unreviewed generic Git remote library. Validate actual GHES host-policy consequences; do not conflate source-level checks with external GitHub permission checks.
- Required proof after implementation: test all GRB cases with injected transports (0 unauthorized GET/POST), existing full `test:all`, compile/lint, macOS/Windows/Linux qualification, no observed SHIELD false PASS, real opt-in GitHub API/host conformance in an isolated account as permitted, independent review on exact commit. CI PASS alone is not installed user acceptance.
- Stop on an ambiguous enterprise host mapping, parser regression, failed negative case, incompatible client-side permission, missing native audit, or unreviewed release security behavior. **Do not merge this planning+red-tests branch as a product fix.**

**Production remains published v6.0.13; existing FailSafe 6.1.0 development on main remains unchanged.**