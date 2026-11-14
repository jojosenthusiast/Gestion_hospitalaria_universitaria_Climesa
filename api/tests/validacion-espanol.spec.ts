import { Body, Controller, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';
import { ApiErrorsFilter } from '../src/platform/errors.filter';
import { Text } from '../src/platform/dto';
import { validationPipe } from '../src/platform/validation';

class LineDto { @Text(1, 10) dose!: string; }
class ProbeDto {
  @IsUUID() patientId!: string;
  @IsIn(['vip', 'semiprivada']) requestedCategory!: string;
  @Text(10, 500) motive!: string;
  @IsInt() @Min(1) @Max(4) visitors!: number;
  @IsBoolean() isolation!: boolean;
  @IsOptional() @IsISO8601({ strict: true }) scheduledAt?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(2) @ValidateNested({ each: true }) @Type(() => LineDto) items?: LineDto[];
  @IsOptional() @Matches(/^\d{8}-?\d$/, { message: 'El DUI debe tener 9 dígitos.' }) dui?: string;
}
const valid = { patientId: '00000000-0000-4000-8000-000000000001', requestedCategory: 'vip', motive: 'Motivo suficiente', visitors: 2, isolation: false };

@Controller('prueba')
class ProbeController { @Post() accept(@Body() _dto: ProbeDto) { return { ok: true }; } }
@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('MOV-03 errores de validación en español, por campo', () => {
  let app: NestFastifyApplication;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false });
    app.useGlobalPipes(validationPipe());
    app.useGlobalFilters(new ApiErrorsFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => { await app.close(); });
  const post = async (payload: Record<string, unknown>) => {
    const r = await app.inject({ method: 'POST', url: '/prueba', payload });
    return { status: r.statusCode, type: r.headers['content-type'], body: r.json() };
  };
  const messageOf = (body: { errors: { field: string; message: string }[] }, field: string) => body.errors.find(e => e.field === field)?.message;

  test('un cuerpo válido pasa', async () => expect((await post(valid)).status).toBe(201));

  test('cada regla da un mensaje en español con el nombre del campo tal como viaja', async () => {
    const r = await post({ patientId: 'x', requestedCategory: 'suite', motive: 'corto', visitors: 9, isolation: 'si', scheduledAt: 'mañana' });
    expect(r.status).toBe(400);
    expect(r.type).toContain('application/problem+json');
    expect(r.body).toMatchObject({ status: 400, codigo: 'validacion', campo: 'patientId', detail: 'Revisa los campos: patientId, requestedCategory, motive, visitors, isolation, scheduledAt.' });
    expect(messageOf(r.body, 'patientId')).toBe('Debe ser un identificador (UUID) válido.');
    expect(messageOf(r.body, 'requestedCategory')).toBe('Debe ser uno de estos valores: vip, semiprivada.');
    expect(messageOf(r.body, 'motive')).toBe('Debe tener al menos 10 caracteres.');
    expect(messageOf(r.body, 'visitors')).toBe('Debe ser menor o igual a 4.');
    expect(messageOf(r.body, 'isolation')).toBe('Debe ser verdadero o falso.');
    expect(messageOf(r.body, 'scheduledAt')).toBe('Debe ser una fecha válida en formato ISO 8601.');
    expect(JSON.stringify(r.body)).not.toMatch(/\bmust\b|\bshould\b/);
  });

  test('un campo faltante es obligatorio; uno de más no se admite; un único error se resume en detail', async () => {
    const { motive: _motive, ...rest } = valid;
    const missing = await post(rest);
    expect(missing.body).toMatchObject({ campo: 'motive', detail: 'Revisa el campo motive: es obligatorio.', errors: [{ field: 'motive', message: 'Es obligatorio.' }] });
    const extra = await post({ ...valid, admin: true });
    expect(extra.body.errors).toEqual([{ field: 'admin', message: 'Este campo no se admite en la solicitud.' }]);
  });

  test('longitud máxima, mínimo numérico, entero, listas anidadas y mensajes propios', async () => {
    const r = await post({ ...valid, motive: 'x'.repeat(501), visitors: 0, items: [{ dose: '' }, { dose: 'ok' }, { dose: 'ok' }], dui: '123' });
    expect(messageOf(r.body, 'motive')).toBe('Debe tener como máximo 500 caracteres.');
    expect(messageOf(r.body, 'visitors')).toBe('Debe ser mayor o igual a 1.');
    expect(messageOf(r.body, 'items')).toBe('Debe tener como máximo 2 elementos.');
    expect(messageOf(r.body, 'items[0].dose')).toBe('Debe tener al menos 1 carácter.');
    expect(messageOf(r.body, 'dui')).toBe('El DUI debe tener 9 dígitos.');
    expect(messageOf((await post({ ...valid, visitors: 1.5 })).body, 'visitors')).toBe('Debe ser un número entero.');
    expect(messageOf((await post({ ...valid, motive: 42 })).body, 'motive')).toBe('Debe ser texto.');
  });
});
