import { useState, type FormEvent } from 'react';
import { Field, Icon, Notice } from '../../components/ui';
import { can, roleNames, type AccessProfile, type Api } from '../../lib/api';
import { Dialog, Empty, Heading, RemoteState, Tag, WriteError, formatDateTime, useAction, useData } from '../common';
import { NoticeCard } from './NoticePreview';
import { audienceRoles, audienceText, durations, isoToLocalInput, localInput, localToIso, personalDataIn, priorities, WITHDRAW_MIN, type NoticeListItem, type Priority } from './rules';
import './avisos.css';

export { localToIso } from './rules';
const PERSONAL_DATA = 'aviso_con_datos_personales';
const stateLabel: Record<string, string> = { vigente: 'Vigente', programado: 'Programado', vencido: 'Vencido', retirado: 'Retirado' };
const stateTag: Record<string, string> = { vigente: 'activo', programado: 'pendiente', vencido: 'inactivo', retirado: 'cancelado' };

/**
 * W25 · Avisos generales: redactar con vista previa, elegir a quién llega y con qué prioridad, y ver lo ya publicado
 * (FR-112-03, FR-112-05). Editar y retirar (MA-AVI-02) solo aparecen donde el servidor los acepta (`allowedActions`).
 */
export function NoticesPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const list = useData<NoticeListItem[]>(api, '/avisos', version, can(profile, 'avisos.publicar'));
  const [editing, setEditing] = useState<NoticeListItem | null>(null), [withdrawing, setWithdrawing] = useState<NoticeListItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const edit = (notice: NoticeListItem) => { setMessage(null); setEditing(notice); document.querySelector('.notice-composer')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); };
  return <>
    <Heading eyebrow="Operaciones / Comunicación" title="Avisos generales" description="Redacta un aviso, elige quién lo ve y por cuánto tiempo. Cada rol lo recibe en su tablero de inicio; el público lo ve en la pantalla pública." />
    {can(profile, 'avisos.publicar') && <NoticeComposer key={editing ? `${editing.id}-${editing.version}` : 'nuevo'} api={api} editing={editing} onDone={() => { if (editing) setMessage(`Cambios guardados en «${editing.titulo}». Ya se ven donde se publica.`); setEditing(null); list.refresh(); }} onCancel={() => setEditing(null)} onReload={() => { setEditing(null); list.refresh(); }} />}
    {message && <Notice kind="success">{message}</Notice>}
    <section className="data-workbench notice-history" aria-label="Avisos publicados">
      <div className="table-caption">Publicados<span>Los más recientes primero. Un aviso vencido o retirado deja de verse solo.</span></div>
      <RemoteState state={list}>{rows => rows.length
        ? <table className="record-table"><caption className="sr-only">Avisos publicados</caption><thead><tr><th>Aviso</th><th>Prioridad</th><th>Dónde se ve</th><th>Vigencia</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>{rows.map(a => <tr key={a.id}>
            <td data-label="Aviso"><strong>{a.titulo}</strong><small>{a.cuerpo}</small></td>
            <td data-label="Prioridad"><span className={`notice-badge notice-${a.prioridad}`}>{priorities.find(p => p.id === a.prioridad)?.label ?? a.prioridad}</span></td>
            <td data-label="Dónde se ve">{audienceText(a)}</td>
            <td data-label="Vigencia">{a.desde ? formatDateTime(a.desde) : '—'}<small>hasta {a.hasta ? formatDateTime(a.hasta) : '—'}</small></td>
            <td data-label="Estado"><Tag value={stateTag[a.estado] ?? a.estado} label={stateLabel[a.estado] ?? a.estado} />
              {a.estado === 'retirado' && <small>{a.retiradoEn ? `${formatDateTime(a.retiradoEn)} · ` : ''}Motivo: {a.motivoRetiro ?? 'sin motivo registrado'}</small>}</td>
            <td data-label="Acciones">{(a.allowedActions ?? []).length
              ? <div className="row-actions">
                {a.allowedActions.includes('editar') && <button type="button" className="row-action" onClick={() => edit(a)}>Editar</button>}
                {a.allowedActions.includes('retirar') && <button type="button" className="row-action" onClick={() => { setMessage(null); setWithdrawing(a); }}>Retirar</button>}
              </div>
              : <small className="muted">—</small>}</td>
          </tr>)}</tbody></table>
        : <Empty title="Todavía no hay avisos" description="Publica el primero con el formulario de arriba." />}</RemoteState>
    </section>
    {withdrawing && <WithdrawDialog api={api} notice={withdrawing} onClose={() => setWithdrawing(null)} onDone={() => { setMessage(`Aviso «${withdrawing.titulo}» retirado. Ya no se ve en ninguna parte.`); setWithdrawing(null); if (editing?.id === withdrawing.id) setEditing(null); list.refresh(); }} onReload={() => { setWithdrawing(null); list.refresh(); }} />}
  </>;
}

/** Retirar antes de tiempo (D-13): motivo de 10 caracteres o más, auditado; el aviso deja de verse en todas partes. */
function WithdrawDialog({ api, notice, onClose, onDone, onReload }: { api: Api; notice: NoticeListItem; onClose: () => void; onDone: () => void; onReload: () => void }) {
  const [reason, setReason] = useState('');
  const action = useAction(api);
  const short = reason.trim().length < WITHDRAW_MIN;
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (await action.run(`/avisos/${notice.id}/retirar`, { version: notice.version, motivo: reason.trim() })) onDone();
  }
  return <Dialog title="Retirar aviso" onClose={onClose} busy={action.busy}>
    <form className="module-form" onSubmit={submit}>
      <p>«{notice.titulo}» dejará de verse de inmediato en la pantalla pública, en las apps y en los tableros. No se puede deshacer; si hace falta, publica uno nuevo.</p>
      <WriteError error={action.error} onReload={onReload} />
      <div className="field"><label htmlFor="aviso-motivo-retiro">Motivo del retiro</label>
        <textarea id="aviso-motivo-retiro" value={reason} onChange={e => setReason(e.target.value)} required minLength={WITHDRAW_MIN} maxLength={500} rows={3} />
        <small className="field-hint">{short ? `Escribe al menos ${WITHDRAW_MIN} caracteres; queda en la auditoría.` : 'Queda en la auditoría junto con tu nombre.'}</small></div>
      <div className="dialog-actions">
        <button type="button" className="secondary-button" disabled={action.busy} onClick={onClose}>Cancelar</button>
        <button type="submit" className="primary-button" disabled={action.busy || short}>{action.busy ? 'Retirando…' : 'Retirar aviso'}</button>
      </div>
    </form>
  </Dialog>;
}

function NoticeComposer({ api, editing, onDone, onCancel, onReload }: { api: Api; editing: NoticeListItem | null; onDone: () => void; onCancel: () => void; onReload: () => void }) {
  // Al editar un aviso ya vigente su inicio no cambia: se envía sin `desde` y la API conserva el inicio vigente.
  const started = editing?.estado === 'vigente';
  const [title, setTitle] = useState(editing?.titulo ?? ''), [body, setBody] = useState(editing?.cuerpo ?? ''), [priority, setPriority] = useState<Priority>((editing?.prioridad as Priority) ?? 'atencion');
  const [isPublic, setPublic] = useState(editing?.publico ?? true), [roles, setRoles] = useState<string[]>(editing?.roles ?? []);
  const [from, setFrom] = useState(editing && !started && editing.desde ? isoToLocalInput(editing.desde) : ''), [until, setUntil] = useState(() => editing?.hasta ? isoToLocalInput(editing.hasta) : localInput(72));
  const [done, setDone] = useState(false);
  const action = useAction(api);
  const found = personalDataIn(title, body), warned = action.error?.code === PERSONAL_DATA;
  const noAudience = !isPublic && roles.length === 0;
  const invalid = title.trim().length < 3 || body.trim().length < 3 || !until || noAudience;
  const toggle = (role: string) => setRoles(current => current.includes(role) ? current.filter(r => r !== role) : [...current, role]);

  async function publish(confirm: boolean) {
    const payload = { titulo: title.trim(), cuerpo: body.trim(), prioridad: priority, publico: isPublic, roles, ...(from && !started ? { desde: localToIso(from) } : {}), hasta: localToIso(until), ...(confirm ? { confirmarDatosPersonales: true } : {}) };
    if (editing) {
      if (await action.run(`/avisos/${editing.id}`, { ...payload, version: editing.version }, 'PUT')) onDone();
      return;
    }
    if (await action.run('/avisos', payload)) { setTitle(''); setBody(''); setPriority('atencion'); setPublic(true); setRoles([]); setFrom(''); setUntil(localInput(72)); setDone(true); onDone(); }
  }
  const submit = (event: FormEvent) => { event.preventDefault(); setDone(false); void publish(false); };
  const label = editing ? (action.busy ? 'Guardando…' : 'Guardar cambios') : (action.busy ? 'Publicando…' : 'Publicar aviso');

  return <section className="notice-composer" aria-label={editing ? 'Editar aviso' : 'Nuevo aviso'}>
    <form className="module-form" onSubmit={submit}>
      <h2>{editing ? 'Editar aviso' : 'Nuevo aviso'}</h2>
      {editing && <Notice kind="info">Editas «{editing.titulo}». Los cambios se ven de inmediato; quien ya no esté en la audiencia deja de verlo.</Notice>}
      {done && <Notice kind="success">Aviso publicado. Ya aparece donde lo elegiste.</Notice>}
      {warned
        ? <Notice kind="error">{action.error?.message} <button type="button" className="secondary-button" disabled={action.busy} onClick={() => void publish(true)}>{editing ? 'Guardar de todos modos' : 'Publicar de todos modos'}</button></Notice>
        : <WriteError error={action.error} onReload={editing ? onReload : undefined} />}
      <Field label="Título" value={title} onChange={setTitle} required minLength={3} maxLength={120} hint="Corto y claro: qué pasa." />
      <div className="field"><label htmlFor="aviso-cuerpo">Texto del aviso</label><textarea id="aviso-cuerpo" value={body} onChange={e => setBody(e.target.value)} required minLength={3} maxLength={1000} rows={4} /><small className="field-hint">{body.length}/1000 caracteres</small></div>
      {found.length > 0 && <Notice kind="error">El texto parece contener {found.join(', ')}. Un aviso no debe llevar datos de pacientes ni de personal: quítalos o, si es intencional, confirma al publicar.</Notice>}
      <fieldset className="notice-fieldset"><legend>Prioridad</legend>
        <div className="segmented-control" role="group" aria-label="Prioridad">{priorities.map(p => <button key={p.id} type="button" aria-pressed={priority === p.id} title={p.hint} onClick={() => setPriority(p.id)}>{p.label}</button>)}</div>
        <small className="field-hint">{priorities.find(p => p.id === priority)?.hint}</small>
      </fieldset>
      <fieldset className="notice-fieldset"><legend>¿Quién lo ve?</legend>
        <label className="notice-check"><input type="checkbox" checked={isPublic} onChange={e => setPublic(e.target.checked)} />Público: pantalla pública y apps sin iniciar sesión</label>
        <div className="notice-roles">{audienceRoles.map(r => <label key={r} className="notice-check"><input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(r)} />{roleNames[r]}</label>)}</div>
        <small className="field-hint">Los roles lo ven en su tablero de inicio, en la web y en las apps. Un aviso solo para roles no sale en la pantalla pública.</small>
        {noAudience && <Notice kind="error">Elige a quién va dirigido: público, uno o más roles.</Notice>}
      </fieldset>
      <fieldset className="notice-fieldset"><legend>Vigencia</legend>
        <div className="form-grid">
          {started
            ? <p className="field-hint">Vigente desde {editing?.desde ? formatDateTime(editing.desde) : '—'}; el inicio no cambia.</p>
            : <Field label="Desde (opcional)" type="datetime-local" value={from} onChange={setFrom} hint="Sin fecha, empieza al publicarlo." />}
          <Field label="Hasta" type="datetime-local" value={until} onChange={setUntil} required hint={editing ? 'Adelántalo para que venza antes.' : undefined} />
        </div>
        <div className="segmented-control" role="group" aria-label="Duración rápida">{durations.map(d => <button key={d.hours} type="button" onClick={() => setUntil(localInput(d.hours))}>{d.label}</button>)}</div>
        <small className="field-hint">Desaparece solo al llegar a «Hasta».</small>
      </fieldset>
      <div className="dialog-actions">
        {editing && <button className="secondary-button" type="button" disabled={action.busy} onClick={onCancel}>Cancelar edición</button>}
        <button className="primary-button" type="submit" disabled={action.busy || invalid}><Icon name="megaphone" size={18} />{label}</button>
      </div>
    </form>
    <aside className="notice-preview" aria-label="Vista previa">
      <h3>Vista previa</h3>
      <NoticeCard notice={{ titulo: title.trim(), cuerpo: body.trim(), prioridad: priority, publico: isPublic, roles, hasta: until ? localToIso(until) : null }} />
      <p className="muted">Así lo ve quien lo recibe. {isPublic ? 'En la pantalla pública solo se muestran título y texto.' : 'No saldrá en la pantalla pública.'}</p>
    </aside>
  </section>;
}
