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
const KNOWN_DRIFT: Record<string, string> = {
  'ios/Tests/CoreTests/Fixtures/contract/admission-indication.json': 'AdmissionBody no envía `motive` (obligatorio, 10-500) y manda `reason` en su lugar.',
};

type Fixture = { operation: string; source?: string; body: unknown };
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

function requestSchema(operation: string) {
  const [method, path] = operation.split(' ');
  const op = contract.paths[`/api/v1${path}`]?.[method.toLowerCase()];
  return op?.requestBody?.content?.['application/json']?.schema as Record<string, unknown> | undefined;
}
function problems(fixture: Fixture) {
  const schema = requestSchema(fixture.operation);
  if (!schema) return [`la operación ${fixture.operation} no existe en el contrato o no recibe cuerpo JSON`];
  const validate = ajv.compile(close(schema) as object);
  return validate(fixture.body) ? [] : (validate.errors ?? []).map(e => `${e.instancePath || '/'} ${e.message}${e.params && 'additionalProperty' in e.params ? `: ${e.params.additionalProperty}` : ''}`);
}

describe('MOV-04 cuerpos móviles contra contrato/openapi.json', () => {
  it('hay fixtures de Android y de iOS', () => {
    for (const dir of FOLDERS) expect(fixtures.some(([file]) => file.startsWith(dir))).toBe(true);
  });

  it.each(fixtures)('%s tiene operación y cuerpo', (_file, fixture) => {
    expect(fixture.operation).toMatch(/^(POST|PUT|PATCH|DELETE) \/\S+$/);
    expect(fixture.body).toBeDefined();
  });

  it.each(fixtures.filter(([file]) => !KNOWN_DRIFT[file]))('%s cumple el esquema del contrato', (_file, fixture) => {
    expect(problems(fixture)).toEqual([]);
  });

  it.each(fixtures.filter(([file]) => KNOWN_DRIFT[file]))('%s sigue desalineado (quítalo de KNOWN_DRIFT al corregirlo)', (file, fixture) => {
    expect({ file, drift: KNOWN_DRIFT[file], problems: problems(fixture) }).toEqual({ file, drift: KNOWN_DRIFT[file], problems: expect.arrayContaining([expect.any(String)]) });
  });

  it('el validador detecta campos faltantes, de más, con formato o tipo inválido', () => {
    const body = { version: 2, reason: 'No podré asistir ese día' };
    expect(problems({ operation: 'POST /citas/{id}/cancelar', body })).toEqual([]);
    expect(problems({ operation: 'POST /citas/{id}/cancelar', body: { version: 2 } })).toEqual(["/ must have required property 'reason'"]);
    expect(problems({ operation: 'POST /citas/{id}/cancelar', body: { ...body, motivo: 'x' } })).toEqual(['/ must NOT have additional properties: motivo']);
    expect(problems({ operation: 'POST /citas/{id}/cancelar', body: { ...body, version: '2' } })).toEqual(['/version must be number']);
    expect(problems({ operation: 'POST /consultas', body: { appointmentId: 'no-uuid' } })).toEqual(['/appointmentId must match format "uuid"']);
    expect(problems({ operation: 'POST /no/existe', body })).toHaveLength(1);
  });

  it('KNOWN_DRIFT solo nombra fixtures que existen', () => {
    expect(Object.keys(KNOWN_DRIFT).filter(file => !fixtures.some(([name]) => name === file))).toEqual([]);
  });
});
