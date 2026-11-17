import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * MOV-04: the request bodies that Android and iOS build are checked against contrato/openapi.json in CI.
 * Each mobile unit test builds its body with production code and asserts it equals the fixture's `body`; this test
 * then validates every fixture against the request schema of its operation. Object schemas are closed
 * (`additionalProperties: false`) because the API rejects unknown fields (`forbidNonWhitelisted`).
 */
const repo = resolve(__dirname, '../..');
const contract = JSON.parse(readFileSync(resolve(repo, 'contrato/openapi.json'), 'utf8'));
const FOLDERS = ['android/app/src/test/resources/contract', 'ios/Tests/CoreTests/Fixtures/contract'];

/**
 * Bodies that today drift from the contract. Each entry must FAIL validation; once the client is fixed the entry
 * must be removed (the test fails if a listed fixture becomes valid, so the list never goes stale).
 */
const KNOWN_DRIFT: Record<string, string> = {};

/** One format for every mobile suite: `{ method, path, body }`, with `path` exactly as in the contract (`/api/v1/...`). */
type Fixture = { method: string; path: string; body: unknown };
const fixtures: [string, Fixture][] = FOLDERS.filter(dir => existsSync(resolve(repo, dir))).flatMap(dir =>
  readdirSync(resolve(repo, dir)).filter(name => name.endsWith('.json')).sort()
    .map(name => [`${dir}/${name}`, JSON.parse(readFileSync(resolve(repo, dir, name), 'utf8').replace(/^﻿/, ''))] as [string, Fixture]));

/** OpenAPI 3.0 object schemas → closed JSON Schema objects with absolute references into the contract. */
function close(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(close);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) out[key] = key === '$ref' && typeof value === 'string' ? value.replace(/^#/, 'contrato#') : close(value);
  if (out.properties && out.additionalProperties === undefined) out.additionalProperties = false;
  return out;
}
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'contrato', components: close(contract.components) });

function requestSchema(method: string, path: string) {
  const op = contract.paths[path]?.[method.toLowerCase()];
  return op?.requestBody?.content?.['application/json']?.schema as Record<string, unknown> | undefined;
}
function problems(fixture: Fixture) {
  const schema = requestSchema(fixture.method, fixture.path);
  if (!schema) return [`la operación ${fixture.method} ${fixture.path} no existe en el contrato o no recibe cuerpo JSON`];
  const validate = ajv.compile(close(schema) as object);
  return validate(fixture.body) ? [] : (validate.errors ?? []).map(e => `${e.instancePath || '/'} ${e.message}${e.params && 'additionalProperty' in e.params ? `: ${e.params.additionalProperty}` : ''}`);
}

describe('MOV-04 cuerpos móviles contra contrato/openapi.json', () => {
  it('hay fixtures de Android y de iOS', () => {
    for (const dir of FOLDERS) expect(fixtures.some(([file]) => file.startsWith(dir))).toBe(true);
  });

  it.each(fixtures)('%s tiene método, ruta y cuerpo, sin otras claves', (_file, fixture) => {
    expect(Object.keys(fixture).sort()).toEqual(['body', 'method', 'path']);
    expect(fixture.method).toMatch(/^(POST|PUT|PATCH|DELETE)$/);
    expect(fixture.path).toMatch(/^\/api\/v1\/\S+$/);
    expect(fixture.body).toBeDefined();
  });

  it.each(fixtures.filter(([file]) => !KNOWN_DRIFT[file]))('%s cumple el esquema del contrato', (_file, fixture) => {
    expect(problems(fixture)).toEqual([]);
  });

  const drifting = fixtures.filter(([file]) => KNOWN_DRIFT[file]);
  if (drifting.length) {
    it.each(drifting)('%s sigue desalineado (quítalo de KNOWN_DRIFT al corregirlo)', (file, fixture) => {
      expect({ file, drift: KNOWN_DRIFT[file], problems: problems(fixture) }).toEqual({ file, drift: KNOWN_DRIFT[file], problems: expect.arrayContaining([expect.any(String)]) });
    });
  }

  it('el validador detecta campos faltantes, de más, con formato o tipo inválido', () => {
    const cancel = { method: 'POST', path: '/api/v1/citas/{id}/cancelar' };
    const body = { version: 2, reason: 'No podré asistir ese día' };
    expect(problems({ ...cancel, body })).toEqual([]);
    // R7 U1 (D-8): `reason` became optional in the schema (the patient may send `reasonCode`); the API still requires
    // 10+ characters when no `reasonCode` comes, so current mobile clients keep working. `version` stays required.
    expect(problems({ ...cancel, body: { reason: 'No podré asistir ese día' } })).toEqual(["/ must have required property 'version'"]);
    expect(problems({ ...cancel, body: { ...body, motivo: 'x' } })).toEqual(['/ must NOT have additional properties: motivo']);
    expect(problems({ ...cancel, body: { ...body, version: '2' } })).toEqual(['/version must be number']);
    expect(problems({ method: 'POST', path: '/api/v1/consultas', body: { appointmentId: 'no-uuid' } })).toEqual(['/appointmentId must match format "uuid"']);
    expect(problems({ method: 'POST', path: '/api/v1/no/existe', body })).toHaveLength(1);
  });

  it('KNOWN_DRIFT solo nombra fixtures que existen', () => {
    expect(Object.keys(KNOWN_DRIFT).filter(file => !fixtures.some(([name]) => name === file))).toEqual([]);
  });
});
