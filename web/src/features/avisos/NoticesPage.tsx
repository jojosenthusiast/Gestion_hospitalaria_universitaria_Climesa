import { useEffect, useState, type FormEvent } from 'react';
import { useFold } from '../../components/fold';
import { useQuickAction } from '../personal/accion';
import { AreaTag, CrudActions, CrudButton, statusFilterLook } from '../../components/system';
import { Field, Icon, Notice } from '../../components/ui';
import { can, roleNames, type AccessProfile, type Api, type Space } from '../../lib/api';
import { useRefreshAt } from '../../lib/publico';
import { Dialog, Empty, CompactHeader, RemoteState, Tag, WriteError, useAction, useData, type Remote } from '../common';
import { formatDayHeading, formatNumber, joinParts, plural } from '../../lib/format';
import { NoticeCard, NoticeLevelBadge } from './NoticePreview';
import { audienceRoles, audienceText, durations, filterInbox, groupInbox, inboxFilters, inboxState, inboxStateTag, noticeWhen, shortWhen, isoToLocalInput, levels, localInput, localToIso, personalDataIn, priorityOfLevel, WITHDRAW_MIN, type Inbox, type InboxFilter, type InboxNotice, type Level, type NoticeListItem, type NoticeStats, type Priority } from './rules';
import '../listas/lists.css';
import './avisos.css';

export { localToIso } from './rules';
const PERSONAL_DATA = 'aviso_con_datos_personales';
const stateLabel: Record<string, string> = { vigente: 'Vigente', programado: 'Programado', vencido: 'Vencido', retirado: 'Retirado' };
const stateTag: Record<string, string> = { vigente: 'activo', programado: 'pendiente', vencido: 'inactivo', retirado: 'cancelado' };

type View = 'mios' | 'publicados';
const filterFromHash = (): InboxFilter => { const value = new URLSearchParams(location.hash.split('?')[1] ?? '').get('filtro'); return value === 'criticos' || value === 'sin-leer' ? value : 'todos'; };

/**
 * W25 · Avisos (Fase 2, S11): su propia área para toda cuenta con sesión. «Para mí» es la bandeja de pendientes de la
 * cuenta (críticos primero, filtros y detalle con «Enterado»). Quien tiene `avisos.publicar` ve además «Publicados»:
 * redactar con vista previa, nivel y audiencia (FR-112-03, FR-112-05), editar y retirar donde el servidor lo acepta
 * (`allowedActions`, MA-AVI-02) y cuántas cuentas dieron «Enterado».
 */
export function NoticesPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const publisher = can(profile, 'avisos.publicar');
  const [view, setView] = useState<View>(publisher ? 'publicados' : 'mios');
  const [filter, setFilter] = useState<InboxFilter>(filterFromHash);
  const mine = view === 'mios' || !publisher;
  const inbox = useData<Inbox>(api, '/me/avisos/bandeja', version, mine);
  // `?accion=publicar` (Inicio, «Publicar aviso»): «Publicados» with the cursor in the composer's title.
  const [quick, consumeQuick] = useQuickAction();
  useEffect(() => {
    if (!quick) return;
    if (quick === 'publicar' && publisher) { setView('publicados'); setTimeout(() => { const title = document.querySelector<HTMLInputElement>('.notice-composer input'); title?.scrollIntoView?.({ block: 'start' }); title?.focus(); }, 0); }
    consumeQuick();
  }, [quick, publisher, consumeQuick]);
  const views = publisher && <div className="segmented-control" role="group" aria-label="Vista">
    <button type="button" aria-pressed={mine} onClick={() => setView('mios')}>Para mí</button>
    <button type="button" aria-pressed={!mine} onClick={() => setView('publicados')}>Publicados</button>
  </div>;
  const counts: Record<InboxFilter, number | null> = { todos: null, 'sin-leer': inbox.data?.noLeidos ?? null, criticos: inbox.data?.criticos ?? null };
  const filters = mine && <div className="segmented-control" role="group" aria-label="Filtrar avisos">{inboxFilters.map(f => { const look = statusFilterLook(f.status); return <button key={f.id} type="button" className={look?.className} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{look && <Icon name={look.icon} size={14} />}{f.label}{counts[f.id] ? <span className="notice-count">{counts[f.id]}</span> : null}</button>; })}</div>;
  return <>
    <CompactHeader breadcrumb="CLIMESA / Comunicación" title="Avisos" filters={filters || undefined} actions={views || undefined}/>
    {mine ? <NoticeInbox api={api} state={inbox} filter={filter} /> : <PublishedNotices api={api} profile={profile} version={version} />}
  </>;
}

/** One inbox row: level tag, then «Sin leer»/«Enterado» while in force, or «Programado»/«Vencido» otherwise. */
function InboxRow({ notice: n, selected, onSelect }: { notice: InboxNotice; selected: boolean; onSelect: () => void }) {
  const state = inboxState(n);
  const when = state === 'programado' ? (n.desde ? `empieza ${shortWhen(n.desde)}` : '') : state === 'vencido' ? (n.hasta ? `venció ${shortWhen(n.hasta)}` : '')
    : joinParts(n.publicadoEn && noticeWhen(n.publicadoEn), n.hasta && `hasta ${shortWhen(n.hasta)}`);
  return <li><button type="button" className={`notice-row${n.enteradoEn || state !== 'vigente' ? ' is-read' : ''}`} aria-current={selected ? 'true' : undefined} onClick={onSelect}>
    <span className="notice-row-head"><NoticeLevelBadge level={n.nivel} /><span className="notice-row-tags">
      {state !== 'vigente' && <Tag value={inboxStateTag[state].value} label={inboxStateTag[state].label} />}
      {state === 'vigente' ? <Tag value={n.enteradoEn ? 'completado' : 'pendiente'} label={n.enteradoEn ? 'Enterado' : 'Sin leer'} /> : n.enteradoEn && <Tag value="completado" label="Enterado" />}
    </span></span>
    <strong>{n.titulo}</strong>
    <small>{when}</small>
  </button></li>;
}

/**
 * «Para mí»: bandeja (02-sistema §5) con lista y detalle; la acción principal es «Enterado». Como la agenda de citas:
 * primero los vigentes, después los programados por día y al final, plegados, los vencidos de los últimos 30 días.
 */
function NoticeInbox({ api, state, filter }: { api: Api; state: Remote<Inbox>; filter: InboxFilter }) {
  useRefreshAt(state.data?.proximoCambio, state.refresh);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return <RemoteState state={state}>{data => {
    const items = filterInbox(data.avisos, filter);
    if (!data.avisos.length) return <Empty title="Estás al día" description="No hay avisos vigentes, programados ni vencidos en los últimos 30 días para tu rol ni tu área." />;
    if (!items.length) return <Empty title={filter === 'criticos' ? 'Sin avisos críticos' : 'Todo leído'} description="Cambia el filtro para ver los demás avisos." />;
    const { current, upcoming, past } = groupInbox(items);
    const selected = items.find(n => n.id === selectedId) ?? current[0] ?? upcoming[0]?.items[0] ?? past[0].items[0];
    const row = (n: InboxNotice) => <InboxRow key={n.id} notice={n} selected={n.id === selected.id} onSelect={() => setSelectedId(n.id)} />;
    const ahead = current.length + upcoming.length > 0, pastCount = past.reduce((total, d) => total + d.items.length, 0);
    const pastDays = past.map(d => <section className="ag-day" key={`p-${d.day}`} aria-label={formatDayHeading(`${d.day}T12:00:00-06:00`)}><h3>{formatDayHeading(`${d.day}T12:00:00-06:00`)}</h3><ul className="notice-inbox-list" aria-label="Avisos vencidos">{d.items.map(row)}</ul></section>);
    return <div className="notice-inbox">
      <div className="notice-inbox-sections">
        {current.length > 0 && <section className="ag-day" aria-label="Vigentes"><h3>Vigentes<small> · hoy</small></h3><ul className="notice-inbox-list" aria-label="Mis avisos">{current.map(row)}</ul></section>}
        {upcoming.map(d => <section className="ag-day" key={`u-${d.day}`} aria-label={`Programados · ${formatDayHeading(`${d.day}T12:00:00-06:00`)}`}><h3>{formatDayHeading(`${d.day}T12:00:00-06:00`)}<small> · programados</small></h3><ul className="notice-inbox-list" aria-label="Avisos programados">{d.items.map(row)}</ul></section>)}
        {past.length > 0 && (ahead ? <details className="ag-past"><summary>Vencidos · {plural(pastCount, 'aviso', 'avisos')}</summary>{pastDays}</details> : pastDays)}
      </div>
      <NoticeDetail key={selected.id} api={api} notice={selected} hours={data.recordatorioHoras} onDone={state.refresh} />
    </div>;
  }}</RemoteState>;
}

function NoticeDetail({ api, notice, hours, onDone }: { api: Api; notice: InboxNotice; hours: number; onDone: () => void }) {
  const action = useAction(api);
  const send = async (verb: 'enterado' | 'posponer') => { if (await action.run(`/me/avisos/${notice.id}/${verb}`, {})) onDone(); };
  const current = inboxState(notice) === 'vigente';
  const snoozable = current && notice.nivel === 'critico' && notice.dirigido && !notice.enteradoEn;
  return <section className="notice-detail" aria-label="Detalle del aviso">
    <NoticeCard notice={notice} emptyAudience="Tu área" />
    <dl className="notice-detail-meta">
      <div><dt>Publicado</dt><dd>{notice.publicadoEn ? noticeWhen(notice.publicadoEn) : '—'}</dd></div>
      {inboxState(notice) === 'programado' && <div><dt>Empieza</dt><dd>{notice.desde ? noticeWhen(notice.desde) : '—'}</dd></div>}
      <div><dt>{inboxState(notice) === 'vencido' ? 'Venció' : 'Vigente hasta'}</dt><dd>{notice.hasta ? noticeWhen(notice.hasta) : '—'}</dd></div>
      {notice.recordarEn && !notice.enteradoEn && <div><dt>Te lo recordamos</dt><dd>{noticeWhen(notice.recordarEn)}</dd></div>}
    </dl>
    <WriteError error={action.error} />
    {!current
      ? <p className="notice-detail-done">{notice.enteradoEn && <><Tag value="completado" label="Enterado" /> {noticeWhen(notice.enteradoEn)} · </>}{inboxState(notice) === 'vencido' ? 'Este aviso ya venció.' : 'Podrás dar «Enterado» cuando entre en vigencia.'}</p>
      : notice.enteradoEn
      ? <p className="notice-detail-done"><Tag value="completado" label="Enterado" /> {noticeWhen(notice.enteradoEn)}</p>
      : <div className="dialog-actions">
        {snoozable && <button type="button" className="secondary-button" disabled={action.busy} onClick={() => void send('posponer')}>Recordarme en {hours} h</button>}
        <button type="button" className="primary-button" disabled={action.busy} onClick={() => void send('enterado')}><Icon name="check" size={18} />Enterado</button>
      </div>}
  </section>;
}

/** «Publicados»: redactar, editar, retirar y ver cuántas cuentas dieron «Enterado» (solo conteos). */
function PublishedNotices({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const list = useData<NoticeListItem[]>(api, '/avisos', version);
  const stats = useData<NoticeStats[]>(api, '/avisos/estadisticas', version);
  const statsOf = (id: string) => Array.isArray(stats.data) ? stats.data.find(s => s.avisoId === id) : undefined;
  const [editing, setEditing] = useState<NoticeListItem | null>(null), [withdrawing, setWithdrawing] = useState<NoticeListItem | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // In force and scheduled first; withdrawn and expired fold behind «Ver N más» (newest first inside each group).
  const rows = list.data ?? [], past = (n: NoticeListItem) => n.estado === 'retirado' || n.estado === 'vencido';
  const current = rows.filter(n => !past(n));
  const fold = useFold([...current, ...rows.filter(past)], current.length);
  const edit = (notice: NoticeListItem) => { setMessage(null); setEditing(notice); document.querySelector('.notice-composer')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }); };
  return <>
    <NoticeComposer key={editing ? `${editing.id}-${editing.version}` : 'nuevo'} api={api} profile={profile} editing={editing} onDone={() => { if (editing) setMessage(`Cambios guardados en «${editing.titulo}». Ya se ven donde se publica.`); setEditing(null); list.refresh(); stats.refresh(); }} onCancel={() => setEditing(null)} onReload={() => { setEditing(null); list.refresh(); }} />
    {message && <Notice kind="success">{message}</Notice>}
    <section className="data-workbench notice-history" aria-label="Avisos publicados">
      <div className="table-caption">Publicados<span>Los más recientes primero. Un aviso vencido o retirado deja de verse solo.</span></div>
      <RemoteState state={list}>{rows => rows.length
        ? <><table className="record-table"><caption className="sr-only">Avisos publicados</caption><thead><tr><th>Aviso</th><th>Nivel</th><th>Dónde se ve</th><th>Vigencia</th><th>Enterado</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>{fold.shown.map(a => { const count = statsOf(a.id); return <tr key={a.id}>
            <td data-label="Aviso"><strong>{a.titulo}</strong><small>{a.cuerpo}</small></td>
            <td data-label="Nivel"><NoticeLevelBadge level={a.nivel} /></td>
            <td data-label="Dónde se ve">{audienceText(a)}</td>
            <td data-label="Vigencia">{a.desde ? noticeWhen(a.desde) : '—'}<small>hasta {a.hasta ? shortWhen(a.hasta) : '—'}</small></td>
            <td data-label="Enterado" className="numeric">{count ? (count.destinatarios ? `${count.enterados}/${count.destinatarios} enterados` : String(count.enterados)) : '—'}</td>
            <td data-label="Estado"><Tag value={stateTag[a.estado] ?? a.estado} label={stateLabel[a.estado] ?? a.estado} />
              {a.estado === 'retirado' && <small>{a.retiradoEn ? `${noticeWhen(a.retiradoEn)} · ` : ''}Motivo: {a.motivoRetiro ?? 'sin motivo registrado'}</small>}</td>
            <td data-label="Acciones">{(a.allowedActions ?? []).length
              ? <CrudActions>
                {a.allowedActions.includes('editar') && <CrudButton kind="edit" iconOnly label="Editar" onClick={() => edit(a)} />}
                {a.allowedActions.includes('retirar') && <CrudButton kind="deactivate" iconOnly label="Retirar" onClick={() => { setMessage(null); setWithdrawing(a); }} />}
              </CrudActions>
              : <small className="muted">—</small>}</td>
          </tr>; })}</tbody></table>{fold.more}</>
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
        <CrudButton kind="deactivate" type="submit" label={action.busy ? 'Retirando…' : 'Retirar aviso'} disabled={action.busy || short} />
      </div>
    </form>
  </Dialog>;
}

function NoticeComposer({ api, profile, editing, onDone, onCancel, onReload }: { api: Api; profile: AccessProfile; editing: NoticeListItem | null; onDone: () => void; onCancel: () => void; onReload: () => void }) {
  // Al editar un aviso ya vigente su inicio no cambia: se envía sin `desde` y la API conserva el inicio vigente.
  const started = editing?.estado === 'vigente';
  // Al editar uno programado, vaciar «Desde» significa empezar ahora: se envía la hora actual (sin `desde` la API conservaría el inicio programado).
  const scheduled = editing?.estado === 'programado';
  const [title, setTitle] = useState(editing?.titulo ?? ''), [body, setBody] = useState(editing?.cuerpo ?? ''), [level, setLevel] = useState<Level>(editing?.nivel ?? 'informativo');
  const [isPublic, setPublic] = useState(editing?.publico ?? true), [roles, setRoles] = useState<string[]>(editing?.roles ?? []), [areas, setAreas] = useState<string[]>(editing?.areas ?? []);
  // R7 D-6: one scale only. The web sends `nivel`; the API derives the public screen's old priority from it.
  // An edit that leaves the level as it was keeps the stored priority, so an older notice never changes rank silently.
  const keepPriority = !!editing && level === (editing.nivel ?? 'informativo');
  const priority: Priority = keepPriority ? editing!.prioridad as Priority : priorityOfLevel[level];
  const canSeeAreas = can(profile, 'espacios.ver');
  const spaces = useData<Space[]>(api, '/espacios', 0, canSeeAreas);
  // R7 D-2: «llega a N personas» while composing, with the same rule as the «Enterado» counts.
  const reachQuery = new URLSearchParams({ ...(roles.length ? { roles: [...roles].sort().join(',') } : {}), ...(areas.length ? { areas: [...areas].sort().join(',') } : {}) }).toString();
  const reach = useData<{ destinatarios: number }>(api, `/avisos/alcance?${reachQuery}`, 0, reachQuery.length > 0);
  // break-ui: an audience with nobody active is a real case (a new area, a role without staff); say so instead of "0 personas".
  const reachCount = reach.data?.destinatarios;
  const reachText = reachQuery ? (reachCount === undefined ? 'Calculando a cuántas personas llega…'
    : reachCount === 0 ? `Nadie del personal activo recibe este aviso con esta audiencia${isPublic ? '; solo lo verá la pantalla pública' : ''}.`
    : `Llega a ${formatNumber(reachCount)} ${reachCount === 1 ? 'persona' : 'personas'}${isPublic ? ' y a la pantalla pública' : ''}`) : isPublic ? 'Solo pantalla pública y apps sin sesión' : '';
  const [confirming, setConfirming] = useState(false);
  const areaOptions = (Array.isArray(spaces.data) ? spaces.data : []).filter(s => s.active && (s.type === 'area' || s.type === 'bahia'));
  const [from, setFrom] = useState(editing && !started && editing.desde ? isoToLocalInput(editing.desde) : ''), [until, setUntil] = useState(() => editing?.hasta ? isoToLocalInput(editing.hasta) : localInput(72));
  const [done, setDone] = useState(false);
  const action = useAction(api);
  const found = personalDataIn(title, body), warned = action.error?.code === PERSONAL_DATA;
  const noAudience = !isPublic && roles.length === 0 && areas.length === 0;
  const invalid = title.trim().length < 3 || body.trim().length < 3 || !until || noAudience;
  const toggle = (role: string) => setRoles(current => current.includes(role) ? current.filter(r => r !== role) : [...current, role]);
  const toggleArea = (code: string) => setAreas(current => current.includes(code) ? current.filter(a => a !== code) : [...current, code]);

  async function publish(confirm: boolean) {
    const payload = { titulo: title.trim(), cuerpo: body.trim(), nivel: level, ...(keepPriority ? { prioridad: priority } : {}), publico: isPublic, roles, areas, ...(started ? {} : from ? { desde: localToIso(from) } : scheduled ? { desde: new Date().toISOString() } : {}), hasta: localToIso(until), ...(confirm ? { confirmarDatosPersonales: true } : {}) };
    if (editing) {
      if (await action.run(`/avisos/${editing.id}`, { ...payload, version: editing.version }, 'PUT')) onDone();
      return;
    }
    if (await action.run('/avisos', payload)) { setTitle(''); setBody(''); setLevel('informativo'); setPublic(true); setRoles([]); setAreas([]); setFrom(''); setUntil(localInput(72)); setDone(true); onDone(); }
  }
  // R7 D1: a critical or public notice reaches many people at once, so it confirms with a summary first.
  const needsConfirm = (level === 'critico' || isPublic) && (!editing || level !== (editing.nivel ?? 'informativo') || isPublic !== editing.publico);
  const submit = (event: FormEvent) => { event.preventDefault(); setDone(false); if (needsConfirm) setConfirming(true); else void publish(false); };
  const confirmAndPublish = async () => { setConfirming(false); await publish(false); };
  const label = editing ? (action.busy ? 'Guardando…' : 'Guardar cambios') : (action.busy ? 'Publicando…' : 'Publicar aviso');
  // Owner obs. 22: the preview says in plain words who will see it, with area names instead of codes.
  const areaName = (code: string) => areaOptions.find(a => a.code === code)?.name ?? code;
  const audience = [
    ...(isPublic ? ['Pantalla pública y apps sin sesión'] : []),
    ...(roles.length ? [`Roles: ${roles.map(r => roleNames[r] ?? r).join(', ')}`] : []),
    ...(areas.length ? [`Áreas: ${areas.map(areaName).join(', ')}`] : []),
  ];
  const [previewOpen, setPreviewOpen] = useState(true);

  return <section className="notice-composer" aria-label={editing ? 'Editar aviso' : 'Nuevo aviso'}>
    <form className="module-form" onSubmit={submit}>
      <h2>{editing ? 'Editar aviso' : 'Nuevo aviso'}</h2>
      {editing && <Notice kind="info">Editas «{editing.titulo}». Los cambios se ven de inmediato; quien ya no esté en la audiencia deja de verlo.</Notice>}
      {done && <Notice kind="success">Aviso publicado. Ya aparece donde lo elegiste.</Notice>}
      {warned
        ? <Notice kind="error">{action.error?.message} <button type="button" className="secondary-button" disabled={action.busy} onClick={() => void publish(true)}>{editing ? 'Guardar de todos modos' : 'Publicar de todos modos'}</button></Notice>
        : <WriteError error={action.error} onReload={editing ? onReload : undefined} />}
      <div className="notice-form-columns">
        <div className="notice-form-main">
          <Field label="Título" value={title} onChange={setTitle} required minLength={3} maxLength={120} hint="Corto y claro: qué pasa." />
          <div className="field"><label htmlFor="aviso-cuerpo">Texto del aviso</label><textarea id="aviso-cuerpo" value={body} onChange={e => setBody(e.target.value)} required minLength={3} maxLength={1000} rows={4} /><small className="field-hint">{body.length}/1000 caracteres</small></div>
          {found.length > 0 && <Notice kind="error">El texto parece contener {found.join(', ')}. Un aviso no debe llevar datos de pacientes ni de personal: quítalos o, si es intencional, confirma al publicar.</Notice>}
          <fieldset className="notice-fieldset"><legend>Nivel</legend>
            <div className="segmented-control" role="group" aria-label="Nivel">{levels.map(l => { const look = statusFilterLook(l.status); return <button key={l.id} type="button" className={look?.className} aria-pressed={level === l.id} title={l.hint} onClick={() => setLevel(l.id)}>{look && <Icon name={look.icon} size={14} />}{l.label}</button>; })}</div>
            <small className="field-hint">{levels.find(l => l.id === level)?.hint}</small>
          </fieldset>
          <fieldset className="notice-fieldset"><legend>Vigencia</legend>
            <div className="form-grid">
              {started
                ? <p className="field-hint">Vigente desde {editing?.desde ? shortWhen(editing.desde) : '—'}; el inicio no cambia.</p>
                : <Field label="Desde (opcional)" type="datetime-local" value={from} onChange={setFrom} hint={scheduled && editing?.desde ? `Programado para ${shortWhen(editing.desde)}. Si lo vacías, empieza al guardar.` : 'Sin fecha, empieza al publicarlo.'} />}
              <Field label="Hasta" type="datetime-local" value={until} onChange={setUntil} required hint={editing ? 'Adelántalo para que venza antes.' : undefined} />
            </div>
            <div className="segmented-control" role="group" aria-label="Duración rápida">{durations.map(d => <button key={d.hours} type="button" onClick={() => setUntil(localInput(d.hours))}>{d.label}</button>)}</div>
            <small className="field-hint">Desaparece solo al llegar a «Hasta».</small>
          </fieldset>
        </div>
        <fieldset className="notice-fieldset notice-audience"><legend>¿Quién lo ve?</legend>
          <fieldset className="notice-audience-group"><legend>Público</legend>
            <label className="notice-check"><input type="checkbox" checked={isPublic} onChange={e => setPublic(e.target.checked)} />Público: pantalla pública y apps sin iniciar sesión</label>
          </fieldset>
          <fieldset className="notice-audience-group"><legend>Roles{roles.length > 0 && <span className="notice-count">{roles.length}</span>}</legend>
            <div className="notice-roles">{audienceRoles.map(r => <label key={r} className="notice-check"><input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(r)} />{roleNames[r]}</label>)}</div>
          </fieldset>
          <fieldset className="notice-audience-group"><legend>Áreas{areas.length > 0 && <span className="notice-count">{areas.length}</span>}</legend>
            {!canSeeAreas && <small className="field-hint">Para dirigirlo a un área hace falta el permiso de ver espacios; pídeselo a Administración.</small>}
            {areaOptions.length > 0 && <div className="notice-roles" role="group" aria-label="Áreas">{areaOptions.map(a => <label key={a.id} className="notice-check"><input type="checkbox" checked={areas.includes(a.code)} onChange={() => toggleArea(a.code)} /><AreaTag code={a.code} />{a.name}</label>)}</div>}
          </fieldset>
          <small className="field-hint">Los roles y las áreas lo ven en Avisos, en la web y en las apps; si es crítico, también en su inicio. Un aviso solo para roles o áreas no sale en la pantalla pública.</small>
          {noAudience && <Notice kind="error">Elige a quién va dirigido: público, uno o más roles o áreas.</Notice>}
        </fieldset>
      </div>
      <div className="dialog-actions">
        {editing && <button className="secondary-button" type="button" disabled={action.busy} onClick={onCancel}>Cancelar edición</button>}
        <button className="primary-button" type="submit" disabled={action.busy || invalid}><Icon name="megaphone" size={18} />{label}</button>
      </div>
    </form>
    <aside className="notice-preview" aria-label="Vista previa" data-open={previewOpen ? 'true' : 'false'}>
      <header className="notice-preview-head"><h3>Vista previa</h3>
        <button type="button" className="secondary-button notice-preview-toggle" aria-expanded={previewOpen} onClick={() => setPreviewOpen(!previewOpen)}>{previewOpen ? 'Ocultar' : 'Mostrar'}</button></header>
      <div className="notice-preview-body">
        <NoticeCard notice={{ titulo: title.trim(), cuerpo: body.trim(), prioridad: priority, nivel: level, publico: isPublic, roles, areas, hasta: until ? localToIso(until) : null }} showAudience={false} />
        <div className="notice-audience-summary">
          <strong>Lo verán:</strong>
          {audience.length ? <ul>{audience.map(line => <li key={line}>{line}</li>)}</ul> : <p>Nadie todavía. Elige público, roles o áreas.</p>}
          {reachQuery && <p className={reachCount === 0 ? 'notice-reach is-empty' : 'notice-reach'} role="status">{reachText}</p>}
        </div>
        <p className="muted">{isPublic ? 'En la pantalla pública solo se muestran título y texto.' : 'No saldrá en la pantalla pública.'}</p>
      </div>
    </aside>
    {confirming && <Dialog title={editing ? 'Guardar cambios del aviso' : 'Publicar aviso'} onClose={() => setConfirming(false)}>
      <div className="module-form">
        <p>Revisa antes de {editing ? 'guardar' : 'publicar'}: {level === 'critico' ? 'un aviso crítico se destaca en el inicio de cada persona hasta que da «Enterado».' : 'un aviso público sale en la pantalla pública y en las apps sin sesión.'}</p>
        <dl className="detail-grid">
          <div><dt>Título</dt><dd>{title.trim()}</dd></div>
          <div><dt>Nivel</dt><dd><NoticeLevelBadge level={level} /></dd></div>
          <div><dt>Dónde se ve</dt><dd>{audienceText({ publico: isPublic, roles, areas })}</dd></div>
          {reachText && <div><dt>Alcance</dt><dd>{reachText}</dd></div>}
          <div><dt>Hasta</dt><dd>{until ? noticeWhen(localToIso(until)) : '—'}</dd></div>
        </dl>
        <div className="dialog-actions">
          <button type="button" className="secondary-button" onClick={() => setConfirming(false)}>Volver</button>
          <button type="button" className="primary-button" onClick={() => void confirmAndPublish()}><Icon name="megaphone" size={18} />{editing ? 'Guardar cambios' : 'Publicar aviso'}</button>
        </div>
      </div>
    </Dialog>}
  </section>;
}
