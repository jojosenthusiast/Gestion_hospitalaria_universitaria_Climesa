import { useState } from 'react';
import { Field } from '../components/ui';
import { can, type AccessProfile, type Api } from '../lib/api';
import { Dialog, Empty, Heading, RemoteState, Tag, WriteError, useAction, useData } from './common';

type LabResult = { value?: number | null; text?: string | null; mark: string; version: number };
type LabItem = { id: string; code: string; name: string; result?: LabResult | null };
type LabOrder = { id: string; patientName: string; priority: string; state: string; version: number; createdAt: string; sampleTakenAt?: string | null; completedAt?: string | null; reviewedAt?: string | null; items: LabItem[] };

export function LaboratoryPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<LabOrder[]>(api, '/laboratorio/ordenes', version, can(profile, 'laboratorio.ver_cola') || can(profile, 'resultados.ver'));
  return <>
    <Heading eyebrow="Atención / Diagnóstico" title="Laboratorio" description="Órdenes, toma de muestras, resultados y liberación clínica con estados trazables." />
    <section className="data-workbench"><RemoteState state={data}>{rows => rows.length ? <table className="record-table"><caption className="sr-only">Órdenes de laboratorio</caption><thead><tr><th>Paciente</th><th>Prioridad</th><th>Estado</th><th>Exámenes</th><th>Acción</th></tr></thead><tbody>{rows.map(row => <LabOrderRow key={row.id} api={api} profile={profile} order={row} onChanged={data.refresh} />)}</tbody></table> : <Empty title="No hay órdenes de laboratorio" description="Las órdenes aparecerán cuando Medicina solicite estudios para una consulta." />}</RemoteState></section>
  </>;
}

function LabOrderRow({ api, profile, order, onChanged }: { api: Api; profile: AccessProfile; order: LabOrder; onChanged: () => void }) {
  const action = useAction(api);
  const [open, setOpen] = useState(false), [sampleOpen, setSampleOpen] = useState(false);
  const isLab = can(profile, 'laboratorio.procesar');
  const canReview = can(profile, 'laboratorio.revisar');
  async function transition(path: string, body: unknown) { if (await action.run(path, body)) onChanged(); }
  return <>
    <tr><td data-label="Paciente"><strong>{order.patientName}</strong><small>{order.id}</small></td><td data-label="Prioridad">{order.priority === 'urgente' ? 'Urgente' : 'Rutina'}</td><td data-label="Estado"><Tag value={order.state} label={order.state === 'pendiente' ? 'Pendiente' : undefined} /></td><td data-label="Exámenes">{order.items.map(item => <span className="table-chip" key={item.id}>{item.code} · {item.name}</span>)}</td><td data-label="Acción"><div className="row-actions"><button className="row-action" onClick={() => setOpen(value => !value)}>{open ? 'Ocultar' : 'Gestionar'}</button>{isLab && order.state === 'pendiente' && <button className="row-action" onClick={() => setSampleOpen(true)}>Tomar muestra</button>}{isLab && order.state === 'en_proceso' && <button className="row-action" onClick={() => void transition(`/laboratorio/ordenes/${order.id}/completar`, { version: order.version })}>Completar</button>}{canReview && order.state === 'completado' && !order.reviewedAt && <button className="row-action" onClick={() => void transition(`/laboratorio/ordenes/${order.id}/revisar`, { version: order.version })}>Revisar</button>}</div></td></tr>
    {open && <tr><td colSpan={5}><WriteError error={action.error} /><div className="lab-order-detail">{order.items.map(item => <LabItemRow key={item.id} api={api} profile={profile} order={order} item={item} onChanged={onChanged} />)}</div></td></tr>}
    {sampleOpen && <SampleDialog api={api} order={order} onClose={() => setSampleOpen(false)} onSaved={() => { setSampleOpen(false); onChanged(); }} />}
  </>;
}

function SampleDialog({ api, order, onClose, onSaved }: { api: Api; order: LabOrder; onClose: () => void; onSaved: () => void }) {
  const [expediente, setExpediente] = useState(''), [nombreCompleto, setNombreCompleto] = useState('');
  const action = useAction(api);
  async function save() { if (await action.run(`/laboratorio/ordenes/${order.id}/muestra`, { version: order.version, expediente: expediente.trim(), nombreCompleto: nombreCompleto.trim() })) onSaved(); }
  return <Dialog title="Confirmar identidad para toma de muestra" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={event => { event.preventDefault(); void save(); }}><p className="form-intro">Confirma dos datos independientes antes de tomar la muestra: expediente y nombre completo.</p><WriteError error={action.error} /><Field label="Número de expediente" value={expediente} onChange={setExpediente} required autoFocus /><Field label="Nombre completo" value={nombreCompleto} onChange={setNombreCompleto} required /><div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={action.busy || !expediente.trim() || !nombreCompleto.trim()}>Confirmar identidad</button></div></form></Dialog>;
}

function LabItemRow({ api, profile, order, item, onChanged }: { api: Api; profile: AccessProfile; order: LabOrder; item: LabItem; onChanged: () => void }) {
  const action = useAction(api);
  const [value, setValue] = useState(item.result?.value?.toString() ?? ''), [text, setText] = useState(item.result?.text ?? ''), [reason, setReason] = useState('');
  if (!can(profile, 'laboratorio.procesar')) return <div className="lab-result-row"><strong>{item.code} · {item.name}</strong>{item.result ? <span><Tag value={item.result.mark} /> {item.result.text ?? item.result.value}</span> : <span>Resultado pendiente</span>}</div>;
  async function save() { const body = { orderItemId: item.id, ...(value.trim() ? { value: Number(value) } : { text: text.trim() }), ...(item.result ? { reason: reason.trim() } : {}) }; if (await action.run(`/laboratorio/ordenes/${order.id}/resultados`, body)) onChanged(); }
  return <div className="lab-result-row"><strong>{item.code} · {item.name}</strong><p>La marca se calcula con el rango vigente; no se selecciona manualmente.</p><div className="form-grid"><Field label="Valor" type="number" value={value} onChange={setValue} /><Field label="Texto" value={text} onChange={setText} />{item.result && <Field label="Motivo de corrección" value={reason} onChange={setReason} />}</div><button className="secondary-button" type="button" onClick={() => void save()} disabled={action.busy || (!value.trim() && !text.trim()) || (!!item.result && !reason.trim())}>Guardar resultado</button><WriteError error={action.error} /></div>;
}
