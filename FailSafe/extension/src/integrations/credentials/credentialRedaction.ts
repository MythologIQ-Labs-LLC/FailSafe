/**
 * credentialRedaction - keep stored credential values out of provider error
 * text before it is shown (#482, LD6).
 */

import type { IntegrationCredentials } from './IntegrationCredentials';

/** Replace every stored credential value inside a provider's error text. */
export function providerMessage(text: string, creds: IntegrationCredentials): string {
  let out = text;
  for (const v of creds.knownValues()) {
    if (v.length < 4) continue;
    out = out.split(v).join('[redacted]');
    const encoded = encodeURIComponent(v);
    if (encoded !== v) out = out.split(encoded).join('[redacted]');
  }
  return out;
}
