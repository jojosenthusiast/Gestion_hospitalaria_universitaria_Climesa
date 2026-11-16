import { useState, type FormEvent } from 'react';
import { Field, Notice } from '../../components/ui';
import type { Api } from '../../lib/api';
import { Dialog, SaveButton, WriteError, formatDateTime, isVersionConflict, useAction } from '../common';
import { localDay, localMs, localTime, type ShiftRow } from './rules';

/** Respuesta de `POST /turnos/{id}/asistencia` (ASIS-01 a ASIS-03). */
export type AttendanceResult = {
  id: string; version: number; state: string; attendance: string | null; late: boolean;
  affectedAppointments: { id: string; start: string; end: string; state: string }[];
  substitutes: { id: string; name: string; type: string; specialty: string | null; area: string | null }[];
};
type Choice = 'presente' | 'ausente' | 'pendiente';

/**
 * La entrada se confirma sola a la hora de inicio. JOP marca la ausencia (tipo y motivo), corrige la hora real de entrada
 * (también de alguien marcado ausente que sí llegó) o deshace una ausencia equivocada; siempre con motivo. Solo se ofrece
 * lo que la API permite (`allowedActions`). Tras una ausencia lista las citas que hay que reprogramar y suplentes libres (ASIS-02).
 */
export function AttendanceDialog({ api, shift, onClose, onSaved, onAssignSubstitute }: {
  api: Api; shift: ShiftRow; onClose: () => void; onSaved: () => void;
  onAssignSubstitute?: (staffId: string) => void;
}) {
  const absent = shift.state === 'ausente';
  const options: [Choice, string][] = [
    ...(shift.allowedActions?.includes('marcar_ausente') ? [['ausente', 'Marcar ausencia'] as [Choice, string]] : []),
    ...(shift.allowedActions?.includes('marcar_presente') ? [['presente', absent ? 'Sí llegó: registrar entrada' : 'Corregir hora de entrada'] as [Choice, string]] : []),
    ...(shift.allowedActions?.includes('deshacer_asistencia') ? [['pendiente', 'Deshacer la ausencia'] as [Choice, string]] : []),
  ];
  const startDay = localDay(Date.parse(shift.start));
  const [choice, setChoice] = useState<Choice>(options[0]?.[0] ?? 'ausente');
  const [time, setTime] = useState('');
  const [absenceType, setAbsenceType] = useState<'justificada' | 'injustificada' | ''>('');
  const [reason, setReason] = useState(''), [problem, setProblem] = useState('');
  const [result, setResult] = useState<AttendanceResult | null>(null);
  const action = useAction(api);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (choice === 'ausente' && !absenceType) { setProblem('Indica si la ausencia es justificada o injustificada.'); return; }
    if (choice === 'presente' && !time) { setProblem('Indica la hora real de entrada.'); return; }
    if (reason.trim().length < 10) { setProblem('Indica el motivo, de al menos 10 caracteres.'); return; }
    setProblem('');
    const at = choice === 'presente' && time ? new Date(localMs(localTime(Date.parse(shift.start)) <= time ? startDay : localDay(Date.parse(shift.end)), time)).toISOString() : undefined;
    const body = { state: choice, version: shift.version, ...(choice === 'ausente' ? { absenceType } : {}), ...(at ? { at } : {}), ...(reason.trim() ? { reason: reason.trim() } : {}) };
    const saved = await action.run<AttendanceResult>(`/turnos/${shift.id}/asistencia`, body);
    if (!saved) return;
    if (saved.affectedAppointments?.length || saved.substitutes?.length) setResult(saved); else onSaved();
  }

  if (result) return <Dialog title="Ausencia registrada" onClose={onSaved}>
    <div className="module-form">
      <Notice kind="success">La ausencia de {shift.person} quedó registrada. Ya no cuenta como de turno para la agenda, la fila, la ambulancia ni la cobertura.</Notice>
      {result.affectedAppointments.length > 0 && <section className="attendance-followup">
        <h3>Citas que hay que reprogramar o cancelar</h3>
        <ul>{result.affectedAppointments.map(c => <li key={c.id}>{formatDateTime(c.start)} · {c.state === 'confirmada' ? 'Confirmada' : 'Solicitada'}</li>)}</ul>
        <p className="muted">Recepción las resuelve desde Citas, con aviso al paciente.</p>
      </section>}
      <section className="attendance-followup">
        <h3>Suplentes disponibles</h3>
        {result.substitutes.length ? <ul>{result.substitutes.map(p => <li key={p.id}>
          <span>{p.name}{p.specialty ? ` · ${p.specialty}` : ''}{p.area ? ` · ${p.area}` : ''}</span>
          {onAssignSubstitute && <button type="button" className="row-action" onClick={() => onAssignSubstitute(p.id)}>Asignar turno</button>}
        </li>)}</ul> : <p className="muted">Nadie de la misma función está libre con su descanso cumplido en ese horario.</p>}
      </section>
      <div className="dialog-actions"><button type="button" className="primary-button" onClick={onSaved}>Listo</button></div>
    </div>
  </Dialog>;

  return <Dialog title="Asistencia del turno" onClose={onClose} busy={action.busy}>
    <form className="module-form" onSubmit={save} noValidate>
      {isVersionConflict(action.error) ? <><Notice kind="error">El turno cambió. Cierra y vuelve a abrirlo para ver su estado actual; la marca no se guardó.</Notice><button type="button" className="secondary-button" onClick={onSaved}>Cerrar y recargar</button></> : <WriteError error={action.error} />}
      <p><strong>{shift.person}</strong> · {shift.area}, del {formatDateTime(shift.start)} al {formatDateTime(shift.end)}.</p>
      {options.length > 1 && <fieldset className="shift-filter-group"><legend>Qué quieres registrar</legend><div className="shift-pills">
        {options.map(([code, label]) => <button key={code} type="button" className="shift-pill" aria-pressed={choice === code} onClick={() => { setChoice(code); setProblem(''); }}>{label}</button>)}
      </div></fieldset>}
      <p className="muted">{absent ? 'Está marcado ausente.' : Date.now() >= Date.parse(shift.start) ? `La entrada se confirmó sola a las ${localTime(Date.parse(shift.start))}.` : `La entrada se confirmará sola a las ${localTime(Date.parse(shift.start))}.`} Solo registra aquí lo que fue distinto.</p>

      {choice === 'presente' && <Field label="Hora real de entrada" type="time" value={time} onChange={setTime} required hint="Queda en el turno y en la auditoría; si pasa del margen, se marca como llegada tarde." />}
      {choice === 'ausente' && <fieldset className="shift-filter-group"><legend>Tipo de ausencia</legend><div className="shift-pills">
        <button type="button" className="shift-pill" aria-pressed={absenceType === 'justificada'} onClick={() => setAbsenceType('justificada')}>Justificada (incapacidad, permiso)</button>
        <button type="button" className="shift-pill" aria-pressed={absenceType === 'injustificada'} onClick={() => setAbsenceType('injustificada')}>Injustificada</button>
      </div></fieldset>}
      <Field label={choice === 'ausente' ? 'Motivo de la ausencia' : choice === 'presente' ? 'Motivo de la corrección' : 'Por qué deshaces la ausencia'} value={reason} onChange={setReason} required minLength={10} maxLength={500} />

      {problem && <Notice kind="error">{problem}</Notice>}
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button>
        <SaveButton busy={action.busy} label={options.find(o => o[0] === choice)?.[1] ?? 'Guardar'} />
      </div>
    </form>
  </Dialog>;
}
