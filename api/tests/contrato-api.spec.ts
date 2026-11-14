import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PROBLEM_CODES } from '../src/platform/problem-codes';
import { EVENT_TYPES } from '../src/platform/event-types';

// CON-01/02/03/09 and DAT-06: a strict generator (swift-openapi-generator, openapi-typescript, Kotlin) must be able to
// build a client from contrato/openapi.json alone. The API CI regenerates the file and fails on any diff, so these
// checks read the committed contract.
const root = resolve(__dirname, '..');
const contract = JSON.parse(readFileSync(resolve(root, '../contrato/openapi.json'), 'utf8'));
type Operation = { operationId: string; parameters?: { name: string; in: string; schema?: Record<string, unknown> }[]; responses: Record<string, { content?: Record<string, { schema?: unknown }> }> };
const operations: [string, Operation][] = Object.entries<Record<string, Operation>>(contract.paths).flatMap(([path, item]) =>
  ['get', 'post', 'put', 'patch', 'delete'].filter(method => item[method]).map(method => [`${method.toUpperCase()} ${path}`, item[method]] as [string, Operation]));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}
const sources = sourceFiles(join(root, 'src')).map(file => readFileSync(file, 'utf8'));
const migrations = readdirSync(resolve(root, '../supabase/migrations')).filter(name => name.endsWith('.sql')).map(name => readFileSync(resolve(root, '../supabase/migrations', name), 'utf8'));

describe('contrato OpenAPI', () => {
  it('lists operations', () => expect(operations.length).toBeGreaterThan(100));

  it.each(operations)('%s declares a typed success response', (_name, op) => {
    const success = Object.entries(op.responses).filter(([status]) => /^2\d\d$/.test(status));
    expect(success).toHaveLength(1);
    expect(success[0][1].content?.['application/json']?.schema).toBeDefined();
  });

  it.each(operations)('%s declares problem+json errors', (_name, op) => {
    for (const status of ['400', 'default']) expect(op.responses[status]?.content?.['application/problem+json']?.schema).toEqual({ $ref: '#/components/schemas/Problem' });
  });

  it.each(operations)('%s declares each parameter once, with a concrete schema', (_name, op) => {
    const names = (op.parameters ?? []).map(p => `${p.in}:${p.name.toLowerCase()}`);
    expect(new Set(names).size).toBe(names.length);
    for (const parameter of op.parameters ?? []) expect(parameter.schema && (parameter.schema.type || parameter.schema.$ref || parameter.schema.enum)).toBeTruthy();
  });

  it('has no empty `Object` schema', () => {
    expect(contract.components.schemas.Object).toBeUndefined();
    expect(JSON.stringify(contract)).not.toContain('#/components/schemas/Object"');
  });

  it('publishes every problem code the source throws', () => {
    const thrown = new Set(sources.flatMap(text => [...text.matchAll(/ProblemException\(\s*'([a-z_]+)'/g)].map(m => m[1])));
    const sqlCodes = new Set(sources.flatMap(text => [...text.matchAll(/SQL_CODES[^=]*=\s*\{([^}]*)\}/g)].flatMap(m => [...m[1].matchAll(/:\s*'([a-z_]+)'/g)].map(x => x[1]))));
    expect([...thrown, ...sqlCodes].filter(code => !(PROBLEM_CODES as readonly string[]).includes(code))).toEqual([]);
    expect(contract.components.schemas.CodigoProblema.enum).toEqual([...PROBLEM_CODES]);
  });

  it('publishes exactly the event types that code and database emit', () => {
    const fromApi = sources.flatMap(text => [...text.matchAll(/\.event\(\s*c\s*,\s*'([a-z_.]+)'/g), ...text.matchAll(/announce\(\s*c\s*,\s*'([a-z_.]+)'/g), ...text.matchAll(/'(laboratorio\.critico)'/g)].map(m => m[1]));
    const fromSql = migrations.flatMap(text => [...text.matchAll(/insert into plataforma\.outbox[^;]*?values\s*\(([^;]*?)\)\s*;/gis)].flatMap(m => [...m[1].matchAll(/'([a-z_]+\.[a-z_]+)'/g)].map(x => x[1])));
    expect([...new Set([...fromApi, ...fromSql])].sort()).toEqual([...EVENT_TYPES].sort());
    expect(contract.components.schemas.TipoEvento.enum).toEqual([...EVENT_TYPES]);
    expect(contract.components.schemas.EventoDelgado.required).toEqual(['seq', 'tipo', 'entidad', 'id', 'version']);
  });

  it('declares the optional query parameters of the listings as optional', () => {
    const query = (name: string, op: string) => operations.find(([n]) => n === op)![1].parameters!.find(p => p.in === 'query' && p.name === name) as { required?: boolean } | undefined;
    for (const name of ['from', 'to', 'patientId', 'doctorId']) expect(query(name, 'GET /api/v1/citas')?.required).toBe(false);
    for (const name of ['date', 'service']) expect(query(name, 'GET /api/v1/fila')?.required).toBe(false);
    expect(query('after', 'GET /api/v1/eventos')?.required).toBe(false);
  });

  // CON-04: endpoints.csv matches the real routes; a catalog row without a route is an explicit pending item.
  it('keeps endpoints.csv aligned with the contract', () => {
    const pending = [
      'PUT /api/v1/me/dispositivos', 'GET /api/v1/recursos/equipos', 'POST /api/v1/recursos/equipos/{id}/estado', 'PUT /api/v1/recursos/tipos/{id}',
      'GET /api/v1/me/fila', 'POST /api/v1/consultas/{id}/addendum', 'GET /api/v1/laboratorio/ordenes/{id}', 'PUT /api/v1/catalogo/examenes/{id}',
    ];
    const rows = readFileSync(resolve(root, '../docs/arquitectura/datos/endpoints.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1).filter(Boolean).map(line => line.split(','));
    const catalog = rows.map(([, method, path]) => `${method} ${path}`);
    expect(new Set(catalog).size).toBe(catalog.length);
    const routes = new Set(operations.map(([name]) => name));
    expect(catalog.filter(op => !routes.has(op)).sort()).toEqual([...pending].sort());
  });
});
