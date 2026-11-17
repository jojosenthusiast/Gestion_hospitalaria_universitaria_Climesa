/**
 * Design data for the laboratory journeys: the worklist (/laboratorio/ordenes) in every stage, the exam catalog
 * (/catalogo/examenes and /laboratorio/catalogo), the doctor's results to review, reception's follow-up proposals and the
 * patient's own results. Fictitious and in memory; `request` and `write` return `undefined` for paths they do not serve.
 */
import { ApiError } from '../../lib/api';
import { ago, fixtureUuid, STAFF, type FixturePatient } from './people';

const uuid = (n: number) => fixtureUuid('a001', n);

type Range = { id?: string; sex: string; ageFrom: number; ageTo: number | null; min: number | null; max: number | null; criticalLow: number | null; criticalHigh: number | null; validFrom?: string; source: string };
type Exam = { id: string; code: string; name: string; isPanel: boolean; unit: string | null; resultType: string; active: boolean; version: number; hasResults: boolean; components: { id: string; code: string; name: string }[]; ranges: Range[] };
type Result = { value?: number | null; text?: string | null; mark: string; version: number; observation?: string | null; relevant?: boolean };
type Item = { id: string; code: string; name: string; unit?: string | null; resultType?: string; result?: Result | null };
type Attachment = { id: string; fileName: string; mimeType: string; sizeBytes: number; stored: boolean; note?: string | null; uploadedAt: string; uploadedByName?: string | null };
type Order = {
  id: string; patientId: string; patientName: string; patientRecord: string; patientSex: string; patientAge: number; doctorName: string;
  priority: string; state: string; version: number; createdAt: string; sampleTakenAt: string | null; completedAt: string | null; reviewedAt: string | null; amendedAt: string | null;
  items: Item[]; external: boolean; externalPlace: string | null; externalInstructions: string | null; attachments: Attachment[];
};

const range = (min: number, max: number, criticalLow: number | null = null, criticalHigh: number | null = null): Range[] => [{ id: undefined, sex: 'todos', ageFrom: 18, ageTo: null, min, max, criticalLow, criticalHigh, validFrom: '2026-01-01', source: 'Referencia del laboratorio (ficticia)' }];
const EXAMS: Omit<Exam, 'id' | 'active' | 'version' | 'hasResults' | 'components'>[] = [
  { code: 'GLU', name: 'Glucosa en ayunas', isPanel: false, unit: 'mg/dL', resultType: 'numerico', ranges: range(70, 100, 40, 400) },
  { code: 'CRE', name: 'Creatinina sérica', isPanel: false, unit: 'mg/dL', resultType: 'numerico', ranges: range(0.6, 1.2, null, 5) },
  { code: 'COL', name: 'Colesterol total', isPanel: false, unit: 'mg/dL', resultType: 'numerico', ranges: range(0, 200) },
  { code: 'TRI', name: 'Triglicéridos', isPanel: false, unit: 'mg/dL', resultType: 'numerico', ranges: range(0, 150) },
  { code: 'HB', name: 'Hemoglobina', isPanel: false, unit: 'g/dL', resultType: 'numerico', ranges: range(12, 16, 7, 20) },
  { code: 'LEU', name: 'Leucocitos', isPanel: false, unit: 'x10³/µL', resultType: 'numerico', ranges: range(4.5, 11, 2, 30) },
  { code: 'PLT', name: 'Plaquetas', isPanel: false, unit: 'x10³/µL', resultType: 'numerico', ranges: range(150, 450, 50, 1000) },
  { code: 'HBA1C', name: 'Hemoglobina glicosilada', isPanel: false, unit: '%', resultType: 'numerico', ranges: range(4, 5.6) },
  { code: 'TSH', name: 'Hormona estimulante de tiroides', isPanel: false, unit: 'µUI/mL', resultType: 'numerico', ranges: range(0.4, 4) },
  { code: 'AU', name: 'Ácido úrico', isPanel: false, unit: 'mg/dL', resultType: 'numerico', ranges: range(3.4, 7) },
  { code: 'EGO', name: 'Examen general de orina', isPanel: false, unit: null, resultType: 'texto', ranges: [] },
  { code: 'HCG', name: 'Prueba de embarazo en sangre', isPanel: false, unit: null, resultType: 'texto', ranges: [] },
  { code: 'HEM', name: 'Hemograma completo', isPanel: true, unit: null, resultType: 'numerico', ranges: [] },
  { code: 'PL', name: 'Perfil lipídico', isPanel: true, unit: null, resultType: 'numerico', ranges: [] },
];
const PANELS: Record<string, string[]> = { HEM: ['HB', 'LEU', 'PLT'], PL: ['COL', 'TRI'] };
const ORDER_SETS = [['GLU', 'CRE'], ['HB', 'LEU', 'PLT'], ['COL', 'TRI', 'GLU'], ['HBA1C'], ['TSH'], ['EGO'], ['AU', 'CRE'], ['HCG'], ['GLU', 'HBA1C', 'CRE', 'COL']];
/** Value per exam, scaled: normal most of the time, a few out of range and one critical. */
const SAMPLE: Record<string, number[]> = { GLU: [92, 118, 87, 431], CRE: [0.9, 1.4, 1.1, 0.8], COL: [182, 236, 199, 210], TRI: [130, 188, 96, 149], HB: [13.4, 10.8, 14.9, 6.5], LEU: [7.2, 12.6, 5.1, 8.8], PLT: [240, 310, 120, 198], HBA1C: [5.2, 7.9, 5.5, 6.1], TSH: [2.1, 5.8, 0.9, 1.7], AU: [5.1, 7.8, 4.2, 6.6] };
const TEXT: Record<string, string> = { EGO: 'Aspecto claro, pH 6.0, sin leucocitos ni nitritos.', HCG: 'Negativo' };

export class LabFixtures {
  private seq = 500000;
  private readonly exams: Exam[] = EXAMS.map((e, i) => ({ ...e, id: uuid(10 + i), active: true, version: 1, hasResults: i % 3 !== 2, components: [] }));
  private orders: Order[] = [];
  private proposals: Record<string, unknown>[] = [];
  private pending: Record<string, unknown>[] = [];

  constructor(private readonly role: string, private readonly patients: FixturePatient[]) {
    for (const exam of this.exams) if (PANELS[exam.code]) exam.components = PANELS[exam.code].map(code => { const c = this.exam(code)!; return { id: c.id, code: c.code, name: c.name }; });
    // 42 orders spread over the stages the worklist groups: in process, to sample, external, to review, released, cancelled.
    const stages = ['pendiente', 'pendiente', 'en_proceso', 'en_proceso', 'completado', 'completado', 'liberada', 'pendiente', 'en_proceso', 'liberada', 'cancelado', 'externa', 'completado', 'liberada'];
    for (let i = 0; i < 42; i++) {
      const patient = this.patients[(i * 7 + 3) % this.patients.length], stage = stages[i % stages.length], created = (i * 23) % 480 + 5;
      const items: Item[] = ORDER_SETS[i % ORDER_SETS.length].map((code, k) => { const e = this.exam(code)!; return { id: uuid(2000 + i * 10 + k), code: e.code, name: e.name, unit: e.unit, resultType: e.resultType, result: null }; });
      const done = stage === 'completado' || stage === 'liberada';
      if (done || stage === 'en_proceso') items.forEach((item, k) => { if (done || k < items.length - 1) item.result = this.result(item.code, (i + k) % 4, i % 9 === 4 && k === 0 ? 'Muestra levemente hemolizada; se recomienda repetir si el cuadro no concuerda.' : null); });
      this.orders.push({
        id: uuid(1000 + i), patientId: patient.id, patientName: patient.fullName, patientRecord: patient.record, patientSex: patient.sex, patientAge: 2026 - Number(patient.birth.slice(0, 4)), doctorName: STAFF.doctors[i % STAFF.doctors.length],
        priority: i % 5 === 1 ? 'urgente' : 'rutina', state: stage === 'liberada' ? 'completado' : stage === 'externa' ? 'pendiente' : stage, version: 1,
        createdAt: ago(created), sampleTakenAt: stage === 'pendiente' || stage === 'externa' || stage === 'cancelado' ? null : ago(created - 4), completedAt: done ? ago(Math.max(1, created - 40)) : null,
        reviewedAt: stage === 'liberada' ? ago(Math.max(1, created - 60)) : null, amendedAt: null, items,
        external: stage === 'externa', externalPlace: stage === 'externa' ? 'Laboratorio de referencia Ejemplo, San Salvador' : null, externalInstructions: stage === 'externa' ? 'Enviar en tubo rojo refrigerado; resultado en 48 horas.' : null, attachments: [],
      });
    }
    // Pending items for the home trays: the doctor reviews results, reception books the follow-up appointment.
    this.pending = this.orders.filter(o => o.state === 'completado' && !o.reviewedAt).slice(0, 5).map((o, i) => ({ id: uuid(3000 + i), orderId: o.id, patientId: o.patientId, patientName: o.patientName, patientRecord: o.patientRecord, reason: i % 2 ? 'valor_critico' : 'resultado_listo', detail: i % 2 ? `${o.items[0].name} fuera de los valores críticos` : `${o.items.length} resultados listos para revisar`, createdAt: o.completedAt!, version: 1 }));
    this.proposals = this.orders.filter(o => o.reviewedAt).slice(0, 4).map((o, i) => ({ id: uuid(3100 + i), orderId: o.id, patientId: o.patientId, patientName: o.patientName, patientRecord: o.patientRecord, doctorId: fixtureUuid('9000', 100 + i), doctorName: STAFF.doctors[i % STAFF.doctors.length], priority: i === 0 ? 'urgente' : 'rutina', resultsAt: o.reviewedAt!, createdAt: o.reviewedAt!, version: 1 }));
  }

  private nextId() { return uuid(++this.seq); }
  private exam(code: string) { return this.exams.find(e => e.code === code); }
  private mark(code: string, value: number) {
    const r = this.exam(code)?.ranges[0];
    if (!r) return 'normal';
    if (r.criticalHigh !== null && value >= r.criticalHigh) return 'critico_alto';
    if (r.criticalLow !== null && value <= r.criticalLow) return 'critico_bajo';
    return r.max !== null && value > r.max ? 'alto' : r.min !== null && value < r.min ? 'bajo' : 'normal';
  }
  private result(code: string, variant: number, observation: string | null): Result {
    if (TEXT[code]) return { text: TEXT[code], mark: 'normal', version: 1, observation, relevant: !!observation };
    const value = SAMPLE[code]?.[variant] ?? 1;
    return { value, mark: this.mark(code, value), version: 1, observation, relevant: !!observation };
  }
  private view(o: Order) {
    const captured = o.items.every(item => item.result);
    const doctor = this.role === 'MED';
    const allowed = o.state === 'pendiente' ? (o.external ? ['cancelar'] : doctor ? ['cancelar'] : ['tomar_muestra', 'cancelar'])
      : o.state === 'en_proceso' ? (doctor ? [] : ['capturar', ...(captured ? ['completar'] : []), 'cancelar'])
      : o.state === 'completado' ? (doctor && !o.reviewedAt ? ['revisar'] : doctor ? [] : ['enmendar']) : [];
    const external = this.role === 'LAB' && o.state === 'pendiente' ? (o.external ? ['cargar_externo'] : ['enviar_externo']) : [];
    const { attachments: _attachments, ...rest } = o;
    // R7 C-3: the lab and the doctor see the patient's range next to each value.
    const items = this.role === 'PAC' ? rest.items : rest.items.map(item => { const r = this.exam(item.code)?.ranges[0]; return { ...item, referenceRange: r ? { min: r.min, max: r.max, criticalLow: r.criticalLow, criticalHigh: r.criticalHigh } : null }; });
    return { ...rest, items, allowedActions: allowed, externalActions: external };
  }
  private order(id: string) {
    const o = this.orders.find(x => x.id === id);
    if (!o) throw new ApiError('No se encontró la orden.', 404);
    return o;
  }
  private bump(o: Order, d: Record<string, any>) {
    if (d.version !== undefined && d.version !== o.version) throw new ApiError('La orden cambió mientras la tenías abierta.', 409, 'version_conflicto', o.version);
    o.version++;
    return { id: o.id, version: o.version, state: o.state };
  }

  request(path: string): unknown {
    const url = new URL(path, 'https://fixture.invalid'), p = url.pathname;
    if (p === '/laboratorio/ordenes') return [...this.orders].sort((a, b) => (a.priority === 'urgente' ? 0 : 1) - (b.priority === 'urgente' ? 0 : 1) || a.createdAt.localeCompare(b.createdAt)).map(o => this.view(o));
    if (/^\/laboratorio\/ordenes\/[^/]+$/.test(p)) { const o = this.order(p.split('/')[3]); return { ...this.view(o), attachments: o.attachments }; }
    if (p === '/me/laboratorio') { const own = this.patients[0]; return this.orders.filter(o => o.reviewedAt).slice(0, 4).map(o => ({ ...this.view(o), patientId: own.id, patientName: own.fullName, patientRecord: own.record, allowedActions: [] })); }
    if (p === '/laboratorio/catalogo') return this.exams.filter(e => e.active).map(e => ({ id: e.id, code: e.code, name: e.name, isPanel: e.isPanel, unit: e.unit, resultType: e.resultType }));
    if (p === '/catalogo/examenes') return this.exams;
    if (p === '/laboratorio/seguimientos') return this.proposals;
    if (p === '/laboratorio/pendientes') return this.pending.map(row => {
      // R7 C-4: the tray brings the order's version, whether it can be released, and the key values (critical first).
      const o = this.orders.find(x => x.id === row.orderId)!;
      const values = o.items.filter(i => i.result).map(i => ({ code: i.code, name: i.name, unit: i.unit, value: i.result!.value ?? null, text: i.result!.text ?? null, mark: i.result!.mark }))
        .sort((a, b) => Number(b.mark.startsWith('critico')) - Number(a.mark.startsWith('critico')));
      return { ...row, orderVersion: o.version, orderActions: this.role === 'MED' && !o.reviewedAt ? ['revisar'] : [], values };
    });
    if (/^\/laboratorio\/adjuntos\/[^/]+\/enlace$/.test(p)) return { url: 'about:blank', expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(), expiresInSeconds: 300, fileName: 'informe-externo-ejemplo.pdf', mimeType: 'application/pdf', sizeBytes: 182_000 };
    return undefined;
  }

  write(path: string, d: Record<string, any>): unknown {
    const parts = path.split('/');
    if (path === '/laboratorio/ordenes') {
      const patient = this.patients[5], items = (d.exams as string[] ?? []).map((id) => { const e = this.exams.find(x => x.id === id) ?? this.exams[0]; return { id: this.nextId(), code: e.code, name: e.name, unit: e.unit, resultType: e.resultType, result: null }; });
      const o: Order = { id: this.nextId(), patientId: patient.id, patientName: patient.fullName, patientRecord: patient.record, patientSex: patient.sex, patientAge: 2026 - Number(patient.birth.slice(0, 4)), doctorName: STAFF.doctors[0], priority: d.priority ?? 'rutina', state: 'pendiente', version: 1, createdAt: new Date().toISOString(), sampleTakenAt: null, completedAt: null, reviewedAt: null, amendedAt: null, items, external: false, externalPlace: null, externalInstructions: null, attachments: [] };
      this.orders.push(o);
      return { id: o.id, version: 1, state: o.state };
    }
    if (parts[1] === 'laboratorio' && parts[2] === 'ordenes' && parts[3]) {
      const o = this.order(parts[3]), verb = parts[4], now = new Date().toISOString();
      if (verb === 'resultados' && parts[5] === 'lote') {
        // R7 C-1: the whole sheet in one step, optionally completing the order.
        for (const entry of d.items as Record<string, any>[]) {
          const item = o.items.find(x => x.id === entry.orderItemId);
          if (!item) throw new ApiError('No se encontró el examen de la orden.', 404);
          item.result = { ...(typeof entry.value === 'number' ? { value: entry.value } : { text: entry.text }), mark: typeof entry.value === 'number' ? this.mark(item.code, entry.value) : 'normal', version: (item.result?.version ?? 0) + 1, observation: entry.observation ?? null, relevant: entry.relevant ?? false };
        }
        if (d.complete) Object.assign(o, { state: 'completado', completedAt: now });
        const saved = this.bump(o, d);
        const results = o.items.filter(i => i.result).map(i => ({ orderItemId: i.id, mark: i.result!.mark, version: i.result!.version }));
        return { id: o.id, state: o.state, orderVersion: saved.version, results, criticalCount: results.filter(r => r.mark.startsWith('critico')).length, completedAt: o.completedAt };
      }
      if (verb === 'revisar') {
        // R7 C-2: releasing closes the order's pending items too.
        const closed = this.pending.filter(x => x.orderId === o.id).length;
        this.pending = this.pending.filter(x => x.orderId !== o.id);
        Object.assign(o, { reviewedAt: now });
        return { ...this.bump(o, d), reviewedAt: now, followUpsClosed: closed, followUpProposalId: d.followUp === false ? null : this.nextId() };
      }
      if (verb === 'resultados' || verb === 'enmendar') {
        const item = o.items.find(x => x.id === d.orderItemId);
        if (!item) throw new ApiError('No se encontró el examen de la orden.', 404);
        item.result = { ...(typeof d.value === 'number' ? { value: d.value } : { text: d.text }), mark: typeof d.value === 'number' ? this.mark(item.code, d.value) : 'normal', version: (item.result?.version ?? 0) + 1, observation: d.observation ?? item.result?.observation ?? null, relevant: d.relevant ?? item.result?.relevant ?? false };
        if (verb === 'enmendar') o.amendedAt = now;
        return this.bump(o, d);
      }
      const next: Record<string, Partial<Order>> = {
        muestra: { state: 'en_proceso', sampleTakenAt: now }, completar: { state: 'completado', completedAt: now }, revisar: { reviewedAt: now }, cancelar: { state: 'cancelado' },
        externa: { external: true, externalPlace: d.place ?? null, externalInstructions: d.instructions ?? null },
        'resultado-externo': { state: 'completado', completedAt: now, sampleTakenAt: o.sampleTakenAt ?? now },
      };
      if (verb === 'resultado-externo') {
        const attachment: Attachment = { id: this.nextId(), fileName: d.fileName ?? 'informe-externo-ejemplo.pdf', mimeType: d.mimeType ?? 'application/pdf', sizeBytes: d.sizeBytes ?? 182_000, stored: true, note: d.note ?? null, uploadedAt: now, uploadedByName: STAFF.lab[0] };
        o.attachments.push(attachment);
        o.items.forEach(item => { item.result ??= { text: 'Ver informe adjunto del laboratorio externo.', mark: 'normal', version: 1 }; });
        Object.assign(o, next[verb]);
        return { ...this.bump(o, d), attachmentId: attachment.id };
      }
      Object.assign(o, next[verb] ?? {});
      // R7 C-6: the fixture patient has the app, so the notice reaches them.
      if (verb === 'externa') return { ...this.bump(o, d), patientNotified: true };
      return this.bump(o, d);
    }
    // R7 C-5: an exam done elsewhere without a prior order; the API ties it to the latest consultation.
    if (parts[1] === 'laboratorio' && parts[2] === 'pacientes' && parts[4] === 'resultado-externo') return { id: this.nextId(), version: 3, state: 'completado', attachmentId: this.nextId(), consultationId: this.nextId() };
    if (parts[1] === 'laboratorio' && parts[2] === 'seguimientos' && parts[3]) { this.proposals = this.proposals.filter(x => x.id !== parts[3]); return { id: parts[3], version: 2 }; }
    if (parts[1] === 'laboratorio' && parts[2] === 'pendientes' && parts[3]) { this.pending = this.pending.filter(x => x.id !== parts[3]); return { id: parts[3], version: 2 }; }
    if (parts[1] === 'catalogo' && parts[2] === 'examenes' && parts[3]) {
      const e = this.exams.find(x => x.id === parts[3]);
      if (!e) throw new ApiError('No se encontró el examen.', 404);
      if (d.version !== undefined && d.version !== e.version) throw new ApiError('El examen cambió mientras lo tenías abierto.', 409, 'version_conflicto', e.version);
      Object.assign(e, { ...d, ranges: d.ranges ?? e.ranges, version: e.version + 1 });
      return e;
    }
    return undefined;
  }
}
