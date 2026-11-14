import { useState, type FormEvent } from 'react';
import { Field, Icon, Notice } from '../components/ui';
import { can, type AccessProfile, type Api } from '../lib/api';
import type { PublicNotice, PublicNotices } from '../lib/publico';
import { Dialog, Empty, Heading, RemoteState, SaveButton, WriteError, formatDateTime, useAction, useData } from './common';

/** `datetime-local` se interpreta en la hora de El Salvador (UTC-6 todo el año, FR-100-16). */
export const localToIso = (value: string) => value ? new Date(`${value.length === 16 ? value + ':00' : value}-06:00`).toISOString() : '';
const PERSONAL_DATA = 'aviso_con_datos_personales';

/** W25 · avisos generales: lista de vigentes y publicación con vigencia (FR-112-03, FR-112-05). */
export function NoticesPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const notices = useData<PublicNotices>(api, '/publico/avisos', version);
  const [open, setOpen] = useState(false);
  return <>
    <Heading eyebrow="Operaciones / Información pública" title="Avisos generales" description="Los avisos se ven en la pantalla pública y en las apps sin iniciar sesión. No escribas datos personales." actions={can(profile, 'avisos.publicar') && <button className="primary-button" onClick={() => setOpen(true)}><Icon name="plus" size={18} />Nuevo aviso</button>} />
    <section className="data-workbench">
      <RemoteState state={notices}>{data => data.avisos.length
        ? <table className="record-table"><caption className="sr-only">Avisos vigentes</caption><thead><tr><th>Aviso</th><th>Desde</th><th>Hasta</th></tr></thead><tbody>{data.avisos.map((a: PublicNotice) => <tr key={a.id}><td data-label="Aviso"><strong>{a.titulo}</strong><small>{a.cuerpo}</small></td><td data-label="Desde">{formatDateTime(a.desde)}</td><td data-label="Hasta">{formatDateTime(a.hasta)}</td></tr>)}</tbody></table>
        : <Empty title="No hay avisos vigentes" description="Publica un aviso para que aparezca en la pantalla pública." />}</RemoteState>
    </section>
    {open && <NoticeDialog api={api} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); notices.refresh(); }} />}
  </>;
}

function NoticeDialog({ api, onClose, onSaved }: { api: Api; onClose: () => void; onSaved: () => void }) {
  const [titulo, setTitulo] = useState(''), [cuerpo, setCuerpo] = useState(''), [desde, setDesde] = useState(''), [hasta, setHasta] = useState('');
  const action = useAction(api);
  const warned = action.error?.code === PERSONAL_DATA;
  async function publish(confirm: boolean) {
    const body = { titulo: titulo.trim(), cuerpo: cuerpo.trim(), ...(desde ? { desde: localToIso(desde) } : {}), hasta: localToIso(hasta), ...(confirm ? { confirmarDatosPersonales: true } : {}) };
    if (await action.run('/avisos', body)) onSaved();
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void publish(false); };
  return <Dialog title="Nuevo aviso" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={submit}>
    {warned
      ? <Notice kind="error">{action.error?.message} <button type="button" className="secondary-button" disabled={action.busy} onClick={() => void publish(true)}>Publicar de todos modos</button></Notice>
      : <WriteError error={action.error} />}
    <p className="form-intro">El aviso es público. Sin "Desde", empieza al publicarlo; desaparece solo al llegar a "Hasta".</p>
    <div className="form-grid">
      <Field label="Título" value={titulo} onChange={setTitulo} required minLength={3} maxLength={120} />
      <div className="field full-width"><label htmlFor="aviso-cuerpo">Texto del aviso</label><textarea id="aviso-cuerpo" value={cuerpo} onChange={e => setCuerpo(e.target.value)} required minLength={3} maxLength={1000} rows={4} /></div>
      <Field label="Desde (opcional)" type="datetime-local" value={desde} onChange={setDesde} />
      <Field label="Hasta" type="datetime-local" value={hasta} onChange={setHasta} required />
    </div>
    <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><SaveButton busy={action.busy} label="Publicar aviso" disabled={titulo.trim().length < 3 || cuerpo.trim().length < 3 || !hasta} /></div>
  </form></Dialog>;
}
