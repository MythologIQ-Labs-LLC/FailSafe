'use strict';

/**
 * Controls that cannot be made to fail here because they do not apply — not
 * because they are broken. Reporting these as NOT-FALSIFIABLE would be true and
 * misleading, so they are declared with their evidence and never run.
 *
 * This list is Scope C's job to own properly; it is inline so Scope B ships
 * independently. Each entry cites the ledger entry that established it.
 */
const INAPPLICABLE_CONTROLS = [
  { id: 'seal_artifacts',
    reason: 'expects a pytest collected-count and README count-badges; this is a TypeScript archetype',
    evidence: 'ledger #602' },
  { id: 'seal_entry_check',
    reason: 'requires a numeric ledger phase tag this repository does not use',
    evidence: 'ledger #601, #603' },
  { id: 'qor-repo-release',
    reason: 'hard-stops without a Python version backend (detect_backend() returns null)',
    evidence: 'ledger #605' },
];

module.exports = { INAPPLICABLE_CONTROLS };
