/** Reglas del ingreso guiado. La API vuelve a comprobar todo al confirmar; aquí solo guiamos a la persona. */
export type Category = 'vip' | 'semiprivada';
export type OriginKind = 'cita' | 'emergencia' | 'ambulancia' | 'consulta';

export const MOTIVE_MIN = 10;
export const MOTIVE_MAX = 500;
/** Supuesto (docs/preguntas-abiertas.md): acompañantes por paciente según la categoría. */
export const VISITOR_LIMIT: Record<Category, number> = { semiprivada: 1, vip: 3 };

export const originNames: Record<OriginKind, string> = { cita: 'Cita', emergencia: 'Emergencia', ambulancia: 'Ambulancia', consulta: 'Consulta' };
export const categoryNames: Record<Category, string> = { semiprivada: 'Semiprivada', vip: 'VIP' };
export const isolationNames = { contacto: 'Por contacto', gotitas: 'Por gotitas', aerea: 'Aérea', protector: 'Protector (inmunosuprimido)' } as const;
export type IsolationType = keyof typeof isolationNames;

export type PickItem = { id: string; label: string };
export type DoctorPick = PickItem & { available: boolean; reason: string | null };
export type OriginRecord = { id: string; origin: OriginKind; at: string; label: string; detail: string };
export type BedPick = { id: string; version: number; code: string; roomId: string; room: string; floor: number | null; category: Category; capacity: number; state: string; occupiedInRoom: number; compatible: boolean; reason: string | null; suggested: boolean };
export type CategoryCount = { category: Category; free: number; compatible: number };
export type Check = { code: string; ok: boolean; message: string };

export type AdmissionForm = {
  patient: PickItem | null;
  origin: OriginKind | null;
  originRecord: OriginRecord | null;
  motive: string;
  /** `datetime-local` en hora de El Salvador. */
  at: string;
  doctor: DoctorPick | null;
  category: Category | null;
  isolation: boolean;
  isolationType: IsolationType | '';
  unstable: boolean;
  postSurgical: boolean;
  bed: BedPick | null;
  visitorsAllowed: boolean;
  visitorsMax: number;
  feasible: boolean;
};

export const initialForm = (at: string): AdmissionForm => ({ patient: null, origin: null, originRecord: null, motive: '', at, doctor: null, category: null, isolation: false, isolationType: '', unstable: false, postSurgical: false, bed: null, visitorsAllowed: true, visitorsMax: 1, feasible: false });

export const stepTitles = ['Paciente', 'Origen y motivo', 'Fecha y médico', 'Categoría', 'Requisitos clínicos', 'Cama', 'Visitas', 'Resumen'] as const;
export const LAST_STEP = stepTitles.length - 1;

/** Instante local de El Salvador (UTC-6, sin horario de verano) desde un `datetime-local`. */
export const salvadorInstant = (local: string) => `${local.length === 16 ? `${local}:00` : local}-06:00`;
/** Hora actual de El Salvador con el formato de `datetime-local`. */
export const salvadorNow = (now = new Date()) => new Date(now.getTime() - 6 * 3_600_000).toISOString().slice(0, 16);
/** El ingreso es inmediato salvo que se pida más de 15 minutos adelante (la cama se asigna al llegar). */
export const isImmediate = (local: string, now = new Date()) => new Date(salvadorInstant(local)).getTime() <= now.getTime() + 15 * 60_000;

export function visitorError(allowed: boolean, max: number, category: Category | null): string | null {
  if (!allowed) return max === 0 ? null : 'Sin visitas, el número de acompañantes debe ser 0.';
  if (!Number.isInteger(max) || max < 1) return 'Indica al menos 1 acompañante.';
  const limit = category ? VISITOR_LIMIT[category] : 4;
  if (max > limit) return `La categoría ${category ? categoryNames[category] : ''} admite hasta ${limit} acompañante${limit === 1 ? '' : 's'}.`;
  return null;
}

/** Mensaje de lo que falta para salir del paso `step`, o `null` si puede avanzar. `canAssignBed`: tiene `camas.asignar`. */
export function stepError(step: number, form: AdmissionForm, canAssignBed: boolean, now = new Date()): string | null {
  switch (step) {
    case 0: return form.patient ? null : 'Elige al paciente.';
    case 1:
      if (!form.origin) return 'Elige el origen del ingreso.';
      if (!form.originRecord) return 'Elige el registro de origen del paciente.';
      if (form.motive.trim().length < MOTIVE_MIN) return `Escribe el motivo del ingreso, de al menos ${MOTIVE_MIN} caracteres.`;
      return null;
    case 2:
      if (!form.at || Number.isNaN(new Date(salvadorInstant(form.at)).getTime())) return 'Indica la fecha y la hora del ingreso.';
      if (!form.doctor) return 'Elige al médico tratante.';
      return form.doctor.available ? null : `El médico elegido no está disponible: ${form.doctor.reason ?? 'sin turno'}.`;
    case 3: return form.category ? null : 'Elige la categoría de habitación.';
    case 4: return form.isolationType && !form.isolation ? 'El tipo de aislamiento necesita que el aislamiento esté marcado.' : null;
    case 5:
      if (!canAssignBed || !isImmediate(form.at, now)) return null;
      return form.bed ? null : 'Elige una cama compatible.';
    case 6: return visitorError(form.visitorsAllowed, form.visitorsMax, form.category);
    case 7: return form.feasible ? null : 'Hay condiciones que impiden confirmar el ingreso.';
    default: return null;
  }
}

export function admissionBody(form: AdmissionForm, canAssignBed: boolean, now = new Date()) {
  const immediateBed = canAssignBed && isImmediate(form.at, now) && form.bed;
  return {
    patientId: form.patient!.id, origin: form.origin!, originId: form.originRecord!.id, motive: form.motive.trim(),
    requestedCategory: form.category!, isolation: form.isolation, ...(form.isolation && form.isolationType ? { isolationType: form.isolationType } : {}),
    unstable: form.unstable, postSurgical: form.postSurgical, attendingDoctorId: form.doctor!.id, scheduledAt: salvadorInstant(form.at),
    visitorsAllowed: form.visitorsAllowed, visitorsMax: form.visitorsAllowed ? form.visitorsMax : 0,
    ...(immediateBed ? { bedId: immediateBed.id, bedVersion: immediateBed.version } : {}),
  };
}

export function feasibilityQuery(form: AdmissionForm, canAssignBed: boolean, now = new Date()) {
  const params = new URLSearchParams({ patientId: form.patient!.id, origin: form.origin!, originId: form.originRecord!.id, doctorId: form.doctor!.id, at: salvadorInstant(form.at), category: form.category!, isolation: String(form.isolation), visitorsAllowed: String(form.visitorsAllowed), visitorsMax: String(form.visitorsAllowed ? form.visitorsMax : 0) });
  if (canAssignBed && isImmediate(form.at, now) && form.bed) params.set('bedId', form.bed.id);
  return params.toString();
}

/** Plantas -> habitaciones -> camas, en el orden del edificio. */
export function groupBeds(beds: BedPick[]) {
  const floors = new Map<number | null, Map<string, { id: string; name: string; capacity: number; beds: BedPick[] }>>();
  for (const bed of beds) {
    const rooms = floors.get(bed.floor) ?? new Map();
    const room = rooms.get(bed.roomId) ?? { id: bed.roomId, name: bed.room, capacity: bed.capacity, beds: [] as BedPick[] };
    room.beds.push(bed);
    rooms.set(bed.roomId, room);
    floors.set(bed.floor, rooms);
  }
  return [...floors.entries()].sort(([a], [b]) => (a ?? 999) - (b ?? 999)).map(([floor, rooms]) => ({ floor, rooms: [...rooms.values()] }));
}
