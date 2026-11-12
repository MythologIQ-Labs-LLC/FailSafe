# G4 FreeTSA root and interoperability qualification (2026-11-12)

Evidence for the single-root TSA policy (`tools/g4/tsa-policy.json`, `tools/g4/tsa-roots/freetsa-root-ca.pem`). Collected on the owner workstation (Windows 11, OpenSSL 3.5.7, Node v24.19.0) between 2026-11-12T15:05Z and 15:40Z. Raw files are kept as retrieved. Two changes were made for the repository: `.pem` files carry an extra `.txt` suffix (the repository ignores `*.pem`), and local directory names in tool output are replaced by `<scratch>`.

## 1. Root identity

The candidate pin from the 2026-11-10 inventory was DER SHA-256 `a6379e7cecc05faa3cbf076013d745e327bbbaa38c0b9af22469d4701d18aabc`. **It matches.** Every source below gives the same DER SHA-256.

| Source | Retrieved | File in `root-sources/` | DER SHA-256 |
|---|---|---|---|
| `https://freetsa.org/files/cacert.pem` (live, HTTPS) | 2026-11-12 | `freetsa.org_files_cacert.pem.txt` | `a6379e7c…18aabc` |
| `https://www.freetsa.org/files/cacert.pem` (live, HTTPS) | 2026-11-12 | `www.freetsa.org_files_cacert.pem.txt` | `a6379e7c…18aabc` |
| Internet Archive capture 2016-08-29 | via `web.archive.org/web/2017…id_/` | `wayback-2017.pem.txt` | `a6379e7c…18aabc` |
| Internet Archive capture 2019-07-23 | | `wayback-2019.pem.txt` | `a6379e7c…18aabc` |
| Internet Archive capture 2021-04-22 | | `wayback-2021.pem.txt` | `a6379e7c…18aabc` |
| Internet Archive capture 2022-12-06 | | `wayback-2023.pem.txt` | `a6379e7c…18aabc` |
| Internet Archive capture 2025-03-06 | | `wayback-2025.pem.txt` | `a6379e7c…18aabc` |
| GitHub `trbs/rfc3161ng` `data/freetsa_cacert.pem`, first committed 2018-09-18 | 2026-11-12 | `gh-trbs_rfc3161ng.pem.txt` | `a6379e7c…18aabc` |
| GitHub `huridocs/preserve` `files/freetsa/cacert.pem`, first committed 2022-05-17 | 2026-11-12 | `gh-huridocs_preserve.pem.txt` | `a6379e7c…18aabc` |
| GitHub `chainloop-dev/chainloop` `devel/devkeys/freetsa.pem`, first committed 2025-02-20 (second certificate of two; the first is FreeTSA's previous TSA signer) | 2026-11-12 | `gh-chainloop-dev_chainloop.pem.txt` | `a6379e7c…18aabc` |

The Internet Archive captures and the three repositories were made by other parties at other times, from 2016 to 2025. To substitute the root, an attacker would have had to alter all of them as well as the live site.

**Certificate:** subject = issuer = `O=Free TSA, OU=Root CA, CN=www.freetsa.org, emailAddress=busilezas@gmail.com, L=Wuerzburg, ST=Bayern, C=DE`; serial `C1E986160DA8E980`; valid 2016-03-13 to 2041-03-07; RSA 4096, sha512WithRSAEncryption; CA:TRUE; key usage Certificate Sign and CRL Sign. The PEM file's SHA-256 `2151b61137ffa86bf664691ba67e7da0b19f98c758e3d228d5d8ebf27e044438` equals the value FreeTSA prints on `index_en.php`, and the committed file is byte-identical to it.

**Current TSA signer** (`root-sources/freetsa.org_files_tsa.crt`): serial `C2E986160DA8E9CD`, valid 2026-02-15 to 2040-02-02, EKU critical Time Stamping, issued by the root above (`openssl verify` OK). Its SHA-256 `32e841a9…b191fc` (DER) is the certificate embedded in every token below, and its file SHA-256 `8bfb0305…a13467` equals the value FreeTSA prints.

**Revocation data:** `root_ca.crl.pem.txt` (SHA-256 `13d85acc…031935`). Its signature verifies against the root. Last update 2026-09-18, next update 2027-09-18, and it lists no revoked certificates. The OCSP responder named in the signer certificate (`http://www.freetsa.org:2560`) did not answer within 60 s from this host, so no OCSP evidence is recorded.

**Published terms:** `freetsa.org_freetsa.html` (SHA-256 `7890c117…38e942`, identical to the copy retained on 2026-11-10) and `freetsa.org_index_en.php`.

## 2. Interoperability and rejection (`scripts/`, `run1/`, `run2/`)

`scripts/qualify-freetsa.cjs <repo> <out>` with its two parts. It reads the exact candidate `tools/g4/tsa-policy.json` (SHA-256 `738f5cb1…5bf670`) and the root PEM it names. Both are recorded in `results.json`.

- **Part A**: three real FreeTSA tokens, each for SHA-256 of 64 fresh random bytes, checked with `openssl ts -verify` against the pinned root alone. Then the rejection cases.
- **Part B**: the real G4 verifier (`verifyCheckpoints`, `--release`) over throwaway Git repositories. They carry the exact policy and root bytes, a copy of the real ledger, and an ephemeral software test signer (certificate in `part-b-ephemeral-test-signer.cer`; its private key was never retained). Two real FreeTSA-witnessed checkpoints were made, and their five files each are in `part-b-base-checkpoints/`.

**`run2` (final): 42 of 42 expectations met.**

- Every token was granted with SHA-256, signed by the published signer, and verified against the pinned root alone.
- **Wrong roots rejected:**
  - the public Mozilla bundle;
  - a forged self-signed root with FreeTSA's exact subject DN.
- **Substituted imprints rejected:**
  - a random digest;
  - another token's digest.
- **Malformed tokens rejected:**
  - truncated;
  - signature byte flipped;
  - a genTime digit inside the signed TSTInfo flipped;
  - the nonce flipped;
  - random bytes;
  - empty.
- **Verification-time window:**
  - OK at token time;
  - rejected before the signer's validity ("not yet valid");
  - rejected after the signer expires ("certificate has expired");
  - rejected after the root expires.
- **Release verification:** `PASS OK`, `mode: release`, no limitations. A stale trusted head was `REFUSED HEAD_MISMATCH`.
- **Policy rejections:**
  - status pending: `BLOCKED TSA_POLICY_UNSELECTED`;
  - status selected with no root: `BLOCKED TSA_POLICY_UNSELECTED`;
  - digest one hex digit off: `REFUSED TSA_ROOT_MISMATCH`;
  - root file missing: `REFUSED TSA_POLICY_MISSING`;
  - root replaced by the same-DN forgery with its digest updated: `REFUSED TOKEN_INVALID`.
- **Token rejections:**
  - a token substituted between checkpoints: `REFUSED TOKEN_IMPRINT_MISMATCH`;
  - a byte-flipped token: `REFUSED TOKEN_INVALID`.
- **Overrides:**
  - `--tsa-ca` in release mode: `BLOCKED TSA_OVERRIDE_NOT_RELEASE`;
  - public roots in diagnostic mode: `REFUSED TOKEN_INVALID`, so there is no fallback.
- **Outages.** Each case left no checkpoint or staging directory:
  - connection refused;
  - unresolvable host;
  - HTTP 503;
  - HTTP 200 with an empty body;
  - HTTP 200 with garbage;
  - no answer within the timeout.

**`run1` (kept unchanged): 37 of 39.** Both misses were errors in my own test expectations. Neither was a verifier defect.

1. **Missing root file.** I expected `BLOCKED TSA_POLICY_MISSING`. The verifier returns `REFUSED TSA_POLICY_MISSING`, which still fails closed. The expectation was corrected.
2. **"Byte inside TSTInfo flipped".** This was a fixed offset of one third of the length, and it landed in the CMS `certificates` field, which is outside the signature by design. OpenSSL took the genuine signer from the separately supplied chain, matched by the signed ESSCertID, and the token verified.

   In `run2` this case is replaced by two cases:
   - flips located inside the signed TSTInfo (genTime and nonce), both rejected;
   - an explicit unsigned-certificate case: it verifies with the genuine chain, and is rejected without it.

## 3. Network use

- **FreeTSA** received 10 RFC 3161 queries, 5 per run, at least 2 s apart. Each was for SHA-256 of 64 fresh random bytes. No repository content, key, path or secret was sent.
- **Read-only HTTPS GETs:**
  - the root, the signer certificate, the two policy pages and the CRL from freetsa.org;
  - five Internet Archive captures;
  - three GitHub file reads.
- **One GitHub code search** for the first line of the root's public base64.
- **One OCSP query** to `www.freetsa.org:2560` for the signer serial. It got no answer.
- **Outage cases** used `127.0.0.1` and a reserved `.invalid` name only.
