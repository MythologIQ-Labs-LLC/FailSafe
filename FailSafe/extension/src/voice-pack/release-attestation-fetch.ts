/** Fetch a bounded detached receipt using the same redirect allowlist as assets.
 * The caller verifies the tar and manifest locally before calling this module.
 */
import * as fs from 'fs';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { fetchAllowlisted } from './allowlisted-fetch';
import { verifyVoicePublisherAttestation } from './publisher-auth';

const ROOT = 'https://github.com/MythologIQ-Labs-LLC/FailSafe/releases/download';
const RECORD = 'voice-pack-release.json';

async function fetchBounded(url: string, max: number): Promise<Buffer> {
  const { response } = await fetchAllowlisted(url, 'publisher authentication refused');
  if (!response.body) throw new Error('publisher authentication refused: empty signed response');
  const claimed = response.headers.get('content-length');
  if (claimed && Number(claimed) > max) {
    throw new Error('publisher authentication refused: response exceeds budget');
  }
  const data: Buffer[] = [];
  let size = 0;
  for await (const chunk of Readable.fromWeb(
    response.body as unknown as import('stream/web').ReadableStream)) {
    size += chunk.length;
    if (size > max) throw new Error('publisher authentication refused: response exceeds budget');
    data.push(Buffer.from(chunk));
  }
  if (!size) throw new Error('publisher authentication refused: empty signed response');
  return Buffer.concat(data);
}

/** Do not promote content until the signed manifest SHA and archive SHA match. */
export async function verifyPublisherBeforePromotion(
  version: string, archiveSha: string, manifestPath: string, publisherPem: string,
): Promise<void> {
  const url = `${ROOT}/v${version}-voice/${RECORD}`;
  const [record, sig] = await Promise.all([
    fetchBounded(url, 4096), fetchBounded(url + '.sig', 90),
  ]);
  const manifestSha = createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
  verifyVoicePublisherAttestation(record, sig, publisherPem, version, archiveSha, manifestSha);
}
