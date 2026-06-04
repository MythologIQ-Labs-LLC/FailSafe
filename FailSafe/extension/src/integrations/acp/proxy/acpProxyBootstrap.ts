// ACP proxy esbuild entrypoint (GH #172 Part 2). The ONLY side-effectful module in
// the proxy bundle: reads process.argv, runs the bridge, forwards the exit code.
// Kept separate from AcpProxyEntry.main so that module stays importable/testable
// without spawning a child. Bundled to `dist/acp-proxy.js`.

import { main } from './AcpProxyEntry';

main(process.argv.slice(2), process.cwd())
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    process.stderr.write(`acp-proxy: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
