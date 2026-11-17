/**
 * R7 U1: design data for the front desk journeys (/fila, /citas, /pacientes/selector, /vinculaciones) at realistic
 * volume: 45 doctors, the shared 330 patients of people.ts (the Pacientes module reads the same set), about 60
 * appointments today and long names. Fictitious, in memory, used only by
 * work-preview.html; it never touches the network. `request` and `write` return `undefined` for paths they do not
 * serve, so FixtureApi falls back to its own data.
 */
import { ApiError } from '../../lib/api';
import { addDays, buildPatients, fold, localDay, localInstant, MIN, patientUuid as uuid, personName, type FixturePatient } from './people';

const SPECIALTY = ['Medicina general', 'Medicina general', 'Medicina interna', 'Pediatría', 'Ginecología', 'Dermatología', 'Cardiología', 'Traumatología', 'Oftalmología'];

type Doctor = { id: string; givenNames: string; surnames: string; specialty: string; active: boolean };
type Cita = { id: string; patientId: string; patientName: string; doctorId: string; doctorName: string; start: string; end: string; state: string; origin: string; version: number; reason: string | null; cancelReasonCode?: string | null; cancelReason?: string | null };
type Ticket = { id: string; service: string; area: string; fecha: string; numero: number; patientId: string; patientName: string; state: string; llamados: number; version: number; issuedAt: string; priority: string; appointmentId: string | null; officeCode: string | null };

const AREA: Record<string, string> = { consulta_general: 'CON', emergencia: 'EMG', laboratorio: 'LAB', admisiones: 'REC' };

export class FrontDeskFixtures {
  private seq = 900000;
  private readonly today = localDay();
  readonly doctors: Doctor[] = Array.from({ length: 45 }, (_, i) => { const { givenNames, surnames } = personName(400 + i * 7); return { id: uuid(100 + i), givenNames, surnames, specialty: SPECIALTY[i % SPECIALTY.length], active: true }; });
  private citas: Cita[] = [];
  private tickets: Ticket[] = [];
  private requests: Record<string, unknown>[] = [];

  /** The shared patient set: FixtureApi passes the same array the Pacientes module reads and edits. */
  constructor(readonly patients: FixturePatient[] = buildPatients()) {
    const name = (d: Doctor) => `${d.givenNames} ${d.surnames}`;
    // ~60 appointments today across 12 doctors, 08:00-12:00, plus a few on the next days.
    for (let i = 0; i < 60; i++) {
      const doctor = this.doctors[i % 12], patient = this.patients[i * 4], slot = Math.floor(i / 12);
      const start = localInstant(this.today, 8 + Math.floor(slot * 20 / 60) + (i % 3), (slot * 20) % 60);
      const past = Date.parse(start) < Date.now() - 30 * MIN;
      this.citas.push({ id: uuid(5000 + i), patientId: patient.id, patientName: patient.fullName, doctorId: doctor.id, doctorName: name(doctor), start, end: new Date(Date.parse(start) + 20 * MIN).toISOString(), state: i % 17 === 5 ? 'cancelada' : past && i % 4 === 0 ? 'atendida' : 'confirmada', origin: i % 3 ? 'recepcion' : 'paciente', version: 1, reason: i % 5 === 0 ? 'Control de presión arterial y revisión de exámenes de laboratorio recientes' : null, cancelReasonCode: i % 17 === 5 ? 'no_puedo_a_esa_hora' : null });
    }
    for (let i = 0; i < 12; i++) {
      const doctor = this.doctors[(i * 5) % 45], patient = this.patients[200 + i], start = localInstant(addDays(this.today, 1 + (i % 4)), 9 + (i % 6));
      this.citas.push({ id: uuid(5100 + i), patientId: patient.id, patientName: patient.fullName, doctorId: doctor.id, doctorName: name(doctor), start, end: new Date(Date.parse(start) + 20 * MIN).toISOString(), state: i % 4 === 0 ? 'solicitada' : 'confirmada', origin: 'paciente', version: 1, reason: null });
    }
    // The queue of the morning: walk-ins and arrivals registered from appointments, in every column.
    const states = ['en_espera', 'en_espera', 'en_espera', 'llamado', 'en_espera', 'en_atencion', 'atendido', 'en_espera', 'no_se_presento', 'en_espera'];
    for (let i = 0; i < 26; i++) {
      const service = i % 7 === 3 ? 'laboratorio' : i % 11 === 6 ? 'emergencia' : 'consulta_general';
      const linked = service === 'consulta_general' && i % 2 === 0 ? this.citas[i] : null;
      const patient = linked ? this.patients.find(p => p.id === linked.patientId)! : this.patients[120 + i];
      this.tickets.push({ id: uuid(7000 + i), service, area: AREA[service], fecha: this.today, numero: 1 + this.tickets.filter(t => t.service === service).length, patientId: patient.id, patientName: patient.fullName, state: states[i % states.length], llamados: states[i % states.length] === 'llamado' ? 1 : states[i % states.length] === 'no_se_presento' ? 3 : 0, version: 1, issuedAt: new Date(Date.now() - (60 - i * 2) * MIN).toISOString(), priority: i === 9 ? 'urgente' : i === 17 ? 'emergencia' : 'rutina', appointmentId: linked?.id ?? null, officeCode: states[i % states.length] === 'en_atencion' ? 'C-03' : null });
    }
    const categories = [['piel', 'Piel', 'Dermatología'], ['consulta_general', 'Consulta general', 'Medicina general'], ['corazon', 'Corazón', 'Cardiología']];
    this.requests = Array.from({ length: 6 }, (_, i) => {
      const patient = this.patients[250 + i], [code, label, specialty] = categories[i % 3];
      return { id: uuid(8000 + i), patientId: patient.id, patientName: patient.fullName, record: patient.record, categories: [{ code, name: label, icon: code === 'consulta_general' ? 'general' : code }], specialties: [specialty], franja: i % 2 ? 'tarde' : 'manana', note: i % 2 ? 'Mancha en el brazo desde hace un mes, a veces pica por las noches' : null, preferredDoctorId: null, preferredDoctorName: null, state: 'pendiente', rejectionReason: null, appointment: null, createdAt: new Date(Date.now() - (i + 1) * 3_600_000).toISOString(), version: 1, allowedActions: ['asignar', 'rechazar'], blockedActions: [] };
    });
  }

  private nextId() { return uuid(++this.seq); }
  private patientById(id: string) { return this.patients.find(p => p.id === id); }
  private appointmentToday(patientId: string) {
    const c = this.citas.filter(a => a.patientId === patientId && a.state === 'confirmada' && localDay(Date.parse(a.start)) === this.today).sort((a, b) => a.start.localeCompare(b.start))[0];
    return c ? { id: c.id, start: c.start, doctorId: c.doctorId, doctorName: c.doctorName } : null;
  }
  private ticketToday(patientId: string) {
    const t = this.tickets.find(x => x.patientId === patientId && ['en_espera', 'llamado', 'en_atencion'].includes(x.state));
    return t ? { id: t.id, service: t.service, numero: t.numero, state: t.state, appointmentId: t.appointmentId } : null;
  }
  private ticketView(t: Ticket) {
    const cita = t.appointmentId ? this.citas.find(c => c.id === t.appointmentId) : null;
    const allowed = t.state === 'en_espera' ? ['llamar'] : t.state === 'llamado' ? ['llamar', 'atender', ...(t.llamados >= 3 ? ['no_se_presento'] : [])] : t.state === 'en_atencion' ? ['completar'] : [];
    const blocked = t.state === 'llamado' && t.llamados < 3 ? [{ action: 'no_se_presento', reason: `Disponible tras 3 llamados (van ${t.llamados}).` }] : [];
    return { ...t, appointmentAt: cita?.start ?? null, appointmentDoctorName: cita?.doctorName ?? null, appointmentDoctorId: cita?.doctorId ?? null, arrivalFromAppointment: !!cita, walkIn: !cita, maxCalls: 3, callsForAbsence: 3, allowedActions: allowed, blockedActions: blocked, undoActions: t.state === 'llamado' && t.llamados === 1 ? ['deshacer_llamado'] : [], voidableUntil: t.state === 'en_espera' && Date.parse(t.issuedAt) > Date.now() - 10 * MIN ? new Date(Date.parse(t.issuedAt) + 10 * MIN).toISOString() : null };
  }
  private citaView(c: Cita) {
    const today = localDay(Date.parse(c.start)) === this.today, started = Date.parse(c.start) <= Date.now() + 15 * MIN;
    const arrival = this.tickets.find(t => t.appointmentId === c.id && t.state !== 'cerrado');
    const allowed = c.state === 'confirmada' ? ['reprogramar', 'cancelar', ...(today && started && !arrival ? ['no_asistio'] : [])] : c.state === 'solicitada' ? ['confirmar', 'rechazar'] : [];
    return { ...c, allowedActions: allowed, blockedActions: [], cancelableUntil: c.start, reschedule: null, arrival: arrival ? { id: arrival.id, numero: arrival.numero, state: arrival.state } : null };
  }
  private franjas(doctorId: string, day: string) {
    const out = [];
    for (let m = 8 * 60; m < 16 * 60; m += 20) {
      const start = localInstant(day, Math.floor(m / 60), m % 60), end = new Date(Date.parse(start) + 20 * MIN).toISOString();
      const taken = this.citas.some(c => c.doctorId === doctorId && ['confirmada', 'solicitada'].includes(c.state) && c.start === start);
      const past = Date.parse(start) < Date.now();
      out.push({ start, end, estado: past ? 'pasado' : taken ? 'ocupado' : 'libre', motivo: past ? 'Ya pasó' : taken ? 'Ocupado' : null });
    }
    return out;
  }

  request(path: string): unknown {
    const url = new URL(path, 'https://fixture.invalid'), p = url.pathname, q = url.searchParams;
    if (p === '/pacientes/selector') {
      const words = fold(q.get('query') ?? '').split(' ').filter(Boolean), offset = Number(q.get('offset') ?? 0), limit = Number(q.get('limit') ?? 10);
      const hits = this.patients.filter(x => words.every(w => fold(`${x.fullName} ${x.record} ${x.dui}`).includes(w)));
      return { items: hits.slice(offset, offset + limit).map(x => ({ id: x.id, record: x.record, fullName: x.fullName, age: 2026 - Number(x.birth.slice(0, 4)), appointmentToday: this.appointmentToday(x.id), ticketToday: this.ticketToday(x.id) })), offset, limit, hasMore: hits.length > offset + limit };
    }
    if (p === '/fila') return this.tickets.map(t => this.ticketView(t));
    if (p === '/fila/mi-puesto') return { service: null, area: null, areaName: null, officeId: null, officeCode: null, shiftEnd: null };
    if (p === '/fila/siguiente') {
      const service = q.get('service') ?? 'consulta_general', next = this.tickets.filter(t => t.service === service && t.state === 'en_espera').sort((a, b) => a.numero - b.numero)[0];
      return { service, area: AREA[service], rule: 'Emergencias primero; luego citas dentro de su ventana; luego por orden de llegada.', proposal: next ? { id: next.id, numero: next.numero, area: next.area, patientName: next.patientName, priority: next.priority, appointmentAt: this.ticketView(next).appointmentAt, version: next.version, reason: 'llegada', reasonText: 'El que más tiempo lleva esperando.' } : null };
    }
    if (p === '/citas') { const patientId = q.get('patientId'); return this.citas.filter(c => !patientId || c.patientId === patientId).map(c => this.citaView(c)); }
    if (p === '/citas/solicitudes-categoria') return this.requests;
    if (/^\/citas\/solicitudes-categoria\/[^/]+\/sugerencia$/.test(p)) {
      const doctor = this.doctors[3], day = addDays(this.today, 1), slot = this.franjas(doctor.id, day).find(f => f.estado === 'libre')!;
      return { found: true, doctorId: doctor.id, doctorName: `${doctor.givenNames} ${doctor.surnames}`, specialty: doctor.specialty, date: day, start: slot.start, end: slot.end };
    }
    if (p === '/citas/catalogos') return { patients: [], doctors: this.doctors.map((d, i) => ({ ...d, type: 'medico', areaId: null, area: 'Consulta externa', tieneTurno: i % 9 !== 8, motivo: i % 9 === 8 ? 'Sin turno ese día' : null })) };
    if (p === '/citas/disponibilidad') { const franjas = this.franjas(q.get('doctorId') ?? '', q.get('date') ?? this.today); return { durationMinutes: 20, workPeriods: [{ start: localInstant(q.get('date') ?? this.today, 8), end: localInstant(q.get('date') ?? this.today, 16) }], slots: franjas.filter(f => f.estado === 'libre'), franjas }; }
    if (p === '/cuentas/vinculaciones') {
      const a = this.patients[10], b = this.patients[11];
      return [
        { id: uuid(9001), createdAt: new Date(Date.now() - 40 * MIN).toISOString(), version: 1, account: { email: 'maria.jose.hernandez.ejemplo@example.test', name: a.fullName }, declared: { dui: a.dui, birth: a.birth }, candidate: { id: a.id, record: a.record, fullName: a.fullName, birth: a.birth, dui: a.dui, exact: true }, candidates: 1 },
        { id: uuid(9002), createdAt: new Date(Date.now() - 25 * MIN).toISOString(), version: 1, account: { email: 'jose.roberto.prueba@example.test', name: b.fullName }, declared: { dui: `${b.dui.slice(0, 7)}${(Number(b.dui[7]) + 1) % 10}-${b.dui[9]}`, birth: b.birth }, candidate: null, candidates: 0, closest: { id: b.id, record: b.record, fullName: b.fullName, birth: b.birth, dui: b.dui } },
        { id: uuid(9003), createdAt: new Date(Date.now() - 5 * MIN).toISOString(), version: 1, account: { email: 'cuenta.nueva@example.test', name: 'Gabriela Alejandra Sin Expediente' }, declared: { dui: '09876543-2', birth: '2001-07-19' }, candidate: null, candidates: 0 },
      ];
    }
    return undefined;
  }

  write(path: string, d: Record<string, any>): unknown {
    const parts = path.split('/'), id = parts[2], verb = parts[3];
    if (path === '/fila') {
      const patient = this.patientById(d.patientId);
      if (!patient) throw new ApiError('No se encontró al paciente.', 404);
      if (this.ticketToday(patient.id)) throw new ApiError(`${patient.fullName} ya tiene un número vigente hoy.`, 409, 'ticket_activo_existente');
      const t: Ticket = { id: this.nextId(), service: d.service, area: AREA[d.service], fecha: this.today, numero: 1 + Math.max(0, ...this.tickets.filter(x => x.service === d.service).map(x => x.numero)), patientId: patient.id, patientName: patient.fullName, state: 'en_espera', llamados: 0, version: 1, issuedAt: new Date().toISOString(), priority: d.priority ?? 'rutina', appointmentId: d.appointmentId ?? null, officeCode: null };
      this.tickets.push(t);
      return { ...t, serviceName: d.service, ahead: this.tickets.filter(x => x.service === t.service && x.state === 'en_espera' && x.numero < t.numero).length, voidableUntil: new Date(Date.now() + 10 * MIN).toISOString() };
    }
    if (path === '/fila/llamar-siguiente') {
      const next = this.tickets.filter(t => t.service === d.service && t.state === 'en_espera').sort((a, b) => a.numero - b.numero)[0];
      if (!next) throw new ApiError('Nadie espera en este servicio.', 409, 'fila_sin_espera');
      Object.assign(next, { state: 'llamado', llamados: 1, version: next.version + 1 });
      return { id: next.id, numero: next.numero, version: next.version, state: next.state, llamados: 1, ownAppointment: false };
    }
    if (parts[1] === 'fila' && id) {
      const t = this.tickets.find(x => x.id === id);
      if (!t) throw new ApiError('No se encontró el número.', 404);
      if (d.version !== undefined && d.version !== t.version) throw new ApiError('El número cambió mientras lo tenías abierto.', 409, 'version_conflicto', t.version);
      const next: Record<string, Partial<Ticket>> = { llamar: { state: 'llamado', llamados: t.llamados + 1 }, atender: { state: 'en_atencion', officeCode: 'C-03' }, completar: { state: 'atendido' }, 'no-se-presento': { state: 'no_se_presento' }, 'deshacer-llamado': { state: t.llamados > 1 ? 'llamado' : 'en_espera', llamados: t.llamados - 1 }, anular: { state: 'cerrado' }, prioridad: { priority: d.priority } };
      Object.assign(t, next[verb] ?? {}, { version: t.version + 1 });
      return { id: t.id, numero: t.numero, version: t.version, state: t.state, llamados: t.llamados };
    }
    if (parts[1] === 'citas' && parts[2] === 'solicitudes-categoria' && parts[4] === 'asignar') {
      const r = this.requests.find(x => x.id === parts[3]);
      if (r) Object.assign(r, { state: 'asignada', allowedActions: [] });
      return { id: parts[3], version: 2, state: 'asignada' };
    }
    if (parts[1] === 'citas' && id && (verb === 'cancelar' || verb === 'no-asistio')) {
      const c = this.citas.find(x => x.id === id);
      if (!c) throw new ApiError('No se encontró la cita.', 404);
      Object.assign(c, verb === 'cancelar' ? { state: 'cancelada', cancelReasonCode: d.reasonCode ?? null, cancelReason: d.reason ?? null } : { state: 'no_asistio' }, { version: c.version + 1 });
      return { id: c.id, state: c.state, version: c.version };
    }
    return undefined;
  }
}
