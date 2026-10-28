import { Body, ConflictException, Controller, ForbiddenException, Get, LoggerService, Module, Post, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { IsInt, IsString } from 'class-validator';
import { ApiErrorsFilter } from '../src/platform/errors.filter';
import { VersionConflictException } from '../src/platform/problem';
import { requestLogging } from '../src/main';

class EditDto { @IsString() nombre!: string; @IsInt() version!: number; }

@Controller('prueba')
class ProbeController {
  @Post('validar') validate(@Body() _dto: EditDto) { return { ok: true }; }
  @Post('version') version() { throw new VersionConflictException(7, 'La ficha cambió; vuelve a abrirla.'); }
  @Get('prohibido') forbidden() { throw new ForbiddenException('Tu cuenta no tiene permiso para esta operación.'); }
  @Get('conflicto') conflict() { throw new ConflictException('Ya existe.'); }
  @Get('sql') sql() { throw Object.assign(new Error('relation "paciente" violates SELECT * FROM x'), { code: '23505' }); }
  @Post('boom') boom() { throw new Error('SELECT dui FROM pacientes.paciente'); }
}
@Module({ controllers: [ProbeController] })
class ProbeModule {}

const bootstrap = async (stream?: { write: (line: string) => void }, logger?: LoggerService) => {
  const module = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
  const adapter = new FastifyAdapter({ logger: stream ? { ...requestLogging, stream } : false });
  const app = module.createNestApplication<NestFastifyApplication>(adapter, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true, forbidUnknownValues: true }));
  app.useGlobalFilters(new ApiErrorsFilter(undefined, logger));
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
};

describe('FR-100-11 errores uniformes (problem+json)', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => { app = await bootstrap(); });
  afterAll(async () => { await app.close(); });

  test('409 por versión obsoleta: codigo estable y versión actual (FR-100-12)', async () => {
    const r = await app.inject({ method: 'POST', url: '/prueba/version', payload: {} });
    expect(r.statusCode).toBe(409);
    expect(r.headers['content-type']).toContain('application/problem+json');
    expect(r.json()).toMatchObject({ status: 409, codigo: 'version_conflicto', detail: 'La ficha cambió; vuelve a abrirla.', versionActual: 7 });
    expect(r.json().requestId).toEqual(expect.any(String));
  });
  test('validación: codigo validacion y campo afectado', async () => {
    const r = await app.inject({ method: 'POST', url: '/prueba/validar', payload: { nombre: 'Ana', version: 'x' } });
    expect(r.statusCode).toBe(400);
    expect(r.headers['content-type']).toContain('application/problem+json');
    expect(r.json()).toMatchObject({ status: 400, codigo: 'validacion', campo: 'version' });
  });
  test('403, 404 y 409 genéricos usan codigos snake_case', async () => {
    const forbidden = await app.inject('/prueba/prohibido');
    expect(forbidden.json()).toMatchObject({ status: 403, codigo: 'sin_permiso' });
    expect((await app.inject('/prueba/no-existe')).json()).toMatchObject({ status: 404, codigo: 'no_encontrado' });
    expect((await app.inject('/prueba/conflicto')).json()).toMatchObject({ status: 409, codigo: 'conflicto' });
  });
  test('errores inesperados y de SQL no exponen trazas ni SQL', async () => {
    const sql = await app.inject('/prueba/sql');
    expect(sql.json()).toMatchObject({ status: 409, codigo: 'conflicto' });
    expect(sql.body).not.toMatch(/SELECT|relation|stack/i);
    const boom = await app.inject({ method: 'POST', url: '/prueba/boom', payload: {} });
    expect(boom.statusCode).toBe(500);
    expect(boom.json()).toMatchObject({ status: 500, codigo: 'error_interno' });
    expect(boom.body).not.toMatch(/SELECT|pacientes|stack/i);
  });
});

describe('FR-100-15 registros sin cuerpos, tokens ni datos clínicos', () => {
  test('una solicitud fallida con cuerpo, token y campo clínico no deja rastro en los registros', async () => {
    const lines: string[] = [];
    const logger: LoggerService = { log: m => lines.push(JSON.stringify(m)), error: m => lines.push(JSON.stringify(m)), warn: m => lines.push(JSON.stringify(m)) };
    const app = await bootstrap({ write: line => lines.push(line) }, logger);
    try {
      const r = await app.inject({
        method: 'POST', url: '/prueba/boom?dui=00000001-8',
        headers: { authorization: 'Bearer eyJhbGciOi.SECRETO-TOKEN.firma', cookie: 'sesion=COOKIE-SECRETA', 'content-type': 'application/json' },
        payload: { diagnostico: 'DIAGNOSTICO-CLINICO-SECRETO', password: 'CLAVE-SECRETA', dui: '00000001-8' },
      });
      expect(r.statusCode).toBe(500);
      const output = lines.join('\n');
      expect(output.length).toBeGreaterThan(0);
      expect(output).toContain('boom');
      for (const secret of ['DIAGNOSTICO-CLINICO-SECRETO', 'CLAVE-SECRETA', 'SECRETO-TOKEN', 'COOKIE-SECRETA', '00000001-8', 'SELECT dui']) expect(output).not.toContain(secret);
    } finally { await app.close(); }
  });
});
