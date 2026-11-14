import { useState, type FormEvent } from 'react';
import { Field, Icon, Notice } from '../../components/ui';
import { can, roleNames, type AccessProfile, type Api } from '../../lib/api';
import { Empty, Heading, RemoteState, Tag, WriteError, formatDateTime, useAction, useData } from '../common';
import { NoticeCard } from './NoticePreview';
import { audienceRoles, audienceText, durations, localInput, localToIso, personalDataIn, priorities, type NoticeListItem, type Priority } from './rules';
import './avisos.css';

export { localToIso } from './rules';
const PERSONAL_DATA = 'aviso_con_datos_personales';
const stateLabel: Record<string, string> = { vigente: 'Vigente', programado: 'Programado', vencido: 'Vencido' };
const stateTag: Record<string, string> = { vigente: 'activo', programado: 'pendiente', vencido: 'inactivo' };

/** W25 · Avisos generales: redactar con vista previa, elegir a quién llega y con qué prioridad, y ver lo ya publicado (FR-112-03, FR-112-05). */
export function NoticesPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const list = useData<NoticeListItem[]>(api, '/avisos', version, can(profile, 'avisos.publicar'));
  return <>
    <Heading eyebrow="Operaciones / Comunicación" title="Avisos generales" description="Redacta un aviso, elige quién lo ve y por cuánto tiempo. Cada rol lo recibe en su tablero de inicio; el público lo ve en la pantalla pública." />
    {can(profile, 'avisos.publicar') && <NoticeComposer api={api} onPublished={list.refresh} />}
    <section className="data-workbench notice-history" aria-label="Avisos publicados">
      <div className="table-caption">Publicados<span>Los más recientes primero. Un aviso vencido deja de verse solo.</span></div>
      <RemoteState state={list}>{rows => rows.length
        ? <table className="record-table"><caption className="sr-only">Avisos publicados</caption><thead><tr><th>Aviso</th><th>Prioridad</th><th>Dónde se ve</th><th>Vigencia</th><th>Estado</th></tr></thead>
          <tbody>{rows.map(a => <tr key={a.id}>
            <td data-label="Aviso"><strong>{a.titulo}</strong><small>{a.cuerpo}</small></td>
            <td data-label="Prioridad"><span className={`notice-badge notice-${a.prioridad}`}>{priorities.find(p => p.id === a.prioridad)?.label ?? a.prioridad}</span></td>
            <td data-label="Dónde se ve">{audienceText(a)}</td>
            <td data-label="Vigencia">{a.desde ? formatDateTime(a.desde) : '—'}<small>hasta {a.hasta ? formatDateTime(a.hasta) : '—'}</small></td>
            <td data-label="Estado"><Tag value={stateTag[a.estado] ?? a.estado} label={stateLabel[a.estado] ?? a.estado} /></td>
          </tr>)}</tbody></table>
        : <Empty title="Todavía no hay avisos" description="Publica el primero con el formulario de arriba." />}</RemoteState>
    </section>
  </>;
}

function NoticeComposer({ api, onPublished }: { api: Api; onPublished: () => void }) {
  const [title, setTitle] = useState(''), [body, setBody] = useState(''), [priority, setPriority] = useState<Priority>('atencion');
  const [isPublic, setPublic] = useState(true), [roles, setRoles] = useState<string[]>([]);
  const [from, setFrom] = useState(''), [until, setUntil] = useState(() => localInput(72));
  const [done, setDone] = useState(false);
  const action = useAction(api);
  const found = personalDataIn(title, body), warned = action.error?.code === PERSONAL_DATA;
  const noAudience = !isPublic && roles.length === 0;
  const invalid = title.trim().length < 3 || body.trim().length < 3 || !until || noAudience;
  const toggle = (role: string) => setRoles(current => current.includes(role) ? current.filter(r => r !== role) : [...current, role]);

  async function publish(confirm: boolean) {
    const payload = { titulo: title.trim(), cuerpo: body.trim(), prioridad: priority, publico: isPublic, roles, ...(from ? { desde: localToIso(from) } : {}), hasta: localToIso(until), ...(confirm ? { confirmarDatosPersonales: true } : {}) };
    if (await action.run('/avisos', payload)) { setTitle(''); setBody(''); setPriority('atencion'); setPublic(true); setRoles([]); setFrom(''); setUntil(localInput(72)); setDone(true); onPublished(); }
  }
  const submit = (event: FormEvent) => { event.preventDefault(); setDone(false); void publish(false); };

  return <section className="notice-composer" aria-label="Nuevo aviso">
    <form className="module-form" onSubmit={submit}>
      <h2>Nuevo aviso</h2>
      {done && <Notice kind="success">Aviso publicado. Ya aparece donde lo elegiste.</Notice>}
      {warned
        ? <Notice kind="error">{action.error?.message} <button type="button" className="secondary-button" disabled={action.busy} onClick={() => void publish(true)}>Publicar de todos modos</button></Notice>
        : <WriteError error={action.error} />}
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
        <small className="field-hint">Los roles lo ven en su tablero de inicio, en la web y en Android. Un aviso solo para roles no sale en la pantalla pública.</small>
        {noAudience && <Notice kind="error">Elige a quién va dirigido: público, uno o más roles.</Notice>}
      </fieldset>
      <fieldset className="notice-fieldset"><legend>Vigencia</legend>
        <div className="form-grid">
          <Field label="Desde (opcional)" type="datetime-local" value={from} onChange={setFrom} hint="Sin fecha, empieza al publicarlo." />
          <Field label="Hasta" type="datetime-local" value={until} onChange={setUntil} required />
        </div>
        <div className="segmented-control" role="group" aria-label="Duración rápida">{durations.map(d => <button key={d.hours} type="button" onClick={() => setUntil(localInput(d.hours))}>{d.label}</button>)}</div>
        <small className="field-hint">Desaparece solo al llegar a «Hasta».</small>
      </fieldset>
      <div className="dialog-actions"><button className="primary-button" type="submit" disabled={action.busy || invalid}><Icon name="megaphone" size={18} />{action.busy ? 'Publicando…' : 'Publicar aviso'}</button></div>
    </form>
    <aside className="notice-preview" aria-label="Vista previa">
      <h3>Vista previa</h3>
      <NoticeCard notice={{ titulo: title.trim(), cuerpo: body.trim(), prioridad: priority, publico: isPublic, roles, hasta: until ? localToIso(until) : null }} />
      <p className="muted">Así lo ve quien lo recibe. {isPublic ? 'En la pantalla pública solo se muestran título y texto.' : 'No saldrá en la pantalla pública.'}</p>
    </aside>
  </section>;
}
