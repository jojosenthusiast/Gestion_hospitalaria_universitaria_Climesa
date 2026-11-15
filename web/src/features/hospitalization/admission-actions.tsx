import { useState, type FormEvent, type ReactNode } from 'react';
import { Field } from '../../components/ui';
import { SearchPicker, type PickerItem } from '../../components/search-picker';
import { type Api } from '../../lib/api';
import { Dialog, SaveButton, WriteError, formatDateTime, useAction, useData } from '../common';
import { spanishProblem } from '../problems';

export type DischargePending = { description: string; responsible: string };
export type Admission = {
  id: string; patientId: string; patientName: string; origin: string; requestedCategory: string; state: string; isolation: boolean; bed: string; version: number;
  occupationId?: string | null; scheduledAt?: string | null; motive?: string | null; unstable?: boolean; postSurgical?: boolean; visitorsAllowed?: boolean; visitorsMax?: number;
  attendingDoctorName?: string | null; attendingDoctorHasAccount?: boolean; bedCategory?: 'vip' | 'semiprivada' | null; authorized?: boolean;
  dischargeRequestedAt?: string | null;
  discharge?: { type: string; signedAt: string; signedByName: string; pending: DischargePending[] } | null;
  /** D-02: the API decides which actions this person may run on this row; the page never infers them from role permissions. */
  allowedActions?: string[];
};
type DoctorRow = { id: string; name: string; specialty: string | null; available: boolean; reason: string | null; hasAccount?: boolean };

export const categoryNames: Record<string, string> = { vip: 'VIP', semiprivada: 'Semiprivada' };
export const dischargeTypeNames: Record<string, string> = { medica: 'Médica', voluntaria: 'Voluntaria', traslado: 'Traslado a otro centro', defuncion: 'Defunción' };
const MIN_REASON = 10;

/** «hace 5 min», «hace 3 h»; más de un día muestra la fecha. */
export function relativeTime(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'hace un momento';
  if (minutes < 60) return `hace ${minutes} min`;
  if (minutes < 1440) return `hace ${Math.floor(minutes / 60)} h`;
  return `el ${formatDateTime(iso)}`;
}

/** Contexto común de cada diálogo: paciente, cama y médico tratante. */
function Context({ admission, children }: { admission: Admission; children?: ReactNode }) {
  return <p className="form-intro">Paciente: <strong>{admission.patientName}</strong> · cama {admission.bed || 'sin cama'} · médico tratante <strong>{admission.attendingDoctorName || 'sin asignar'}</strong>.{children && <> {children}</>}</p>;
}

type DialogProps = { api: Api; admission: Admission; onClose: () => void; onSaved: () => void };

/** Acción con motivo obligatorio de 10 a 500 caracteres (cancelar, anular, revocar alta, autorizar excepción). */
export function ReasonDialog({ api, admission, onClose, onSaved, title, path, submitLabel, explanation }: DialogProps & { title: string; path: string; submitLabel: string; explanation: string }) {
  const [reason, setReason] = useState(''), action = useAction(api), valid = reason.trim().length >= MIN_REASON;
  async function save(event: FormEvent) { event.preventDefault(); if (valid && await action.run(`/admisiones/${admission.id}/${path}`, { version: admission.version, reason: reason.trim() })) onSaved(); }
  return <Dialog title={title} onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}>
    <Context admission={admission} />
    <p className="admission-action-note">{explanation}</p>
    <WriteError error={spanishProblem(action.error)} onReload={onSaved} />
    <Field label="Motivo" value={reason} onChange={setReason} required minLength={MIN_REASON} maxLength={500} hint="Al menos 10 caracteres. Queda en la auditoría." autoFocus />
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} label={submitLabel} disabled={!valid} /></div>
  </form></Dialog>;
}

/** D-02: Recepción o Jefatura no firman el alta; le avisan al médico tratante, que la firma desde la app. */
export function RequestDischargeDialog({ api, admission, onClose, onSaved }: DialogProps) {
  const [note, setNote] = useState(''), action = useAction(api);
  async function save(event: FormEvent) { event.preventDefault(); if (await action.run(`/admisiones/${admission.id}/solicitar-alta`, { version: admission.version, ...(note.trim() ? { note: note.trim() } : {}) })) onSaved(); }
  return <Dialog title="Solicitar alta al médico tratante" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}>
    <Context admission={admission} />
    <p className="admission-action-note">El médico tratante recibe el aviso en la app y firma el alta desde ahí. Después podrás registrar la salida física.</p>
    {admission.dischargeRequestedAt && <p className="muted">Ya se pidió {relativeTime(admission.dischargeRequestedAt)}; puedes volver a avisar.</p>}
    <WriteError error={spanishProblem(action.error)} onReload={onSaved} />
    <Field label="Nota para el médico (opcional)" value={note} onChange={setNote} maxLength={500} hint="Por ejemplo: la familia ya está lista para el egreso." autoFocus />
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} label="Solicitar alta" /></div>
  </form></Dialog>;
}

/** BL-03 (b): Jefatura cambia el médico tratante; solo se puede elegir a quien tiene cuenta en la app para firmar. */
export function ReassignDoctorDialog({ api, admission, onClose, onSaved }: DialogProps) {
  const doctors = useData<DoctorRow[]>(api, '/admisiones/medicos-disponibles'), [doctor, setDoctor] = useState<PickerItem | null>(null), [reason, setReason] = useState(''), action = useAction(api);
  const items: PickerItem[] = (doctors.data ?? []).map(d => ({ id: d.id, label: d.name, detail: d.specialty ?? 'Medicina general', disabled: d.hasAccount === false, reason: d.hasAccount === false ? 'Sin cuenta en la app' : undefined }));
  const valid = !!doctor && reason.trim().length >= MIN_REASON;
  async function save(event: FormEvent) { event.preventDefault(); if (doctor && valid && await action.run(`/admisiones/${admission.id}/tratante`, { attendingDoctorId: doctor.id, version: admission.version, reason: reason.trim() })) onSaved(); }
  return <Dialog title="Reasignar médico tratante" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}>
    <Context admission={admission} />
    <WriteError error={spanishProblem(action.error ?? doctors.error)} onReload={onSaved} />
    <SearchPicker label="Nuevo médico tratante" value={doctor} onChange={setDoctor} items={items} required emptyText={doctors.loading ? 'Cargando médicos…' : 'No hay médicos que coincidan.'} hint="Los médicos sin cuenta en la app aparecen apagados: no podrían firmar el alta." />
    <Field label="Motivo" value={reason} onChange={setReason} required minLength={MIN_REASON} maxLength={500} hint="Al menos 10 caracteres. Queda en la auditoría." />
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} label="Reasignar" disabled={!valid} /></div>
  </form></Dialog>;
}

/** Salida física tras el alta firmada; muestra el tipo de alta y sus pendientes con responsable (MA-HOS-03). */
export function ExitDialog({ api, admission, onClose, onSaved }: DialogProps) {
  const [reason, setReason] = useState(''), action = useAction(api), discharge = admission.discharge;
  async function save(event: FormEvent) { event.preventDefault(); if (await action.run(`/admisiones/${admission.id}/salida`, { version: admission.version, reason: reason.trim() })) onSaved(); }
  return <Dialog title="Registrar salida física" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}>
    <p className="form-intro">Paciente: <strong>{admission.patientName}</strong> · cama {admission.bed || 'sin cama'}. La cama queda pendiente de limpieza.</p>
    {discharge && <section className="admission-discharge" aria-label="Alta firmada">
      <p>Alta <strong>{dischargeTypeNames[discharge.type] ?? discharge.type}</strong> · firmada por {discharge.signedByName} el {formatDateTime(discharge.signedAt)}.</p>
      {discharge.pending.length ? <><h3>Pendientes al salir</h3><ul>{discharge.pending.map((p, i) => <li key={i}>{p.description} <small>Responsable: {p.responsible}</small></li>)}</ul></> : <p className="muted">Sin pendientes registrados.</p>}
    </section>}
    <WriteError error={spanishProblem(action.error)} onReload={onSaved} />
    <Field label="Motivo o detalle de la salida" value={reason} onChange={setReason} required minLength={MIN_REASON} maxLength={500} hint="Al menos 10 caracteres." autoFocus />
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Registrar salida" disabled={reason.trim().length < MIN_REASON} /></div>
  </form></Dialog>;
}
