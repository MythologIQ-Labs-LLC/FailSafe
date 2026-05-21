// B-BIC-22: MCP protocol/version floor assertion. Reads getServerVersion()
// from the connected MCP client; fail-closed when missing OR below the
// pinned MIN_BICAMERAL_VERSION (re-used from install-handler so the floor
// is the single source of truth across pip-install + connect-time).

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { compareSemver } from './semver';
import { MIN_BICAMERAL_VERSION } from './install-handler';

export function assertBicameralProtocolFloor(client: Client): void {
  const impl = client.getServerVersion();
  const version = impl?.version;
  if (typeof version !== 'string' || version.length === 0) {
    throw new Error('Bicameral server did not report a version; refusing to proceed.');
  }
  if (compareSemver(version, MIN_BICAMERAL_VERSION) < 0) {
    throw new Error(
      `Bicameral server version ${version} is below the supported floor ${MIN_BICAMERAL_VERSION}; refusing to proceed.`,
    );
  }
}
