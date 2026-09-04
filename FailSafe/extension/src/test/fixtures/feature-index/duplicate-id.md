# FEATURE INDEX (fixture)

Deliberately malformed. Two rows claim `FX930`, which is the shape produced when two
cycles each allocate `max(FX) + 1` against divergent local views of the index — the
FEATURE_INDEX analogue of a ledger fork. Used to prove the duplicate detector fires;
without it the detector could only ever be observed passing.

| ID | Feature | Doc | Code | Test | Status | Notes | Surface |
|---|---|---|---|---|---|---|---|
| FX929 | first | d | c | t | verified | n | governance |
| FX930 | second | d | c | t | verified | n | governance |
| FX930 | third — collides with the row above | d | c | t | verified | n | governance |
| FX931 | fourth | d | c | t | verified | n | governance |
