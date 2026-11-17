/**
 * Design data for the doctor's office and the clinical record: today's agenda (/consultas/agenda), the open
 * consultations to sign (/consultas/sin-firmar), a consultation's detail and a patient's history
 * (/pacientes/:id/historial). Patients are the shared set. Fictitious and in memory.
 */
import { ApiError } from '../../lib/api';
import { addDays, ago, fixtureUuid, localDay, localInstant, MIN, STAFF, type FixturePatient } from './people';

const uuid = (n: number) => fixtureUuid('a005', n);
const REASONS = ['Control de presión arterial', 'Dolor de garganta y fiebre de dos días', 'Revisión de exámenes de laboratorio', 'Dolor lumbar al levantar peso', 'Control de diabetes', 'Tos persistente desde hace una semana', 'Chequeo general anual', 'Mareo al levantarse por la mañana', 'Seguimiento de tratamiento antihipertensivo', 'Erupción en la piel del brazo'];

type Visit = { appointmentId: string; patientId: string; patientName: string; start: string; end: string; reason: string | null; appointmentState: string; consultationId: string | null; consultationState: string | null; consultationReason: string | null; physicalExam: string | null; plan: string | null; version: number | null; startedAt: string | null; signedAt: string | null; ticketNumber: number | null };

export class ClinicFixtures {
  private seq = 950000;
  private agenda: Visit[];

  constructor(private readonly patients: FixturePatient[]) {
    const today = localDay();
    this.agenda = Array.from({ length: 14 }, (_, i) => {
      const patient = patients[(i * 9 + 30) % patients.length], start = localInstant(today, 8 + Math.floor(i / 2), (i % 2) * 30);
      const past = Date.parse(start) < Date.now() - 30 * MIN, state = past ? (i % 4 === 1 ? 'borrador' : 'firmada') : i === 6 ? 'borrador' : null;
      return { appointmentId: uuid(100 + i), patientId: patient.id, patientName: patient.fullName, start, end: new Date(Date.parse(start) + 30 * MIN).toISOString(), reason: REASONS[i % REASONS.length], appointmentState: state === 'firmada' ? 'atendida' : 'confirmada', consultationId: state ? uuid(200 + i) : null, consultationState: state, consultationReason: state ? REASONS[i % REASONS.length] : null, physicalExam: state ? 'Paciente alerta y orientado, mucosas hidratadas, sin dificultad respiratoria.' : null, plan: state === 'firmada' ? 'Tratamiento sintomático, control en dos semanas.' : null, version: state ? 1 : null, startedAt: state ? new Date(Date.parse(start) + 5 * MIN).toISOString() : null, signedAt: state === 'firmada' ? new Date(Date.parse(start) + 25 * MIN).toISOString() : null, ticketNumber: i === 3 ? 7 : null };
    });
  }

  private nextId() { return uuid(++this.seq); }
  private view(v: Visit) {
    const startable = !v.consultationId && v.appointmentState === 'confirmada';
    return { ...v, allowedActions: startable ? ['iniciar_consulta'] : [], blockedActions: [] };
  }
  private find(id: string) {
    const v = this.agenda.find(x => x.consultationId === id);
    if (!v) throw new ApiError('No se encontró la consulta.', 404);
    return v;
  }
  private history(patient: FixturePatient) {
    const i = this.patients.indexOf(patient), consultations = [0, 1, 2].map(k => ({
      id: uuid(3000 + i * 3 + k), state: 'firmada', startedAt: ago((k + 1) * 60 * 24 * 45), signedAt: ago((k + 1) * 60 * 24 * 45 - 30), reason: REASONS[(i + k) % REASONS.length],
      physicalExam: 'Signos vitales dentro de lo esperado. Abdomen blando, no doloroso.', plan: 'Control en un mes con exámenes de laboratorio.',
      doctor: { id: fixtureUuid('9000', 100 + k), name: STAFF.doctors[(i + k) % STAFF.doctors.length], specialty: ['Medicina general', 'Medicina interna', 'Cardiología'][k] },
      diagnoses: [{ code: ['I10', 'E11.9', 'J02.9'][k], description: ['Hipertensión esencial', 'Diabetes mellitus tipo 2 sin complicaciones', 'Faringitis aguda'][k], principal: true, note: null }],
      prescriptions: k === 2 ? [] : [{ id: uuid(4000 + i * 3 + k), issuedAt: ago((k + 1) * 60 * 24 * 45 - 20), items: [{ medication: ['Losartán 50 mg', 'Metformina 850 mg'][k], dose: '1 tableta', route: 'oral', frequency: k ? 'cada 12 horas' : 'cada 24 horas', duration: '30 días', instructions: k ? 'Tomar con los alimentos' : null }] }],
    }));
    const laboratory = [{ id: uuid(5000 + i), state: 'completado', createdAt: ago(60 * 24 * 40), reviewedAt: ago(60 * 24 * 39), items: [{ id: uuid(5500 + i), code: 'GLU', name: 'Glucosa en ayunas', unit: 'mg/dL', result: { value: 118, mark: 'alto' } }, { id: uuid(5600 + i), code: 'CRE', name: 'Creatinina sérica', unit: 'mg/dL', result: { value: 0.9, mark: 'normal' } }] }];
    const admissions = i % 3 === 0 ? [{ id: uuid(6000 + i), state: 'egresado', origin: 'emergencia', createdAt: ago(60 * 24 * 120), doctor: { id: fixtureUuid('9000', 101), name: STAFF.doctors[1] } }] : [];
    return { patient: { id: patient.id, record: patient.record, fullName: patient.fullName }, access: 'relacion' as const, consultations, laboratory, admissions };
  }

  request(path: string): unknown {
    const p = new URL(path, 'https://fixture.invalid').pathname;
    if (p === '/consultas/agenda') return this.agenda.map(v => this.view(v));
    if (p === '/consultas/sin-firmar') {
      const open = this.agenda.filter(v => v.consultationState === 'borrador').map(v => ({ id: v.consultationId!, patientId: v.patientId, patientName: v.patientName, appointmentId: v.appointmentId, ticketId: null, reason: v.consultationReason, startedAt: v.startedAt!, version: v.version! }));
      const older = this.patients[77];
      return [...open, { id: uuid(299), patientId: older.id, patientName: older.fullName, appointmentId: null, ticketId: null, reason: 'Consulta de ayer sin firmar', startedAt: localInstant(addDays(localDay(), -1), 15, 20), version: 2 }];
    }
    if (/^\/consultas\/[^/]+\/detalle$/.test(p)) {
      const id = p.split('/')[2], v = this.agenda.find(x => x.consultationId === id), older = this.patients[77];
      return { consultation: v ? { id, patientId: v.patientId, appointmentId: v.appointmentId, reason: v.consultationReason, physicalExam: v.physicalExam, plan: v.plan, state: v.consultationState!, version: v.version!, patientName: v.patientName } : { id, patientId: older.id, appointmentId: null, reason: 'Consulta de ayer sin firmar', physicalExam: null, plan: null, state: 'borrador', version: 2, patientName: older.fullName } };
    }
    if (/^\/pacientes\/[^/]+\/historial$/.test(p)) {
      const patient = this.patients.find(x => x.id === p.split('/')[2]);
      if (!patient) throw new ApiError('No se encontró al paciente.', 404);
      return this.history(patient);
    }
    return undefined;
  }

  write(path: string, d: Record<string, any>): unknown {
    const parts = path.split('/');
    if (path === '/consultas') {
      const v = this.agenda.find(x => x.appointmentId === d.appointmentId);
      const id = this.nextId();
      if (v) Object.assign(v, { consultationId: id, consultationState: 'borrador', consultationReason: d.reason ?? v.reason, version: 1, startedAt: new Date().toISOString() });
      return { id, version: 1 };
    }
    if (parts[1] !== 'consultas' || !parts[2]) return undefined;
    const v = this.agenda.find(x => x.consultationId === parts[2]);
    if (!v) return { id: parts[2], version: (d.version ?? 1) + 1 };
    if (!parts[3]) Object.assign(v, { consultationReason: d.reason ?? v.consultationReason, physicalExam: d.physicalExam ?? v.physicalExam, plan: d.plan ?? v.plan });
    if (parts[3] === 'firmar') Object.assign(this.find(parts[2]), { consultationState: 'firmada', appointmentState: 'atendida', signedAt: new Date().toISOString() });
    v.version = (v.version ?? 1) + 1;
    return { id: parts[2], version: v.version, ...(parts[3] === 'firmar' ? { nextProposal: null } : {}) };
  }
}
