# G4 historical-gap statement

This file is bound into every G4 checkpoint manifest by its SHA-256. Changing
it changes what every later checkpoint attests; earlier checkpoints keep the
digest of the version they bound.

G4 checkpoints attest only to the complete committed bytes of
`docs/META_LEDGER.md` from the genesis checkpoint onward, "after clean epoch
#914". They do not re-verify, repair or reinterpret any earlier history:

- The pre-anchor native hash-chain break at Entry #382 is disclosed and remains.
  `verify-ledger --post-anchor` checks the chain after the anchor only.
- The October operator-local VETOs #610, #611 and #612 and event `7126134e`
  remain UNKNOWN/UNRESOLVED. G4 does not close, supersede or reinterpret them.
- Ledger bytes that existed before the genesis checkpoint are covered from
  then on only in the sense that later checkpoints prove they did not change
  after genesis. Nothing proves what they were before genesis.
