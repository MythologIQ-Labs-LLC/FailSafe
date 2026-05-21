// B151 — Module-scoped AJV 2020 instance + cached compiled validators.
//
// FX552: a single `Ajv2020` instance is created lazily; each contract schema
// compiles exactly once and the `ValidateFunction` is cached so the interceptor
// hot path never recompiles. `getValidator` is idempotent and `===`-stable.
//
// Schemas are loaded from the compiled `contracts/` tree (copy-ui-js mirrors
// the `.json` schema files into `out/contracts/`), resolved relative to this
// module so it works under both `src/` (ts-node) and `out/` (compiled) layouts.

import * as fs from "fs";
import * as path from "path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { ValidateFunction } from "ajv";

/** Contract schema names this interceptor validates against. */
const KNOWN_SCHEMAS = new Set(["evaluation_request", "receipt"]);

const CONTRACTS_DIR = path.resolve(__dirname, "..", "..", "contracts");

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
  if (!KNOWN_SCHEMAS.has(schemaName)) {
    throw new Error(`ajv-instance: unknown governance schema "${schemaName}"`);
  }
  const schemaPath = path.join(CONTRACTS_DIR, `${schemaName}.json`);
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8")) as object;
  const validate = getAjv().compile(schema);
  validatorCache.set(schemaName, validate);
  return validate;
}
