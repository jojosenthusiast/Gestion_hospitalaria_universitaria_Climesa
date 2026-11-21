/**
 * Design data for operations and administration: the metrics board and its series, inventory, notices, the shift
 * catalogs and coverage, staff specialties and the audit log. Fictitious and in memory; `request` and `write` return
 * `undefined` for paths they do not serve.
 */
import { ApiError, type Bed, type Shift, type Space, type Staff } from '../../lib/api';
import { addDays, ago, fixtureUuid, fold, HOUR, localDay, localInstant, STAFF, type FixturePatient } from './people';

const uuid = (n: number) => fixtureUuid('a002', n);

type Article = { id: string; code: string; name: string; type: 'insumo' | 'reactivo' | 'equipo_menor'; unit: string; minimum: number; active: boolean; version: number };
type Lot = { id: string; articleId: string; number: string; expiresAt: string | null; active: boolean; version: number; stock: Record<string, number> };
type Movement = { id: string; articleId: string; type: string; lotNumber: string; quantity: number; reason: string | null; originWarehouseCode: string | null; destinationWarehouseCode: string | null; authorName: string; registeredAt: string };
type Notice = { id: string; titulo: string; cuerpo: string; desde: string | null; hasta: string | null; prioridad: string; publico: boolean; roles: string[]; nivel: 'informativo' | 'importante' | 'critico'; areas: string[]; estado: 'vigente' | 'programado' | 'vencido' | 'retirado'; publicadoEn: string | null; version: number; retiradoEn: string | null; motivoRetiro: string | null; enteradoEn: string | null };

const ARTICLES: [string, string, Article['type'], string, number][] = [
  ['INS-001', 'Guantes de nitrilo talla M', 'insumo', 'caja', 20], ['INS-002', 'Jeringa de 5 mL con aguja', 'insumo', 'unidad', 200], ['INS-003', 'Gasa estéril 10 x 10 cm', 'insumo', 'paquete', 50],
  ['INS-004', 'Catéter intravenoso 20G', 'insumo', 'unidad', 100], ['INS-005', 'Solución salina 0.9 % 1000 mL', 'insumo', 'bolsa', 80], ['INS-006', 'Mascarilla quirúrgica', 'insumo', 'caja', 15],
  ['INS-007', 'Equipo de venoclisis', 'insumo', 'unidad', 60], ['INS-008', 'Alcohol isopropílico 70 %', 'insumo', 'frasco', 12], ['INS-009', 'Esparadrapo hipoalergénico', 'insumo', 'rollo', 30],
  ['REA-001', 'Reactivo de glucosa enzimática', 'reactivo', 'kit', 4], ['REA-002', 'Reactivo de creatinina', 'reactivo', 'kit', 3], ['REA-003', 'Tubos con EDTA 4 mL', 'reactivo', 'caja', 10],
  ['REA-004', 'Tiras reactivas de orina', 'reactivo', 'frasco', 6], ['REA-005', 'Control de calidad hematología', 'reactivo', 'kit', 2], ['REA-006', 'Prueba rápida de embarazo', 'reactivo', 'caja', 5],
  ['EQM-001', 'Tensiómetro digital de brazo', 'equipo_menor', 'unidad', 4], ['EQM-002', 'Oxímetro de pulso', 'equipo_menor', 'unidad', 6], ['EQM-003', 'Termómetro infrarrojo', 'equipo_menor', 'unidad', 5],
  ['EQM-004', 'Glucómetro portátil', 'equipo_menor', 'unidad', 3], ['EQM-005', 'Estetoscopio adulto', 'equipo_menor', 'unidad', 4],
];
const WAREHOUSES = [{ id: uuid(1), code: 'BOD-CEN', name: 'Bodega central' }, { id: uuid(2), code: 'BOD-LAB', name: 'Bodega de laboratorio' }, { id: uuid(3), code: 'BOD-P2', name: 'Estación de enfermería, planta 2' }];
const ROLES = [['medico', 'Médico'], ['enfermero', 'Enfermería'], ['asistente', 'Asistencia'], ['recepcionista', 'Recepción'], ['laboratorista', 'Laboratorio'], ['paramedico', 'Paramédico'], ['motorista', 'Motorista']];
const AUDIT_ACTIONS = ['pacientes.buscar', 'pacientes.ver_ficha', 'expediente.ver', 'fila.emitir', 'citas.agendar', 'laboratorio.validar', 'admision.crear', 'usuarios.invitar', 'acceso.denegado', 'auditoria.exportar'];
const AUDIT_ROLES = ['REC', 'MED', 'ENF', 'LAB', 'JOP', 'ADM', 'PAC', 'DPD'];

export class OperationsFixtures {
  private seq = 800000;
  private articles: Article[];
  private lots: Lot[] = [];
  private movements: Movement[] = [];
  private notices: Notice[];
  private audit: { seq: string; at: string; role: string; actor: string; actorId: string; permission: string; action: string; entity: string; entityId: string; patientId: string | null; patientRecord: string | null; result: string; reason: string | null }[];

  constructor(private readonly role: string, private readonly patients: FixturePatient[], private readonly beds: Bed[], private readonly spaces: Space[], private readonly people: Staff[], private readonly shifts: Shift[]) {
    const today = localDay();
    this.articles = ARTICLES.map(([code, name, type, unit, minimum], i) => ({ id: uuid(100 + i), code, name, type, unit, minimum, active: i !== 19, version: 1 }));
    this.articles.forEach((a, i) => {
      for (let k = 0; k < 1 + (i % 3); k++) {
        const expiry = a.type === 'equipo_menor' ? null : addDays(today, [-12, 18, 160, 400][(i + k) % 4]);
        const base = a.minimum * (i % 5 === 2 ? 0 : i % 4 === 1 ? 0.4 : 1.6);
        this.lots.push({ id: uuid(300 + i * 5 + k), articleId: a.id, number: `L${2026}${String(i * 5 + k).padStart(3, '0')}`, expiresAt: expiry, active: true, version: 1, stock: { [WAREHOUSES[0].id]: Math.round(base / (k + 1)), [WAREHOUSES[a.type === 'reactivo' ? 1 : 2].id]: Math.round(base / 4) } });
      }
      for (let k = 0; k < 3; k++) this.movements.push({ id: uuid(600 + i * 3 + k), articleId: a.id, type: ['entrada', 'consumo', 'traslado'][k], lotNumber: this.lots.find(l => l.articleId === a.id)!.number, quantity: [a.minimum * 2, 3 + k, 5][k], reason: k === 1 ? 'Consumo en planta 2' : null, originWarehouseCode: k === 0 ? null : 'BOD-CEN', destinationWarehouseCode: k === 1 ? null : k === 0 ? 'BOD-CEN' : 'BOD-P2', authorName: STAFF.nurses[k % STAFF.nurses.length], registeredAt: ago((k + 1) * 60 * 24 + i) });
    });
    const now = Date.now();
    const notice = (i: number, titulo: string, cuerpo: string, nivel: Notice['nivel'], estado: Notice['estado'], roles: string[], extra: Partial<Notice> = {}): Notice => ({ id: uuid(900 + i), titulo, cuerpo, desde: new Date(now - (i + 1) * 20 * HOUR).toISOString(), hasta: new Date(now + (72 - i * 10) * HOUR).toISOString(), prioridad: nivel === 'critico' ? 'critico' : nivel === 'importante' ? 'urgente' : 'atencion', publico: roles.length === 0, roles, nivel, areas: [], estado, publicadoEn: new Date(now - (i + 1) * 20 * HOUR).toISOString(), version: 1, retiradoEn: null, motivoRetiro: null, enteradoEn: i % 2 ? ago(90) : null, ...extra });
    this.notices = [
      notice(0, 'Corte programado de agua en planta 2', 'El sábado de 6:00 a 9:00 no habrá agua en planta 2. Enfermería prepara reserva en cada estación.', 'importante', 'vigente', []),
      notice(1, 'Código rojo: simulacro de evacuación', 'Hoy a las 15:00 se realiza el simulacro. Sigue las rutas señaladas; nadie usa los ascensores.', 'critico', 'vigente', ['JOP', 'REC', 'ENF', 'MED']),
      notice(2, 'Nuevo horario de toma de muestras', 'Laboratorio toma muestras de 6:30 a 11:30 de lunes a sábado.', 'informativo', 'vigente', ['LAB', 'REC']),
      notice(3, 'Actualización del catálogo de exámenes', 'Se agregó hemoglobina glicosilada al catálogo y cambió el rango de referencia de glucosa.', 'informativo', 'programado', ['MED', 'LAB'], { desde: new Date(now + 24 * HOUR).toISOString(), publicadoEn: null }),
      notice(4, 'Mantenimiento de la ambulancia', 'La unidad P-123-456 entra a mantenimiento preventivo el lunes por la mañana.', 'importante', 'vencido', ['JOP', 'PAR', 'REC'], { hasta: ago(60 * 30) }),
      notice(5, 'Aviso retirado de prueba', 'Este aviso se retiró porque se publicó con la fecha equivocada.', 'informativo', 'retirado', [], { retiradoEn: ago(60 * 10), motivoRetiro: 'Se publicó con la fecha equivocada.' }),
    ];
    this.audit = Array.from({ length: 140 }, (_, i) => {
      const role = AUDIT_ROLES[i % AUDIT_ROLES.length], action = AUDIT_ACTIONS[(i * 3) % AUDIT_ACTIONS.length], patient = action.startsWith('pacientes') || action === 'expediente.ver' ? this.patients[(i * 11) % this.patients.length] : null;
      return { seq: String(5000 - i), at: ago(i * 13 + 2), role, actor: role === 'PAC' ? 'Cuenta ficticia de paciente' : [...STAFF.doctors, ...STAFF.nurses, ...STAFF.lab][i % 11], actorId: fixtureUuid('8000', 1 + (i % 6)), permission: action, action, entity: patient ? 'paciente' : action.split('.')[0], entityId: patient?.id ?? uuid(1000 + i), patientId: patient?.id ?? null, patientRecord: patient?.record ?? null, result: action === 'acceso.denegado' ? 'denegado' : i % 29 === 7 ? 'error' : 'exito', reason: action === 'acceso.denegado' ? 'Sin permiso para esa vista' : null };
    });
  }

  private nextId() { return uuid(++this.seq); }
  private stockOf(a: Article) {
    const lots = this.lots.filter(l => l.articleId === a.id && l.active), today = localDay(), soon = addDays(today, 30);
    const qty = (l: Lot) => Object.values(l.stock).reduce((s, n) => s + n, 0);
    const expired = lots.filter(l => l.expiresAt && l.expiresAt < today).reduce((s, l) => s + qty(l), 0);
    const available = lots.filter(l => !l.expiresAt || l.expiresAt >= today).reduce((s, l) => s + qty(l), 0);
    const expiringSoon = lots.filter(l => l.expiresAt && l.expiresAt >= today && l.expiresAt <= soon).reduce((s, l) => s + qty(l), 0);
    const nextExpiry = lots.map(l => l.expiresAt).filter((x): x is string => !!x && x >= today).sort()[0] ?? null;
    const status = !a.active ? 'inactivo' as const : available === 0 ? 'agotado' as const : available < a.minimum ? 'bajo_minimo' as const : expiringSoon ? 'por_vencer' as const : 'ok' as const;
    return { ...a, available, expired, expiringSoon, nextExpiry, lots: lots.length, status };
  }
  private lotView(l: Lot) {
    const warehouses = WAREHOUSES.filter(w => l.stock[w.id]).map(w => ({ warehouseId: w.id, warehouseCode: w.code, warehouseName: w.name, quantity: l.stock[w.id] }));
    return { id: l.id, number: l.number, expiresAt: l.expiresAt, active: l.active, version: l.version, expired: !!l.expiresAt && l.expiresAt < localDay(), total: warehouses.reduce((s, w) => s + w.quantity, 0), warehouses };
  }
  private article(id: string) {
    const a = this.articles.find(x => x.id === id);
    if (!a) throw new ApiError('No se encontró el artículo.', 404);
    return a;
  }
  private inbox() {
    const visible = this.notices.filter(n => n.estado === 'vigente' && (n.publico || n.roles.includes(this.role)));
    const items = visible.map(n => ({ id: n.id, titulo: n.titulo, cuerpo: n.cuerpo, desde: n.desde, hasta: n.hasta, prioridad: n.prioridad, publico: n.publico, roles: n.roles, nivel: n.nivel, areas: n.areas, publicadoEn: n.publicadoEn, dirigido: !n.publico, enteradoEn: n.enteradoEn, recordarEn: null, destacado: n.nivel === 'critico' }));
    return { actualizadoEn: new Date().toISOString(), avisos: items, noLeidos: items.filter(n => !n.enteradoEn).length, criticos: items.filter(n => n.nivel === 'critico' && !n.enteradoEn).length, recordatorioHoras: 4, proximoCambio: null };
  }
  private catalog() {
    return {
      roles: ROLES.map(([code, name]) => ({ code, name })),
      areas: this.spaces.filter(s => s.type !== 'cama').map(s => ({ id: s.id, parentId: s.parentId, type: s.type, code: s.code, name: s.name })),
      staff: this.people.map(p => ({ id: p.id, name: `${p.givenNames} ${p.surnames}`, type: p.type, specialty: p.specialty ?? null, areaId: p.areaId ?? null, area: p.area ?? null, registrations: [{ validFrom: '2025-01-01', validTo: '2027-12-31' }] })),
    };
  }
  private board() {
    const count = (state: string) => this.beds.filter(b => b.state === state).length;
    const camas = { total: this.beds.length, libres: count('libre'), ocupadas: count('ocupada'), limpieza: count('limpieza'), bloqueadas: count('bloqueada'), reservadas: count('reservada') };
    const plantas = [...new Set(this.beds.map(b => b.level))].sort();
    return {
      actualizadoEn: new Date().toISOString(), fecha: localDay(), camas,
      ocupacionPorPlanta: plantas.map(level => { const beds = this.beds.filter(b => b.level === level), c = (s: string) => beds.filter(b => b.state === s).length; return { planta: level, camas: beds.length, libres: c('libre'), ocupadas: c('ocupada'), limpieza: c('limpieza'), bloqueadas: c('bloqueada'), reservadas: c('reservada') }; }),
      ambulancia: { estado: 'en_servicio', paramedicoDeTurno: true },
      fila: { emitidos: 26, enEspera: 12, llamados: 3, enAtencion: 3, atendidos: 5, noSePresento: 3 },
      laboratorio: { pendiente: 12, enProceso: 9, completadoHoy: 17, canceladoHoy: 3 },
      cobertura: { huecos: 2, detalle: [{ area: 'Planta 2', rol: 'enfermero', inicio: localInstant(localDay(), 19), fin: localInstant(localDay(), 23), requeridos: 3, actuales: 2 }, { area: 'Laboratorio', rol: 'laboratorista', inicio: localInstant(localDay(), 22), fin: localInstant(addDays(localDay(), 1), 6), requeridos: 1, actuales: 0 }] },
      turnosEnCurso: this.shifts.length + 9, pacientesActivos: this.patients.filter(p => p.active).length,
    };
  }
  private series(id: string, from: string, to: string) {
    const units: Record<string, string> = { ocupacion_diaria: 'porcentaje', estancia_promedio: 'dias', tiempo_laboratorio: 'minutos', tiempo_ambulancia: 'minutos', cobertura_turnos: 'horas_con_hueco' };
    const base: Record<string, [number, number]> = { ocupacion_diaria: [68, 18], estancia_promedio: [3.6, 2.4], tiempo_laboratorio: [52, 45], tiempo_ambulancia: [13, 12], cobertura_turnos: [1, 5] };
    if (!units[id]) return undefined;
    const serie = [];
    for (let d = from, i = 0; d <= to && i < 400; d = addDays(d, 1), i++) {
      const [mid, spread] = base[id], wave = Math.sin(i * 1.3) * 0.5 + Math.cos(i * 0.7) * 0.5;
      serie.push({ fecha: d, valor: i === 2 && id === 'tiempo_ambulancia' ? null : Math.max(0, Math.round((mid + wave * spread / 2) * 10) / 10), muestras: i === 2 && id === 'tiempo_ambulancia' ? 0 : 3 + (i % 6) });
    }
    if (id !== 'tiempo_laboratorio') return { indicador: id, unidad: units[id], desde: from, hasta: to, actualizadoEn: new Date().toISOString(), serie };
    // D2: the lab turnaround also carries the median (fixture: a little under the average) and the range summary.
    const lab = serie.map(p => ({ ...p, mediana: p.valor == null ? null : Math.round(p.valor * 0.85 * 10) / 10 }));
    const muestras = lab.reduce((a, p) => a + p.muestras, 0);
    const promedio = muestras ? Math.round(lab.reduce((a, p) => a + (p.valor ?? 0) * p.muestras, 0) / muestras * 10) / 10 : null;
    return { indicador: id, unidad: units[id], desde: from, hasta: to, actualizadoEn: new Date().toISOString(), serie: lab, resumen: { promedio, mediana: promedio == null ? null : Math.round(promedio * 0.85 * 10) / 10, muestras } };
  }
  private auditRows(q: URLSearchParams) {
    const person = fold(q.get('persona') ?? ''), patient = fold(q.get('paciente') ?? ''), results = (q.get('resultado') ?? '').split(',').filter(Boolean);
    const rows = this.audit.filter(r => (!person || fold(r.actor).includes(person)) && (!patient || fold(r.patientRecord ?? '').includes(patient)) && (!q.get('rol') || r.role === q.get('rol'))
      && (!q.get('accion') || r.action.includes(q.get('accion')!)) && (!q.get('entidad') || r.entity === q.get('entidad')) && (!results.length || results.includes(r.result))
      && (!q.get('desde') || r.at >= q.get('desde')!) && (!q.get('hasta') || r.at < q.get('hasta')!));
    const key = ({ fecha: 'at', persona: 'actor', rol: 'role', accion: 'action', entidad: 'entity', paciente: 'patientRecord', resultado: 'result' } as Record<string, keyof typeof rows[number]>)[q.get('orden') ?? 'fecha'] ?? 'at';
    const dir = q.get('sentido') === 'asc' ? 1 : -1;
    rows.sort((a, b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')) * dir);
    const page = Number(q.get('pagina') ?? 1), limit = Number(q.get('limite') ?? 25);
    return { filas: rows.slice((page - 1) * limit, page * limit), total: rows.length, pagina: page, limite: limit };
  }

  request(path: string): unknown {
    const url = new URL(path, 'https://fixture.invalid'), p = url.pathname, q = url.searchParams;
    if (p === '/metricas/tablero') return this.board();
    // P3 S5: public occupancy per floor and room type (ADM reads free beds by type from it).
    if (p === '/publico/ocupacion') {
      const keys = [...new Set(this.beds.map(b => `${b.level}|${b.category}`))].sort();
      return { actualizadoEn: new Date().toISOString(), ocupacion: keys.map(key => { const [level, category] = key.split('|'), beds = this.beds.filter(b => `${b.level}|${b.category}` === key); return { planta: Number(level), categoria: category, camas: beds.length, libres: beds.filter(b => b.state === 'libre').length, ocupadas: beds.filter(b => b.state === 'ocupada').length }; }) };
    }
    // D3: the lab's own turnaround, the last 7 days of the same series.
    if (p === '/laboratorio/tiempo-entrega') return this.series('tiempo_laboratorio', addDays(localDay(), -6), localDay());
    if (/^\/metricas\/[a-z_]+$/.test(p)) return this.series(p.split('/')[2], q.get('desde') ?? addDays(localDay(), -6), q.get('hasta') ?? localDay());
    if (p === '/inventario/articulos') return this.articles.map(a => this.stockOf(a));
    if (/^\/inventario\/articulos\/[^/]+$/.test(p)) {
      const a = this.article(p.split('/')[3]), lots = this.lots.filter(l => l.articleId === a.id).map(l => this.lotView(l));
      const warehouses = WAREHOUSES.map(w => ({ warehouseId: w.id, warehouseCode: w.code, warehouseName: w.name, quantity: lots.reduce((s, l) => s + (l.warehouses.find(x => x.warehouseId === w.id)?.quantity ?? 0), 0) })).filter(w => w.quantity);
      return { ...this.stockOf(a), lotList: lots, warehouses, movements: this.movements.filter(m => m.articleId === a.id).sort((x, y) => y.registeredAt.localeCompare(x.registeredAt)) };
    }
    if (p === '/inventario/existencias') return this.articles.filter(a => a.active).map(a => { const s = this.stockOf(a); return { articulo_id: a.id, codigo: a.code, nombre: a.name, tipo: a.type, unidad: a.unit, minimo: a.minimum, disponible: s.available, vencido: s.expired, bajo_minimo: s.available < a.minimum }; });
    if (p === '/inventario/bodegas') return WAREHOUSES;
    if (p === '/inventario/lotes') {
      const today = localDay(), withExpired = q.get('includeExpired') === 'true', warehouse = q.get('warehouseId') ?? '';
      const lots = this.lots.filter(l => l.articleId === q.get('articleId') && l.stock[warehouse] && (withExpired || !l.expiresAt || l.expiresAt >= today)).sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999'));
      return lots.map((l, i) => ({ id: l.id, number: l.number, expiresAt: l.expiresAt, expired: !!l.expiresAt && l.expiresAt < today, quantity: l.stock[warehouse], fefo: i === 0 }));
    }
    if (p === '/me/avisos/bandeja') return this.inbox();
    if (p === '/avisos') return this.notices.map(({ enteradoEn: _seen, ...n }) => ({ ...n, allowedActions: n.estado === 'vigente' || n.estado === 'programado' ? ['editar', 'retirar'] : [] }));
    // R7 D-2: reach while composing; a stable count per role and area so the preview reads naturally.
    if (p === '/avisos/alcance') {
      const roles = (url.searchParams.get('roles') ?? '').split(',').filter(Boolean), areas = (url.searchParams.get('areas') ?? '').split(',').filter(Boolean);
      const perRole: Record<string, number | undefined> = { MED: 14, ENF: 22, REC: 6, LAB: 5, PAR: 4, JOP: 3 };
      return { destinatarios: roles.reduce((n, r) => n + (perRole[r] ?? 2), 0) + areas.length * 9 };
    }
    if (p === '/avisos/estadisticas') return this.notices.filter(n => n.publicadoEn).map((n, i) => ({ avisoId: n.id, enterados: 4 + i * 3, destinatarios: n.publico ? 48 : 12 + i * 2 }));
    if (p === '/turnos/catalogo') return this.catalog();
    if (p === '/turnos/cobertura') {
      const from = q.get('from') ?? localDay(), to = q.get('to') ?? addDays(from, 6), area = this.spaces.find(s => s.code === 'P2') ?? this.spaces[0];
      // `role` is the function code the API returns (MED, ENF, REC, LAB).
      return { from, to, gaps: [{ areaId: area.id, area: area.name, role: 'ENF', start: localInstant(addDays(from, 2), 19), end: localInstant(addDays(from, 2), 23), required: 3, actual: 2 }, { areaId: area.id, area: area.name, role: 'MED', start: localInstant(addDays(from, 5), 0), end: localInstant(addDays(from, 5), 6), required: 1, actual: 0 }] };
    }
    // R7 F-1: who can take a gap; the first people of the function are valid, one is resting.
    if (p === '/turnos/candidatos') {
      const type = q.get('role') === 'MED' ? 'medico' : q.get('role') === 'ENF' ? 'enfermero' : q.get('role') === 'LAB' ? 'laboratorista' : 'recepcionista';
      const people = this.people.filter(x => x.type === type && x.active !== false).slice(0, 4).map((x, i) => ({ staffId: x.id, person: `${x.givenNames} ${x.surnames}`, sameArea: x.areaId === q.get('areaId'), weekHours: 12 * i }));
      return { candidatos: people.slice(0, 3).map(x => ({ ...x, advertencias: [] })), descartados: people.slice(3).map(x => ({ ...x, codigo: 'personal_en_descanso', mensaje: 'Necesita 8 horas de descanso entre turnos.' })) };
    }
    if (p === '/turnos/mios') {
      const me = this.people[0], area = this.spaces.find(s => s.id === me.areaId) ?? this.spaces[0];
      return [0, 1, 2, 4].map((offset, i) => ({ id: uuid(1500 + i), staffId: me.id, person: `${me.givenNames} ${me.surnames}`, areaId: area.id, area: area.name, start: localInstant(addDays(localDay(), offset), 7), end: localInstant(addDays(localDay(), offset), 15), type: 'diurno', state: 'publicado', version: 1 }));
    }
    if (p === '/turnos/especialistas') {
      const from = q.get('from') ?? localDay();
      return { from, to: addDays(from, 6), items: Array.from({ length: 14 }, (_, i) => ({ date: addDays(from, i % 7), specialty: ['Cardiología', 'Pediatría', 'Ginecología', 'Dermatología'][i % 4], name: STAFF.doctors[i % STAFF.doctors.length], area: 'Consulta externa', start: localInstant(addDays(from, i % 7), 8 + (i % 2) * 5), end: localInstant(addDays(from, i % 7), 12 + (i % 2) * 5), attendance: i < 3 ? 'presente' : null })) };
    }
    if (p === '/turnos/plantillas') {
      const area = this.spaces.find(s => s.code === 'P2') ?? this.spaces[0];
      return [{ id: uuid(1600), areaId: area.id, area: area.name, name: 'Semana tipo de enfermería', version: 1, shifts: [0, 1, 2, 3, 4].map(d => ({ day: d, startTime: '07:00', hours: 8, type: 'diurno', staffId: this.people[1]?.id ?? this.people[0].id })) }];
    }
    if (p === '/personal/especialidades') return [['medicina_general', 'Medicina general', 'medico'], ['medicina_interna', 'Medicina interna', 'medico'], ['pediatria', 'Pediatría', 'medico'], ['ginecologia', 'Ginecología', 'medico'], ['cardiologia', 'Cardiología', 'medico'], ['cirugia_general', 'Cirugía general', 'medico'], ['dermatologia', 'Dermatología', 'medico'], ['enfermeria_general', 'Enfermería general', 'enfermero'], ['cuidados_intensivos', 'Cuidados intensivos', 'enfermero']].map(([code, name, category]) => ({ code, name, category }));
    if (p === '/auditoria/registros') return this.auditRows(q);
    if (/^\/auditoria\/registros\/[^/]+$/.test(p)) {
      const seq = p.split('/')[3], i = this.audit.findIndex(r => r.seq === seq);
      if (i < 0) throw new ApiError('No se encontró el registro.', 404);
      const r = this.audit[i];
      return { ...r, correlation: uuid(2000 + i), detail: { ip: '10.0.0.' + (i % 200), canal: 'web', ...(r.reason ? { motivo: r.reason } : {}) }, hash: `f1c7${String(i).padStart(4, '0')}e9a2b3c4d5e6f70812ab34cd56ef7890a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6`.slice(0, 64), previousHash: `0be1${String(i + 1).padStart(4, '0')}d9c8b7a6f5e4d3c2b1a0918273645546372819a0b1c2d3e4f5a6b7c8d9e0f1a2`.slice(0, 64), previousSeq: this.audit[i + 1]?.seq ?? null, nextSeq: this.audit[i - 1]?.seq ?? null };
    }
    if (p === '/auditoria/opciones') return { acciones: [...AUDIT_ACTIONS].sort(), entidades: [...new Set(this.audit.map(r => r.entity))].sort(), roles: AUDIT_ROLES };
    return undefined;
  }

  write(path: string, d: Record<string, any>, method: string): unknown {
    const parts = path.split('/'), now = new Date().toISOString();
    if (path === '/inventario/movimientos') {
      const lot = d.lotId ? this.lots.find(l => l.id === d.lotId) : (() => { const l: Lot = { id: this.nextId(), articleId: d.articleId, number: d.lotNumber, expiresAt: d.expiresAt ?? null, active: true, version: 1, stock: {} }; this.lots.push(l); return l; })();
      if (!lot) throw new ApiError('No se encontró el lote.', 404);
      const qty = Number(d.quantity), from = d.originWarehouseId as string | undefined, to = d.destinationWarehouseId as string | undefined;
      if (from) { if ((lot.stock[from] ?? 0) < qty && d.type !== 'ajuste') throw new ApiError('No hay existencia suficiente en esa bodega.', 409, 'existencia_insuficiente'); lot.stock[from] = d.type === 'ajuste' ? qty : (lot.stock[from] ?? 0) - qty; }
      if (to) lot.stock[to] = (lot.stock[to] ?? 0) + qty;
      if (!from && !to) lot.stock[WAREHOUSES[0].id] = (lot.stock[WAREHOUSES[0].id] ?? 0) + qty;
      const code = (id?: string) => WAREHOUSES.find(w => w.id === id)?.code ?? null;
      this.movements.push({ id: this.nextId(), articleId: lot.articleId, type: d.type, lotNumber: lot.number, quantity: qty, reason: d.reason || null, originWarehouseCode: code(from), destinationWarehouseCode: code(to), authorName: STAFF.nurses[0], registeredAt: now });
      return { id: this.movements[this.movements.length - 1].id };
    }
    if (path === '/inventario/articulos') { const a: Article = { id: this.nextId(), code: d.code, name: d.name, type: d.type, unit: d.unit, minimum: Number(d.minimum ?? 0), active: true, version: 1 }; this.articles.push(a); return { id: a.id, version: 1 }; }
    if (parts[1] === 'inventario' && parts[2] === 'articulos' && parts[3] && parts[4] === 'lotes') { const l: Lot = { id: this.nextId(), articleId: parts[3], number: d.number ?? d.lotNumber, expiresAt: d.expiresAt ?? null, active: true, version: 1, stock: {} }; this.lots.push(l); return { id: l.id, version: 1 }; }
    if (parts[1] === 'inventario' && parts[2] === 'articulos' && parts[3]) {
      const a = this.article(parts[3]);
      if (method === 'DELETE') { this.articles = this.articles.filter(x => x.id !== a.id); return { id: a.id }; }
      Object.assign(a, d, { version: a.version + 1 });
      return { id: a.id, version: a.version };
    }
    if (parts[1] === 'inventario' && parts[2] === 'lotes' && parts[3]) { const l = this.lots.find(x => x.id === parts[3]); if (!l) throw new ApiError('No se encontró el lote.', 404); Object.assign(l, { number: d.number ?? l.number, expiresAt: d.expiresAt ?? l.expiresAt, active: d.active ?? l.active, version: l.version + 1 }); return { id: l.id, version: l.version }; }
    if (parts[1] === 'me' && parts[2] === 'avisos' && parts[3]) {
      const n = this.notices.find(x => x.id === parts[3]);
      if (n && parts[4] === 'enterado') n.enteradoEn = now;
      return { avisoId: parts[3], enteradoEn: n?.enteradoEn ?? null, recordarEn: parts[4] === 'posponer' ? new Date(Date.now() + 4 * HOUR).toISOString() : null };
    }
    if (path === '/avisos') { const n: Notice = { id: this.nextId(), titulo: d.titulo, cuerpo: d.cuerpo, desde: d.desde ?? now, hasta: d.hasta ?? null, prioridad: d.prioridad ?? 'atencion', publico: !!d.publico, roles: d.roles ?? [], nivel: d.nivel ?? 'informativo', areas: d.areas ?? [], estado: 'vigente', publicadoEn: now, version: 1, retiradoEn: null, motivoRetiro: null, enteradoEn: null }; this.notices.unshift(n); return { id: n.id, version: 1 }; }
    if (parts[1] === 'avisos' && parts[2]) {
      const n = this.notices.find(x => x.id === parts[2]);
      if (!n) throw new ApiError('No se encontró el aviso.', 404);
      if (d.version !== undefined && d.version !== n.version) throw new ApiError('El aviso cambió mientras lo tenías abierto.', 409, 'version_conflicto', n.version);
      if (parts[3] === 'retirar') Object.assign(n, { estado: 'retirado', retiradoEn: now, motivoRetiro: d.motivo });
      else { const { version: _v, ...rest } = d; Object.assign(n, rest); }
      n.version++;
      return { id: n.id, version: n.version };
    }
    if (path === '/auditoria/verificacion') return { integra: true, revisados: this.audit.length, verificadoEn: now };
    return undefined;
  }
}
