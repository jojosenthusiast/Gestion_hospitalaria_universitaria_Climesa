import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTestApp, TestApp } from './support/app';

/**
 * Datos de demostración (tools/demo): la semilla es idempotente y respeta todas las restricciones del esquema;
 * la limpieza deja la base como estaba antes de sembrar. Se aplica sobre el esquema completo en PGlite.
 */
jest.setTimeout(240000);

const carpeta = resolve(__dirname, '../../tools/demo');
const semilla = readFileSync(resolve(carpeta, 'semilla-demo.sql'), 'utf8');
const limpieza = readFileSync(resolve(carpeta, 'limpiar-demo.sql'), 'utf8');

const DEMO = "'de300000-%'";
/** Tabla -> condición que identifica sus filas demo (id propio, o el padre demo cuando la tabla no tiene id). */
const TABLAS: Record<string, string> = {
  'pacientes.paciente': `id::text LIKE ${DEMO}`,
  'pacientes.identificador': `id::text LIKE ${DEMO}`,
  'pacientes.historial_demografico': `paciente_id::text LIKE ${DEMO}`,
  'pacientes.caso_duplicado': `id::text LIKE ${DEMO}`,
  'acceso.usuario': `id::text LIKE ${DEMO}`,
  'acceso.asignacion_rol': `usuario_id::text LIKE ${DEMO}`,
  'acceso.vinculacion_paciente': `id::text LIKE ${DEMO}`,
  'acceso.invitacion': `id::text LIKE ${DEMO}`,
  'infra.espacio': `id::text LIKE ${DEMO}`,
  'infra.bloqueo_cama': `id::text LIKE ${DEMO}`,
  'infra.limpieza_cama': `id::text LIKE ${DEMO}`,
  'infra.equipo': `id::text LIKE ${DEMO}`,
  'personal.persona': `id::text LIKE ${DEMO}`,
  'personal.inscripcion': `id::text LIKE ${DEMO}`,
  'personal.turno': `id::text LIKE ${DEMO}`,
  'atencion.cita': `id::text LIKE ${DEMO}`,
  'atencion.ticket_fila': `id::text LIKE ${DEMO}`,
  'atencion.consulta': `id::text LIKE ${DEMO}`,
  'atencion.diagnostico': `id::text LIKE ${DEMO}`,
  'atencion.receta': `id::text LIKE ${DEMO}`,
  'atencion.receta_item': `id::text LIKE ${DEMO}`,
  'atencion.signos_vitales': `id::text LIKE ${DEMO}`,
  'atencion.addendum': `id::text LIKE ${DEMO}`,
  'atencion.relacion_atencion': `id::text LIKE ${DEMO}`,
  'laboratorio.orden': `id::text LIKE ${DEMO}`,
  'laboratorio.orden_item': `id::text LIKE ${DEMO}`,
  'laboratorio.resultado': `orden_item_id::text LIKE ${DEMO}`,
  'laboratorio.resultado_historial': `orden_item_id::text LIKE ${DEMO}`,
  'hospitalizacion.admision': `id::text LIKE ${DEMO}`,
  'hospitalizacion.ocupacion_cama': `id::text LIKE ${DEMO}`,
  'hospitalizacion.reserva_cama': `id::text LIKE ${DEMO}`,
  'hospitalizacion.traslado': `id::text LIKE ${DEMO}`,
  'hospitalizacion.alta': `admision_id::text LIKE ${DEMO}`,
  'hospitalizacion.nota_enfermeria': `id::text LIKE ${DEMO}`,
  'ambulancia.solicitud': `id::text LIKE ${DEMO}`,
  'ambulancia.servicio': `id::text LIKE ${DEMO}`,
  'ambulancia.tripulacion': `servicio_id::text LIKE ${DEMO}`,
  'ambulancia.hito': `id::text LIKE ${DEMO}`,
  'ambulancia.reporte_prehospital': `id::text LIKE ${DEMO}`,
  'ambulancia.ubicacion': `servicio_id::text LIKE ${DEMO}`,
  'ambulancia.cambio_estado': `motivo LIKE '[DEMO]%'`,
  'inventario.articulo': `id::text LIKE ${DEMO}`,
  'inventario.lote': `id::text LIKE ${DEMO}`,
  'inventario.existencia': `lote_id::text LIKE ${DEMO}`,
  'inventario.movimiento': `id::text LIKE ${DEMO}`,
  'publico.aviso': `id::text LIKE ${DEMO}`,
};
/** Tablas de negocio que la semilla no puebla a propósito (ver README.md, sección "Lo que no se siembra"). */
const SIN_SEMBRAR = ['atencion.contador_fila', 'acceso.acceso_excepcional', 'acceso.dispositivo_push', 'acceso.administrador_principal',
  'pacientes.busqueda_registro', 'plataforma.auditoria', 'plataforma.outbox', 'plataforma.inbox', 'plataforma.idempotencia'];

describe('Datos de demostración (tools/demo)', () => {
  let t: TestApp;
  beforeAll(async () => { t = await createTestApp(new Date()); });
  afterAll(async () => { await t?.close(); });

  const contar = async (tabla: string, donde: string) =>
    Number((await t.one<{ n: string }>(`SELECT count(*) AS n FROM ${tabla} WHERE ${donde}`)).n);
  const demo = async (): Promise<Record<string, number>> => Object.fromEntries(await Promise.all(Object.entries(TABLAS).map(async ([tabla, donde]) => [tabla, await contar(tabla, donde)])));
  const totales = async (): Promise<Record<string, number>> => Object.fromEntries(await Promise.all(Object.keys(TABLAS).map(async tabla => [tabla, await contar(tabla, 'true')])));
  const estadoGeneral = async () => ({
    totales: await totales(),
    unidad: (await t.one<{ estado: string }>('SELECT estado FROM ambulancia.unidad')).estado,
    vinculos: (await t.one<{ n: string }>('SELECT count(*) AS n FROM acceso.usuario WHERE persona_personal_id IS NOT NULL')).n,
  });

  let antes: Awaited<ReturnType<typeof estadoGeneral>>;

  test('la semilla se aplica y deja datos en todas las tablas de negocio', async () => {
    antes = await estadoGeneral();
    await t.pg.exec(semilla);
    const conteo = await demo();
    for (const [tabla, n] of Object.entries(conteo)) expect({ tabla, n: n > 0 }).toEqual({ tabla, n: true });
    // Las tablas de negocio sin datos demo están todas declaradas y justificadas.
    const todas = (await t.pg.query<{ t: string }>(`SELECT schemaname || '.' || tablename AS t FROM pg_tables
      WHERE schemaname IN ('plataforma','acceso','pacientes','infra','personal','atencion','laboratorio','hospitalizacion','ambulancia','inventario','publico')`)).rows.map(r => r.t);
    const catalogos = ['pacientes.tipo_identificador', 'infra.tipo_equipo', 'acceso.rol', 'acceso.permiso', 'acceso.rol_permiso', 'atencion.cie10',
      'laboratorio.examen', 'laboratorio.examen_componente', 'laboratorio.rango_referencia', 'plataforma.politica', 'ambulancia.unidad'];
    expect(todas.filter(x => !(x in TABLAS) && !SIN_SEMBRAR.includes(x) && !catalogos.includes(x))).toEqual([]);
  });

  test('sembrar dos veces no duplica ni falla (idempotencia)', async () => {
    const primera = await demo();
    const totalPrimera = await totales();
    await t.pg.exec(semilla);
    expect(await demo()).toEqual(primera);
    expect(await totales()).toEqual(totalPrimera);
  });

  test('lo sembrado respeta lo que cuenta la demo: hemograma revisado y uno pendiente, cama en cada estado, unidad en servicio', async () => {
    const ordenes = (await t.pg.query<{ estado: string; revisada: boolean; items: string }>(`
      SELECT o.estado, o.revisada_en IS NOT NULL AS revisada, string_agg(e.codigo, ',' ORDER BY e.codigo) AS items
      FROM laboratorio.orden o JOIN laboratorio.orden_item i ON i.orden_id = o.id JOIN laboratorio.examen e ON e.id = i.examen_id
      WHERE o.id::text LIKE ${DEMO} GROUP BY o.id, o.estado, o.revisada_en`)).rows;
    expect(ordenes.some(o => o.estado === 'completado' && o.revisada && o.items.includes('HB'))).toBe(true);
    expect(ordenes.some(o => o.estado === 'pendiente' && o.items.includes('HB'))).toBe(true);
    for (const estado of ['pendiente', 'en_proceso', 'completado', 'cancelado']) expect(ordenes.some(o => o.estado === estado)).toBe(true);

    const camas = (await t.pg.query<{ estado: string }>(`SELECT DISTINCT estado FROM infra.v_estado_cama WHERE cama_id::text LIKE ${DEMO}`)).rows.map(r => r.estado).sort();
    expect(camas).toEqual(['bloqueada', 'libre', 'limpieza', 'ocupada', 'reservada']);
    const categorias = (await t.pg.query<{ categoria: string }>(`SELECT DISTINCT categoria FROM infra.v_estado_cama WHERE cama_id::text LIKE ${DEMO} AND estado = 'ocupada'`)).rows.map(r => r.categoria).sort();
    expect(categorias).toEqual(['semiprivada', 'vip']);

    const citas = (await t.pg.query<{ estado: string }>(`SELECT DISTINCT estado FROM atencion.cita WHERE id::text LIKE ${DEMO}`)).rows.map(r => r.estado).sort();
    expect(citas).toEqual(['atendida', 'cancelada', 'confirmada', 'no_asistio', 'rechazada', 'solicitada']);
    const consultas = (await t.pg.query<{ estado: string }>(`SELECT DISTINCT estado FROM atencion.consulta WHERE id::text LIKE ${DEMO}`)).rows.map(r => r.estado).sort();
    expect(consultas).toEqual(['abierta', 'firmada', 'ingresada_por_error']);
    const servicios = (await t.pg.query<{ estado: string | null }>(`SELECT DISTINCT estado_final AS estado FROM ambulancia.servicio WHERE id::text LIKE ${DEMO}`)).rows.map(r => r.estado);
    expect(servicios).toEqual(expect.arrayContaining(['completado', 'cancelado', 'sin_traslado', 'rechaza_traslado', null]));
    expect((await t.one<{ estado: string }>('SELECT estado FROM ambulancia.unidad')).estado).toBe('en_servicio');

    const bajoMinimo = Number((await t.one<{ n: string }>(`SELECT count(*) AS n FROM inventario.v_existencias WHERE bajo_minimo AND articulo_id::text LIKE ${DEMO}`)).n);
    expect(bajoMinimo).toBeGreaterThanOrEqual(4);
    const vinculaciones = (await t.pg.query<{ estado: string }>(`SELECT DISTINCT estado FROM acceso.vinculacion_paciente WHERE id::text LIKE ${DEMO}`)).rows.map(r => r.estado).sort();
    expect(vinculaciones).toEqual(['aprobada', 'pendiente', 'rechazada']);
  });

  test('la API lee lo sembrado: la búsqueda "maria" sin tilde encuentra a las dos María', async () => {
    const encontrados = await t.call('REC', 'GET', '/pacientes?query=maria');
    expect(encontrados.status).toBe(200);
    const nombres = JSON.stringify(encontrados.body);
    expect(nombres).toContain('María Alejandra');
    expect(nombres).toContain('María Valeria');
  });

  test('la limpieza quita exactamente lo demo y deja la base como estaba', async () => {
    await t.pg.exec(limpieza);
    const restante = await demo();
    for (const [tabla, n] of Object.entries(restante)) expect({ tabla, n }).toEqual({ tabla, n: 0 });
    const despues = await estadoGeneral();
    expect(despues).toEqual(antes);
  });

  test('limpiar dos veces tampoco falla y se puede volver a sembrar', async () => {
    await t.pg.exec(limpieza);
    await t.pg.exec(semilla);
    for (const [tabla, n] of Object.entries(await demo())) expect({ tabla, n: n > 0 }).toEqual({ tabla, n: true });
    await t.pg.exec(limpieza);
    expect(await estadoGeneral()).toEqual(antes);
  });

  test('si alguien usó un paciente demo en un flujo real, la limpieza lo conserva y no falla', async () => {
    await t.pg.exec(semilla);
    const medico = await t.one<{ id: string }>(`SELECT persona_personal_id AS id FROM acceso.usuario WHERE correo = 'med@example.test'`);
    const real = await t.one<{ id: string }>(`INSERT INTO atencion.cita(paciente_id, medico_id, horario, estado, origen)
      VALUES ('de300000-0001-4000-8000-000000000001', $1, tstzrange(now() + interval '40 days', now() + interval '40 days 20 minutes', '[)'), 'confirmada', 'recepcion') RETURNING id`, [medico.id]);
    await t.pg.exec(limpieza);
    expect(await contar('pacientes.paciente', `id = 'de300000-0001-4000-8000-000000000001'`)).toBe(1);
    expect(await contar('pacientes.paciente', `id::text LIKE ${DEMO} AND id <> 'de300000-0001-4000-8000-000000000001'`)).toBe(0);
    await t.pg.query('DELETE FROM atencion.cita WHERE id = $1', [real.id]);
    await t.pg.exec(limpieza);
    expect(await estadoGeneral()).toEqual(antes);
  });
});
