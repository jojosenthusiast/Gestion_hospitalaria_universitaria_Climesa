/**
 * Design data for hospitalization: active admissions (/admisiones) for every occupied bed of the fixture building plus
 * the ones waiting for a bed, and what the guided admission and the bed dialogs read (doctors, origins, bed map,
 * feasibility, suggestions). The patients are the shared set; occupied beds name the same patient. Fictitious, in memory.
 */
import { ApiError, type Bed } from '../../lib/api';
import { ago, fixtureUuid, STAFF, type FixturePatient } from './people';

const uuid = (n: number) => fixtureUuid('a004', n);
const MOTIVES = ['Neumonía adquirida en la comunidad, requiere antibiótico intravenoso', 'Control de glucosa en paciente con diabetes descompensada', 'Observación posquirúrgica tras colecistectomía', 'Deshidratación moderada por gastroenteritis', 'Insuficiencia cardiaca descompensada', 'Celulitis en miembro inferior derecho', 'Dolor abdominal en estudio'];
const ORIGINS = ['emergencia', 'consulta', 'cita', 'ambulancia', 'programada'];
/** D-02: what each role may do on each state; the page only shows what this list allows. */
const ACTIONS: Record<string, Record<string, string[]>> = {
  JOP: { pendiente_cama: ['asignar_cama', 'autorizar', 'cancelar'], hospitalizado: ['trasladar', 'reasignar_tratante', 'anular'], alta: ['revocar_alta', 'registrar_salida'] },
  REC: { pendiente_cama: ['asignar_cama', 'cancelar'], hospitalizado: ['trasladar'], alta: ['registrar_salida'] },
  ENF: { pendiente_cama: [], hospitalizado: ['solicitar_alta'], alta: ['registrar_salida'] },
  MED: { pendiente_cama: [], hospitalizado: ['firmar_alta'], alta: [] },
};

type Admission = {
  id: string; patientId: string; patientName: string; origin: string; requestedCategory: string; state: string; isolation: boolean; bed: string; version: number;
  occupationId: string | null; scheduledAt: string | null; motive: string; unstable: boolean; postSurgical: boolean; visitorsAllowed: boolean; visitorsMax: number;
  attendingDoctorName: string; attendingDoctorHasAccount: boolean; bedCategory: 'vip' | 'semiprivada' | null; authorized: boolean; dischargeRequestedAt: string | null;
  discharge: { type: string | null; signedAt: string; signedByName: string | null; pending: { description: string; responsible: string }[] | null; pendingCount: number; specialHandling: boolean } | null;
};

export class HospitalFixtures {
  private seq = 700000;
  private admissions: Admission[] = [];

  constructor(private readonly role: string, private readonly patients: FixturePatient[], private readonly beds: Bed[]) {
    const occupied = beds.filter(b => b.state === 'ocupada');
    occupied.forEach((bed, i) => {
      const patient = patients[(i * 17 + 9) % patients.length], signed = i % 5 === 3;
      bed.occupant = patient.fullName; bed.patientId = patient.id;
      this.admissions.push(this.make(i, patient, 'hospitalizado', bed, { dischargeRequestedAt: i % 5 === 1 ? ago(95) : null, discharge: signed ? { type: 'medica', signedAt: ago(50), signedByName: STAFF.doctors[1], pending: [{ description: 'Entregar receta y cita de control', responsible: 'Enfermería' }], pendingCount: 1, specialHandling: false } : null }));
    });
    for (let i = 0; i < 6; i++) this.admissions.push(this.make(occupied.length + i, patients[(i * 29 + 140) % patients.length], 'pendiente_cama', null, { scheduledAt: i === 4 ? new Date(Date.now() + 20 * 3_600_000).toISOString() : null }));
  }

  private nextId() { return uuid(++this.seq); }
  private make(i: number, patient: FixturePatient, state: string, bed: Bed | null, extra: Partial<Admission>): Admission {
    const category = bed ? bed.category : i % 3 === 0 ? 'vip' : 'semiprivada';
    return {
      id: uuid(100 + i), patientId: patient.id, patientName: patient.fullName, origin: ORIGINS[i % ORIGINS.length], requestedCategory: category, state, isolation: i % 6 === 2, bed: bed?.code ?? '', version: 1,
      occupationId: bed ? uuid(500 + i) : null, scheduledAt: null, motive: MOTIVES[i % MOTIVES.length], unstable: i % 7 === 4, postSurgical: MOTIVES[i % MOTIVES.length].includes('posquirúrgica'),
      visitorsAllowed: true, visitorsMax: category === 'vip' ? 3 : 1, attendingDoctorName: STAFF.doctors[i % STAFF.doctors.length], attendingDoctorHasAccount: i % 6 !== 5,
      bedCategory: bed ? (bed.category as 'vip' | 'semiprivada') : null, authorized: i % 8 === 6, dischargeRequestedAt: null, discharge: null, ...extra,
    };
  }
  private view(a: Admission) {
    const phase = a.state === 'hospitalizado' && a.discharge ? 'alta' : a.state;
    return { ...a, allowedActions: ACTIONS[this.role]?.[phase] ?? [] };
  }
  private admission(id: string) {
    const a = this.admissions.find(x => x.id === id);
    if (!a) throw new ApiError('No se encontró la admisión.', 404);
    return a;
  }
  private bedMap(category?: string | null) {
    const pick = this.beds.filter(b => b.state !== 'ocupada');
    const rooms = new Map<string, number>();
    for (const b of this.beds) if (b.state === 'ocupada') rooms.set(b.roomId, (rooms.get(b.roomId) ?? 0) + 1);
    const beds = pick.map((b, i) => ({ id: b.id, version: b.version, code: b.code, roomId: b.roomId, room: b.room, floor: b.level, category: b.category as 'vip' | 'semiprivada', capacity: b.category === 'vip' ? 1 : 2, state: b.state, occupiedInRoom: rooms.get(b.roomId) ?? 0, compatible: b.state === 'libre' && (!category || b.category === category), reason: b.state === 'libre' ? (category && b.category !== category ? 'Otra categoría' : null) : b.state === 'limpieza' ? 'En limpieza' : 'Reservada', suggested: b.state === 'libre' && i < 3 }));
    const counts = (['semiprivada', 'vip'] as const).map(c => ({ category: c, free: pick.filter(b => b.category === c && b.state === 'libre').length, compatible: beds.filter(b => b.category === c && b.compatible).length }));
    return { categories: counts, beds };
  }

  request(path: string): unknown {
    const url = new URL(path, 'https://fixture.invalid'), p = url.pathname, q = url.searchParams;
    if (p === '/admisiones') return this.admissions.map(a => this.view(a));
    if (p === '/admisiones/medicos-disponibles') return STAFF.doctors.map((name, i) => ({ id: fixtureUuid('9000', 100 + i), name, specialty: ['Medicina interna', 'Cirugía general', 'Pediatría', 'Medicina interna', 'Ginecología', 'Cardiología'][i], available: i !== 4, reason: i === 4 ? 'Sin turno a esa hora' : null, hasAccount: i !== 5 }));
    if (p === '/admisiones/origenes') return [
      { id: uuid(901), origin: 'consulta', at: ago(45), label: 'Consulta de hoy', detail: `${STAFF.doctors[0]} · Medicina general` },
      { id: uuid(902), origin: 'emergencia', at: ago(180), label: 'Emergencia', detail: 'Número EMG-4 de esta mañana' },
      { id: uuid(903), origin: 'cita', at: ago(60 * 26), label: 'Cita de ayer', detail: `${STAFF.doctors[3]} · Medicina interna` },
    ];
    if (p === '/admisiones/mapa-camas') return this.bedMap(q.get('category'));
    if (p === '/admisiones/factibilidad') return { feasible: true, checks: [{ code: 'paciente_sin_admision', ok: true, message: 'El paciente no tiene otra admisión activa.' }, { code: 'medico_de_turno', ok: true, message: 'El médico tratante tiene turno a esa hora.' }, { code: 'cama_disponible', ok: true, message: 'Hay camas libres de la categoría pedida.' }] };
    if (/^\/admisiones\/[^/]+\/sugerencias-cama$/.test(p)) {
      const a = this.admission(p.split('/')[2]), category = q.get('category') ?? a.requestedCategory;
      return this.beds.filter(b => b.state === 'libre' && b.category === category).slice(0, 5).map((b, i) => ({ id: b.id, version: b.version, code: b.code, room: b.room, category: b.category, reason: i === 0 ? 'Misma categoría, habitación sin otros pacientes' : 'Misma categoría' }));
    }
    return undefined;
  }

  write(path: string, d: Record<string, any>): unknown {
    const parts = path.split('/');
    if (path === '/admisiones') {
      const patient = this.patients.find(x => x.id === d.patientId) ?? this.patients[0], bed = this.beds.find(b => b.id === d.bedId) ?? null;
      const a = this.make(this.admissions.length, patient, bed ? 'hospitalizado' : 'pendiente_cama', bed, { motive: d.motive ?? MOTIVES[0], isolation: !!d.isolation, requestedCategory: d.requestedCategory ?? 'semiprivada', unstable: !!d.unstable, postSurgical: !!d.postSurgical });
      a.id = this.nextId();
      if (bed) Object.assign(bed, { state: 'ocupada', occupant: patient.fullName, patientId: patient.id, version: bed.version + 1 });
      this.admissions.push(a);
      return { id: a.id, version: 1, state: a.state };
    }
    if (parts[1] === 'ocupaciones' && parts[3] === 'traslado') {
      const a = this.admissions.find(x => x.occupationId === parts[2]);
      if (!a) throw new ApiError('No se encontró la ocupación.', 404);
      return this.write(`/admisiones/${a.id}/cama`, d);
    }
    if (parts[1] !== 'admisiones' || !parts[2]) return undefined;
    const a = this.admission(parts[2]), verb = parts[3];
    if (d.version !== undefined && d.version !== a.version && verb !== 'cama') throw new ApiError('La admisión cambió mientras la tenías abierta.', 409, 'version_conflicto', a.version);
    const free = (code: string) => { const b = this.beds.find(x => x.code === code); if (b) Object.assign(b, { state: 'limpieza', occupant: undefined, patientId: undefined, cleaningPending: true, version: b.version + 1 }); };
    if (verb === 'cama') {
      const bed = this.beds.find(b => b.id === d.bedId);
      if (!bed) throw new ApiError('No se encontró la cama.', 404);
      if (a.bed) free(a.bed);
      Object.assign(bed, { state: 'ocupada', occupant: a.patientName, patientId: a.patientId, version: bed.version + 1 });
      Object.assign(a, { state: 'hospitalizado', bed: bed.code, bedCategory: bed.category, occupationId: this.nextId() });
    } else if (verb === 'salida' || verb === 'cancelar' || verb === 'anular') {
      if (a.bed) free(a.bed);
      this.admissions = this.admissions.filter(x => x.id !== a.id);
    } else if (verb === 'solicitar-alta') a.dischargeRequestedAt = new Date().toISOString();
    else if (verb === 'revocar-alta') a.discharge = null;
    else if (verb === 'autorizar') a.authorized = true;
    else if (verb === 'tratante') a.attendingDoctorName = STAFF.doctors.find((_, i) => fixtureUuid('9000', 100 + i) === d.attendingDoctorId) ?? a.attendingDoctorName;
    a.version++;
    return { id: a.id, version: a.version, state: a.state };
  }
}
