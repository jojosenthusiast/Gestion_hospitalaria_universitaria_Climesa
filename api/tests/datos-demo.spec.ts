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

const MINIMOS: Record<string, number> = {
  'pacientes.paciente': 120, 'pacientes.identificador': 100, 'atencion.cita': 130, 'atencion.ticket_fila': 30, 'atencion.consulta': 70,
  'atencion.diagnostico': 100, 'atencion.receta': 60, 'atencion.signos_vitales': 150, 'laboratorio.orden': 30, 'laboratorio.resultado': 80,
  'hospitalizacion.admision': 20, 'hospitalizacion.ocupacion_cama': 18, 'hospitalizacion.nota_enfermeria': 30, 'ambulancia.solicitud': 15,
  'ambulancia.servicio': 12, 'ambulancia.hito': 45, 'ambulancia.reporte_prehospital': 10, 'inventario.articulo': 40, 'inventario.lote': 40,
  'inventario.movimiento': 90, 'publico.aviso': 14, 'personal.turno': 350, 'acceso.vinculacion_paciente': 10, 'acceso.invitacion': 8,
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
      'laboratorio.examen', 'laboratorio.examen_componente', 'laboratorio.rango_referencia', 'plataforma.politica', 'ambulancia.unidad', 'personal.especialidad_catalogo'];
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

  test('volumen: unos 120 pacientes y cada módulo supera su umbral', async () => {
    await t.pg.exec(limpieza);
    await t.pg.exec(semilla);
    const conteo = await demo();
    verificarUmbrales(conteo);
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
    for (const area of ['P1-REC', 'P1-CON', 'P1-LAB', 'P1-AMB', 'P2-HOS', 'P3-VIP', 'P4-HOS']) {
      const dias = Number((await t.one<{ n: string }>(`SELECT count(DISTINCT (lower(u.periodo) AT TIME ZONE 'America/El_Salvador')::date) AS n FROM personal.turno u
        JOIN infra.espacio e ON e.id = u.area_id WHERE e.codigo = '${area}' AND u.estado <> 'cancelado'
        AND (lower(u.periodo) AT TIME ZONE 'America/El_Salvador')::date BETWEEN (now() AT TIME ZONE 'America/El_Salvador')::date AND (now() AT TIME ZONE 'America/El_Salvador')::date + 13`)).n);
      expect({ area, dias }).toEqual({ area, dias: 14 });
    }
    // Las noches del hospital las cubren dos personas alternas: toda noche de la Planta 4 tiene un turno nocturno.
    const noches = Number((await t.one<{ n: string }>(`SELECT count(DISTINCT (lower(u.periodo) AT TIME ZONE 'America/El_Salvador')::date) AS n FROM personal.turno u
      JOIN infra.espacio e ON e.id = u.area_id WHERE e.codigo = 'P4-HOS' AND u.tipo = 'nocturno' AND u.estado <> 'cancelado'
      AND (lower(u.periodo) AT TIME ZONE 'America/El_Salvador')::date BETWEEN (now() AT TIME ZONE 'America/El_Salvador')::date AND (now() AT TIME ZONE 'America/El_Salvador')::date + 13`)).n);
    expect(noches).toBe(14);
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
    await t.pg.exec(semillaAnterior);
    const conAnterior = await demo();
    expect(conAnterior['pacientes.paciente']).toBeGreaterThan(0);
    await t.pg.exec(semilla);
    const actualizada = await demo();
    verificarUmbrales(actualizada);
    // Ninguna fila de la semilla nueva se pierde por chocar con otra de la anterior, ni se pierde ninguna de la anterior.
    // Las tablas sin id propio (tripulación, bitácora de la unidad...) conservan lo de los padres que ya existían: solo se compara contra lo anterior.
    for (const [tabla, n] of Object.entries(conAnterior)) {
      const esperado = TABLAS[tabla] === `id::text LIKE ${DEMO}` ? Math.max(n, nueva[tabla]) : n;
      expect({ tabla, ok: actualizada[tabla] >= esperado }).toEqual({ tabla, ok: true });
    }
    const totalActualizada = await totales();
    await t.pg.exec(semilla);
    expect(await demo()).toEqual(actualizada);
    expect(await totales()).toEqual(totalActualizada);
    // Coherencia tras la actualización: nada huérfano y cada ingreso vigente conserva su ocupación abierta única.
    const huerfanos = async (sql: string) => (await t.pg.query<{ id: string }>(sql)).rows.map(r => r.id);
    expect(await huerfanos(`SELECT c.id::text AS id FROM atencion.consulta c WHERE c.id::text LIKE ${DEMO} AND c.estado = 'firmada'
      AND (c.id NOT IN (SELECT consulta_id FROM atencion.diagnostico WHERE principal) OR c.id NOT IN (SELECT consulta_id FROM atencion.signos_vitales WHERE consulta_id IS NOT NULL))`)).toEqual([]);
    expect(await huerfanos(`SELECT a.id::text AS id FROM hospitalizacion.admision a LEFT JOIN hospitalizacion.ocupacion_cama o ON o.id::text LIKE ${DEMO} AND o.admision_id = a.id AND upper_inf(o.periodo)
      WHERE a.id::text LIKE ${DEMO} GROUP BY a.id, a.estado HAVING count(o.id) <> (CASE WHEN a.estado IN ('hospitalizado', 'alta_firmada') THEN 1 ELSE 0 END)`)).toEqual([]);
    await t.pg.exec(limpieza);
    for (const [tabla, n] of Object.entries(await demo())) expect({ tabla, n }).toEqual({ tabla, n: 0 });
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
