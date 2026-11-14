import type { OpenAPIObject } from '@nestjs/swagger';
import { PROBLEM_CODES } from './problem-codes';
import { EVENT_TYPES } from './event-types';

type Operation = { parameters?: { name: string; in: string }[]; responses: Record<string, unknown>; security?: unknown[]; requestBody?: unknown; 'x-permiso'?: string };
const MUTATING = ['post', 'patch', 'put', 'delete'] as const;
const problemRef = { $ref: '#/components/schemas/Problem' };
const problemResponse = (description: string) => ({ description, content: { 'application/problem+json': { schema: problemRef } } });

/**
 * CON-02: error body of every operation (RFC 9457 problem+json). Clients decide only by `codigo`, never by `detail`.
 * CON-07: optimistic concurrency travels as `version` in the body; a stale one answers 409 `version_conflicto` with `versionActual`.
 */
export const problemSchema = {
  type: 'object',
  required: ['type', 'title', 'status', 'codigo', 'detail', 'requestId'],
  properties: {
    type: { type: 'string', example: 'urn:sghu:error:version_conflicto' },
    title: { type: 'string', example: 'Conflicto' },
    status: { type: 'integer', example: 409 },
    codigo: { $ref: '#/components/schemas/CodigoProblema' },
    detail: { type: 'string', description: 'Mensaje en español para mostrar; no sirve para decidir.' },
    campo: { type: 'string', description: 'Campo del cuerpo o cabecera que causó el error, si aplica.' },
    requestId: { type: 'string', description: 'Correlación con los registros del servidor ("código de soporte").' },
    versionActual: { type: 'integer', description: 'Solo en `version_conflicto`: versión vigente del registro.' },
    disponibleDesde: { type: 'string', format: 'date-time', description: 'Solo en `personal_en_descanso`.' },
  },
};

/**
 * DAT-06: one thin-event shape for the live broadcast and for `GET /eventos`.
 * `type` and `entity` are deprecated aliases kept only while clients migrate to `tipo` and `entidad`.
 */
export const eventSchema = {
  type: 'object',
  required: ['seq', 'tipo', 'entidad', 'id', 'version'],
  properties: {
    seq: { type: 'string', description: 'Posición en plataforma.outbox (entero de 64 bits como texto); sirve de cursor.' },
    tipo: { $ref: '#/components/schemas/TipoEvento' },
    entidad: { type: 'string', example: 'cita' },
    id: { type: 'string', description: 'Id de la entidad (uuid, o una clave agregada en el canal `publico`).' },
    version: { type: 'integer' },
    ocurrido: { type: 'string', format: 'date-time' },
    type: { type: 'string', deprecated: true, description: 'Alias obsoleto de `tipo`.' },
    entity: { type: 'string', deprecated: true, description: 'Alias obsoleto de `entidad`.' },
  },
};

/** Post-processes the generated document so a strict generator (Swift, Kotlin, TS) can build a client from it alone. */
export function completeDocument(document: OpenAPIObject): OpenAPIObject {
  document.components ??= {};
  document.components.schemas ??= {};
  Object.assign(document.components.schemas, {
    CodigoProblema: { type: 'string', enum: [...PROBLEM_CODES], description: 'Código estable del error (snake_case).' },
    Problem: problemSchema,
    TipoEvento: { type: 'string', enum: [...EVENT_TYPES], description: 'Catálogo de eventos que la API emite (docs/arquitectura/tiempo-real.md).' },
    EventoDelgado: eventSchema,
  });
  for (const [route, item] of Object.entries(document.paths)) {
    for (const method of ['get', ...MUTATING] as const) {
      const op = (item as Record<string, Operation | undefined>)[method];
      if (!op) continue;
      // CON-03 (H-06): `@Headers('idempotency-key')` also emits a lowercase parameter; keep only the canonical one.
      op.parameters = (op.parameters ?? []).filter(p => !(p.in === 'header' && p.name === 'idempotency-key'));
      if (method !== 'get' && op['x-permiso'] !== 'pacientes.buscar') op.parameters.push({ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', minLength: 8, maxLength: 128, pattern: '^[a-zA-Z0-9_-]{8,128}$' }, description: 'Una por intención del usuario; se reutiliza en los reintentos de esa misma intención (docs/arquitectura/convenciones-api.md, Idempotencia).' } as never);
      op.responses['400'] ??= problemResponse('Datos no válidos (`validacion`, `idempotency_key_invalida`, ...)');
      if (op.security?.length) {
        op.responses['401'] ??= problemResponse('Sesión requerida (`no_autenticado`)');
        op.responses['403'] ??= problemResponse('Sin permiso (`sin_permiso`) o regla de acceso');
      }
      if (route.includes('{')) op.responses['404'] ??= problemResponse('No encontrado (`no_encontrado`)');
      if (method !== 'get') op.responses['409'] ??= problemResponse('Conflicto de negocio, de versión (`version_conflicto`) o de idempotencia (`idempotencia_conflicto`)');
      op.responses.default ??= problemResponse('Otro error (422, 429, 5xx) con el mismo cuerpo problem+json');
    }
  }
  return document;
}
