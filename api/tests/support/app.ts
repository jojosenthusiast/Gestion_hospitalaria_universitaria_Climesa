import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/main';
import { DatabaseService } from '../../src/platform/database.service';
import { SupabaseService } from '../../src/supabase/supabase.service';
import { Clock, businessDate } from '../../src/platform/clock';
import { createDatabase, userId } from './database';

const issuer = 'https://gvmvmrusscsfbndnbvbr.supabase.co/auth/v1';

/** Full Nest application over PGlite with a controllable clock and fictitious accounts per role. */
export async function createTestApp(start: Date) {
  let current = start;
  const fixture = await createDatabase();
  const jwt = (role: string) => {
    const h = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const b = Buffer.from(JSON.stringify({ sub: userId(role), iss: issuer, aud: 'authenticated', exp: Math.floor(current.valueOf() / 1000) + 86400 })).toString('base64url');
    return `${h}.${b}.${createHmac('sha256', 'test-only-key').update(h + '.' + b).digest('base64url')}`;
  };
  const auth = { authClient: { auth: { getUser: async (token: string) => {
    const [h, b, s] = token.split('.');
    const expected = createHmac('sha256', 'test-only-key').update(h + '.' + b).digest('base64url');
    if (!s || s.length !== expected.length || !timingSafeEqual(Buffer.from(s), Buffer.from(expected))) return { data: { user: null }, error: new Error('firma') };
    const p = JSON.parse(Buffer.from(b, 'base64url').toString());
    return { data: { user: { id: p.sub, email: 'fixture@example.test' } }, error: null };
  } } }, admin: { auth: { admin: { inviteUserByEmail: jest.fn() } } }, isConfigured: () => true };
  const clock = { now: () => current, today: () => businessDate(current) };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService).useValue(fixture.db)
    .overrideProvider(SupabaseService).useValue(auth)
    .overrideProvider(Clock).useValue(clock)
    .compile();
  const app = module.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), { logger: false });
  configureApplication(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  const pg = fixture.pg;

  const call = async (role: string, method: string, path: string, body?: unknown, key?: string) => {
    const response = await app.inject({ method: method as any, url: '/api/v1' + path, headers: { authorization: `Bearer ${jwt(role)}`, ...(body ? { 'content-type': 'application/json', 'idempotency-key': key ?? randomUUID() } : {}) }, ...(body ? { payload: body as object } : {}) });
    return { status: response.statusCode, body: response.body ? response.json() : undefined };
  };
  const one = async <T = any>(sql: string, params: unknown[] = []) => (await pg.query<T>(sql, params)).rows[0];
  const staffOf = async (role: string) => (await one<{ id: string }>('SELECT persona_personal_id AS id FROM acceso.usuario WHERE id=$1', [userId(role)])).id;
  let sequence = 0;
  let slots = 0;
  /** Fictitious patient inserted directly; optionally linked to the PAC account. */
  const patient = async (options: { sex?: string; linkPac?: boolean; name?: string } = {}) => {
    sequence++;
    const row = await one<{ id: string }>(`INSERT INTO pacientes.paciente(expediente,nombres,primer_apellido,sexo,precision_nacimiento,nacimiento)
      VALUES($1,$2,'Ficticio',$3,'exacta','1990-01-01') RETURNING id`, [`T-${Date.now()}-${sequence}`, options.name ?? `Paciente${sequence}`, options.sex ?? 'femenino']);
    if (options.linkPac) await pg.query('UPDATE acceso.usuario SET paciente_id=$2 WHERE id=$1', [userId('PAC'), row.id]);
    return row.id;
  };
  /** Current professional registration for the account of a role (D-012); same validity as the seed's `[2026-01-01,2027-12-31)`. */
  const enroll = async (role: string, from = '2026-01-01', to = '2027-12-31') => {
    await pg.query(`INSERT INTO personal.inscripcion(persona_id,junta,numero,vigencia) VALUES($1,'JVPM',$2,daterange($3::date,$4::date,'[)'))`, [await staffOf(role), `N-${role}-${randomUUID().slice(0, 8)}`, from, to]);
  };
  const shift = async (role: string, from: Date, to: Date) => {
    await pg.query(`INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado) SELECT $1,id,tstzrange($2::timestamptz,$3::timestamptz,'[)'),'diurno','publicado' FROM infra.espacio WHERE codigo='P1-CON'`, [await staffOf(role), from, to]);
  };
  /**
   * Body of a valid admission: links the patient to a fresh emergency ticket and makes sure the doctor has a shift
   * covering the test clock (the create command checks both): a 4-hour shift that ends right after `now`, so
   * tests that publish their own later shifts never overlap it. `extra` overrides any field.
   */
  const admissionBody = async (patientId: string, extra: Record<string, unknown> = {}) => {
    const doctorId = (extra.attendingDoctorId as string | undefined) ?? await staffOf('MED');
    const date = businessDate(current);
    const ticket = await one<{ id: string }>(`INSERT INTO atencion.ticket_fila(servicio,fecha,numero,paciente_id) SELECT 'emergencia',$1::date,coalesce(max(numero),0)+1,$2 FROM atencion.ticket_fila WHERE servicio='emergencia' AND fecha=$1::date RETURNING id`, [date, patientId]);
    const covered = await one(`SELECT 1 AS ok FROM personal.turno WHERE persona_id=$1 AND estado IN ('publicado','en_curso') AND periodo @> $2::timestamptz`, [doctorId, current]);
    if (!covered) await pg.query(`INSERT INTO personal.turno(persona_id,area_id,periodo,tipo,estado) SELECT $1,id,tstzrange($2::timestamptz,$3::timestamptz,'[)'),'diurno','publicado' FROM infra.espacio WHERE codigo='P1-CON'`, [doctorId, new Date(current.valueOf() - 239 * 60_000), new Date(current.valueOf() + 60_000)]);
    return { patientId, origin: 'emergencia', originId: ticket.id, attendingDoctorId: doctorId, motive: 'Ingreso de prueba por emergencia', ...extra };
  };
  /** Confirmed appointment inserted directly (the scheduling rules have their own tests). */
  const appointment = async (patientId: string, start: Date, state = 'confirmada') => {
    const doctor = await staffOf('MED');
    return (await one<{ id: string }>(`INSERT INTO atencion.cita(paciente_id,medico_id,horario,estado,origen) VALUES($1,$2,tstzrange($3::timestamptz,$3::timestamptz+interval '20 minutes','[)'),$4,'recepcion') RETURNING id`, [patientId, doctor, start, state])).id;
  };
  /** Opens a consultation as MED through the API. */
  const consultation = async (patientId: string) => {
    // Each consultation uses its own past slot so the doctor's appointments never overlap.
    const start = new Date(current.valueOf() - (60 + 20 * ++slots) * 60_000);
    const appointmentId = await appointment(patientId, start);
    const started = await call('MED', 'POST', '/consultas', { appointmentId });
    if (started.status !== 201) throw new Error(`consulta: ${started.status} ${JSON.stringify(started.body)}`);
    return { id: started.body.id as string, version: started.body.version as number, appointmentId };
  };
  const events = async (type: string, entityId: string) => (await pg.query<{ canales: string[] }>('SELECT canales FROM plataforma.outbox WHERE tipo=$1 AND entidad_id=$2 ORDER BY seq', [type, entityId])).rows.map(r => r.canales);
  const audits = async (action: string) => (await pg.query<{ paciente_id: string | null; resultado: string; detalle: any }>('SELECT paciente_id,resultado,detalle FROM plataforma.auditoria WHERE accion=$1 ORDER BY seq', [action])).rows;

  return {
    app, pg, call, one, staffOf, patient, enroll, shift, appointment, consultation, admissionBody, events, audits,
    setNow: (value: Date) => { current = value; },
    close: async () => { await app.close(); await pg.close(); },
  };
}
export type TestApp = Awaited<ReturnType<typeof createTestApp>>;
