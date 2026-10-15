# Recovering an interrupted release

The release workflow (`.github/workflows/release.yml`) builds the eight platform packages once per tag. It publishes that one set to the VS Code Marketplace and Open VSX, then attaches the same files and `SHA256SUMS.txt` to the GitHub Release. A second build produces different bytes, so a release must always finish from the set it started with.

Only the operator runs these steps, and only with explicit approval. They publish outside the `production` environment gate, so an agent never runs them.

## The normal path: Re-run failed jobs

If a publish job or the GitHub Release job fails, open the failed run and choose **Re-run failed jobs**. The re-run reuses the run's `vsix-targets` artifact, which is kept for 90 days:

- The publish jobs skip every package a marketplace already has (`--skip-duplicate`) and publish the rest.
- The GitHub Release job waits until both marketplaces serve exactly those bytes. It then uploads only the files the release is missing, never replaces one, and publishes the draft once all nine files match.

The `production` environment approval is asked for again on a re-run; approve it in GitHub as usual.

Two runs for the same tag never run at once. If a newer run is queued while an older one is still pending, GitHub cancels the older pending run. That is harmless: a run that never started a job published nothing.

## When a publish job stops at "Check the tag still points at the built commit"

The tag was moved after this run built its packages. Stop here and investigate why the tag moved. Do not use the manual procedure below to get past this check.

## When the build job refuses to build

**Re-run all jobs**, or a new run for the same tag, would rebuild the packages. Once any attempt for the tag has started publishing, the build job stops before packaging and names what it found:

- an earlier attempt that reached "Publish every target VSIX";
- a marketplace that already serves the version;
- an existing GitHub Release for the tag.

GitHub only re-runs the latest attempt, so after this stop **Re-run failed jobs** would run the build again and stop again. Finish the release by hand from the artifact of the attempt that published, from `FailSafe/extension` in a checkout of the tag:

1. **List the run's `vsix-targets` artifacts.** `gh run download` cannot choose an attempt, so list them with their ids and creation times:

   ```
   gh api repos/<owner>/<repo>/actions/runs/<run-id>/artifacts --jq '.artifacts[] | select(.name=="vsix-targets") | {id, created_at}'
   ```

   A run holds two when an earlier attempt built but never published. The checks in the next steps reject a wrong pick.

2. **Download the chosen artifact by id and unpack it:**

   ```
   gh api repos/<owner>/<repo>/actions/artifacts/<artifact-id>/zip > vsix-targets.zip
   unzip vsix-targets.zip -d ../../vsix-targets
   ```

3. **Check the set:**

   ```
   node scripts/release-artifacts.cjs verify-set ../../vsix-targets --version <version>
   ```

4. **See which marketplace targets are missing or differ:**

   ```
   node scripts/verify-release-provenance.cjs --version <version> --sums ../../vsix-targets/SHA256SUMS.txt --vscode --openvsx
   ```

   - A target reported `inconclusive` may still be propagating; Open VSX can take about 40 minutes. Wait and check again.
   - A target reported `fail` means a different package is already published. Stop: it cannot be replaced.

5. **Publish only the missing targets**, with the same pinned tools the workflow uses:

   ```
   npx --yes @vscode/vsce@3.9.2 publish --skip-duplicate --packagePath ../../vsix-targets/<file>.vsix
   npx --yes ovsx@1.2.0 publish --skip-duplicate ../../vsix-targets/<file>.vsix
   ```

6. **Run step 4 again.** Continue only when it reports pass for all sixteen targets.

7. **Attach the set to the GitHub Release:**

   ```
   node scripts/release-artifacts.cjs publish-release ../../vsix-targets --tag v<version> --repo <owner>/<repo> --sha <tag commit>
   ```

   - `--sha` must be the commit the tag points to; the command checks it against the remote tag.
   - It runs the marketplace check again and attaches nothing unless both marketplaces pass.
   - It keeps every protection the workflow has: draft first, missing files only, no replacement, and published only when all nine files match.

The artifact is kept for 90 days. After that, an interrupted release can only be finished from a local copy of the same files.

Never delete `release.yml` runs for a tag. Their history is what tells the build job that publishing already started, and unlike a marketplace answer it does not lag.

## Checking a finished release

```
node scripts/verify-release-provenance.cjs --version <version> --sums <SHA256SUMS.txt> --tag v<version> --commit <tag commit> --github --vscode --openvsx
```

Every check reports pass, fail or inconclusive. The exit code is:

- `0`: every check passed;
- `1`: a check failed;
- `3`: nothing failed, but something could not be confirmed yet.

The release-candidate rehearsal (`native-vsix-qualification.yml`) also runs these lookups for its own version and requires nothing to be published yet. It fails by design once that version has shipped.
