import { LabMark } from './laboratory.dto';

export type ReferenceRange = {
  minimo: string | number | null;
  maximo: string | number | null;
  critico_bajo: string | number | null;
  critico_alto: string | number | null;
};

export function classifyLabValue(value: number | undefined, range?: ReferenceRange): LabMark {
  if (value === undefined || !range) return LabMark.NO_RANGE;
  if (range.critico_bajo !== null && value < Number(range.critico_bajo)) return LabMark.CRITICAL_LOW;
  if (range.critico_alto !== null && value > Number(range.critico_alto)) return LabMark.CRITICAL_HIGH;
  if (range.minimo !== null && value < Number(range.minimo)) return LabMark.LOW;
  if (range.maximo !== null && value > Number(range.maximo)) return LabMark.HIGH;
  return LabMark.NORMAL;
}

export function normalizePatientName(value: string) {
  return value.trim().toLocaleLowerCase('es-SV').replace(/\s+/g, ' ');
}

export function matchesDoubleIdentification(identity: { expediente: string; fullName: string }, expediente: string, nombreCompleto: string) {
  return expediente.trim() === identity.expediente && normalizePatientName(nombreCompleto) === normalizePatientName(identity.fullName);
}

/** Actions a reader may take on a lab order now (`allowedActions`); clients draw their buttons only from this list. */
export const LAB_ORDER_ACTIONS = ['tomar_muestra', 'capturar', 'completar', 'revisar', 'cancelar', 'enmendar'] as const;
export type LabOrderAction = typeof LAB_ORDER_ACTIONS[number];

export type LabActionInput = {
  state: string;
  reviewed: boolean;
  allCaptured: boolean;
  /** The reader may review this order (laboratorio.puede_revisar: requester, attending doctor, care relationship or on-duty substitute). */
  reviewer: boolean;
  /** The reader is the doctor who ordered it. */
  own: boolean;
  /** S10: the order is done elsewhere; nobody takes a sample here. */
  external?: boolean;
};

export type LabPermissions = { process: boolean; validate: boolean; review: boolean; cancelAny: boolean; cancelOwn: boolean };

export function labOrderActions(order: LabActionInput, can: LabPermissions): LabOrderAction[] {
  const open = order.state === 'pendiente' || order.state === 'en_proceso';
  const actions: LabOrderAction[] = [];
  if (can.process && order.state === 'pendiente' && !order.external) actions.push('tomar_muestra');
  if (can.process && order.state === 'en_proceso') actions.push('capturar');
  if (can.validate && order.state === 'en_proceso' && order.allCaptured) actions.push('completar');
  if (can.review && order.reviewer && order.state === 'completado' && !order.reviewed) actions.push('revisar');
  if (open && (can.cancelAny || (can.cancelOwn && order.own))) actions.push('cancelar');
  if (can.validate && order.state === 'completado') actions.push('enmendar');
  return actions;
}

export type RangeInput = { sex: string; ageFrom: number; ageTo?: number | null; min?: number | null; max?: number | null; criticalLow?: number | null; criticalHigh?: number | null };

/** W10: a reference range set is coherent before it reaches the exclusion constraint (message in Spanish, or null). */
export function rangeProblem(ranges: RangeInput[]): string | null {
  const has = (value?: number | null): value is number => value !== undefined && value !== null;
  for (const r of ranges) {
    if (has(r.ageTo) && r.ageTo <= r.ageFrom) return 'La edad final de un rango debe ser mayor que la inicial.';
    if (!has(r.min) && !has(r.max) && !has(r.criticalLow) && !has(r.criticalHigh)) return 'Cada rango necesita al menos un límite.';
    if (has(r.min) && has(r.max) && r.min > r.max) return 'El mínimo de un rango no puede ser mayor que el máximo.';
    if (has(r.criticalLow) && has(r.min) && r.criticalLow > r.min) return 'El valor crítico bajo no puede ser mayor que el mínimo normal.';
    if (has(r.criticalHigh) && has(r.max) && r.criticalHigh < r.max) return 'El valor crítico alto no puede ser menor que el máximo normal.';
  }
  const end = (r: RangeInput) => (has(r.ageTo) ? r.ageTo : Infinity);
  for (let i = 0; i < ranges.length; i++) for (let j = i + 1; j < ranges.length; j++) {
    const [a, b] = [ranges[i], ranges[j]];
    if (a.sex === b.sex && a.ageFrom < end(b) && b.ageFrom < end(a)) return 'Dos rangos del mismo sexo se traslapan en edad.';
  }
  return null;
}

/**
 * S10: actions on the external path of an order, apart from `allowedActions` so clients that do not know them keep
 * decoding the list. `enviar_externo`: a pending order is done elsewhere (lab, or the doctor who ordered it).
 * `cargar_externo`: the result of an external order comes in with its attachment and key values (lab, or a doctor who may
 * review it).
 */
export const LAB_EXTERNAL_ACTIONS = ['enviar_externo', 'cargar_externo'] as const;
export type LabExternalAction = typeof LAB_EXTERNAL_ACTIONS[number];

export function labExternalActions(order: { state: string; external: boolean; own: boolean; reviewer: boolean }, can: LabPermissions & { order: boolean }): LabExternalAction[] {
  if (order.state !== 'pendiente') return [];
  if (!order.external) return can.process || (can.order && order.own) ? ['enviar_externo'] : [];
  return can.process || (can.review && order.reviewer) ? ['cargar_externo'] : [];
}

/**
 * S10: a result opens a follow-up item in the requesting doctor's "Resultados por revisar" when its mark is critical
 * (critical wins) or the lab flagged its observation as relevant. Anything else needs no item.
 */
export type FollowUpReason = 'critico' | 'observacion';
export function followUpReason(mark: string, relevant: boolean): FollowUpReason | null {
  if (mark.startsWith('critico_')) return 'critico';
  return relevant ? 'observacion' : null;
}

/** S10: an appointment confirms a follow-up proposal only if it is for the same patient and doctor and still active. */
export function appointmentMatchesProposal(appointment: { patientId: string; doctorId: string; state: string }, proposal: { patientId: string; doctorId: string }) {
  return appointment.patientId === proposal.patientId && appointment.doctorId === proposal.doctorId && ['solicitada', 'confirmada'].includes(appointment.state);
}

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);
/**
 * T07b (S10): the attachment type read from the first bytes of the file (magic bytes), never from the name or the
 * declared Content-Type. Only PDF, JPEG, PNG, HEIC/HEIF and WEBP pass; anything else is null.
 */
export function detectAttachmentType(content: Uint8Array): 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/heic' | 'image/webp' | null {
  const ascii = (from: number, to: number) => Buffer.from(content.subarray(from, to)).toString('latin1');
  if (content.length >= 5 && ascii(0, 5) === '%PDF-') return 'application/pdf';
  if (content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff) return 'image/jpeg';
  if (content.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, i) => content[i] === byte)) return 'image/png';
  if (content.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (content.length >= 12 && ascii(4, 8) === 'ftyp' && HEIF_BRANDS.has(ascii(8, 12))) return 'image/heic';
  return null;
}
