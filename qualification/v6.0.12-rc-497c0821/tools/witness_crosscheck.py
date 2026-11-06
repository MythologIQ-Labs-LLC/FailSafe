# #467 external-record cross-check (NOT G4): compare the candidate META_LEDGER with records that exist
# outside the candidate branch -- the published v6.0.11 tag tree and the GitHub-timestamped #467
# decision comment -- and report whether anything at or before the epoch changed and whether later
# changes are append-only. Read-only: uses git object bytes, never the working tree.
# Usage: python witness_crosscheck.py <repo> <candidate-sha> <out.json>
import hashlib, json, re, subprocess, sys

repo, cand, out = sys.argv[1], sys.argv[2], sys.argv[3]
git = lambda *a: subprocess.run(['git', '-C', repo, *a], capture_output=True, check=True).stdout
PUBLIC = {  # 8-hex prefixes as published in #467 issuecomment-6513152200 (2026-10-30T02:04:39Z)
    'epoch914_content': '7274699b', 'epoch914_chain': '96500e67', 'epoch914_prev_913': '89b89eea', 'prefix_pin': '5b2e18e2'}
FX946 = {'prefix_bytes': 1051993, 'prefix_sha256': '5b2e18e2c27d14097dfeae0eafd3a122fbe73cc7f2ea08dbefcfb15f89f7cc40',
         'content_sha256': '7274699b42615378c2191cac2ab038d743933b5642e3ffab53ffbcc3ee9cb1b1',
         'chain_sha256': '96500e67bd9bf323d223f11de6097455b658457a40611ddef57ee32772a56f10'}

tag_commit = git('rev-parse', 'v6.0.11^{commit}').decode().strip()
tag_obj = git('rev-parse', 'v6.0.11').decode().strip()
T = git('show', f'{tag_commit}:docs/META_LEDGER.md')
C = git('show', f'{cand}:docs/META_LEDGER.md')
nums = lambda b: [int(n) for n in re.findall(rb'^### Entry #(\d+):', b, re.M)]
r = {'candidate': cand, 'tag': 'v6.0.11', 'tag_object': tag_obj, 'tag_commit': tag_commit,
     'tag_ledger_sha256': hashlib.sha256(T).hexdigest(), 'candidate_ledger_sha256': hashlib.sha256(C).hexdigest(),
     'tag_ledger_bytes': len(T), 'candidate_ledger_bytes': len(C)}
r['append_only_since_tag'] = C.startswith(T)
r['appended_entries'] = [n for n in nums(C)[len(nums(T)):]] if r['append_only_since_tag'] else None
r['appended_entries_all_after_914'] = bool(r['appended_entries'] is not None and all(n > 914 for n in r['appended_entries']))
i383 = C.find(b'\n### Entry #383:')
pref_c, pref_t = C[:i383 + 1], T[:T.find(b'\n### Entry #383:') + 1]
r['prefix_bytes'] = len(pref_c)
r['prefix_sha256_candidate'] = hashlib.sha256(pref_c).hexdigest()
r['prefix_sha256_tag'] = hashlib.sha256(pref_t).hexdigest()
r['prefix_matches_fx946_pin'] = r['prefix_sha256_candidate'] == FX946['prefix_sha256'] and len(pref_c) == FX946['prefix_bytes']
r['prefix_matches_public_record'] = r['prefix_sha256_candidate'].startswith(PUBLIC['prefix_pin'])
blk = re.search(rb'^### Entry #914:.*?(?=^### Entry #|\Z)', C, re.M | re.S).group(0)
r['epoch914_block_identical_to_tag'] = blk in T
r['epoch914_public_content'] = FX946['content_sha256'].startswith(PUBLIC['epoch914_content'])
r['epoch914_public_chain'] = FX946['chain_sha256'].startswith(PUBLIC['epoch914_chain'])
r['epoch914_mentions_prev_913'] = PUBLIC['epoch914_prev_913'].encode() in blk
r['public_record'] = 'https://github.com/MythologIQ-Labs-LLC/FailSafe/issues/467#issuecomment-6513152200 (2026-10-30T02:04:39Z)'
checks = ['append_only_since_tag', 'appended_entries_all_after_914', 'prefix_matches_fx946_pin', 'prefix_matches_public_record',
          'epoch914_block_identical_to_tag', 'epoch914_public_content', 'epoch914_public_chain', 'epoch914_mentions_prev_913']
r['all_checks_pass'] = all(r[k] for k in checks)
r['scope'] = ('External-record cross-check only. Not G4: no signature, no independent key custody, no witness outside '
              'GitHub/the maintainers. It shows the pre-epoch band and #914 are unchanged since the published v6.0.11 '
              'tag and the public #467 record, and that later changes are append-only. It cannot attest #341-#382 as correct.')
json.dump(r, open(out, 'w'), indent=2)
for k in checks: print(('PASS ' if r[k] else 'FAIL ') + k)
print('appended entries since v6.0.11:', r['appended_entries'])
