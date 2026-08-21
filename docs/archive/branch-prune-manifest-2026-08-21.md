# Branch prune manifest — 2026-08-21

Restore any row with:

```
git fetch origin '+refs/pull/*/head:refs/remotes/pull/*'   # if the anchor is a PR head
git push origin <sha>:refs/heads/<branch>
```

Every deleted tip is held by a permanent anchor recorded per row, so the
objects cannot be garbage-collected: `main` (tip is an ancestor of main),
`tag:<t>` (a real ref), or `refs/pull/N/head` (GitHub retains these
indefinitely). A SHA written in a document anchors nothing on its own —
the anchor column, not this file, is what makes deletion reversible.

Governed by `plan-workspace-housekeeping.md` (audit iterations 1-2 VETO,
iteration 3 PASS). This manifest is the resolution target for branch names
cited in `docs/META_LEDGER.md` that no longer resolve as refs.

**Note (dual ref):** `hotfix/v5.2.2` existed both as the remote tip below and
as a LOCAL branch carrying 2 unpushed commits. The tag anchors the remote tip
only; the local branch was retained untouched by the local-prune guard.

**Note (governance artifacts):** the last committed copies of
`.failsafe/governance/AUDIT_REPORT.md` live on `hotfix/v4.6.6` and
`plan/repo-consolidation`; both are anchored below.

## Deleted (109)

| branch | tip SHA | last commit | PRs | anchor |
|---|---|---|---|---|
| `chore/deliver-seal-v600` | `9f6f604bf4d4cb3aaa4afb7043cfd34d1ab6009f` | 2026-08-19 | #333:MERGED | main |
| `chore/v5.1.5-backlog-housekeeping` | `0184cb4539ea24e1831478158e38caa16e111a84` | 2026-05-20 | #76:MERGED | main |
| `claude/eager-rubin-14gz34` | `9ced230e817233450951ab8455735d8760ecc7e1` | 2026-08-20 | #353:CLOSED | main |
| `feat/b-int-4-mcp-client-host` | `3f500b33bd2fc6619c145e0945db81c5f4bbb496` | 2026-05-28 | — | main |
| `feat/b190-governance-contracts` | `15af5a12a636ed8b2409ce2262e08ca0d456d69c` | 2026-05-20 | #79:MERGED | main |
| `feat/b199-phase2-settings-e2e` | `e2d0fb80fd90d6339e9232fd342f2c89621423b8` | 2026-05-19 | — | main |
| `feat/b199-phase3-integrations-e2e` | `77345d0287086ed00e77d3b88d8f0f78e8e9369a` | 2026-05-19 | — | main |
| `feat/b199-phase4-agents-e2e` | `61b44b4568ee3c9533553eaf0b4aaf03d8e83df5` | 2026-05-19 | — | main |
| `feat/b199-phase5-workspace-e2e` | `f004484a3cedfec20905ba858ac3d48e05f5c1c5` | 2026-05-19 | — | main |
| `feat/b199-phase6-risks-e2e` | `6a150687a21b276058679860b020e6a26e4aa1df` | 2026-05-19 | — | main |
| `feat/b199-phase7-overview-e2e` | `9b798ea27e798e1e80f65c16cf4ccfd867dc3e9d` | 2026-05-19 | — | main |
| `feat/b199-phase8-ws-broadcasts-e2e` | `baded53d67ce7564f94dfdcd6c086d24c53d8b6a` | 2026-05-19 | — | main |
| `feat/b199-phase9-bus-renderer-e2e` | `42f176878f993521eeed5593807524189c15e586` | 2026-05-19 | — | main |
| `feat/bicameral-cluster-high` | `7a6fa72654ad026e6f112659800ec0dddb467043` | 2026-05-20 | #77:MERGED | refs/pull/head |
| `feat/bicameral-enhancements-quickwins` | `20754bf60de811c2dbe2441ecb04e992f5aeba30` | 2026-05-19 | — | main |
| `feat/bicameral-safety-concurrency` | `6cd81215be1d919e2b0393c5c4853882b47dd74a` | 2026-05-20 | #78:MERGED | main |
| `feat/enforcement-mode-escalation-ux` | `8dcafc2e8b5c3f51aae4031f3f5a49eda5cf36e3` | 2026-05-18 | — | main |
| `feat/feature-index-surface-206` | `0cbfe90add6ef5a2d75e54aaab94c6267964e20b` | 2026-06-08 | #207:MERGED | refs/pull/head |
| `feat/governance-projection-tracker` | `e39dd52a9c52fb67bb94ccc7ce6d761da945fcda` | 2026-06-06 | #190:MERGED | refs/pull/head |
| `feat/historical-genome-reconstruction` | `d7b7f5cc8a77e67026880a4fbafd74c0f461bbb3` | 2026-06-10 | #219:MERGED | refs/pull/head |
| `feat/local-cicd-prepush-gates` | `8c5e99ccd83e0b6336f951bbd64c4d142475a097` | 2026-03-07 | #8:MERGED,#7:MERGED | main |
| `feat/meta-ledger-model-197` | `93f2ad1efe63ce072c499f1ea45c6c39b01f3d99` | 2026-06-10 | #217:MERGED | refs/pull/head |
| `feat/monitor-theme-inheritance-fx881` | `26f84df46ed452b8b3fd94f7dbc95510c7be503f` | 2026-06-09 | #212:MERGED | refs/pull/head |
| `feat/organize-governed-pr` | `17ebbcad695093fa92830644f17ec22910aeac29` | 2026-06-10 | #220:MERGED | refs/pull/head |
| `feat/pr-linkage-governance-154` | `7efaa0a5f19be314c4fa2e34a801e49768076533` | 2026-06-06 | #189:MERGED | refs/pull/head |
| `feat/pr-linkage-publish-154` | `ed925aafcfd6a127e788728f0066d4b2a7153716` | 2026-06-06 | #192:MERGED | refs/pull/head |
| `feat/qor-logic-version-pinning` | `e9ef0ac399b8c32876dc4c998d1a045c0a04e18e` | 2026-05-19 | — | main |
| `feat/security-codeql-cross-platform` | `90659b3d79fe17bbfd7536cbabaabcd8a7a8c2fb` | 2026-07-16 | #267:MERGED | main |
| `feat/sentinel-governance-extensions` | `ddf10e953407bdffba92b6fe40c80f109be4de65` | 2026-05-19 | — | main |
| `feat/shadow-genome-213-wiring` | `b6ffa6563aa0d6afb8ba95dbe13239e27dca0f9e` | 2026-06-10 | #218:MERGED | refs/pull/head |
| `feat/shadow-genome-ui-196-phase1` | `39e1e5e0246c9f6ba6ef96fcf6a7d90444d60515` | 2026-06-09 | #211:MERGED | refs/pull/head |
| `feat/shadow-genome-viewer-118` | `aceacc31c06634c8c917c55b7a3f50177a1140d2` | 2026-06-06 | #191:MERGED | refs/pull/head |
| `feat/tracker-loading-freshness-163` | `25dbf630de04ac567ee7c8eb568b13ed93b8cd71` | 2026-06-06 | #187:MERGED | refs/pull/head |
| `feat/tracker-manifest-generator` | `bb59b89935f7f8f98dfbe305bb822206867c4fb2` | 2026-06-05 | #183:MERGED | refs/pull/head |
| `feat/tracker-verticals-console-spine` | `265a77339a38c79a247f74a0ba85e1106771ca1f` | 2026-06-08 | #204:MERGED | refs/pull/head |
| `feat/tracker-visual-202` | `cadff52867972d6e049533c36b26e64fda331494` | 2026-06-08 | #208:MERGED | refs/pull/head |
| `feat/v5-2-0-learn-tab-multimode` | `d7716bd8e8bd01b6485b12a5dde88ff8a3ec5bfd` | 2026-05-26 | #91:MERGED | main |
| `feat/v5.5.2-integrations-tab-surfacing` | `b35aefc2adfd455e3f42184bc3276230d3c6b8b4` | 2026-06-04 | #169:MERGED | refs/pull/head |
| `fix-l3-escalation-error-handling-14417316085261625405` | `7448eed29f16572413c55b1db52e3e6ac9ec5485` | 2026-03-11 | #21:MERGED | main |
| `fix/244-evaluation-router-confidence-cache` | `d0d923526aa035255b306f10042818e40143256e` | 2026-08-19 | #324:MERGED | main |
| `fix/244-model-export-support-bundle` | `f6faf3ab25d3ab7e76a1d0731d118894c3cc1491` | 2026-08-20 | #330:MERGED | main |
| `fix/agents-window-configure-83bc` | `0eb551a01720df843dd472c7f56573458e91e4da` | 2026-08-19 | #323:MERGED | main |
| `fix/bicameral-ui-standard` | `fb903585fb563b4db7479bad5cbda917e7bd509e` | 2026-05-19 | — | main |
| `fix/consumer-route-migration-233` | `a4bf93fb6b5e95f13e7f7d312c52a5ffb3c4ab5f` | 2026-08-19 | #328:MERGED | main |
| `fix/ecosystem-position-2026-07` | `4d6657a26a7b6565622bd68cec32c5ecf9c95873` | 2026-07-14 | #266:MERGED | refs/pull/head |
| `fix/governance-index-archive-cleanup` | `27c9acebc7e697a2d1bccc52e3d0b34dd1b9a48c` | 2026-06-10 | #214:MERGED | refs/pull/head |
| `fix/integration-defects-241c` | `160e18e23521d37f4f120178f2723d2b238ec502` | 2026-08-19 | #331:MERGED | main |
| `fix/meta-ledger-utf8-chain-repair` | `7e1fb0e735194c27c255ebbf1db28d8030f30fd9` | 2026-06-09 | #210:MERGED | refs/pull/head |
| `fix/mindmap-list-view-325` | `c6302b04a4a37bfc49b7dbee14ac65cc3507b3d6` | 2026-08-19 | #329:MERGED | main |
| `fix/monitor-alert-console-deeplink` | `8e07a5a02415a20f1701ca9c2bcfa6404fca6f56` | 2026-08-20 | #334:MERGED | main |
| `fix/observe-mode-test-coverage` | `60f9ad2f88e85cf9570fac90d46d8f054acd373c` | 2026-03-13 | #27:MERGED | main |
| `fix/tracker-live-accuracy` | `d1aa251a6e8c3d8d3b6a3af62c437043aefb9141` | 2026-06-08 | #205:MERGED | refs/pull/head |
| `fix/v5.4.3-deliver-closeout` | `06636012912aba314f633a3f6069d8f4e1825107` | 2026-06-03 | #143:MERGED | main |
| `fix/v5.5.2-bicameral-team-setup` | `24e31fd05cb0d0a678bd7891f9f4c840dfd75541` | 2026-06-04 | #168:MERGED | refs/pull/head |
| `fix/v5.5.2-playwright-subview-regression` | `dbb412376f5c27c589b691efd567f7e8d75c3dcd` | 2026-06-04 | #171:MERGED | refs/pull/head |
| `fix/vsix-hygiene-243a` | `17cd9d655bac8900c5b8b8b56d219a6f85f70b29` | 2026-08-19 | #327:MERGED | main |
| `fix/workspace-organize-cleanup` | `38c60d26c572d17be38f0202e33415fe0b4496f6` | 2026-06-10 | #221:MERGED | refs/pull/head |
| `hotfix/v4.5.1` | `f573d48a75ed62c54fcc305fe02b96357f71fb4f` | 2026-03-07 | #9:MERGED | main |
| `hotfix/v4.6.1` | `21520f87000a136294054eb1fe6b85c4eca199d2` | 2026-03-08 | #11:MERGED | main |
| `hotfix/v4.6.2` | `e11d413a8ba27bb53f3d15cddba3ce4d84e88d28` | 2026-03-08 | #12:MERGED | main |
| `hotfix/v4.6.3` | `2f47cd42e8e0c4d7a8f3e828672733b874d23052` | 2026-03-09 | #14:MERGED,#13:MERGED | tag:v4.6.5 |
| `hotfix/v4.6.5` | `46242d155e76e54d4944f31365d048dc77f532ef` | 2026-03-09 | #15:MERGED | refs/pull/head |
| `hotfix/v4.6.6` | `2088f86a5c74ae1d7a18431915d461f39022469b` | 2026-03-09 | #17:MERGED | refs/pull/head |
| `hotfix/v4.7.1-test-fix` | `af6b56b9ec833022bcfb29602b406112a595b543` | 2026-03-10 | #19:MERGED | refs/pull/head |
| `hotfix/v4.8.0-version-markers` | `110948ae702806532faf07aca49da07ab57645d8` | 2026-03-13 | #29:MERGED | main |
| `hotfix/v4.9.7-docs` | `b437221a8df9f03d323324bd727b93656194c2bc` | 2026-03-17 | #41:MERGED | main |
| `hotfix/v4.9.7-release-fix` | `5cc6cbe6be48c6e9ac87d3cba60252b5a40b93c6` | 2026-03-17 | #40:MERGED | refs/pull/head |
| `hotfix/v4.9.7-skill-validation` | `588ae5c8db70817e15ebb58604e45b049d236eca` | 2026-03-17 | #43:MERGED,#42:MERGED | main |
| `hotfix/v4.9.8` | `a1dc59e3198e983b29a069ebdaa3d3771bdde2c9` | 2026-03-17 | #44:MERGED | main |
| `hotfix/v5.1.6-ci-fix` | `678c8711b94e27e5921f11504ecd0016c8d590fe` | 2026-05-21 | #81:MERGED | main |
| `hotfix/v5.2.1` | `7631ac1d0496aa4eef5bfdc975ed94f200b6cd48` | 2026-05-26 | #93:MERGED | main |
| `hotfix/v5.2.2` | `a77e3518bbab41615c55f69d1f967217cb078903` | 2026-05-27 | #94:MERGED | tag:archive/prune-2026-08-21/hotfix-v5.2.2 |
| `hotfix/v5.6.1` | `a740dd4b894ecdae3c72cccdb4fede119e550305` | 2026-06-05 | #184:MERGED | refs/pull/head |
| `hotfix/v5.6.3` | `78d44bba3634a0345a5c66227b8eea0aaee2ca4d` | 2026-06-06 | #193:MERGED | refs/pull/head |
| `plan/agent-run-replay-governance-contracts` | `eade463c24f4e03dc60b680db73cc9959c610e5c` | 2026-03-13 | #31:MERGED | main |
| `plan/cc-consolidation-audit-skills` | `3958382598ca87067c1398e0c445890e52834a38` | 2026-03-16 | #35:MERGED | main |
| `plan/fix-governance-propagation` | `616f66e45e5077e308a0f54b5a5f6338ecb848a5` | 2026-03-16 | #36:MERGED | main |
| `plan/infrastructure-hardening-v492` | `c4834cab136c65b4b2872b8ff74b217e8cb01e96` | 2026-03-13 | #30:MERGED | main |
| `plan/repo-consolidation` | `4a481e801302b48c9d8c6ec80f30b0f3d9244be0` | 2026-03-09 | #16:MERGED | tag:archive/prune-2026-08-21/plan-repo-consolidation |
| `plan/sre-panel` | `a1bdec5a28589549557dbd2477a84db8ba97c666` | 2026-03-16 | #38:MERGED | main |
| `plan/v2.0.1-tooltip-remediation` | `034300790acca6242e9ddc6d6bae6fd1eb5c03ff` | 2026-02-05 | #3:MERGED,#2:MERGED | main |
| `plan/v3.0.0-ui-consolidation` | `e6409685f1fa8db25f86502bdce9d54ef73d9e85` | 2026-02-06 | #4:MERGED | main |
| `plan/v3.0.2-dashboard-remediation` | `31a7bfaf10343d8965da2fefcac2567390d5b605` | 2026-02-06 | — | main |
| `plan/v3.1.0-cumulative-roadmap` | `c0017b0ed7efc6c5fb3d94f3167b7e17d6218594` | 2026-02-09 | — | main |
| `plan/v4.9.5-pre-v5-sweep` | `af994ddc97730dd426c9e2836d55023976ce877d` | 2026-03-16 | #37:MERGED | main |
| `plan/v497-diagnostic-fixes` | `cee97ba49fc70c5d2dca3c4aff0a2e3f736499ba` | 2026-03-17 | #39:MERGED | main |
| `plan/v5-extension-update` | `72192c8852d9760fa8f8f9bfe4a403568cee0287` | 2026-05-14 | #64:MERGED | main |
| `release/v1.0.7` | `f207ab174b300633362ec249da876d3f61f75961` | 2026-02-04 | #1:MERGED | main |
| `release/v3.0.1` | `3074a5eb8460ba4ab51b21c439e83f4f3d0b1e8d` | 2026-02-06 | #5:MERGED | main |
| `release/v4.6.0` | `8a24faf42a850960c70c44ae4213b49987031e39` | 2026-03-08 | #10:MERGED | main |
| `release/v4.7.0` | `737061fc952fd427dc7e1ea3ac8a7fd63cddd6cc` | 2026-03-10 | #18:MERGED | refs/pull/head |
| `release/v4.7.2` | `8c4444305545778b58c51131e61aced7eb794d62` | 2026-03-12 | #23:MERGED | refs/pull/head |
| `release/v4.8.0` | `5c67a0943c479f11a8fc4f8c0e5b43465d8f881f` | 2026-03-13 | #28:MERGED | main |
| `release/v4.9.0` | `1d97438651157e86ce0d28ab5fa905c22dc739f5` | 2026-03-13 | #32:MERGED | main |
| `release/v4.9.2` | `84c4dfc3a6e245d612f44cd562119baddaa0c52d` | 2026-03-13 | #34:MERGED,#33:MERGED | main |
| `release/v5.1.5` | `60fd7ca4202de9ebded462e026a7597040c713af` | 2026-05-20 | #75:MERGED,#74:MERGED,#73:MERGED,#72:MERGED | main |
| `release/v5.2.0` | `ba9a927eb83535750fd16c15d32ba389b89f2fb0` | 2026-05-26 | #92:MERGED | main |
| `release/v5.3.0` | `08916d90ade2c20f3c127db032fd9dbe2f52ff7f` | 2026-05-28 | #112:MERGED | main |
| `release/v5.5.1-closeout` | `0bdac030e07f71e95634cefd206785b15ea6931a` | 2026-06-04 | #164:MERGED | refs/pull/head |
| `release/v5.5.2` | `93fb8e58f61494ce5cf97298e41d7cbf9e0932da` | 2026-06-04 | #170:MERGED | refs/pull/head |
| `release/v5.6.0-deliver` | `b00e267d7ec4200f0e0fc3b25ab2f4d08a9da9f8` | 2026-06-04 | #181:MERGED | refs/pull/head |
| `release/v5.6.1-closeout` | `06f296ca4421f0bbadddf855d5b5a988d786055a` | 2026-06-05 | #186:MERGED | refs/pull/head |
| `release/v5.6.2-closeout` | `20ab120b484e108f9070d3222e30f0f4ed073991` | 2026-06-06 | #188:MERGED | refs/pull/head |
| `release/v5.6.4` | `5e16b656dd74849ab1a494e50ee9b0ffc4f8c01a` | 2026-06-08 | #209:MERGED | refs/pull/head |
| `release/v5.7.0` | `ede3afbac1b2f07115ab9dccd57b781eeb8f1b1c` | 2026-06-10 | #215:MERGED | refs/pull/head |
| `release/v5.7.0-closeout` | `e86e58dde8ab168836491c0ffab663ad2bca2f89` | 2026-06-10 | #216:MERGED | refs/pull/head |
| `release/v5.8.0` | `eccf45c46057bcda39bb0ed564108627476a38aa` | 2026-06-10 | #222:MERGED | refs/pull/head |
| `release/v6.0.0` | `7c6ce181df755aa5e9b0a7a5ec94914c4f2d5933` | 2026-08-19 | #332:MERGED,#318:MERGED,#294:MERGED | main |
| `release/v6.0.1` | `99a76e6ac6e11741c14e98e353a4d4504e7ba993` | 2026-08-20 | #335:MERGED,#310:CLOSED | main |

## Retained (22)

| branch | tip SHA | last commit | PRs | reason |
|---|---|---|---|---|
| `docs/ecosystem-position-2026-07` | `4d6657a26a7b6565622bd68cec32c5ecf9c95873` | 2026-07-14 | #265:CLOSED | closed PR (fail-closed retention) |
| `feat/agent-cli-wrappers` | `4dc1e009ad0b48a9c964cf32bf8d29971c5734ba` | 2026-06-04 | #151:CLOSED | closed PR (fail-closed retention) |
| `feat/agent-observe-adapters` | `16fe8db38bfeb5036008c82677c496cbfdd94340` | 2026-06-04 | #152:CLOSED | closed PR (fail-closed retention) |
| `feat/github-checks-integration` | `9f36fe022c121caf4a7b0b99fdacabe2b34fd37e` | 2026-06-03 | #147:CLOSED | closed PR (fail-closed retention) |
| `feat/jira-import` | `c100ec576571363e7237646f2c9d0f2281de6a2b` | 2026-06-03 | #148:CLOSED | closed PR (fail-closed retention) |
| `feat/linear-import` | `49e8911219b64ff5d769e10261b962f21794daca` | 2026-06-03 | #145:CLOSED | closed PR (fail-closed retention) |
| `feat/open-design-integration` | `67b2c44f907d14d16ddaa7c1c7c391de910e56cb` | 2026-05-27 | — | no PR ever opened |
| `feat/sentry-import` | `fd62b8118524dbb8d4eb01c845ae05ff7cff4407` | 2026-06-04 | #150:CLOSED | closed PR (fail-closed retention) |
| `feat/supply-chain-security-baseline` | `fa3060588498449e435b5222301346fa315995e4` | 2026-06-03 | #146:CLOSED | closed PR (fail-closed retention) |
| `feat/teams-notify` | `97c116de2c4325c6ae5a957c20afabba37bb857d` | 2026-06-03 | #144:CLOSED | closed PR (fail-closed retention) |
| `feat/tracker-pr-incremental-render` | `35a8af01c2d6aaafe1fbad9853c93cd3edade4a8` | 2026-06-05 | #182:CLOSED | closed PR (fail-closed retention) |
| `fix/297-governance-adapter-preflight-fail-closed` | `a9bbcdd4d602260749526071635ff8031a133c81` | 2026-08-19 | #321:CLOSED | closed PR (fail-closed retention) |
| `fix/297-verdict-generation-timeout-fail-closed` | `1dec6889bc442fa2a7631ff3611b192d6a7306ec` | 2026-08-20 | #322:CLOSED | closed PR (fail-closed retention) |
| `fix/319-brainstorm-workspace-identity-hub-sync` | `2daa1c0a27d6be9bea8cdeef5e4ad3c756d9bde7` | 2026-08-19 | #320:CLOSED | closed PR (fail-closed retention) |
| `fix/add-observe-mode-tests-4798670192534512734` | `981d7f9fee3c1c6708fd1d5a083fe5c836fa9418` | 2026-03-13 | #26:CLOSED | closed PR (fail-closed retention) |
| `fix/deflake-idle-scheduler` | `e0a1cee8fbde2a9367c4373066ee317bff6b9438` | 2026-06-03 | #149:CLOSED | closed PR (fail-closed retention) |
| `fix/version-bump` | `ad0ec0260a635702ea595db4d15a074e5bf022d1` | 2026-03-11 | — | no PR ever opened |
| `plan/agent-debugging-suite` | `78eef853ed9334d3ddae93ec90d24069f7ade192` | 2026-03-13 | — | no PR ever opened |
| `plan/diff-guard` | `afba803895969a106e449e55518d72eb9acb2383` | 2026-03-13 | — | no PR ever opened |
| `plan/v3.2.5-failsafe-console-overhaul` | `dd4252746021045ac5e2bc993baf014dd14817b4` | 2026-02-11 | — | no PR ever opened |
| `plan/voice-brainstorm-mindmap-prod-readiness` | `bea72d425d67377da898ed2789085410c708be5f` | 2026-03-13 | — | no PR ever opened |
| `test-improvement-security-utils-12218428889311583589` | `9c484d47d15e42a152708e72d2cac6eb00cd3f19` | 2026-03-13 | #25:CLOSED,#20:MERGED | closed PR (fail-closed retention) |
