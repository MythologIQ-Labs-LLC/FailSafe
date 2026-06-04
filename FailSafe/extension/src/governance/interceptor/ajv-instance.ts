// B151 — Module-scoped AJV 2020 instance + cached compiled validators.
//
// FX552: a single `Ajv2020` instance is created lazily; each contract schema
// compiles exactly once and the `ValidateFunction` is cached so the interceptor
// hot path never recompiles. `getValidator` is idempotent and `===`-stable.
//
// Schemas are STATICALLY IMPORTED so they inline at build time. This removes a
// fragile runtime `__dirname`-relative `fs.readFileSync` that (a) broke when this
// module is bundled to an ESM target (`__dirname` is undefined in ESM scope —
// e.g. the standalone ACP enforce-proxy bundle, GH #172) and (b) depended on a
// sibling `contracts/` dir existing next to the compiled module. Inlining is
// behavior-identical for every consumer: the same schema objects compile + cache
// the same way; only the source (import vs disk read) changed. resolveJsonModule
// is on, and esbuild inlines `.json` by default.

import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { ValidateFunction } from "ajv";
import evaluationRequestSchema from "../../contracts/evaluation_request.json";
import receiptSchema from "../../contracts/receipt.json";

/** Contract schemas this interceptor validates against, keyed by name. */
const SCHEMAS: Readonly<Record<string, object>> = {
  evaluation_request: evaluationRequestSchema as object,
  receipt: receiptSchema as object,
};

let ajv: Ajv2020 | null = null;
const validatorCache = new Map<string, ValidateFunction>();

/** Lazily create the shared AJV 2020 instance. */
function getAjv(): Ajv2020 {
  if (ajv) return ajv;
  const instance = new Ajv2020({ strict: false, allErrors: true });
  try {
    (addFormats as unknown as (a: Ajv2020) => void)(instance);
  } catch {
    /* ajv-formats optional — date-time then validates opaquely */
  }
  ajv = instance;
  return instance;
}

/**
 * Return the cached compiled `ValidateFunction` for a governance contract
 * schema. The first call compiles + caches; subsequent calls return the same
 * reference (FX552 `===` assertion). Throws if the schema name is unknown.
 */
export function getValidator(schemaName: string): ValidateFunction {
  const cached = validatorCache.get(schemaName);
  if (cached) return cached;
  const schema = SCHEMAS[schemaName];
  if (!schema) {
    throw new Error(`ajv-instance: unknown governance schema "${schemaName}"`);
  }
  const validate = getAjv().compile(schema);
  validatorCache.set(schemaName, validate);
  return validate;
}
