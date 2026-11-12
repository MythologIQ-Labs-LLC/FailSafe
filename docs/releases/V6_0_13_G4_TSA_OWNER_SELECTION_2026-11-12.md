# FailSafe v6.0.13 G4: Owner TSA selection (2026-11-12)

**Status:** OWNER SELECTED PROVIDER. Technical trust admission is DONE: the root was corroborated on 2026-11-12, and the single-root `tools/g4/tsa-policy.json` is committed with it under independent audit (ledger Entries #956 onward). Release qualification is PENDING.
**Decision authority:** solo repository owner, stated in discussion on 2026-11-12. This records the selected service, not an agent-issued operational release approval.
**Parent proposal:** PR #647, decision **#3** in `V6_0_13_G4_OWNER_DECISION_RECORD_PROPOSED.md`. That table now records item #3 as decided by this file (reconciled 2026-11-12). **This file is the dated owner decision for item #3.**

## Owner-selected service and conditions

- **Provider:** FreeTSA **public** RFC 3161 Time-Stamp Authority, `https://freetsa.org/tsr`.
- **Economic/licensing policy:** no mandatory fee, subscription or ongoing required payment; explicit public-service permission for commercial incorporation of issued timestamp tokens without a separate paid licence. No paid/dedicated FreeTSA instance authorized.
- **Published usage condition:** at most one request per second per IP. Donations are voluntary. No service-level, uptime, response-time or recovery guarantee.
- **Explicit security trade-off:** the operator uses a private/self-signed CA, outside public trust programs. No independent audit assurance has been established. The service is a best-effort independent witness, not a high-assurance certified TSA. A single approved root pin is required; fail closed if the service is unavailable, untrusted or the RFC 3161 receipt is invalid.
- **Evidence sources:** https://freetsa.org/freetsa.html and https://freetsa.org/index_en.php, checked 2026-11-12. Published conditions may change; retain a dated copy and hash during technical admission.
- **Selection does not include** Qortara Logic, UOR, a custom TSA or a second/fallback trust root. Any future replacement requires a new owner decision and independent qualification.

## Operational prerequisites (items 1 to 3 done 2026-11-12; items 4 and 5 not yet authorized or completed)

1. On the owner/local host, independently obtain `https://freetsa.org/files/cacert.pem` and corroborate the CA identity. Compute **DER SHA-256** and compare to the previously inventoried *candidate* `a6379e7cecc05faa3cbf076013d745e327bbbaa38c0b9af22469d4701d18aabc`. A mismatch is a blocker, not an invitation to update the pin by assumption. This conversation could not retrieve the actual certificate bytes, so it is **not verified here**. **Done 2026-11-12 on the owner host:** the DER SHA-256 matches, corroborated by 10 independent sources; evidence is at `.failsafe/governance/evidence/g4-freetsa/` on branch `feat/638-g4-freetsa-root`.
2. Test a fresh SHA-256 RFC 3161 timestamp and chain using only this root; reject swapped imprint, wrong root, malformed or expired tokens and outages. Preserve the raw evidence without secrets. **Done 2026-11-12:** see the evidence README.
3. Only after independent root identity, actual compatible token and native governance audit, commit the root PEM and the **single-root** `tools/g4/tsa-policy.json` update through a separate qualified PR. Do not turn `status` to `selected` until the actual blob is verified and committed with policy. **Done:** the root is committed as `tools/g4/tsa-roots/freetsa-root-ca.pem`, and the policy is `selected` with that one root.
4. Keep the owner's TPM signing key non-exportable and under separate explicit local enrollment approval. Store owner certificate fingerprint and each checkpoint head **outside the repository before publication**, not merely in GitHub.
5. Require genuine genesis and `g4-verify-checkpoint.cjs --release` PASS on clean exact qualified release commits and independent release gates before release GO.

**Owner authority boundaries:** This record **does not** approve TPM enrollment, signed checkpoints, key rotation, revocation actions, certificate publication, a release tag or publication. Owner responses to other #647 decisions must be explicitly recorded, with the intended no-deferral architecture and actual implementation risk assessed separately. The release remains **NO-GO** until all checks and approvals pass.

**Rollback:** no runtime or cryptographic state changed by this decision file. If FreeTSA fails independent qualification, stop the v6.0.13 seal and return provider selection to owner. Never auto-fallback to an unapproved TSA.
