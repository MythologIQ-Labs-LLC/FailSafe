// ACP stdio↔Stream factory (GH #172 Part 2). Runtime glue (NOT type-only): bridges
// Node duplex stdio (a child process's stdin/stdout, or this process's own) to the
// SDK `Stream` (`{readable, writable}` of Web streams) that `AgentSideConnection` /
// `ClientSideConnection` consume. Lives in the proxy bundle (dist/acp-proxy.js),
// never the extension host bundle.

import { Readable, Writable } from 'node:stream';
import { ndJsonStream, type Stream } from '@agentclientprotocol/sdk';

/**
 * Build an ACP `Stream` from a Node readable (incoming bytes) + writable (outgoing
 * bytes). `ndJsonStream` handles the newline-delimited-JSON framing; we only adapt
 * Node streams to Web streams.
 *
 * @param incoming - bytes arriving FROM the peer (e.g. child.stdout, or process.stdin)
 * @param outgoing - bytes to send TO the peer (e.g. child.stdin, or process.stdout)
 */
export function nodeStdioToAcpStream(incoming: Readable, outgoing: Writable): Stream {
  // Readable.toWeb / Writable.toWeb yield Web streams; ndJsonStream wants
  // WritableStream<Uint8Array> + ReadableStream<Uint8Array>.
  const readable = Readable.toWeb(incoming) as unknown as ReadableStream<Uint8Array>;
  const writable = Writable.toWeb(outgoing) as unknown as WritableStream<Uint8Array>;
  return ndJsonStream(writable, readable);
}
