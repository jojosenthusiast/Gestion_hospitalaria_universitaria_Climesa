import { useEffect, useMemo, useState } from 'react';
import { Field, Icon, Notice } from '../../components/ui';
import { SearchPicker, type PickerItem } from '../../components/search-picker';
import { can, type AccessProfile, type Api } from '../../lib/api';
import { patientPicker } from '../appointments';
import { Dialog, Empty, RemoteState, WriteError, formatDateTime, useAction, useData } from '../common';
import {
  LAST_STEP, MOTIVE_MAX, VISITOR_LIMIT, admissionBody, categoryNames, feasibilityQuery, groupBeds, initialForm, isImmediate, isolationNames, originNames, salvadorInstant, salvadorNow, stepError, stepTitles, visitorError,
  type AdmissionForm, type BedPick, type Category, type CategoryCount, type Check, type DoctorPick, type IsolationType, type OriginKind, type OriginRecord,
} from './admission-rules';
import './admission-stepper.css';

type BedMap = { categories: CategoryCount[]; beds: BedPick[] };
type DoctorRow = { id: string; name: string; specialty: string | null; available: boolean; reason: string | null };
const originKinds: OriginKind[] = ['cita', 'emergencia', 'ambulancia', 'consulta'];

/** W14 · ingreso guiado: ocho pasos, cada uno se valida antes de avanzar y la API vuelve a comprobar todo al confirmar. */
export function AdmissionStepper({ api, profile, onClose, onSaved }: { api: Api; profile: AccessProfile; onClose: () => void; onSaved: () => void }) {
  const [step, setStep] = useState(0), [form, setForm] = useState<AdmissionForm>(() => initialForm(salvadorNow()));
  const canAssignBed = can(profile, 'camas.asignar'), action = useAction(api);
  const update = (patch: Partial<AdmissionForm>) => setForm(current => ({ ...current, ...patch }));
  const error = stepError(step, form, canAssignBed), last = step === LAST_STEP;
  async function confirm() {
    if (await action.run('/admisiones', admissionBody(form, canAssignBed))) onSaved();
  }
  return <Dialog title="Ingresar paciente" onClose={onClose} busy={action.busy}><div className="module-form admission-stepper">
    <ol className="stepper-track" aria-label="Pasos del ingreso">{stepTitles.map((title, index) => <li key={title} className={index === step ? 'is-current' : index < step ? 'is-done' : ''} aria-current={index === step ? 'step' : undefined}><span>{index < step ? <Icon name="check" size={14} /> : index + 1}</span><small>{title}</small></li>)}</ol>
    <h3 className="stepper-title">Paso {step + 1} de {stepTitles.length} · {stepTitles[step]}</h3>
    <WriteError error={action.error} onReload={onSaved} />
    {step === 0 && <PatientStep api={api} form={form} update={update} />}
    {step === 1 && <OriginStep api={api} form={form} update={update} />}
    {step === 2 && <DoctorStep api={api} form={form} update={update} />}
    {step === 3 && <CategoryStep api={api} form={form} update={update} />}
    {step === 4 && <RequirementsStep form={form} update={update} />}
    {step === 5 && <BedStep api={api} form={form} update={update} canAssignBed={canAssignBed} />}
    {step === 6 && <VisitorsStep form={form} update={update} />}
    {step === 7 && <SummaryStep api={api} form={form} update={update} canAssignBed={canAssignBed} />}
    {error && <p className="step-error" role="alert">{error}</p>}
    <div className="dialog-actions">
      <button type="button" className="secondary-button" onClick={step === 0 ? onClose : () => setStep(step - 1)} disabled={action.busy}>{step === 0 ? 'Cancelar' : 'Atrás'}</button>
      {last ? <SaveButtonLike busy={action.busy} disabled={!!error} onClick={() => void confirm()} /> : <button type="button" className="primary-button" onClick={() => setStep(step + 1)} disabled={!!error}>Siguiente <Icon name="arrow" size={16} /></button>}
    </div>
  </div></Dialog>;
}

function SaveButtonLike({ busy, disabled, onClick }: { busy: boolean; disabled: boolean; onClick: () => void }) {
  return <button type="button" className="primary-button" disabled={busy || disabled} onClick={onClick}><span>{busy ? 'Guardando…' : 'Confirmar ingreso'}</span>{busy ? <span className="spinner" /> : <Icon name="check" size={16} />}</button>;
}

type StepProps = { form: AdmissionForm; update: (patch: Partial<AdmissionForm>) => void };

function PatientStep({ api, form, update }: StepProps & { api: Api }) {
  // Cambiar de paciente invalida lo que dependía de él (origen y cama).
  const change = (patient: PickerItem | null) => update({ patient: patient && { id: patient.id, label: patient.label }, origin: null, originRecord: null, bed: null });
  return <>
    <p className="form-intro">Busca al paciente por nombre, DUI o expediente. La API vuelve a comprobar que no tenga otra admisión activa.</p>
    <SearchPicker label="Paciente" value={form.patient} onChange={change} search={patientPicker(api)} required emptyText="No hay pacientes con ese nombre, DUI o expediente." hint="Escribe al menos 2 letras o números." />
  </>;
}

function OriginStep({ api, form, update }: StepProps & { api: Api }) {
  const records = useData<OriginRecord[]>(api, `/admisiones/origenes?patientId=${encodeURIComponent(form.patient!.id)}`);
  const motiveShort = form.motive.length > 0 && form.motive.trim().length < 10;
  return <>
    <p className="form-intro">El ingreso nace de un registro del paciente: elige de dónde viene y cuál es.</p>
    <RemoteState state={records}>{rows => <>
      <fieldset className="choice-list origin-kinds"><legend>Origen</legend><div className="chip-row">{originKinds.map(kind => {
        const count = rows.filter(row => row.origin === kind).length;
        return <label key={kind} className={`choice-chip${form.origin === kind ? ' is-selected' : ''}${count === 0 ? ' is-disabled' : ''}`}><input type="radio" name="origin-kind" checked={form.origin === kind} disabled={count === 0} onChange={() => update({ origin: kind, originRecord: null })} /><strong>{originNames[kind]}</strong><small>{count === 0 ? 'Sin registros' : `${count} reciente${count === 1 ? '' : 's'}`}</small></label>;
      })}</div></fieldset>
      {form.origin && <fieldset className="choice-list"><legend>Registro de origen</legend>{rows.filter(row => row.origin === form.origin).map(row => <label className="check-field" key={row.id}><input type="radio" name="origin-record" checked={form.originRecord?.id === row.id} onChange={() => update({ originRecord: row })} /><span><strong>{row.label}</strong> <small>{row.detail}</small></span></label>)}</fieldset>}
      {rows.length === 0 && <Empty title="Sin registros recientes" description="El paciente no tiene citas, consultas, emergencias ni servicios de ambulancia a los que enlazar el ingreso." />}
    </>}</RemoteState>
    <Field label="Motivo del ingreso" value={form.motive} onChange={motive => update({ motive })} required maxLength={MOTIVE_MAX} hint="Obligatorio, al menos 10 caracteres." aria-invalid={motiveShort || undefined} />
  </>;
}

function DoctorStep({ api, form, update }: StepProps & { api: Api }) {
  const at = useMemo(() => { const instant = new Date(salvadorInstant(form.at)); return Number.isNaN(instant.getTime()) ? null : instant.toISOString(); }, [form.at]);
  const doctors = useData<DoctorRow[]>(api, `/admisiones/medicos-disponibles${at ? `?at=${encodeURIComponent(at)}` : ''}`, 0, true);
  const items = (doctors.data ?? []).map(d => ({ id: d.id, label: d.name, detail: d.specialty ?? 'Medicina general', disabled: !d.available, reason: d.reason ?? undefined }));
  // Si cambia la hora y el médico elegido ya no tiene turno, se apaga y la validación lo avisa.
  useEffect(() => {
    if (!form.doctor || !doctors.data) return;
    const current = doctors.data.find(d => d.id === form.doctor!.id);
    if (current && (current.available !== form.doctor.available || current.reason !== form.doctor.reason)) update({ doctor: { id: current.id, label: current.name, available: current.available, reason: current.reason } });
  }, [doctors.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (item: PickerItem | null) => {
    const row = item && doctors.data?.find(d => d.id === item.id);
    update({ doctor: row ? { id: row.id, label: row.name, available: row.available, reason: row.reason } as DoctorPick : null });
  };
  return <>
    <p className="form-intro">Primero la fecha y la hora: solo los médicos con turno en ese horario se pueden elegir; los demás aparecen apagados con su motivo.</p>
    <Field label="Fecha y hora del ingreso" type="datetime-local" value={form.at} onChange={value => update({ at: value, bed: null })} required />
    <SearchPicker label="Médico tratante" value={form.doctor && { id: form.doctor.id, label: form.doctor.label }} onChange={pick} items={items} required emptyText={doctors.loading ? 'Cargando médicos…' : 'No hay médicos que coincidan.'} hint="Los médicos sin turno en ese horario aparecen apagados." />
    {doctors.error && <Notice kind="error">{doctors.error.message}</Notice>}
  </>;
}

function CategoryStep({ api, form, update }: StepProps & { api: Api }) {
  const map = useData<BedMap>(api, `/admisiones/mapa-camas?patientId=${encodeURIComponent(form.patient!.id)}`);
  return <>
    <p className="form-intro">Camas disponibles por categoría para este paciente. Una categoría sin camas libres no se puede elegir.</p>
    <RemoteState state={map}>{({ categories }) => <div className="category-grid" role="radiogroup" aria-label="Categoría">{categories.map(item => {
      const unavailable = item.free === 0;
      return <label key={item.category} className={`category-card${form.category === item.category ? ' is-selected' : ''}${unavailable ? ' is-disabled' : ''}`}>
        <input type="radio" name="category" checked={form.category === item.category} disabled={unavailable} onChange={() => update({ category: item.category as Category, bed: null, visitorsMax: Math.min(form.visitorsMax, VISITOR_LIMIT[item.category as Category]) })} />
        <strong>{categoryNames[item.category as Category]}</strong>
        <span>{item.free} libre{item.free === 1 ? '' : 's'} · {item.compatible} compatible{item.compatible === 1 ? '' : 's'}</span>
        {unavailable && <small>No hay camas libres en esta categoría.</small>}
      </label>;
    })}</div>}</RemoteState>
  </>;
}

function RequirementsStep({ form, update }: StepProps) {
  return <>
    <p className="form-intro">Requisitos clínicos que condicionan la habitación. El aislamiento exige una habitación sin otros ocupantes.</p>
    <label className="check-field"><input type="checkbox" checked={form.isolation} onChange={event => update({ isolation: event.target.checked, isolationType: event.target.checked ? form.isolationType : '', bed: null })} /> Requiere aislamiento</label>
    {form.isolation && <fieldset className="choice-list"><legend>Tipo de aislamiento (opcional)</legend><div className="chip-row">{(Object.keys(isolationNames) as IsolationType[]).map(type => <label key={type} className={`choice-chip${form.isolationType === type ? ' is-selected' : ''}`}><input type="radio" name="isolation-type" checked={form.isolationType === type} onChange={() => update({ isolationType: type })} /><strong>{isolationNames[type]}</strong></label>)}</div></fieldset>}
    <label className="check-field"><input type="checkbox" checked={form.unstable} onChange={event => update({ unstable: event.target.checked })} /> Paciente inestable</label>
    <label className="check-field"><input type="checkbox" checked={form.postSurgical} onChange={event => update({ postSurgical: event.target.checked })} /> Posquirúrgico</label>
  </>;
}

function BedStep({ api, form, update, canAssignBed }: StepProps & { api: Api; canAssignBed: boolean }) {
  const immediate = isImmediate(form.at);
  const map = useData<BedMap>(api, `/admisiones/mapa-camas?patientId=${encodeURIComponent(form.patient!.id)}&isolation=${form.isolation}&category=${form.category}`, 0, canAssignBed && immediate);
  // La sugerencia llega preseleccionada; la persona puede elegir otra compatible.
  useEffect(() => {
    if (!map.data || form.bed) return;
    const suggested = map.data.beds.find(bed => bed.suggested);
    if (suggested) update({ bed: suggested });
  }, [map.data]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!canAssignBed) return <Notice kind="info">Tu cuenta no puede asignar cama: el ingreso queda pendiente de cama para quien tenga ese permiso.</Notice>;
  if (!immediate) return <Notice kind="info">El ingreso es para más adelante ({formatDateTime(salvadorInstant(form.at))}): la cama se asigna cuando el paciente llegue. El ingreso queda pendiente de cama.</Notice>;
  return <>
    <p className="form-intro">Planta, habitación y cama. Solo se pueden elegir las camas compatibles (libres, mismo sexo en habitación compartida, aislamiento y categoría); las demás aparecen apagadas con su motivo.</p>
    <RemoteState state={map}>{({ beds }) => {
      const inCategory = beds.filter(bed => bed.category === form.category);
      if (!inCategory.length) return <Empty title="Sin camas en esta categoría" description="Vuelve al paso de categoría y elige otra." />;
      return <>
        {!inCategory.some(bed => bed.compatible) && <Notice kind="error">No hay camas compatibles en {categoryNames[form.category!]}. Cambia la categoría o los requisitos.</Notice>}
        <div className="bed-picker">{groupBeds(inCategory).map(floor => <section key={String(floor.floor)} className="floor-block" aria-label={floor.floor === null ? 'Sin planta' : `Planta ${floor.floor}`}>
          <h4>{floor.floor === null ? 'Sin planta' : `Planta ${floor.floor}`}</h4>
          <div className="room-grid">{floor.rooms.map(room => <div key={room.id} className="room-card"><strong>{room.name}</strong><small>{room.capacity} cama{room.capacity === 1 ? '' : 's'}</small>
            <div className="bed-row">{room.beds.map(bed => <button type="button" key={bed.id} className={`bed-cell${form.bed?.id === bed.id ? ' is-selected' : ''}${bed.compatible ? '' : ' is-blocked'}`} disabled={!bed.compatible} aria-pressed={form.bed?.id === bed.id} aria-label={`Cama ${bed.code}${bed.compatible ? bed.suggested ? ', sugerida' : ', disponible' : `, no disponible: ${bed.reason ?? ''}`}`} onClick={() => update({ bed })}><Icon name="bed" size={16} /><span>{bed.code}</span><small>{bed.compatible ? (bed.suggested ? 'Sugerida' : 'Libre') : bed.reason}</small></button>)}</div>
          </div>)}</div>
        </section>)}</div>
      </>;
    }}</RemoteState>
  </>;
}

function VisitorsStep({ form, update }: StepProps) {
  const limit = form.category ? VISITOR_LIMIT[form.category] : 4, invalid = visitorError(form.visitorsAllowed, form.visitorsMax, form.category);
  return <>
    <p className="form-intro">El edificio no modela asientos para acompañantes: el máximo por paciente depende de la categoría ({form.category ? `${categoryNames[form.category]}: hasta ${limit}` : ''}).</p>
    <label className="check-field"><input type="checkbox" checked={form.visitorsAllowed} onChange={event => update({ visitorsAllowed: event.target.checked, visitorsMax: event.target.checked ? 1 : 0 })} /> Se permiten visitas y acompañantes</label>
    {form.visitorsAllowed && <Field label="Acompañantes permitidos" type="number" min={1} max={limit} value={String(form.visitorsMax)} onChange={value => update({ visitorsMax: value === '' ? 0 : Number(value) })} required aria-invalid={invalid ? true : undefined} />}
  </>;
}

function SummaryStep({ api, form, update, canAssignBed }: StepProps & { api: Api; canAssignBed: boolean }) {
  const checks = useData<{ feasible: boolean; checks: Check[] }>(api, `/admisiones/factibilidad?${feasibilityQuery(form, canAssignBed)}`);
  useEffect(() => { update({ feasible: !!checks.data?.feasible }); return () => update({ feasible: false }); }, [checks.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const bedLabel = !canAssignBed ? 'Pendiente de cama (sin permiso para asignar)' : !isImmediate(form.at) ? 'Pendiente de cama (ingreso futuro)' : form.bed ? `${form.bed.code} · ${form.bed.room}${form.bed.floor === null ? '' : ` · planta ${form.bed.floor}`}` : 'Sin cama';
  return <>
    <dl className="summary-list">
      <div><dt>Paciente</dt><dd>{form.patient!.label}</dd></div>
      <div><dt>Origen</dt><dd>{originNames[form.origin!]} · {form.originRecord!.label}</dd></div>
      <div><dt>Motivo</dt><dd>{form.motive.trim()}</dd></div>
      <div><dt>Fecha y médico</dt><dd>{formatDateTime(salvadorInstant(form.at))} · {form.doctor!.label}</dd></div>
      <div><dt>Categoría</dt><dd>{categoryNames[form.category!]}</dd></div>
      <div><dt>Requisitos</dt><dd>{[form.isolation ? `Aislamiento${form.isolationType ? ` ${isolationNames[form.isolationType as IsolationType].toLowerCase()}` : ''}` : null, form.unstable ? 'Inestable' : null, form.postSurgical ? 'Posquirúrgico' : null].filter(Boolean).join(' · ') || 'Ninguno'}</dd></div>
      <div><dt>Cama</dt><dd>{bedLabel}</dd></div>
      <div><dt>Visitas</dt><dd>{form.visitorsAllowed ? `Hasta ${form.visitorsMax} acompañante${form.visitorsMax === 1 ? '' : 's'}` : 'No se permiten'}</dd></div>
    </dl>
    <RemoteState state={checks}>{result => <ul className="feasibility-list" aria-label="Comprobación de factibilidad">{result.checks.map(check => <li key={check.code} className={check.ok ? 'is-ok' : 'is-fail'}><Icon name={check.ok ? 'check' : 'alert'} size={16} />{check.message}</li>)}</ul>}</RemoteState>
  </>;
}
