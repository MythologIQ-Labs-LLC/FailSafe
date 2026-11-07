# #476 production SHIELD check: prerequisites (research, 2026-11-07, candidate `497c0821`)

## What exists

- **Publisher:** `publishVerifiedShieldCheck` (`integrations/github-checks/shield-check-publish.ts`) runs these steps in order:
  1. config guards;
  2. HEAD and repository agreement between the context and the evidence source;
  3. `verifyShieldReceipt`;
  4. a HEAD re-read before the POST;
  5. echo validation.

  The comment states plainly that "A positive check is a local HMAC attestation, not CI-attested."
- **Verifier:** `verifyShieldReceipt` (`shield-receipts/shield-receipt-verifier.ts`). Step 18 returns `neutral('chain-not-ok')` unless `NativeChainStatus.check()` returns `OK`. Neutral posts nothing.
- **Default chain status:** `unavailableChainStatus` always returns `UNAVAILABLE`. The source comment: "until a native ledger verifier is wired in, success is unreachable in production by design."
- **Evidence source:** `workspace-evidence-source.ts` implements `ShieldEvidenceSource`.

## What is missing (each a prerequisite for any verified-positive check)

| # | Prerequisite | State |
|---|---|---|
| 1 | Production caller | none. Only tests reference `publishVerifiedShieldCheck`; the VS Code command publishes neutral advisories only |
| 2 | `NativeChainStatus` adapter | none. It must run frozen qor-logic 0.176.1 (`governance-health`, `verify-ledger --post-anchor`) against the **exact commit**, at the verified wheel |
| 3 | Native chain covers entry prose | **no.** Verdict and Decision text edits verify clean (earlier receipts). A chain `OK` therefore does not authenticate the receipt's audit text; #467 G4, a signed witness over the full ledger bytes, closes that |
| 4 | `ReceiptKeyProvider` with defined custody | no production implementation; the key custody decision is the owner's |
| 5 | A real receipt from an actual `/qor-audit` PASS and `/qor-substantiate` seal on the exact HEAD | **does not exist** for v6.0.12 (the ledger is unchanged since v6.0.11) |
| 6 | GitHub permission: App installation token or PAT with `checks:write`, fork-safe and off by default | not configured |
| 7 | Policy pin `pinnedQorVersion: '0.176.1'` with a conformance PASS | conformance is **NOT PASS** (#463) |

**Conclusion:** no verified-positive SHIELD check can or should be produced now. Nothing was published, and no receipt was generated.
