/**
 * Design data for the ambulance journeys: the dispatch center (/ambulancia) with the unit in service, requests waiting
 * to be confirmed and the crew on duty, the prehospital report, and a month of the log (/ambulancia/bitacora). The log
 * never carries patient names, only a masked record (FR-109-15). Fictitious and in memory.
 */
import { ApiError } from '../../lib/api';
import type { AmbulanceStatus } from '../../features/ambulance/types';
import { ago, fixtureUuid, fold, MIN, STAFF, type FixturePatient } from './people';

const uuid = (n: number) => fixtureUuid('a003', n);
const MUNICIPALITIES = ['San Salvador', 'Soyapango', 'Mejicanos', 'Santa Tecla', 'Antiguo Cuscatlán', 'Ilopango', 'Apopa', 'San Marcos'];
const ADDRESSES = ['Colonia Ejemplo, calle principal, casa 14', 'Residencial Prueba, pasaje 3, casa 22', 'Barrio Ficticio, avenida norte 45', 'Urbanización Ejemplo II, senda 7, casa 9'];
const crewPool = [
  { staffId: uuid(11), role: 'paramedico', name: STAFF.paramedics[0], hasAccount: true },
  { staffId: uuid(12), role: 'paramedico', name: STAFF.paramedics[1], hasAccount: false },
  { staffId: uuid(13), role: 'motorista', name: STAFF.drivers[0], hasAccount: true },
  { staffId: uuid(14), role: 'motorista', name: STAFF.drivers[1], hasAccount: false },
];
const DISPATCH_ROLES = ['JOP', 'REC'];

type Unit = { id: string; plate: string; state: string; version: number; stateReason: string | null; stateSince: string | null };
type Service = NonNullable<AmbulanceStatus['activeService']>;
type LogRow = { id: string; type: string; priority: string; origin: string; destination: string; municipality: string | null; dispatchedAt: string; finishedAt: string | null; finalState: string | null; responseMinutes: number | null; crew: { staffId: string; role: string; name: string }[]; milestones: { type: string; occurredAt: string }[]; patientRef: string | null; administrativeClose: boolean };

export class AmbulanceFixtures {
  private seq = 600000;
  private unit: Unit = { id: uuid(1), plate: 'P-123-456', state: 'en_servicio', version: 3, stateReason: null, stateSince: ago(38) };
  private active: Omit<Service, 'allowedActions'> | null;
  private requests: Record<string, any>[];
  private log: LogRow[] = [];

  constructor(private readonly role: string, patients: FixturePatient[]) {
    this.active = {
      id: uuid(100), type: 'emergencia_domicilio', priority: 'naranja', origin: ADDRESSES[0], destination: 'Hospital CLIMESA, emergencia', municipality: 'Soyapango', dispatchedAt: ago(38), version: 2, requestId: uuid(200), hasPrehospital: true,
      crew: [crewPool[0], crewPool[2]], milestones: [{ type: 'salida', occurredAt: ago(36) }, { type: 'en_escena', occurredAt: ago(22) }, { type: 'trasladando', occurredAt: ago(9) }], nextMilestones: ['en_hospital'],
      lastLocation: { latitude: 13.7003, longitude: -89.1801, capturedAt: ago(2) },
    };
    this.requests = [0, 1, 2].map(i => {
      const patient = patients[60 + i * 11];
      return { id: uuid(201 + i), channel: i === 1 ? 'telefono' : 'app_paciente', address: ADDRESSES[(i + 1) % ADDRESSES.length], municipality: MUNICIPALITIES[(i * 3) % MUNICIPALITIES.length], latitude: i === 1 ? null : 13.69 + i / 100, longitude: i === 1 ? null : -89.21 + i / 100, reason: ['Dolor de pecho desde hace una hora, sudoración', 'Caída en casa, no puede levantarse', 'Dificultad para respirar en adulto mayor'][i], contactPhone: `7${i}00-55${i}${i}`, createdAt: ago(4 + i * 9), version: 1, registeredPatient: i !== 1, requesterName: i === 1 ? null : patient.fullName, callerName: i === 1 ? 'Vecino que llamó (ficticio)' : null, patientRecord: i === 1 ? null : patient.record };
    });
    const finals = ['completado', 'completado', 'completado', 'sin_traslado', 'completado', 'cancelado', 'rechaza_traslado', 'completado', 'desviado'];
    const priorities = ['roja', 'naranja', 'amarilla', 'verde', 'naranja', 'amarilla'];
    for (let i = 0; i < 40; i++) {
      const dispatched = 60 + i * 17 * 60 / 2, response = 6 + ((i * 7) % 24), final = finals[i % finals.length], record = patients[(i * 13) % patients.length].record;
      const milestones = final === 'cancelado' ? [] : [{ type: 'salida', occurredAt: ago(dispatched - 2) }, { type: 'en_escena', occurredAt: ago(dispatched - response) }, ...(final === 'completado' || final === 'desviado' ? [{ type: 'trasladando', occurredAt: ago(dispatched - response - 12) }, { type: 'en_hospital', occurredAt: ago(dispatched - response - 30) }] : []), { type: 'finalizado', occurredAt: ago(dispatched - response - 40) }];
      this.log.push({ id: uuid(300 + i), type: i % 4 === 3 ? 'traslado_interhospitalario' : 'emergencia_domicilio', priority: priorities[i % priorities.length], origin: i % 4 === 3 ? 'Hospital CLIMESA, hospitalización' : ADDRESSES[i % ADDRESSES.length], destination: i % 4 === 3 ? 'Hospital de referencia Ejemplo' : final === 'desviado' ? 'Unidad de salud Prueba' : 'Hospital CLIMESA, emergencia', municipality: MUNICIPALITIES[i % MUNICIPALITIES.length], dispatchedAt: ago(dispatched), finishedAt: ago(dispatched - response - 40), finalState: final, responseMinutes: final === 'cancelado' ? null : response, crew: [crewPool[i % 2], crewPool[2 + (i % 2)]].map(({ staffId, role, name }) => ({ staffId, role, name })), milestones, patientRef: final === 'cancelado' || final === 'sin_traslado' ? null : `${record.slice(0, 2)}*****-${record.slice(-1)}`, administrativeClose: i % 11 === 7 });
    }
  }

  private nextId() { return uuid(++this.seq); }
  activeView() {
    if (!this.active) return null;
    return { ...this.active, allowedActions: this.role === 'JOP' ? ['cerrar'] : [] as string[] };
  }
  private status() {
    const dispatcher = DISPATCH_ROLES.includes(this.role);
    return {
      unit: this.unit, activeService: this.activeView(), paramedicOnDuty: true, driverOnDuty: true,
      dispatchBlock: this.unit.state === 'en_servicio' ? { code: 'ambulancia_ya_despachada', message: 'La unidad está atendiendo un servicio.', action: 'Las solicitudes quedan en espera hasta que termine.' } : this.unit.state === 'en_mantenimiento' ? { code: 'unidad_en_mantenimiento', message: 'La ambulancia está en mantenimiento.', action: 'Sácala de mantenimiento para despachar.' } : null,
      ...(dispatcher ? { pendingRequests: this.requests, availableCrew: crewPool } : {}),
    };
  }
  private bumpUnit(d: Record<string, any>) {
    if (d.version !== undefined && d.version !== this.unit.version) throw new ApiError('La unidad cambió mientras la tenías abierta.', 409, 'version_conflicto', this.unit.version);
    this.unit.version++;
  }

  request(path: string): unknown {
    const url = new URL(path, 'https://fixture.invalid'), p = url.pathname, q = url.searchParams;
    if (p === '/ambulancia') return this.status();
    if (/^\/ambulancia\/servicios\/[^/]+\/prehospital$/.test(p)) {
      const clinical = ['MED', 'ENF', 'JOP', 'REC'].includes(this.role);
      return { serviceId: p.split('/')[3], version: 1, active: true, arrived: false, priority: 'naranja', patientLinked: true, clinical, handover: null, allowedActions: [], reports: [{ id: uuid(400), priority: 'naranja', estimatedArrival: new Date(Date.now() + 8 * MIN).toISOString(), capturedAt: ago(7), receivedAt: ago(7), ...(clinical ? { reason: 'Dolor torácico opresivo de 1 hora, diaforesis. Antecedente de hipertensión.', vitalSigns: { heartRate: 108, systolic: 152, diastolic: 94, respiratoryRate: 22, oxygenSaturation: 93, temperature: 36.8, glasgow: 15 } } : {}) }] };
    }
    if (p === '/ambulancia/bitacora') {
      const text = fold(q.get('q') ?? ''), min = Number(q.get('minResponseMinutes') ?? 0);
      return this.log.filter(r => (!text || fold(`${r.origin} ${r.destination} ${r.municipality} ${r.patientRef ?? ''} ${r.crew.map(c => c.name).join(' ')}`).includes(text))
        && (!q.get('type') || r.type === q.get('type')) && (!q.get('finalState') || r.finalState === q.get('finalState')) && (!q.get('priority') || r.priority === q.get('priority'))
        && (!q.get('municipality') || r.municipality === q.get('municipality')) && (!min || (r.responseMinutes ?? 0) >= min)
        && (!q.get('from') || r.dispatchedAt.slice(0, 10) >= q.get('from')!) && (!q.get('to') || r.dispatchedAt.slice(0, 10) <= q.get('to')!));
    }
    return undefined;
  }

  write(path: string, d: Record<string, any>): unknown {
    const parts = path.split('/');
    if (path === '/ambulancia/servicios') {
      if (this.unit.state !== 'disponible') throw new ApiError('La ambulancia ya fue despachada.', 409, 'ambulancia_ya_despachada');
      this.bumpUnit(d);
      const request = this.requests.find(r => r.id === d.requestId);
      this.requests = this.requests.filter(r => r.id !== d.requestId);
      this.active = { id: this.nextId(), type: d.type, priority: d.priority, origin: request?.address ?? d.origin, destination: d.destination, municipality: d.municipality ?? request?.municipality ?? null, dispatchedAt: new Date().toISOString(), version: 1, requestId: request?.id ?? null, hasPrehospital: false, crew: crewPool.filter(c => (d.crew as string[]).includes(c.staffId)), milestones: [], nextMilestones: ['salida'], lastLocation: null };
      Object.assign(this.unit, { state: 'en_servicio', stateSince: new Date().toISOString() });
      return { id: this.active.id, version: 1 };
    }
    if (path === '/ambulancia/solicitudes') {
      const r = { id: this.nextId(), channel: 'telefono', address: d.address, municipality: d.municipality ?? null, latitude: null, longitude: null, reason: d.reason, contactPhone: d.contactPhone, createdAt: new Date().toISOString(), version: 1, registeredPatient: false, requesterName: null, callerName: d.callerName ?? null, patientRecord: null };
      this.requests.push(r);
      return { id: r.id, version: 1 };
    }
    if (parts[1] === 'ambulancia' && parts[2] === 'solicitudes' && parts[4] === 'descartar') { this.requests = this.requests.filter(r => r.id !== parts[3]); return { id: parts[3], version: 2 }; }
    if (path === '/ambulancia/mantenimiento') {
      this.bumpUnit(d);
      Object.assign(this.unit, { state: d.inMaintenance ? 'en_mantenimiento' : 'disponible', stateReason: d.inMaintenance ? d.reason : null, stateSince: new Date().toISOString() });
      return { id: this.unit.id, version: this.unit.version, state: this.unit.state };
    }
    if (parts[1] === 'ambulancia' && parts[2] === 'servicios' && parts[4] === 'cerrar') {
      if (!this.active || this.active.id !== parts[3]) throw new ApiError('No se encontró el servicio activo.', 404);
      const s = this.active;
      this.log.unshift({ id: s.id, type: s.type, priority: s.priority, origin: s.origin, destination: s.destination, municipality: s.municipality ?? null, dispatchedAt: s.dispatchedAt, finishedAt: new Date().toISOString(), finalState: 'completado', responseMinutes: 16, crew: s.crew.map(({ staffId, role, name }) => ({ staffId, role, name })), milestones: s.milestones ?? [], patientRef: null, administrativeClose: true });
      this.active = null;
      Object.assign(this.unit, { state: 'disponible', stateSince: new Date().toISOString(), version: this.unit.version + 1 });
      return { id: s.id, version: (s.version ?? 1) + 1 };
    }
    return undefined;
  }
}
