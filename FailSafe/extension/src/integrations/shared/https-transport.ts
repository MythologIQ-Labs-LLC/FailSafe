/**
 * https-transport — two guards the Jira and Linear default transports share
 * (#480 review delta): requests go only to https URLs, and a response body is
 * read up to a cap, rejecting as soon as the cap is passed (not after the whole
 * body has been buffered).
 */

/** Parse `url` and refuse anything that is not https. */
export function requireHttps(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== 'https:') throw new Error(`refusing a non-https URL (${u.protocol})`);
  return u;
}

/** The cap for a provider response body. */
export const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

export interface CappedStream {
  on(event: 'data', listener: (chunk: Buffer) => void): unknown;
  on(event: 'end', listener: () => void): unknown;
  on(event: 'error', listener: (e: Error) => void): unknown;
  destroy(error?: Error): unknown;
}

/** Collect a stream's bytes; reject and destroy the stream once more than `maxBytes` arrive. */
export function collectCapped(stream: CappedStream, maxBytes: number = MAX_RESPONSE_BYTES): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    stream.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > maxBytes) {
        done = true;
        const err = new Error(`response too large (over ${maxBytes} bytes)`);
        stream.destroy(err);
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    stream.on('error', (e) => { if (!done) { done = true; reject(e); } });
  });
}
