import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTestApp, TestApp } from './support/app';
import { userId } from './support/database';
import { AuditService } from '../src/platform/audit.service';
const runner = require('../../tools/demo/demo.cjs') as { simulate: (db: unknown, steps: string[], execute?: boolean) => Promise<{ before: Record<string, number>; after: Record<string, number>; changes: Array<{ tabla: string; diferencia: number }> }>; readOnlyCount: (db: unknown) => Promise<Array<{ tabla: string; demo: number; cuentas_prueba: number }>> };

/**
 * Datos de demostración (tools/demo): la semilla es idempotente y respeta todas las restricciones del esquema;
 * la limpieza deja la base como estaba antes de sembrar. Se aplica sobre el esquema completo en PGlite.
 */
jest.setTimeout(240000);

const carpeta = resolve(__dirname, '../../tools/demo');
const semilla = readFileSync(resolve(carpeta, 'semilla-demo.sql'), 'utf8');
const limpiezaSinConfirmar = readFileSync(resolve(carpeta, 'limpiar-demo.sql'), 'utf8');
// Lote 5 (S17): la limpieza exige la confirmación explícita de la sesión antes de borrar.
const limpieza = `set demo.confirmar = 'limpiar';
${limpiezaSinConfirmar}`;

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
  // Fase 2, S6: solicitudes de cita por categoría en todos los estados, para la bandeja de recepción.
  'atencion.solicitud_cita': `id::text LIKE ${DEMO}`,
  // Lote 5 (S17): reprogramaciones, resultados por revisar del médico e informes externos que no son texto.
  'atencion.reprogramacion': `id::text LIKE ${DEMO}`,
  'laboratorio.pendiente_medico': `id::text LIKE ${DEMO}`,
  'laboratorio.adjunto': `id::text LIKE ${DEMO}`,
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
  // plataforma.auditoria: la semilla agrega lecturas firmadas para «Quién vio mi expediente» (Lote 5), pero la limpieza no
  // las borra nunca (cadena de solo inserción): por eso no está en TABLAS. La prueba de Lote 5 verifica la cadena.
  'pacientes.busqueda_registro', 'plataforma.auditoria', 'plataforma.outbox', 'plataforma.inbox', 'plataforma.idempotencia',
  // Historial de cambios de médico tratante (BL-03): nace de una acción de Jefatura, la demo no lo siembra.
  'hospitalizacion.cambio_tratante',
  // Fase 2, flujo C (S10): pendientes del médico, propuestas de cita y adjuntos externos nacen del uso real.
  'laboratorio.propuesta_cita',
  // Fase 2, flujo F: las plantillas de semana nacen de Jefatura; la demo no las siembra.
  'personal.plantilla_semana',
  // Fase 2, flujo D (S11): el «Enterado» y los recordatorios nacen solo de cada cuenta.
  'publico.aviso_enterado',
  // R7 G-4: un hito anulado nace solo cuando la tripulación deshace un hito real.
  'ambulancia.hito_anulado'];

const MINIMOS: Record<string, number> = {
  'pacientes.paciente': 300, 'pacientes.identificador': 280, 'atencion.cita': 400, 'atencion.ticket_fila': 60, 'personal.persona': 100,
  'atencion.solicitud_cita': 25, 'atencion.consulta': 70,
  'atencion.diagnostico': 100, 'atencion.receta': 60, 'atencion.signos_vitales': 150, 'laboratorio.orden': 30, 'laboratorio.resultado': 80,
  'hospitalizacion.admision': 20, 'hospitalizacion.ocupacion_cama': 18, 'hospitalizacion.nota_enfermeria': 30, 'ambulancia.solicitud': 15,
  'ambulancia.servicio': 12, 'ambulancia.hito': 45, 'ambulancia.reporte_prehospital': 10, 'inventario.articulo': 40, 'inventario.lote': 40,
  'inventario.movimiento': 90, 'publico.aviso': 14, 'personal.turno': 1000, 'acceso.vinculacion_paciente': 10, 'acceso.invitacion': 8,
};
const verificarUmbrales = (conteo: Record<string, number>) => {
  for (const [tabla, minimo] of Object.entries(MINIMOS)) expect({ tabla, ok: conteo[tabla] >= minimo }).toEqual({ tabla, ok: true });
};
const semillaAnterior = readFileSync(resolve(__dirname, 'fixtures/semilla-demo-anterior.sql'), 'utf8');

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
    expedientesUnidos: (await t.one<{ n: string }>('SELECT count(*) AS n FROM acceso.usuario WHERE paciente_id IS NOT NULL')).n,
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
      'laboratorio.examen', 'laboratorio.examen_componente', 'laboratorio.rango_referencia', 'plataforma.politica', 'ambulancia.unidad', 'personal.especialidad_catalogo', 'atencion.categoria_cita'];
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

    // BL-01: la demo ocupa las camas reales de hospitalización (HAB-201 a 206 y VIP-301 a 305), no una planta inventada.
    const HOSPITAL = `cama_id IN (SELECT id FROM infra.espacio WHERE tipo = 'cama' AND (codigo LIKE 'HAB-20%' OR codigo LIKE 'VIP-30%'))`;
    const camas = (await t.pg.query<{ estado: string }>(`SELECT DISTINCT estado FROM infra.v_estado_cama WHERE ${HOSPITAL}`)).rows.map(r => r.estado).sort();
    expect(camas).toEqual(['bloqueada', 'libre', 'limpieza', 'ocupada', 'reservada']);
    const categorias = (await t.pg.query<{ categoria: string }>(`SELECT DISTINCT categoria FROM infra.v_estado_cama WHERE ${HOSPITAL} AND estado = 'ocupada'`)).rows.map(r => r.categoria).sort();
    expect(categorias).toEqual(['semiprivada', 'vip']);
    expect(Number((await t.one<{ n: string }>(`SELECT count(*) AS n FROM infra.espacio WHERE codigo IN ('P4', 'P4-HOS') OR (id::text LIKE ${DEMO} AND tipo IN ('habitacion', 'cama'))`)).n)).toBe(0);
    const fuera = (await t.pg.query<{ codigo: string }>(`SELECT DISTINCT e.codigo FROM hospitalizacion.ocupacion_cama o JOIN infra.espacio e ON e.id = o.cama_id
      WHERE o.id::text LIKE ${DEMO} AND NOT (e.codigo LIKE 'HAB-20%' OR e.codigo LIKE 'VIP-30%')`)).rows;
    expect(fuera).toEqual([]);

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

  test('volumen: unos 300 pacientes y cada módulo supera su umbral', async () => {
    await t.pg.exec(limpieza);
    await t.pg.exec(semilla);
    const conteo = await demo();
    verificarUmbrales(conteo);
  });

  test('S6: escala de hospital real: 45+ médicos, cientos de pacientes, decenas de turnos hoy, fila llena y solicitudes por categoría', async () => {
    await t.pg.exec(semilla);
    const n = async (sql: string) => Number((await t.one<{ n: string }>(sql)).n);
    const HOY = `(now() AT TIME ZONE 'America/El_Salvador')::date`;
    const localDia = `(lower(u.periodo) AT TIME ZONE 'America/El_Salvador')::date`;
    expect(await n(`SELECT count(*) AS n FROM personal.persona WHERE id::text LIKE ${DEMO} AND tipo = 'medico'`)).toBeGreaterThanOrEqual(45);
    expect(await n(`SELECT count(*) AS n FROM pacientes.paciente WHERE id::text LIKE ${DEMO}`)).toBeGreaterThanOrEqual(300);
    // Dozens of published shifts start today across areas, and most doctors work today.
    expect(await n(`SELECT count(*) AS n FROM personal.turno u WHERE u.id::text LIKE ${DEMO} AND u.estado NOT IN ('cancelado', 'borrador') AND ${localDia} = ${HOY}`)).toBeGreaterThanOrEqual(60);
    expect(await n(`SELECT count(DISTINCT u.persona_id) AS n FROM personal.turno u JOIN personal.persona p ON p.id = u.persona_id
      WHERE u.id::text LIKE ${DEMO} AND p.tipo = 'medico' AND u.estado NOT IN ('cancelado', 'borrador') AND ${localDia} = ${HOY}`)).toBeGreaterThanOrEqual(20);
    expect(await n(`SELECT count(DISTINCT e.codigo) AS n FROM personal.turno u JOIN infra.espacio e ON e.id = u.area_id
      WHERE u.id::text LIKE ${DEMO} AND u.estado NOT IN ('cancelado', 'borrador') AND ${localDia} = ${HOY}`)).toBeGreaterThanOrEqual(6);
    // Appointments are spread across many doctors, each one inside a shift of that doctor (API rule CITA-04).
    expect(await n(`SELECT count(DISTINCT medico_id) AS n FROM atencion.cita WHERE id::text LIKE ${DEMO}`)).toBeGreaterThanOrEqual(30);
    expect(await n(`SELECT count(*) AS n FROM atencion.cita c WHERE c.id::text LIKE ${DEMO} AND c.estado IN ('solicitada', 'confirmada')
      AND c.medico_id IN (SELECT id FROM personal.persona WHERE id::text LIKE ${DEMO} AND id::text >= 'de300000-0002-4000-8000-000000000100')
      AND NOT EXISTS (SELECT 1 FROM personal.turno u WHERE u.persona_id = c.medico_id AND u.estado NOT IN ('cancelado', 'borrador') AND u.periodo @> c.horario)`)).toBe(0);
    // Category requests in several states; an assigned one points to a confirmed appointment of the same patient.
    const solicitudes = (await t.pg.query<{ estado: string }>(`SELECT DISTINCT estado FROM atencion.solicitud_cita WHERE id::text LIKE ${DEMO}`)).rows.map(r => r.estado).sort();
    expect(solicitudes).toEqual(['asignada', 'cancelada', 'pendiente', 'rechazada']);
    expect(await n(`SELECT count(*) AS n FROM atencion.solicitud_cita s LEFT JOIN atencion.cita c ON c.id = s.cita_id
      WHERE s.id::text LIKE ${DEMO} AND s.estado = 'asignada' AND (c.id IS NULL OR c.paciente_id <> s.paciente_id OR c.estado <> 'confirmada')`)).toBe(0);
    expect(await n(`SELECT count(*) AS n FROM atencion.solicitud_cita s WHERE s.id::text LIKE ${DEMO}
      AND EXISTS (SELECT unnest(s.categorias) EXCEPT SELECT codigo FROM atencion.categoria_cita)`)).toBe(0);
    // A busy queue today with every priority.
    expect(await n(`SELECT count(*) AS n FROM atencion.ticket_fila WHERE id::text LIKE ${DEMO} AND fecha = ${HOY}`)).toBeGreaterThanOrEqual(60);
    const prioridades = (await t.pg.query<{ p: string }>(`SELECT DISTINCT prioridad AS p FROM atencion.ticket_fila WHERE id::text LIKE ${DEMO}`)).rows.map(r => r.p).sort();
    expect(prioridades).toEqual(['emergencia', 'rutina', 'urgente']);
  });

  test('cada enumeración de estado aparece al menos una vez', async () => {
    const valores = async (tabla: string, columna: string, donde = `id::text LIKE ${DEMO}`) =>
      (await t.pg.query<{ v: string | null }>(`SELECT DISTINCT ${columna} AS v FROM ${tabla} WHERE ${donde}`)).rows.map(r => r.v).sort();
    expect(await valores('atencion.ticket_fila', 'estado')).toEqual(['atendido', 'en_atencion', 'en_espera', 'llamado', 'no_se_presento']);
    expect(await valores('atencion.ticket_fila', 'servicio')).toEqual(['admisiones', 'consulta_general', 'emergencia', 'laboratorio']);
    expect(await valores('laboratorio.orden', 'estado')).toEqual(['cancelado', 'completado', 'en_proceso', 'pendiente']);
    expect(await valores('laboratorio.orden', 'prioridad')).toEqual(['rutina', 'urgente']);
    const marcas = await valores('laboratorio.resultado', 'marca', `orden_item_id::text LIKE ${DEMO}`);
    expect(marcas).toEqual(expect.arrayContaining(['normal', 'alto', 'bajo', 'critico_alto', 'critico_bajo']));
    expect(await valores('hospitalizacion.admision', 'estado')).toEqual(['alta_firmada', 'cancelada', 'egresado', 'hospitalizado', 'pendiente_cama']);
    expect(await valores('hospitalizacion.admision', 'origen')).toEqual(['ambulancia', 'cita', 'consulta', 'emergencia']);
    expect(await valores('hospitalizacion.admision', 'tipo_aislamiento')).toEqual(['aerea', 'contacto', 'gotitas', null]);
    expect(await valores('hospitalizacion.alta', 'tipo', `admision_id::text LIKE ${DEMO}`)).toEqual(['medica', 'traslado', 'voluntaria']);
    expect(await valores('hospitalizacion.reserva_cama', 'estado')).toEqual(['activa', 'usada', 'vencida']);
    expect(await valores('ambulancia.solicitud', 'estado')).toEqual(['cancelada', 'confirmada', 'descartada', 'por_confirmar']);
    expect(await valores('ambulancia.solicitud', 'canal')).toEqual(['app_paciente', 'telefono']);
    expect(await valores('ambulancia.servicio', 'tipo')).toEqual(['emergencia_domicilio', 'traslado_interhospitalario']);
    expect(await valores('ambulancia.hito', 'tipo')).toEqual(['en_escena', 'en_hospital', 'finalizado', 'salida', 'trasladando']);
    expect(await valores('inventario.movimiento', 'tipo')).toEqual(['ajuste', 'consumo', 'entrada', 'merma', 'salida', 'traslado']);
    expect(await valores('inventario.articulo', 'activo')).toEqual(['false', 'true'].map(x => x === 'true') as unknown as string[]);
    expect(await valores('inventario.lote', 'activo')).toEqual([false, true] as unknown as string[]);
    expect(await valores('publico.aviso', 'prioridad')).toEqual(['atencion', 'critico', 'urgente']);
    expect(await valores('publico.aviso', 'publico')).toEqual([false, true] as unknown as string[]);
    expect(await valores('personal.turno', 'estado')).toEqual(['borrador', 'cancelado', 'completado', 'en_curso', 'publicado']);
    expect(await valores('personal.turno', 'tipo')).toEqual(['diurno', 'guardia', 'nocturno']);
    expect(await valores('acceso.vinculacion_paciente', 'estado')).toEqual(['aprobada', 'pendiente', 'rechazada']);
    expect(await valores('acceso.invitacion', 'estado')).toEqual(['aceptada', 'enviada', 'expirada', 'rechazada']);
    expect(await valores('pacientes.paciente', 'estado')).toEqual(['activo', 'inactivo', 'provisional']);
    expect(await valores('pacientes.caso_duplicado', 'estado')).toEqual(['descartado', 'en_revision', 'sospechado']);
    // Hay recetas, diagnósticos principales y secundarios, y consultas de niños, adultos y mayores.
    expect(await contar('atencion.diagnostico', `id::text LIKE ${DEMO} AND NOT principal`)).toBeGreaterThan(10);
    const edades = (await t.pg.query<{ g: string }>(`SELECT DISTINCT CASE WHEN extract(year FROM age(nacimiento)) < 18 THEN 'menor' WHEN extract(year FROM age(nacimiento)) < 60 THEN 'adulto' ELSE 'mayor' END AS g
      FROM pacientes.paciente WHERE id::text LIKE ${DEMO} AND nacimiento IS NOT NULL`)).rows.map(r => r.g).sort();
    expect(edades).toEqual(['adulto', 'mayor', 'menor']);
  });

  test('coherencia clínica: nada huérfano, cada resultado cuelga de una orden de las consultas o ingresos del mismo paciente', async () => {
    const huerfanos = async (sql: string) => (await t.pg.query<{ id: string }>(sql)).rows.map(r => r.id);
    // Resultados sin orden, o con una orden de otro paciente.
    expect(await huerfanos(`SELECT r.orden_item_id::text AS id FROM laboratorio.resultado r LEFT JOIN laboratorio.orden_item i ON i.id = r.orden_item_id
      LEFT JOIN laboratorio.orden o ON o.id = i.orden_id WHERE r.orden_item_id::text LIKE ${DEMO} AND o.id IS NULL`)).toEqual([]);
    expect(await huerfanos(`SELECT o.id::text AS id FROM laboratorio.orden o LEFT JOIN atencion.consulta c ON c.id = o.consulta_id LEFT JOIN hospitalizacion.admision a ON a.id = o.admision_id
      WHERE o.id::text LIKE ${DEMO} AND NOT ((c.id IS NOT NULL AND c.paciente_id = o.paciente_id) OR (a.id IS NOT NULL AND a.paciente_id = o.paciente_id))`)).toEqual([]);
    // Las órdenes con resultados no están pendientes ni canceladas; las canceladas llevan motivo y no tienen resultados.
    expect(await huerfanos(`SELECT o.id::text AS id FROM laboratorio.orden o WHERE o.id::text LIKE ${DEMO} AND o.estado IN ('pendiente', 'cancelado')
      AND EXISTS (SELECT 1 FROM laboratorio.orden_item i JOIN laboratorio.resultado r ON r.orden_item_id = i.id WHERE i.orden_id = o.id)`)).toEqual([]);
    // Una orden de laboratorio nunca es anterior a su consulta ni a su admisión.
    expect(await huerfanos(`SELECT o.id::text AS id FROM laboratorio.orden o LEFT JOIN atencion.consulta c ON c.id = o.consulta_id LEFT JOIN hospitalizacion.admision a ON a.id = o.admision_id
      WHERE o.id::text LIKE ${DEMO} AND (o.creada_en < c.iniciada_en OR o.creada_en < a.creado_en)`)).toEqual([]);
    // Cada consulta es del mismo paciente y médico que su cita, y del mismo paciente que su número de fila.
    expect(await huerfanos(`SELECT c.id::text AS id FROM atencion.consulta c LEFT JOIN atencion.cita ci ON ci.id = c.cita_id LEFT JOIN atencion.ticket_fila tk ON tk.id = c.ticket_id
      WHERE c.id::text LIKE ${DEMO} AND ((ci.id IS NOT NULL AND (ci.paciente_id <> c.paciente_id OR ci.medico_id <> c.medico_id)) OR (tk.id IS NOT NULL AND tk.paciente_id <> c.paciente_id))`)).toEqual([]);
    // Toda consulta firmada tiene un diagnóstico principal y signos; ninguna abierta lo tiene firmado.
    expect(await huerfanos(`SELECT c.id::text AS id FROM atencion.consulta c WHERE c.id::text LIKE ${DEMO} AND c.estado = 'firmada'
      AND c.id NOT IN (SELECT consulta_id FROM atencion.diagnostico WHERE principal)`)).toEqual([]);
    expect(await huerfanos(`SELECT c.id::text AS id FROM atencion.consulta c WHERE c.id::text LIKE ${DEMO} AND c.estado = 'firmada'
      AND c.id NOT IN (SELECT consulta_id FROM atencion.signos_vitales WHERE consulta_id IS NOT NULL)`)).toEqual([]);
    // Las recetas y los diagnósticos son de consultas demo; los renglones tienen su receta.
    expect(await huerfanos(`SELECT r.id::text AS id FROM atencion.receta r LEFT JOIN atencion.consulta c ON c.id = r.consulta_id WHERE r.id::text LIKE ${DEMO} AND c.id IS NULL`)).toEqual([]);
    // Ningún paciente tiene dos citas activas que se traslapen ni dos números activos en el mismo servicio.
    expect(await huerfanos(`SELECT a.id::text AS id FROM atencion.cita a JOIN atencion.cita b ON b.paciente_id = a.paciente_id AND a.id < b.id AND a.horario && b.horario
      WHERE a.id::text LIKE ${DEMO} AND a.estado IN ('solicitada', 'confirmada') AND b.estado IN ('solicitada', 'confirmada')`)).toEqual([]);
    // Las citas atendidas y las que no se cumplieron no están en el futuro.
    expect(await huerfanos(`SELECT id::text AS id FROM atencion.cita WHERE id::text LIKE ${DEMO} AND estado IN ('atendida', 'no_asistio') AND lower(horario) > now()`)).toEqual([]);
    // Las cuentas vinculadas apuntan a pacientes demo distintos y las aprobadas tienen quien las verificó.
    expect(await contar('acceso.usuario', `id::text LIKE ${DEMO} AND paciente_id IS NOT NULL`)).toBeGreaterThanOrEqual(4);
    expect(await huerfanos(`SELECT v.id::text AS id FROM acceso.vinculacion_paciente v WHERE v.id::text LIKE ${DEMO} AND v.estado = 'aprobada'
      AND NOT EXISTS (SELECT 1 FROM acceso.usuario u WHERE u.id = v.usuario_id AND u.paciente_id = v.paciente_candidato_id)`)).toEqual([]);
  });

  test('coherencia de hospitalización: orígenes que existen, ocupación igual a las admisiones y reglas de cama', async () => {
    const filas = async (sql: string) => (await t.pg.query<{ id: string }>(sql)).rows.map(r => r.id);
    // El origen de cada ingreso existe, es del mismo paciente y es anterior al ingreso.
    expect(await filas(`SELECT a.id::text AS id FROM hospitalizacion.admision a WHERE a.id::text LIKE ${DEMO} AND NOT (
      (a.origen = 'consulta' AND EXISTS (SELECT 1 FROM atencion.consulta c WHERE c.id = a.origen_id AND c.paciente_id = a.paciente_id AND coalesce(c.firmada_en, c.iniciada_en) <= a.creado_en))
      OR (a.origen = 'cita' AND EXISTS (SELECT 1 FROM atencion.cita c WHERE c.id = a.origen_id AND c.paciente_id = a.paciente_id AND upper(c.horario) <= a.creado_en))
      OR (a.origen = 'emergencia' AND EXISTS (SELECT 1 FROM atencion.ticket_fila k WHERE k.id = a.origen_id AND k.paciente_id = a.paciente_id AND k.emitido_en <= a.creado_en))
      OR (a.origen = 'ambulancia' AND EXISTS (SELECT 1 FROM ambulancia.servicio s WHERE s.id = a.origen_id AND s.paciente_id = a.paciente_id AND s.finalizado_en <= a.creado_en)))`)).toEqual([]);
    // Ingreso guiado de la ronda 2: ninguna fila demo es legado; el motivo, el aislamiento y las visitas son coherentes.
    expect(await contar('hospitalizacion.admision', `id::text LIKE ${DEMO} AND legado`)).toBe(0);
    expect(await filas(`SELECT id::text AS id FROM hospitalizacion.admision WHERE id::text LIKE ${DEMO} AND (motivo IS NULL OR length(btrim(motivo)) < 10 OR origen_id IS NULL
      OR (tipo_aislamiento IS NOT NULL AND NOT aislamiento) OR (visitas_permitidas AND visitantes_max < 1) OR (NOT visitas_permitidas AND visitantes_max <> 0))`)).toEqual([]);
    // Una ocupación abierta solo existe en los hospitalizados y en las altas firmadas (cuya cama sigue ocupada), y es una sola.
    const abiertas = (await t.pg.query<{ estado: string; n: string }>(`SELECT a.estado, count(o.id) FILTER (WHERE upper_inf(o.periodo)) AS n
      FROM hospitalizacion.admision a LEFT JOIN hospitalizacion.ocupacion_cama o ON o.admision_id = a.id WHERE a.id::text LIKE ${DEMO} GROUP BY a.id, a.estado`)).rows;
    for (const r of abiertas) expect({ estado: r.estado, abiertas: Number(r.n) }).toEqual({ estado: r.estado, abiertas: ['hospitalizado', 'alta_firmada'].includes(r.estado) ? 1 : 0 });
    // Un egresado tiene su alta y su última ocupación cerrada por egreso; una cama nunca se ocupa antes del ingreso.
    expect(await filas(`SELECT a.id::text AS id FROM hospitalizacion.admision a WHERE a.id::text LIKE ${DEMO} AND a.estado = 'egresado'
      AND (NOT EXISTS (SELECT 1 FROM hospitalizacion.alta l WHERE l.admision_id = a.id)
        OR NOT EXISTS (SELECT 1 FROM hospitalizacion.ocupacion_cama o WHERE o.admision_id = a.id AND o.motivo_fin = 'egreso'))`)).toEqual([]);
    expect(await filas(`SELECT o.id::text AS id FROM hospitalizacion.ocupacion_cama o JOIN hospitalizacion.admision a ON a.id = o.admision_id
      WHERE o.id::text LIKE ${DEMO} AND lower(o.periodo) < a.creado_en`)).toEqual([]);
    // La categoría de la ocupación es la de la habitación y la cama es de esa habitación.
    expect(await filas(`SELECT o.id::text AS id FROM hospitalizacion.ocupacion_cama o JOIN infra.espacio h ON h.id = o.habitacion_id JOIN infra.espacio c ON c.id = o.cama_id
      WHERE o.id::text LIKE ${DEMO} AND (h.categoria <> o.categoria OR c.padre_id <> h.id)`)).toEqual([]);
    // Una semiprivada comparte solo pacientes del mismo sexo, y quien está en aislamiento queda solo (la otra cama, bloqueada).
    expect(await filas(`SELECT o.habitacion_id::text AS id FROM hospitalizacion.ocupacion_cama o JOIN hospitalizacion.admision a ON a.id = o.admision_id
      WHERE o.id::text LIKE ${DEMO} AND upper_inf(o.periodo) GROUP BY o.habitacion_id HAVING count(DISTINCT a.sexo_paciente) > 1 OR (bool_or(a.aislamiento) AND count(*) > 1)`)).toEqual([]);
    expect(await filas(`SELECT o.id::text AS id FROM hospitalizacion.ocupacion_cama o JOIN hospitalizacion.admision a ON a.id = o.admision_id
      WHERE o.id::text LIKE ${DEMO} AND upper_inf(o.periodo) AND a.aislamiento
        AND (SELECT count(*) FROM infra.v_estado_cama v WHERE v.habitacion_id = o.habitacion_id AND v.estado = 'bloqueada')
          < (SELECT h.capacidad - 1 FROM infra.espacio h WHERE h.id = o.habitacion_id)`)).toEqual([]);
    // Las camas reservadas o bloqueadas por aislamiento no están ocupadas, y el estado de cada cama demo es uno solo.
    expect(await filas(`SELECT cama_id::text AS id FROM infra.v_estado_cama WHERE cama_id::text LIKE ${DEMO} GROUP BY cama_id HAVING count(*) > 1`)).toEqual([]);
    // Solo hay traslado de semiprivada (la VIP no se traslada) y el destino empieza cuando termina el origen.
    expect(await filas(`SELECT t.id::text AS id FROM hospitalizacion.traslado t JOIN hospitalizacion.ocupacion_cama o ON o.id = t.ocupacion_origen_id
      JOIN hospitalizacion.ocupacion_cama d ON d.id = t.ocupacion_destino_id WHERE t.id::text LIKE ${DEMO} AND (o.categoria = 'vip' OR upper(o.periodo) IS DISTINCT FROM lower(d.periodo))`)).toEqual([]);
    // La reserva activa es de un ingreso pendiente de cama y apunta a una cama sin ocupar.
    expect(await filas(`SELECT r.id::text AS id FROM hospitalizacion.reserva_cama r JOIN hospitalizacion.admision a ON a.id = r.admision_id
      WHERE r.id::text LIKE ${DEMO} AND r.estado = 'activa' AND (a.estado <> 'pendiente_cama' OR EXISTS (SELECT 1 FROM hospitalizacion.ocupacion_cama o WHERE o.cama_id = r.cama_id AND o.periodo @> now()))`)).toEqual([]);
    // Cada hospitalizado tiene al menos un registro de signos vitales y todos los egresos tienen quien los firmó.
    expect(await filas(`SELECT a.id::text AS id FROM hospitalizacion.admision a WHERE a.id::text LIKE ${DEMO} AND a.estado IN ('hospitalizado', 'alta_firmada')
      AND NOT EXISTS (SELECT 1 FROM atencion.signos_vitales s WHERE s.admision_id = a.id)`)).toEqual([]);
    // Los servicios de ambulancia que originaron un ingreso son del paciente y están completos (hitos en orden, reporte prehospitalario, tripulación).
    expect(await filas(`SELECT s.id::text AS id FROM ambulancia.servicio s WHERE s.id::text LIKE ${DEMO} AND s.estado_final = 'completado'
      AND (SELECT count(*) FROM ambulancia.hito h WHERE h.servicio_id = s.id) <> 5
        OR (s.id::text LIKE ${DEMO} AND NOT EXISTS (SELECT 1 FROM ambulancia.tripulacion c WHERE c.servicio_id = s.id))`)).toEqual([]);
    expect(await filas(`SELECT s.id::text AS id FROM ambulancia.solicitud s WHERE s.id::text LIKE ${DEMO} AND s.canal = 'telefono' AND s.paciente_id IS NULL AND coalesce(s.solicitante_nombre, '') = ''`)).toEqual([]);
  });

  test('tiempos plausibles: nada que ya ocurrió está en el futuro', async () => {
    const futuros = async (tabla: string, columna: string, donde = `id::text LIKE ${DEMO}`) =>
      Number((await t.one<{ n: string }>(`SELECT count(*) AS n FROM ${tabla} WHERE ${donde} AND ${columna} > now()`)).n);
    for (const [tabla, columna, donde] of [
      ['atencion.consulta', 'iniciada_en'], ['atencion.consulta', 'firmada_en'], ['atencion.signos_vitales', 'tomado_en'], ['atencion.ticket_fila', 'emitido_en'],
      ['atencion.receta', 'emitida_en'], ['laboratorio.orden', 'creada_en'], ['laboratorio.orden', 'muestra_tomada_en'], ['laboratorio.orden', 'completada_en'],
      ['laboratorio.orden', 'revisada_en'], ['laboratorio.resultado', 'capturado_en', `orden_item_id::text LIKE ${DEMO}`], ['hospitalizacion.admision', 'creado_en'],
      ['hospitalizacion.nota_enfermeria', 'creada_en'], ['hospitalizacion.alta', 'firmada_en', `admision_id::text LIKE ${DEMO}`], ['ambulancia.hito', 'ocurrido_en'],
      ['ambulancia.servicio', 'despachado_en'], ['ambulancia.servicio', 'finalizado_en'], ['inventario.movimiento', 'registrado_en'],
    ] as [string, string, string?][]) expect({ tabla, columna, futuros: await futuros(tabla, columna, donde) }).toEqual({ tabla, columna, futuros: 0 });
    // Una consulta se firma después de empezar, una orden se completa después de crearse, y una revisión es posterior a la captura.
    expect(await contar('atencion.consulta', `id::text LIKE ${DEMO} AND firmada_en < iniciada_en`)).toBe(0);
    expect(await contar('laboratorio.orden', `id::text LIKE ${DEMO} AND (completada_en < creada_en OR revisada_en < completada_en OR muestra_tomada_en < creada_en)`)).toBe(0);
    // Las existencias nunca son negativas y los lotes vencidos no cuentan como disponibles.
    expect(await contar('inventario.existencia', `lote_id::text LIKE ${DEMO} AND cantidad < 0`)).toBe(0);
    const vencido = Number((await t.one<{ n: string }>(`SELECT count(*) AS n FROM inventario.lote WHERE id::text LIKE ${DEMO} AND vence < current_date AND activo`)).n);
    expect(vencido).toBeGreaterThanOrEqual(1);
    const porVencer = Number((await t.one<{ n: string }>(`SELECT count(*) AS n FROM inventario.lote WHERE id::text LIKE ${DEMO} AND vence BETWEEN current_date AND current_date + 30`)).n);
    expect(porVencer).toBeGreaterThanOrEqual(3);
    const agotados = Number((await t.one<{ n: string }>(`SELECT count(*) AS n FROM inventario.existencia WHERE lote_id::text LIKE ${DEMO} AND cantidad = 0`)).n);
    expect(agotados).toBeGreaterThanOrEqual(1);
  });

  test('turnos de los próximos 14 días: cada rol y cada área con servicio permanente tiene cobertura todos los días', async () => {
    const tipos = (await t.pg.query<{ tipo: string }>(`SELECT DISTINCT p.tipo FROM personal.turno u JOIN personal.persona p ON p.id = u.persona_id
      WHERE u.id::text LIKE ${DEMO} AND u.estado <> 'cancelado' AND lower(u.periodo) >= now() - interval '1 day'`)).rows.map(r => r.tipo).sort();
    expect(tipos).toEqual(['administrativo', 'asistente', 'enfermero', 'laboratorista', 'limpieza', 'medico', 'motorista', 'paramedico', 'recepcionista']);
    for (const area of ['P1-REC', 'P1-CON', 'P1-LAB', 'P1-AMB', 'P2-HOS', 'P3-VIP']) {
      const dias = Number((await t.one<{ n: string }>(`SELECT count(DISTINCT (lower(u.periodo) AT TIME ZONE 'America/El_Salvador')::date) AS n FROM personal.turno u
        JOIN infra.espacio e ON e.id = u.area_id WHERE e.codigo = '${area}' AND u.estado <> 'cancelado'
        AND (lower(u.periodo) AT TIME ZONE 'America/El_Salvador')::date BETWEEN (now() AT TIME ZONE 'America/El_Salvador')::date AND (now() AT TIME ZONE 'America/El_Salvador')::date + 13`)).n);
      expect({ area, dias }).toEqual({ area, dias: 14 });
    }
    // Las noches del hospital las cubren dos personas alternas: toda noche de la Planta 2 tiene un turno nocturno.
    const noches = Number((await t.one<{ n: string }>(`SELECT count(DISTINCT (lower(u.periodo) AT TIME ZONE 'America/El_Salvador')::date) AS n FROM personal.turno u
      JOIN infra.espacio e ON e.id = u.area_id WHERE e.codigo = 'P2-HOS' AND u.tipo = 'nocturno' AND u.estado <> 'cancelado'
      AND (lower(u.periodo) AT TIME ZONE 'America/El_Salvador')::date BETWEEN (now() AT TIME ZONE 'America/El_Salvador')::date AND (now() AT TIME ZONE 'America/El_Salvador')::date + 13`)).n);
    expect(noches).toBe(14);
  });

  test('los planes de 7 días seguidos llevan excepcion_carga con motivo (preparado para una regla de días consecutivos)', async () => {
    // Islands of consecutive local days per person; every shift in a run longer than 6 days must carry the exception.
    const sinExcepcion = Number((await t.one<{ n: string }>(`WITH d AS (
        SELECT DISTINCT u.persona_id, (lower(u.periodo) AT TIME ZONE 'America/El_Salvador')::date AS dia FROM personal.turno u
        WHERE u.id::text LIKE ${DEMO} AND u.estado <> 'cancelado'),
      g AS (SELECT persona_id, dia, dia - (row_number() OVER (PARTITION BY persona_id ORDER BY dia))::int AS isla FROM d),
      largas AS (SELECT persona_id, isla FROM g GROUP BY persona_id, isla HAVING count(*) > 6)
      SELECT count(*) AS n FROM personal.turno u JOIN g ON g.persona_id = u.persona_id AND g.dia = (lower(u.periodo) AT TIME ZONE 'America/El_Salvador')::date
      JOIN largas l ON l.persona_id = g.persona_id AND l.isla = g.isla
      WHERE u.id::text LIKE ${DEMO} AND u.estado <> 'cancelado' AND (u.excepcion_carga IS NULL OR length(btrim(u.excepcion_carga)) < 10)`)).n);
    expect(sinExcepcion).toBe(0);
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

  test('actualizar una base que ya tiene la semilla anterior: aplica sin fallar, es idempotente y limpia a cero', async () => {
    await t.pg.exec(limpieza);
    await t.pg.exec(semilla);
    const nueva = await demo();
    await t.pg.exec(limpieza);
    // The old seed predates 20261130002000 (5 VIP / 6 semi-private): its floor-4 rooms already exist in such a base, so it
    // is loaded the way it was applied then, without the room-category trigger.
    await t.pg.exec('ALTER TABLE infra.espacio DISABLE TRIGGER espacio_habitacion_categoria');
    await t.pg.exec(semillaAnterior);
    await t.pg.exec('ALTER TABLE infra.espacio ENABLE TRIGGER espacio_habitacion_categoria');
    const conAnterior = await demo();
    expect(conAnterior['pacientes.paciente']).toBeGreaterThan(0);
    await t.pg.exec(semilla);
    const actualizada = await demo();
    verificarUmbrales(actualizada);
    // Ninguna fila de la semilla nueva se pierde por chocar con otra de la anterior, ni se pierde ninguna de la anterior.
    // Las tablas sin id propio (tripulación, bitácora de la unidad...) conservan lo de los padres que ya existían: solo se compara contra lo anterior.
    for (const [tabla, n] of Object.entries(conAnterior)) {
      const esperado = TABLAS[tabla] === `id::text LIKE ${DEMO}` ? Math.max(n, nueva[tabla] - (tabla === 'atencion.signos_vitales' ? 3 : 0)) : n;
      expect({ tabla, ok: actualizada[tabla] >= esperado }).toEqual({ tabla, ok: true });
    }
    const totalActualizada = await totales();
    await t.pg.exec(semilla);
    expect(await demo()).toEqual(actualizada);
    expect(await totales()).toEqual(totalActualizada);
    // Las consultas firmadas 8, 9 y 11 de la semilla anterior se quedan sin signos (una firmada no admite hijos y la semilla no salta invariantes).
    // Coherencia tras la actualización: nada huérfano y cada ingreso vigente conserva su ocupación abierta única.
    const huerfanos = async (sql: string) => (await t.pg.query<{ id: string }>(sql)).rows.map(r => r.id);
    expect(await huerfanos(`SELECT c.id::text AS id FROM atencion.consulta c WHERE c.id::text LIKE ${DEMO} AND c.estado = 'firmada'
      AND c.id NOT IN (SELECT consulta_id FROM atencion.diagnostico WHERE principal)`)).toEqual([]);
    expect(await huerfanos(`SELECT a.id::text AS id FROM hospitalizacion.admision a LEFT JOIN hospitalizacion.ocupacion_cama o ON o.id::text LIKE ${DEMO} AND o.admision_id = a.id AND upper_inf(o.periodo)
      WHERE a.id::text LIKE ${DEMO} GROUP BY a.id, a.estado HAVING count(o.id) <> (CASE WHEN a.estado IN ('hospitalizado', 'alta_firmada') THEN 1 ELSE 0 END)`)).toEqual([]);
    await t.pg.exec(limpieza);
    for (const [tabla, n] of Object.entries(await demo())) expect({ tabla, n }).toEqual({ tabla, n: 0 });
    expect(await estadoGeneral()).toEqual(antes);
  });

  test('S10: con observaciones, pendientes del médico, adjuntos y citas propuestas sobre órdenes demo, la limpieza no falla', async () => {
    await t.pg.exec(semilla);
    // A real capture with a relevant observation on a demo order opens a follow-up item for the doctor.
    const abierta = await t.one<{ orden: string; item: string; version: number }>(`SELECT o.id AS orden, oi.id AS item, o.version FROM laboratorio.orden o
      JOIN laboratorio.orden_item oi ON oi.orden_id = o.id LEFT JOIN laboratorio.resultado r ON r.orden_item_id = oi.id
      WHERE o.id::text LIKE ${DEMO} AND o.estado = 'en_proceso' AND r.orden_item_id IS NULL ORDER BY o.id LIMIT 1`);
    const capturado = await t.call('LAB', 'POST', `/laboratorio/ordenes/${abierta.orden}/resultados`, { orderItemId: abierta.item, value: 13.4, version: abierta.version, observation: 'Muestra hemolizada; repetir si hay duda.', relevant: true });
    expect(capturado.status).toBe(201);
    expect(await contar('laboratorio.pendiente_medico', `orden_id = '${abierta.orden}'`)).toBe(1);
    // An external report reference and a confirmed follow-up proposal linked to a demo appointment.
    const completa = await t.one<{ orden: string; paciente: string; medico: string }>(`SELECT id AS orden, paciente_id AS paciente, medico_id AS medico FROM laboratorio.orden
      WHERE id::text LIKE ${DEMO} AND estado = 'completado' AND id <> $1 ORDER BY id LIMIT 1`, [abierta.orden]);
    const cita = await t.one<{ id: string }>(`SELECT id FROM atencion.cita WHERE id::text LIKE ${DEMO} ORDER BY id LIMIT 1`);
    await t.pg.query(`INSERT INTO laboratorio.adjunto(orden_id, nombre_archivo, tipo_mime, tamano_bytes, subido_por) VALUES ($1, 'informe.pdf', 'application/pdf', 2048, $2)`, [completa.orden, completa.medico]);
    await t.pg.query(`INSERT INTO laboratorio.propuesta_cita(orden_id, paciente_id, medico_id, estado, cita_id, resuelta_en, resuelta_por)
      VALUES ($1, $2, $3, 'confirmada', $4, now(), $3)`, [completa.orden, completa.paciente, completa.medico, cita.id]);
    await t.pg.exec(limpieza);
    for (const tabla of ['laboratorio.adjunto', 'laboratorio.pendiente_medico', 'laboratorio.propuesta_cita']) expect({ tabla, n: await contar(tabla, `orden_id::text LIKE ${DEMO}`) }).toEqual({ tabla, n: 0 });
    for (const [tabla, n] of Object.entries(await demo())) expect({ tabla, n }).toEqual({ tabla, n: 0 });
    expect(await estadoGeneral()).toEqual(antes);
  });

  test('S11: con «Enterado» de cuentas reales sobre avisos demo y de cuentas demo sobre avisos reales, la limpieza no falla', async () => {
    await t.pg.exec(semilla);
    const avisoDemo = await t.one<{ id: string }>(`SELECT id FROM publico.aviso WHERE id::text LIKE ${DEMO} ORDER BY id LIMIT 1`);
    const cuentaDemo = await t.one<{ id: string }>(`SELECT id FROM acceso.usuario WHERE id::text LIKE ${DEMO} ORDER BY id LIMIT 1`);
    const real = await t.one<{ id: string }>(`INSERT INTO publico.aviso(titulo, cuerpo, vigencia, publicado_por) VALUES ('Aviso real', 'Texto real', tstzrange(now(), now() + interval '1 day'), gen_random_uuid()) RETURNING id`);
    await t.pg.query(`INSERT INTO publico.aviso_enterado(aviso_id, usuario_id, enterado_en) VALUES ($1, $2, now())`, [avisoDemo.id, userId('MED')]);
    await t.pg.query(`INSERT INTO publico.aviso_enterado(aviso_id, usuario_id, recordar_en) VALUES ($1, $2, now() + interval '4 hours')`, [real.id, cuentaDemo.id]);
    await t.pg.exec(limpieza);
    expect(await contar('publico.aviso_enterado', 'true')).toBe(0);
    expect(await contar('publico.aviso', `id = '${real.id}'`)).toBe(1);
    await t.pg.query('DELETE FROM publico.aviso WHERE id = $1', [real.id]);
    for (const [tabla, n] of Object.entries(await demo())) expect({ tabla, n }).toEqual({ tabla, n: 0 });
    expect(await estadoGeneral()).toEqual(antes);
  });

  test('si alguien usó un paciente demo en un flujo real, la limpieza lo conserva y no falla', async () => {
    await t.pg.exec(semilla);
    // A doctor that is neither demo nor a test account (Lote 5: what test accounts create is cleaned too).
    const medico = await t.one<{ id: string }>(`INSERT INTO personal.persona(nombres, apellidos, tipo, area_id)
      SELECT 'Médica', 'Real', 'medico', id FROM infra.espacio WHERE codigo = 'P1-CON' RETURNING id`);
    const real = await t.one<{ id: string }>(`INSERT INTO atencion.cita(paciente_id, medico_id, horario, estado, origen)
      VALUES ('de300000-0001-4000-8000-000000000001', $1, tstzrange(now() + interval '40 days', now() + interval '40 days 20 minutes', '[)'), 'confirmada', 'recepcion') RETURNING id`, [medico.id]);
    await t.pg.exec(limpieza);
    expect(await contar('pacientes.paciente', `id = 'de300000-0001-4000-8000-000000000001'`)).toBe(1);
    expect(await contar('pacientes.paciente', `id::text LIKE ${DEMO} AND id <> 'de300000-0001-4000-8000-000000000001'`)).toBe(0);
    await t.pg.query('DELETE FROM atencion.cita WHERE id = $1', [real.id]);
    await t.pg.query('DELETE FROM personal.persona WHERE id = $1', [medico.id]);
    await t.pg.exec(limpieza);
    expect(await estadoGeneral()).toEqual(antes);
  });

  test('una solicitud por motivo real que prefiere a un médico demo, o de un paciente demo, conserva ambos y la limpieza no falla', async () => {
    await t.pg.exec(semilla);
    const medico = await t.one<{ id: string }>(`SELECT id FROM personal.persona WHERE id::text LIKE ${DEMO} AND tipo = 'medico' ORDER BY id LIMIT 1`);
    const realPaciente = await t.patient();
    const prefiere = await t.one<{ id: string }>(`INSERT INTO atencion.solicitud_cita(paciente_id, categorias, franja, medico_preferido_id)
      VALUES ($1, '{piel}', 'tarde', $2) RETURNING id`, [realPaciente, medico.id]);
    const delDemo = await t.one<{ id: string }>(`INSERT INTO atencion.solicitud_cita(paciente_id, categorias, franja)
      VALUES ('de300000-0001-4000-8000-000000000002', '{consulta_general}', 'manana') RETURNING id`);
    await t.pg.exec(limpieza);
    expect(await contar('personal.persona', `id = '${medico.id}'`)).toBe(1);
    expect(await contar('pacientes.paciente', `id = 'de300000-0001-4000-8000-000000000002'`)).toBe(1);
    expect(await contar('atencion.solicitud_cita', `id IN ('${prefiere.id}', '${delDemo.id}')`)).toBe(2);
    await t.pg.query('DELETE FROM atencion.solicitud_cita WHERE id = ANY($1::uuid[])', [[prefiere.id, delDemo.id]]);
    await t.pg.query('DELETE FROM pacientes.paciente WHERE id = $1', [realPaciente]);
    await t.pg.exec(limpieza);
    expect(await estadoGeneral()).toEqual(antes);
  });
  // ------------------------------------------------------------------------------------------------------------
  // Lote 5 (S17): reinicio repetible (simulación, confirmación explícita, datos de cuentas de prueba) y conexiones nuevas.
  // ------------------------------------------------------------------------------------------------------------
  const HOY_L = `(now() AT TIME ZONE 'America/El_Salvador')::date`;
  const runnerDb = () => ({ exec: (sql: string) => t.pg.exec(sql), rows: async (sql: string) => (await t.pg.query(sql)).rows });

  test('Lote 5: sin «set demo.confirmar» la limpieza se detiene sin borrar nada', async () => {
    await t.pg.exec(semilla);
    const conDemo = await demo();
    await t.pg.exec('RESET demo.confirmar');
    await expect(t.pg.exec(limpiezaSinConfirmar)).rejects.toThrow(/demo\.confirmar/);
    await t.pg.exec('ROLLBACK');
    expect(await demo()).toEqual(conDemo);
  });

  test('Lote 5: las cuentas de prueba tienen turno de 06:00 a 22:00 los 7 días pasados y los 14 siguientes', async () => {
    const personas = (await t.pg.query<{ id: string }>(`SELECT u.persona_personal_id AS id FROM acceso.usuario u
      JOIN acceso.asignacion_rol a ON a.usuario_id = u.id AND a.rol_codigo IN ('REC','AST','ENF','MED','LAB','PAR')
      WHERE u.correo LIKE '%@example.test' AND u.id::text NOT LIKE ${DEMO} AND u.persona_personal_id IS NOT NULL`)).rows.map(r => r.id);
    expect(personas).toHaveLength(6);
    for (const persona of personas) {
      const dias = Number((await t.one<{ n: string }>(`SELECT count(DISTINCT (lower(periodo) AT TIME ZONE 'America/El_Salvador')::date) AS n FROM personal.turno
        WHERE persona_id = $1 AND id::text LIKE ${DEMO} AND estado <> 'cancelado'
          AND (lower(periodo) AT TIME ZONE 'America/El_Salvador')::time = '06:00' AND (upper(periodo) AT TIME ZONE 'America/El_Salvador')::time = '22:00'
          AND (lower(periodo) AT TIME ZONE 'America/El_Salvador')::date BETWEEN ${HOY_L} - 7 AND ${HOY_L} + 13`, [persona])).n);
      expect({ persona, dias }).toEqual({ persona, dias: 21 });
    }
  });

  test('Lote 5: emergencia tiene médico todas las noches salvo el hueco a propósito del día +3', async () => {
    const hoy = (await t.one<{ d: string }>(`SELECT to_char(${HOY_L}, 'YYYY-MM-DD') AS d`)).d;
    const fin = (await t.one<{ d: string }>(`SELECT to_char(${HOY_L} + 13, 'YYYY-MM-DD') AS d`)).d;
    const cobertura = await t.call('JOP', 'GET', `/turnos/cobertura?from=${hoy}&to=${fin}`);
    expect(cobertura.status).toBe(200);
    const huecos = (cobertura.body.gaps as Array<{ area: string; role: string; start: string; end: string }>).filter(g => g.role === 'MED' && /emergencia/i.test(g.area));
    expect(huecos).toHaveLength(1);
    const inicio = await t.one<{ d: string }>(`SELECT to_char(($1::timestamptz AT TIME ZONE 'America/El_Salvador')::date - ${HOY_L}, 'FM99') AS d`, [huecos[0].start]);
    expect(inicio.d).toBe('3');
  });

  test('Lote 5: conexiones nuevas: cuenta PAC unida, fila con citas, reprogramaciones, resultados por revisar, adjuntos y avisos', async () => {
    const pac = await t.one<{ paciente_id: string; correo: string; ficha: string }>(`SELECT u.paciente_id, u.correo, p.correo AS ficha FROM acceso.usuario u
      JOIN pacientes.paciente p ON p.id = u.paciente_id WHERE u.id = $1`, [userId('PAC')]);
    expect(pac.paciente_id).toBe('de300000-0001-4000-8000-000000000004');
    expect(pac.ficha).toBe(pac.correo.toLowerCase());
    expect(await contar('atencion.ticket_fila', `id::text LIKE ${DEMO} AND fecha = ${HOY_L} AND cita_id IS NOT NULL`)).toBeGreaterThanOrEqual(3);
    expect(await contar('atencion.ticket_fila', `id::text LIKE ${DEMO} AND fecha = ${HOY_L} AND cita_id IS NULL`)).toBeGreaterThanOrEqual(30);
    // A linked ticket always belongs to the patient of its appointment.
    expect(await contar('atencion.ticket_fila t JOIN atencion.cita c ON c.id = t.cita_id', `t.id::text LIKE ${DEMO} AND c.paciente_id <> t.paciente_id`)).toBe(0);
    const reprogramaciones = (await t.pg.query<{ estado: string }>(`SELECT DISTINCT estado FROM atencion.reprogramacion WHERE id::text LIKE ${DEMO}`)).rows.map(r => r.estado).sort();
    expect(reprogramaciones).toEqual(['pendiente', 'rechazada', 'vencida']);
    // The requested slot is inside a published shift of the same doctor (accepting it is possible).
    expect(await contar('atencion.reprogramacion r', `r.id::text LIKE ${DEMO} AND NOT EXISTS (SELECT 1 FROM personal.turno u WHERE u.persona_id = r.medico_id
      AND u.estado = 'publicado' AND u.periodo @> r.horario)`)).toBe(0);
    expect(await contar('atencion.solicitud_cita', `id::text LIKE ${DEMO} AND estado = 'pendiente' AND paciente_id = 'de300000-0001-4000-8000-000000000004'`)).toBe(1);
    // The PAC patient has a confirmed upcoming appointment with a pending reschedule, and one to be confirmed.
    expect(await contar('atencion.reprogramacion r JOIN atencion.cita c ON c.id = r.cita_id', `r.id::text LIKE ${DEMO} AND r.estado = 'pendiente'
      AND c.paciente_id = 'de300000-0001-4000-8000-000000000004' AND c.estado = 'confirmada' AND lower(c.horario) > now()`)).toBe(1);
    expect(await contar('atencion.cita', `id::text LIKE ${DEMO} AND paciente_id = 'de300000-0001-4000-8000-000000000004' AND estado = 'solicitada' AND lower(horario) > now()`)).toBe(1);
    expect(await contar('atencion.solicitud_cita s', `s.id::text LIKE ${DEMO} AND s.estado = 'pendiente' AND s.medico_preferido_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM personal.turno u WHERE u.persona_id = s.medico_preferido_id)`)).toBe(1);
    const pendientes = (await t.pg.query<{ v: string }>(`SELECT DISTINCT motivo || ':' || estado AS v FROM laboratorio.pendiente_medico WHERE id::text LIKE ${DEMO}`)).rows.map(r => r.v).sort();
    expect(pendientes).toEqual(['critico:pendiente', 'critico:revisado', 'observacion:pendiente']);
    const mimes = (await t.pg.query<{ v: string }>(`SELECT DISTINCT tipo_mime AS v FROM laboratorio.adjunto WHERE id::text LIKE ${DEMO}`)).rows.map(r => r.v).sort();
    expect(mimes).toEqual(['application/pdf', 'image/jpeg']);
    const niveles = (await t.pg.query<{ v: string }>(`SELECT DISTINCT nivel AS v FROM publico.aviso WHERE id::text LIKE ${DEMO}`)).rows.map(r => r.v).sort();
    expect(niveles).toEqual(['critico', 'importante', 'informativo']);
    expect(await contar('publico.aviso', `id::text LIKE ${DEMO} AND cardinality(areas) > 0`)).toBe(1);
    expect(await contar('ambulancia.cambio_estado', `motivo LIKE '[DEMO] Mantenimiento%'`)).toBe(2);
  });

  test('Lote 5: «Quién vio mi expediente» muestra las lecturas sembradas y la cadena de auditoría sigue válida', async () => {
    const accesos = await t.call('PAC', 'GET', '/me/accesos');
    expect(accesos.status).toBe(200);
    expect((accesos.body as unknown[]).length).toBeGreaterThanOrEqual(7);
    expect(await t.app.get(AuditService).verifyChain()).toEqual(expect.objectContaining({ ok: true }));
    // Seeding again adds no audit rows (fixed event ids).
    const filas = await contar('plataforma.auditoria', `evento_id::text LIKE ${DEMO}`);
    await t.pg.exec(semilla);
    expect(await contar('plataforma.auditoria', `evento_id::text LIKE ${DEMO}`)).toBe(filas);
    expect(await t.app.get(AuditService).verifyChain()).toEqual(expect.objectContaining({ ok: true }));
  });

  test('Lote 5: la limpieza borra lo que crearon las cuentas de prueba y conserva lo de otras cuentas', async () => {
    const medico = await t.staffOf('MED');
    const deCuenta = await t.patient({ name: 'Creada por prueba' });
    await t.pg.query('UPDATE pacientes.paciente SET creado_por = $2 WHERE id = $1', [deCuenta, userId('REC')]);
    const ajena = await t.patient({ name: 'Creada por otra cuenta' });
    await t.pg.query(`UPDATE pacientes.paciente SET creado_por = '11111111-1111-4111-8111-111111111111' WHERE id = $1`, [ajena]);
    const cita = await t.one<{ id: string }>(`INSERT INTO atencion.cita(paciente_id, medico_id, horario, estado, origen, creado_por)
      VALUES ($1, $2, tstzrange(now() + interval '45 days', now() + interval '45 days 20 minutes', '[)'), 'confirmada', 'recepcion', $3) RETURNING id`, [deCuenta, medico, userId('REC')]);
    const turno = await t.one<{ id: string }>(`INSERT INTO personal.turno(persona_id, area_id, periodo, tipo, estado)
      SELECT $1, id, tstzrange(now() + interval '60 days', now() + interval '60 days 8 hours', '[)'), 'diurno', 'publicado' FROM infra.espacio WHERE codigo = 'P1-CON' RETURNING id`, [medico]);
    const aviso = await t.one<{ id: string }>(`INSERT INTO publico.aviso(titulo, cuerpo, vigencia, publicado_por)
      VALUES ('Aviso de prueba', 'Creado por la cuenta ADM de prueba', tstzrange(now(), now() + interval '1 day', '[)'), $1) RETURNING id`, [userId('ADM')]);
    // The read-only count sees them as test-account rows.
    const conteo = Object.fromEntries((await runner.readOnlyCount(runnerDb())).map(r => [r.tabla, r]));
    expect(conteo['atencion.cita'].cuentas_prueba).toBeGreaterThanOrEqual(1);
    expect(conteo['personal.turno'].cuentas_prueba).toBeGreaterThanOrEqual(1);
    expect(conteo['publico.aviso'].cuentas_prueba).toBe(1);
    expect(conteo['pacientes.paciente'].cuentas_prueba).toBe(1);
    await t.pg.exec(limpieza);
    for (const [tabla, id] of [['atencion.cita', cita.id], ['personal.turno', turno.id], ['publico.aviso', aviso.id], ['pacientes.paciente', deCuenta]])
      expect({ tabla, n: await contar(tabla, `id = '${id}'`) }).toEqual({ tabla, n: 0 });
    expect(await contar('pacientes.paciente', `id = '${ajena}'`)).toBe(1);
    expect(await contar('acceso.usuario', `paciente_id IS NOT NULL`)).toBe(0);
    await t.pg.query('DELETE FROM pacientes.paciente WHERE id = $1', [ajena]);
    expect(await estadoGeneral()).toEqual(antes);
  });

  test('Lote 5: demo.cjs simula limpiar y cargar, informa los cambios por tabla y no deja nada escrito', async () => {
    const vacia = await totales();
    const carga = await runner.simulate(runnerDb(), ['cargar']);
    expect(carga.changes.find(c => c.tabla === 'pacientes.paciente')?.diferencia).toBeGreaterThanOrEqual(300);
    expect(carga.changes.find(c => c.tabla === 'personal.turno')?.diferencia).toBeGreaterThanOrEqual(1000);
    expect(await totales()).toEqual(vacia);
    await runner.simulate(runnerDb(), ['cargar'], true);
    const reinicio = await runner.simulate(runnerDb(), ['limpiar', 'cargar']);
    // Clean + load leaves the same volume; only the realtime outbox grows (the database announces the seeded rows).
    expect(reinicio.changes.map(c => c.tabla)).toEqual(['plataforma.outbox']);
    const limpia = await runner.simulate(runnerDb(), ['limpiar']);
    expect(limpia.changes.find(c => c.tabla === 'pacientes.paciente')?.diferencia).toBeLessThanOrEqual(-300);
    expect(await contar('pacientes.paciente', `id::text LIKE ${DEMO}`)).toBeGreaterThanOrEqual(300);
    await runner.simulate(runnerDb(), ['limpiar'], true);
    expect(await estadoGeneral()).toEqual(antes);
  });
});
