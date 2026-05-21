// FX545 — B190 Phase 3: well-formedness of the 8 governance contract schemas.
// Each schema file:
//   - parses as JSON
//   - has $schema = JSON Schema 2020-12 dialect
//   - has $id matching the filename pattern
//   - compiles via AJV 2020 without error
//   - has type === 'object'
//   - has additionalProperties === false at the root
import { strict as assert } from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import Ajv2020 from 'ajv/dist/2020';

const CONTRACTS_DIR = path.resolve(__dirname, '..', '..', 'contracts');

const EXPECTED_SCHEMAS = [
  'approval',
  'checkpoint',
  'evaluation_request',
  'failure_mode',
  'governance_config',
  'intent',
  'ledger_entry',
  'receipt',
];

const DIALECT = 'https://json-schema.org/draft/2020-12/schema';
const ID_HOST = 'https://failsafe.mythologiq.studio/contracts/';

interface SchemaShape {
  $schema?: string;
  $id?: string;
  type?: string;
  additionalProperties?: boolean;
  title?: string;
  description?: string;
}

suite('Governance contract schemas — well-formedness (FX545)', () => {
  test('CONTRACTS_DIR contains exactly the 8 expected schemas plus README + ts/index', () => {
    const files = fs.readdirSync(CONTRACTS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith('.json')).sort();
    assert.deepEqual(jsonFiles, EXPECTED_SCHEMAS.map((n) => `${n}.json`).sort());
  });

  for (const schemaName of EXPECTED_SCHEMAS) {
    test(`${schemaName}.json — parses + $schema dialect 2020-12 + $id host + type object + additionalProperties false`, () => {
      const filePath = path.join(CONTRACTS_DIR, `${schemaName}.json`);
      const raw = fs.readFileSync(filePath, 'utf8');
      const schema = JSON.parse(raw) as SchemaShape;

      assert.equal(schema.$schema, DIALECT, '$schema dialect must be 2020-12');
      assert.equal(schema.$id, `${ID_HOST}${schemaName}.json`, '$id must match filename + canonical host');
      assert.equal(schema.type, 'object', 'top-level type must be object');
      assert.equal(schema.additionalProperties, false, 'additionalProperties must be false at root');
      assert.ok(typeof schema.title === 'string' && schema.title.length > 0, 'schema must declare a title');
      assert.ok(typeof schema.description === 'string' && schema.description.length > 0, 'schema must declare a description');
    });
  }

  test('each schema compiles via AJV 2020 without error', () => {
    const ajv = new Ajv2020({ strict: false });
    for (const schemaName of EXPECTED_SCHEMAS) {
      const filePath = path.join(CONTRACTS_DIR, `${schemaName}.json`);
      const schema = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const validate = ajv.compile(schema);
      assert.ok(typeof validate === 'function', `${schemaName} must compile to a validator function`);
    }
  });
});
