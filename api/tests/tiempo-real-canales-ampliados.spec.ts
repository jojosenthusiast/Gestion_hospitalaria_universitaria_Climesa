import { createDatabase, userId } from './support/database';

// Migración 20261119004000: el disparador `outbox_ampliar_canales` hace que cada evento llegue a todos los
// roles que leen esa información (derivado de `acceso.rol_permiso`) y a la cuenta propia que corresponde.
jest.setTimeout(120000);
describe('Tiempo real · canales ampliados en la base', () => {
  let fixture: Awaited<ReturnType<typeof createDatabase>>;
  beforeAll(async () => { fixture = await createDatabase(); });
  afterAll(async () => { await fixture?.pg.close(); });

  const emit = async (tipo: string, entidad: string, id: string, canales: string[]) =>
    (await fixture.pg.query<{ canales: string[] }>('INSERT INTO plataforma.outbox(tipo,entidad,entidad_id,version,canales) VALUES($1,$2,$3,1,$4) RETURNING canales', [tipo, entidad, id, canales])).rows[0].canales;
  const rolesWith = async (...codes: string[]) => (await fixture.pg.query<{ rol_codigo: string }>(
    "SELECT DISTINCT rol_codigo FROM acceso.rol_permiso WHERE permiso_codigo=ANY($1::text[]) AND contexto NOT IN ('propio','propio_revisado') ORDER BY 1", [codes])).rows.map(r => `rol:${r.rol_codigo}`);
  /** The exact channel set: the channels the event was emitted with plus the widened ones, each once. */
  const exactly = (...groups: string[][]) => [...new Set(groups.flat())].sort();
  const sorted = (channels: string[]) => [...channels].sort();

  test('un turno llega a todo rol que ve horarios, no solo a JOP y ADM', async () => {
    const canales = await emit('turno.actualizado', 'turno', 'turno-1', ['rol:ADM', 'rol:JOP', 'usuario:u-persona']);
    expect(canales).toEqual(expect.arrayContaining(['rol:REC', 'rol:MED', 'rol:ENF', 'rol:PAR', 'usuario:u-persona']));
    expect(sorted(canales)).toEqual(exactly(['rol:ADM', 'rol:JOP', 'usuario:u-persona'], await rolesWith('turnos.ver')));
    expect(canales).not.toContain('rol:PAC');
    expect(new Set(canales).size).toBe(canales.length);
  });

  test('un aviso público llega también a las cuentas con sesión; uno dirigido, a sus roles y a quien administra avisos', async () => {
    const publico = await emit('aviso.publicado', 'aviso', 'aviso-1', ['publico']);
    expect(publico).toContain('publico');
    expect(publico).toEqual(expect.arrayContaining(['rol:REC', 'rol:MED', 'rol:PAC', 'rol:ADM']));
    expect(sorted(publico)).toEqual(exactly(['publico'], await rolesWith('avisos.publicar', 'sesion.perfil')));
    const dirigido = await emit('aviso.publicado', 'aviso', 'aviso-2', ['rol:ENF']);
    expect(dirigido).not.toContain('publico');
    expect(dirigido).not.toContain('rol:PAC');
    expect(sorted(dirigido)).toEqual(exactly(['rol:ENF'], await rolesWith('avisos.publicar')));
  });

  test('el estado de la ambulancia llega a quien ve su estado o bitácora; la ubicación en vivo no se amplía', async () => {
    const estado = await emit('ambulancia.estado_cambiado', 'unidad', 'unidad-1', ['ambulancia']);
    expect(estado).toEqual(expect.arrayContaining(['ambulancia', 'rol:MED', 'rol:DPD']));
    expect(sorted(estado)).toEqual(exactly(['ambulancia'], await rolesWith('ambulancia.ver_estado', 'ambulancia.ver_bitacora')));
    expect(estado).not.toContain('rol:PAC');
    expect(await emit('ambulancia.ubicacion', 'servicio', 'servicio-1', ['ambulancia'])).toEqual(['ambulancia']);
  });

  test('una cita llega a la cuenta del médico de esa cita', async () => {
    const doctor = (await fixture.pg.query<{ id: string }>('SELECT persona_personal_id AS id FROM acceso.usuario WHERE id=$1', [userId('MED')])).rows[0].id;
    const patient = (await fixture.pg.query<{ id: string }>("INSERT INTO pacientes.paciente(expediente,nombres,primer_apellido,sexo,precision_nacimiento,nacimiento) VALUES('T-RT-1','Paciente','Ficticio','femenino','exacta','1990-01-01') RETURNING id")).rows[0].id;
    const cita = (await fixture.pg.query<{ id: string }>("INSERT INTO atencion.cita(paciente_id,medico_id,horario,estado,origen) VALUES($1,$2,tstzrange('2026-12-01T15:00Z','2026-12-01T15:20Z','[)'),'confirmada','recepcion') RETURNING id", [patient, doctor])).rows[0].id;
    const canales = await emit('cita.actualizada', 'cita', cita, ['rol:REC']);
    expect(canales).toEqual(['rol:REC', `usuario:${userId('MED')}`]);
  });

  test('una admisión llega a la cuenta del paciente internado y a nadie más por esa vía', async () => {
    const doctor = (await fixture.pg.query<{ id: string }>('SELECT persona_personal_id AS id FROM acceso.usuario WHERE id=$1', [userId('MED')])).rows[0].id;
    const patient = (await fixture.pg.query<{ id: string }>("INSERT INTO pacientes.paciente(expediente,nombres,primer_apellido,sexo,precision_nacimiento,nacimiento) VALUES('T-RT-2','Paciente','Internada','femenino','exacta','1991-02-02') RETURNING id")).rows[0].id;
    const other = (await fixture.pg.query<{ id: string }>("INSERT INTO pacientes.paciente(expediente,nombres,primer_apellido,sexo,precision_nacimiento,nacimiento) VALUES('T-RT-3','Paciente','Sin Cuenta','femenino','exacta','1992-03-03') RETURNING id")).rows[0].id;
    const admit = async (owner: string) => (await fixture.pg.query<{ id: string }>("INSERT INTO hospitalizacion.admision(paciente_id,origen,origen_id,categoria_pedida,sexo_paciente,medico_tratante_id,estado,motivo) VALUES($1,'consulta',gen_random_uuid(),'semiprivada','femenino',$2,'hospitalizado','Ingreso de prueba en tiempo real') RETURNING id", [owner, doctor])).rows[0].id;
    const previous = (await fixture.pg.query<{ paciente_id: string | null }>('SELECT paciente_id FROM acceso.usuario WHERE id=$1', [userId('PAC')])).rows[0].paciente_id;
    await fixture.pg.query('UPDATE acceso.usuario SET paciente_id=$2 WHERE id=$1', [userId('PAC'), patient]);
    try {
      const own = await admit(patient);
      expect(await emit('admision.actualizada', 'admision', own, ['rol:ENF'])).toEqual(['rol:ENF', `usuario:${userId('PAC')}`]);
      expect(await emit('admision.actualizada', 'admision', await admit(other), ['rol:ENF'])).toEqual(['rol:ENF']);
    } finally {
      await fixture.pg.query('UPDATE acceso.usuario SET paciente_id=$2 WHERE id=$1', [userId('PAC'), previous]);
    }
  });

  test('los derivados públicos, las métricas y los ids que no son uuid quedan como llegaron', async () => {
    expect(await emit('fila.llamado', 'publico', 'fila:consulta_general', ['publico'])).toEqual(['publico']);
    expect(await emit('metricas.recalculadas', 'metricas', 'tablero', ['rol:ADM'])).toEqual(['rol:ADM']);
    expect(await emit('cita.actualizada', 'cita', 'no-es-uuid', ['rol:REC'])).toEqual(['rol:REC']);
    expect(await emit('inventario.actualizado', 'articulo', 'articulo-1', ['rol:JOP'])).toEqual(['rol:JOP']);
  });

  test('crear, editar o eliminar un artículo y crear un lote emiten inventario.actualizado a quien ve existencias', async () => {
    const last = async (id: string) => (await fixture.pg.query<{ canales: string[]; n: number }>(
      "SELECT canales, count(*) OVER ()::int AS n FROM plataforma.outbox WHERE tipo='inventario.actualizado' AND entidad='articulo' AND entidad_id=$1 ORDER BY seq DESC LIMIT 1", [id])).rows[0];
    const article = (await fixture.pg.query<{ id: string }>("INSERT INTO inventario.articulo(codigo,nombre,tipo,unidad,minimo) VALUES('RT-ART-1','Gasa ficticia','insumo','paquete',5) RETURNING id")).rows[0].id;
    const created = await last(article);
    expect(created.n).toBe(1);
    expect(sorted(created.canales)).toEqual(exactly(await rolesWith('inventario.ver', 'inventario.mover')));
    expect(created.canales).not.toContain('rol:PAC');
    await fixture.pg.query("INSERT INTO inventario.lote(articulo_id,numero) VALUES($1,'L-RT-1')", [article]);
    expect((await last(article)).n).toBe(2);
    await fixture.pg.query("DELETE FROM inventario.lote WHERE articulo_id=$1", [article]);
    await fixture.pg.query('DELETE FROM inventario.articulo WHERE id=$1', [article]);
    expect((await last(article)).n).toBe(3);
  });

  test('el bloqueo de cama por aislamiento anuncia cama.estado_cambiado; el manual lo anuncia la API', async () => {
    const bed = (await fixture.pg.query<{ id: string }>("SELECT id FROM infra.espacio WHERE tipo='cama' ORDER BY codigo LIMIT 1")).rows[0].id;
    const count = async () => Number((await fixture.pg.query<{ n: string }>("SELECT count(*) AS n FROM plataforma.outbox WHERE tipo='cama.estado_cambiado' AND entidad='cama' AND entidad_id=$1", [bed])).rows[0].n);
    const before = await count();
    await fixture.pg.query("INSERT INTO infra.bloqueo_cama(cama_id,periodo,motivo,origen) VALUES($1,tstzrange('2026-12-01T00:00Z','2026-12-02T00:00Z','[)'),'Mantenimiento ficticio','manual')", [bed]);
    expect(await count()).toBe(before);
    await fixture.pg.query("INSERT INTO infra.bloqueo_cama(cama_id,periodo,motivo,origen) VALUES($1,tstzrange('2026-12-03T00:00Z',NULL,'[)'),'Aislamiento de paciente hospitalizado','aislamiento')", [bed]);
    expect(await count()).toBe(before + 1);
    const channels = (await fixture.pg.query<{ canales: string[] }>("SELECT canales FROM plataforma.outbox WHERE tipo='cama.estado_cambiado' AND entidad_id=$1 ORDER BY seq DESC LIMIT 1", [bed])).rows[0].canales;
    expect(sorted(channels)).toEqual(exactly(await rolesWith('camas.ver_tablero', 'espacios.ver')));
    const publico = await fixture.pg.query("SELECT 1 FROM plataforma.outbox WHERE tipo='cama.estado_cambiado' AND entidad='publico' AND entidad_id='ocupacion'");
    expect(publico.rows.length).toBeGreaterThan(0);
  });
});
