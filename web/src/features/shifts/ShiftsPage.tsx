import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AreaChip, RoleChip, roleIdentity } from '../../components/identity';
import { ExportMenu } from '../../components/export-menu';
import { SearchPicker, type PickerItem } from '../../components/search-picker';
import { Icon, Notice } from '../../components/ui';
import { statusFilterLook } from '../../components/system';
import { can, type AccessProfile, type Api, type Shift } from '../../lib/api';
import { exportName, type ExportTable } from '../../lib/export';
import { CompactHeader, Dialog, Empty, RemoteState, SaveButton, WriteError, formatDateTime, isVersionConflict, useAction, useData } from '../common';
import { formatDayHeading } from '../../lib/format';
import { useQuickAction } from '../personal/accion';
import { readHashParams, writeHashParams } from '../../lib/hash-params';
import { Field } from '../../components/ui';
import { ShiftForm, type ShiftDraft } from './ShiftForm';
import { CrewCoverageAlert } from './CrewCoverageAlert';
import { AreaCoverageAlert, type CoverageWeek } from './AreaCoverageAlert';
import { FillGapsDialog, GapCoverDialog, blockLabel, draftCountLabel, findGapBlock, gapCountLabel, parseGapParam, pendingGapBlocks, type GapBlock } from './GapCover';
import { useFold } from '../../components/fold';
import { AttendanceDialog } from './AttendanceDialog';
import { SpecialistsWeek } from './SpecialistsWeek';
import { DAY_VIEW_LANES, ShiftWeek, StateLegend, timeRange, type CalendarPlanning } from './ShiftWeek';
import { BatchPreview, BulkDialog, MoveDialog, PublishWeekDialog, RotationDialog, TemplatesDialog, moveBody } from './PlanningDialogs';
import { copyWeek, type BatchGap, type BatchResult, type PreviewItem } from './plan';
import { ShiftDayList, ShiftDetail, dayTitle, type RowActions } from './ShiftDayList';
import { KIND_LABEL, attendanceLabel, can as canShift, localDay, localMs, suggestKind, type CatalogArea, type CatalogRole, type CatalogStaff, type ShiftCatalog, type ShiftRow } from './rules';
import { addWeeks, dayHeading, displayState, mondayOf, stateName, weekDays, weekLabel } from './week';
import './shifts.css';

type View = 'semana' | 'lista' | 'especialistas';
type Sort = 'inicio' | 'persona';
type Scale = 'semana' | 'dia';
type Batch = { items: PreviewItem[]; initial?: { resultados: BatchResult[]; huecos: BatchGap[] } };
type Undo = { shift: ShiftRow; start: string; end: string; version: number };
const DRAFT_REASON = 'Ajuste de borrador en el calendario', UNDO_REASON = 'Deshacer el cambio anterior en el calendario';
const STATES: [string, string][] = [['borrador', 'Borradores'], ['publicado', 'Publicados por iniciar'], ['en_curso', 'En curso'], ['completado', 'Completados'], ['ausente', 'Ausencias'], ['cancelado', 'Cancelados']];
const EMPTY_CATALOG: ShiftCatalog = { roles: [], areas: [], staff: [] };
/** La semana con bloques por hora necesita ancho; en un teléfono se abre la lista por día (la semana sigue disponible). */
const WIDE = '(min-width: 900px)';
/** Ventana que trae `GET /turnos` sin rango (SHIFT_WINDOW de la API); una semana fuera de ella se pide con from/to. */
const WINDOW_PAST = 31 * 86_400_000, WINDOW_FUTURE = 93 * 86_400_000;
const initialView = (): View => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(WIDE).matches ? 'semana' : 'lista';

/** Si el catálogo no se puede leer, las opciones se arman con los turnos cargados: peor que el catálogo, pero la pantalla sigue útil. */
function fallbackCatalog(rows: ShiftRow[]): ShiftCatalog {
  const roles = new Map<string, CatalogRole>(), areas = new Map<string, CatalogArea>(), staff = new Map<string, CatalogStaff>();
  for (const t of rows) {
    if (t.staffType) roles.set(t.staffType, { code: t.staffType, name: roleIdentity(t.staffType).label });
    areas.set(t.areaId, { id: t.areaId, parentId: null, type: 'area', code: '', name: t.area });
    staff.set(t.staffId, { id: t.staffId, name: t.person, type: t.staffType ?? 'otro', specialty: null, areaId: null, area: null, registrations: [] });
  }
  return { roles: [...roles.values()], areas: [...areas.values()], staff: [...staff.values()] };
}

export function ShiftsPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<ShiftRow[]>(api, '/turnos', version);
  const remote = useData<ShiftCatalog>(api, '/turnos/catalogo', version);
  const plan = can(profile, 'turnos.planificar');
  const all = data.data ?? [];
  const catalog = remote.data ?? (remote.error ? fallbackCatalog(all) : EMPTY_CATALOG);

  const [open, setOpen] = useState(false), [editing, setEditing] = useState<Shift | null>(null), [cancelling, setCancelling] = useState<Shift | null>(null);
  const [marking, setMarking] = useState<ShiftRow | null>(null), [detail, setDetail] = useState<ShiftRow | null>(null), [draft, setDraft] = useState<ShiftDraft | undefined>(undefined);
  const [view, setView] = useState<View>(() => parseGapParam(readHashParams().get('hueco')) ? 'semana' : initialView());
  const [person, setPerson] = useState<PickerItem | null>(null), [role, setRole] = useState('todos'), [area, setArea] = useState('todos'), [state, setState] = useState('todos');
  // R7 F3: `#/turnos?persona=yo` («Ver mis turnos» from Inicio) shows only this account's shifts. An account without a
  // staff record has no shifts of its own: it says so instead of showing the whole hospital.
  const [unlinked, setUnlinked] = useState(false);
  // `#/turnos?hueco=<areaId>:<role>:<start>` (the Inicio tray): open «Cubrir hueco» on that hole of its week.
  const [wantedGap, setWantedGap] = useState(() => parseGapParam(readHashParams().get('hueco')));
  useEffect(() => {
    const params = readHashParams();
    if (params.get('hueco')) writeHashParams({ hueco: null });
    if (params.get('persona') !== 'yo') return;
    writeHashParams({ persona: null });
    if (profile.staffId) setPerson({ id: profile.staffId, label: `${profile.name} (yo)` }); else setUnlinked(true);
  }, []);
  const [sort, setSort] = useState<Sort>('inicio'), [panel, setPanel] = useState(false), [focusDay, setFocusDay] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [monday, setMonday] = useState(() => mondayOf(wantedGap?.at ?? Date.now()));
  const [quick, consumeQuick] = useQuickAction();
  // Planificación (S12): vista Día, turno recién creado resaltado, mover con motivo, deshacer y lotes como borrador.
  const [scale, setScale] = useState<Scale>('semana'), [dayDate, setDayDate] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null), [announce, setAnnounce] = useState('');
  const [moving, setMoving] = useState<{ shift: ShiftRow; start: string; end: string } | null>(null), [undo, setUndo] = useState<Undo | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null), [tool, setTool] = useState<'rotacion' | 'masiva' | 'plantillas' | 'publicar' | null>(null);
  const move = useAction(api);
  const publish = can(profile, 'turnos.publicar');
  // Reloj local para pasar de "publicado" a "en curso" en pantalla sin pedir datos; no consulta la red.
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 30_000); return () => clearInterval(timer); }, []);
  useEffect(() => { if (!quick) return; if (quick === 'planificar' && plan) { setEditing(null); setOpen(true); } consumeQuick(); }, [quick, plan, consumeQuick]);
  // "N turnos más" de un día de la semana abre la lista en ese día.
  useEffect(() => { if (view !== 'lista' || !focusDay) return; document.getElementById(`dia-${focusDay}`)?.scrollIntoView({ block: 'start' }); setFocusDay(null); }, [view, focusDay]);

  const at = now.valueOf(), today = localDay(at);
  const days = useMemo(() => weekDays(monday), [monday]);
  const weekStart = days[0].start, weekEnd = days[6].end, sunday = days[6].date;
  // La semana visible sale de la ventana por omisión (con el día anterior, por las guardias que llegan al lunes); si no
  // cabe, se pide esa semana con from/to para no mostrar una semana vacía que no lo está.
  const covered = weekStart - 86_400_000 >= Date.now() - WINDOW_PAST && weekEnd <= Date.now() + WINDOW_FUTURE;
  const weekData = useData<ShiftRow[]>(api, `/turnos?from=${localDay(weekStart - 1)}&to=${sunday}`, version, !covered && view !== 'especialistas');
  const source = covered ? data : weekData;
  const shown = source.data ?? [];
  // Al llegar la hora de inicio del próximo turno, se vuelve a pedir la planificación: el servidor ya lo pasó a en curso
  // y dejó de permitir editarlo o cancelarlo. Un temporizador hasta esa hora, no una consulta periódica.
  const nextStart = useMemo(() => shown.map(t => Date.parse(t.start)).filter(s => s > at).reduce((a, b) => Math.min(a, b), Infinity), [shown, at]);
  const refreshShown = useRef(source.refresh);
  refreshShown.current = source.refresh;
  useEffect(() => {
    const wait = nextStart - Date.now();
    if (!Number.isFinite(wait) || wait > 86_400_000) return;
    const timer = setTimeout(() => { setNow(new Date()); refreshShown.current(); }, Math.max(0, wait) + 1_000);
    return () => clearTimeout(timer);
  }, [nextStart]);

  const coverage = useData<CoverageWeek>(api, `/turnos/cobertura?from=${monday}&to=${sunday}`, version, view === 'semana');
  const staffById = useMemo(() => new Map(catalog.staff.map(p => [p.id, p])), [catalog.staff]);
  const typeOf = (t: ShiftRow) => t.staffType ?? staffById.get(t.staffId)?.type;
  const personItems = useMemo<PickerItem[]>(() => catalog.staff.map(p => ({ id: p.id, label: p.name, detail: [roleIdentity(p.type).label, p.area].filter(Boolean).join(' · ') })), [catalog.staff]);

  const matches = (t: ShiftRow) => (!person || t.staffId === person.id) && (role === 'todos' || typeOf(t) === role) && (area === 'todos' || t.areaId === area) && (state === 'todos' || displayState(t, at) === state);
  // La semana dibuja todo lo que la toca (una guardia del domingo anterior llega al lunes); la lista y la exportación
  // toman los turnos asignados a sus días (los que empiezan en la semana).
  const inWeek = useMemo(() => shown.filter(t => Date.parse(t.start) < weekEnd && Date.parse(t.end) > weekStart), [shown, weekStart, weekEnd]);
  const drawn = inWeek.filter(matches);
  const rows = drawn.filter(t => Date.parse(t.start) >= weekStart).sort((a, b) => Date.parse(a.start) - Date.parse(b.start) || a.person.localeCompare(b.person, 'es'));
  const assigned = inWeek.filter(t => Date.parse(t.start) >= weekStart).length;
  const gaps = useMemo(() => (coverage.data?.gaps ?? []).filter(g => area === 'todos' || g.areaId === area), [coverage.data, area]);
  // R7 F2 + the one gap rule (`pendingGapBlocks`): holes that end after now, in the 12 h blocks «Cubrir hueco» and
  // «Llenar los huecos» propose; the ones drafts already cover only wait for publishing.
  const pending = useMemo(() => pendingGapBlocks(gaps, at), [gaps, at]);
  const openBlocks = pending.open;
  const gapFold = useFold(openBlocks, 12);
  const [covering, setCovering] = useState<GapBlock | null>(null), [filling, setFilling] = useState(false);
  useEffect(() => {
    if (!wantedGap || !plan || !coverage.data || coverage.data.from !== mondayOf(wantedGap.at)) return;
    const block = findGapBlock(openBlocks, wantedGap);
    setWantedGap(null);
    if (block) setCovering(block); else setAnnounce('Ese hueco ya está cubierto o ya terminó.');
  }, [wantedGap, plan, coverage.data, openBlocks]);

  const active: { key: string; label: string; clear: () => void }[] = [
    ...(person ? [{ key: 'persona', label: `Persona: ${person.label}`, clear: () => setPerson(null) }] : []),
    ...(role !== 'todos' ? [{ key: 'rol', label: `Rol: ${catalog.roles.find(r => r.code === role)?.name ?? roleIdentity(role).label}`, clear: () => setRole('todos') }] : []),
    ...(area !== 'todos' ? [{ key: 'area', label: `Área: ${catalog.areas.find(a => a.id === area)?.name ?? 'Área'}`, clear: () => setArea('todos') }] : []),
    ...(state !== 'todos' ? [{ key: 'estado', label: `Estado: ${STATES.find(s => s[0] === state)?.[1] ?? state}`, clear: () => setState('todos') }] : []),
  ];
  const clearAll = () => { setPerson(null); setRole('todos'); setArea('todos'); setState('todos'); };

  const table = (): ExportTable => ({
    filename: exportName('turnos'), title: 'Turnos del personal', subtitle: [`Semana del ${weekLabel(monday, { withYear: true })}`, ...active.map(a => a.label)].join(' · '),
    columns: ['Día', 'Persona', 'Rol', 'Área', 'Horario', 'Inicio', 'Fin', 'Tipo', 'Estado', 'Asistencia'],
    rows: rows.map(t => [dayTitle(localDay(Date.parse(t.start)), today), t.person, roleIdentity(typeOf(t)).label, t.area, timeRange(t.start, t.end), formatDateTime(t.start, { withYear: true }), formatDateTime(t.end, { withYear: true }), KIND_LABEL[t.type] ?? t.type, stateName(displayState(t, at)), attendanceLabel(t) ?? '']),
  });

  const jornada = formatDayHeading(now).replace(/^./, c => c.toUpperCase());
  const toggle = (current: string, value: string, set: (v: string) => void) => set(current === value ? 'todos' : value);
  const assignSubstitute = (shift: ShiftRow, staffId: string) => { setMarking(null); setEditing(null); setDraft({ areaId: shift.areaId, start: new Date(Math.max(Date.now() + 5 * 60_000, Date.parse(shift.start))).toISOString(), end: shift.end, type: shift.type, staffId }); setOpen(true); data.refresh(); };
  const actions: RowActions = {
    onEdit: t => { setEditing(t); setDraft(undefined); setOpen(true); },
    onCancel: t => setCancelling(t),
    onAttendance: t => setMarking(t),
  };
  const isThisWeek = monday === mondayOf(at);
  const gapWindow = isThisWeek ? 'esta semana' : `la semana del ${weekLabel(monday)}`;
  // Planner alerts are for whoever plans; «Mis turnos» (this person's own shifts) never shows them.
  const plannerAlerts = plan && !(person && person.id === profile.staffId);
  const showGaps = () => { setMonday(mondayOf(at)); setView('semana'); setScale('semana'); setTimeout(() => document.getElementById('huecos-por-cubrir')?.scrollIntoView?.({ block: 'start' }), 0); };

  const reload = () => { data.refresh(); if (!covered) weekData.refresh(); };
  const shownDay = days.find(d => d.date === dayDate) ?? days.find(d => d.date === today) ?? days[0];
  const visibleDays = scale === 'dia' ? [shownDay] : days;
  const dayName = (date: string) => { const h = dayHeading(date, today); return `${h.relative ? `${h.relative}, ` : ''}${h.label}`; };
  const drafts = inWeek.filter(t => t.state === 'borrador' && Date.parse(t.start) >= weekStart && (area === 'todos' || t.areaId === area)).length;
  const areaId = area === 'todos' ? undefined : area;
  // R7 F1: drafts of the week by area, for the publish confirmation.
  const draftsByArea = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; count: number }>();
    for (const t of inWeek) if (t.state === 'borrador' && Date.parse(t.start) >= weekStart) { const g = groups.get(t.areaId) ?? { id: t.areaId, name: t.area, count: 0 }; g.count++; groups.set(t.areaId, g); }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }, [inWeek, weekStart]);
  const iso = (ms: number) => new Date(ms).toISOString();
  const openCreate = (date: string, start?: number, end?: number) => {
    const from = start ?? localMs(date, '07:00'), to = end ?? from + 8 * 3600_000;
    setEditing(null); setDraft({ areaId: areaId ?? '', start: iso(from), end: iso(to), type: suggestKind(from, to), staffId: '' }); setOpen(true);
  };
  // Un borrador se ajusta sin motivo (nadie lo ve todavía); un turno publicado pide el motivo en un diálogo.
  const moved = (shift: ShiftRow, start: string, end: string, version: number) => {
    setUndo({ shift: { ...shift, start, end, version }, start: shift.start, end: shift.end, version });
    setHighlight(shift.id); setAnnounce(`Turno de ${shift.person} movido a ${timeRange(start, end)}.`); reload();
  };
  const planning: CalendarPlanning | undefined = plan ? {
    canMove: t => canShift(t, 'editar') && Date.parse(t.start) > at,
    onCreate: openCreate,
    onMove: async (shift, start, end) => {
      if (shift.state !== 'borrador') { setMoving({ shift, start, end }); return; }
      const saved = await move.run<{ version: number }>(`/turnos/${shift.id}`, moveBody(shift, start, end, DRAFT_REASON), 'PATCH');
      if (saved) moved(shift, start, end, saved.version);
    },
  } : undefined;
  const undoMove = async () => {
    if (!undo) return;
    const saved = await move.run<{ version: number }>(`/turnos/${undo.shift.id}`, moveBody(undo.shift, undo.start, undo.end, UNDO_REASON), 'PATCH');
    if (saved) { setUndo(null); setHighlight(undo.shift.id); setAnnounce(`Se deshizo el cambio del turno de ${undo.shift.person}.`); reload(); }
  };
  // Copiar la semana anterior: desde los turnos ya cargados, o pidiendo esa semana si queda fuera de la ventana.
  const copyPrevious = async () => {
    const previous = weekDays(addWeeks(monday, -1));
    let source = all;
    if (previous[0].start < Date.now() - WINDOW_PAST) {
      try { source = await api.request<ShiftRow[]>(`/turnos?from=${previous[0].date}&to=${previous[6].date}`); }
      catch { setAnnounce('No pudimos leer la semana anterior. Vuelve a intentar.'); return; }
    }
    const items = copyWeek(source, previous, areaId);
    if (!items.length) { setAnnounce('La semana anterior no tiene turnos para copiar con estos filtros.'); return; }
    setBatch({ items });
  };
  const created = (count: number) => { setBatch(null); setAnnounce(`${count === 1 ? '1 borrador creado' : `${count} borradores creados`}. Revísalos en el calendario y publica la semana cuando esté lista.`); reload(); };
  // El turno recién creado o movido se trae a la vista sin cambiar de semana.
  useEffect(() => { if (highlight) document.querySelector('.shift-block.is-new')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [highlight, shown]);

  return <>
    <CompactHeader breadcrumb="Operaciones / Jornada" title="Turnos"
      actions={<>
        <ExportMenu table={table} disabled={!rows.length} />
        {plan && view !== 'especialistas' && <button className="primary-button" onClick={() => { setEditing(null); setDraft(undefined); setOpen(true); }}><Icon name="plus" size={18} />Asignar turno</button>}
      </>} />
    <div className="shift-views" role="group" aria-label="Vista">
      <button type="button" className="shift-pill" aria-pressed={view === 'semana'} onClick={() => setView('semana')}>Semana</button>
      <button type="button" className="shift-pill" aria-pressed={view === 'lista'} onClick={() => setView('lista')}>Lista por día</button>
      <button type="button" className="shift-pill" aria-pressed={view === 'especialistas'} onClick={() => setView('especialistas')}>Especialistas de la semana</button>
    </div>
    {view === 'especialistas' ? <SpecialistsWeek api={api} version={version} /> : <>
    <div className="planning-window"><strong>Jornada laboral abierta</strong><span>{jornada} · Cada turno pasa a en curso a su hora, con la entrada confirmada, y a completado al terminar. Jefatura solo marca ausencias.</span></div>
    {plannerAlerts && data.data && remote.data && <CrewCoverageAlert shifts={all} typeOf={typeOf} now={now} onPlan={() => { setEditing(null); setOpen(true); }} />}
    {plannerAlerts && <AreaCoverageAlert api={api} version={version} now={now} areaId={areaId} onShow={showGaps} />}
    {unlinked ? <Empty title="Tu cuenta no está vinculada a una ficha" description="Pide a Administración que vincule tu cuenta con tu ficha de personal para ver tus turnos aquí." /> : <section className="data-workbench">
      <div className="shift-toolbar">
        <div className="shift-weeknav" role="group" aria-label="Semana">
          <button type="button" className="secondary-button" aria-label="Semana anterior" onClick={() => setMonday(m => addWeeks(m, -1))}><Icon name="back" size={18} /></button>
          <strong className="shift-weeknav-label">{weekLabel(monday)}</strong>
          <button type="button" className="secondary-button" aria-label="Semana siguiente" onClick={() => setMonday(m => addWeeks(m, 1))}><Icon name="arrow" size={18} /></button>
          {!isThisWeek && <button type="button" className="secondary-button" onClick={() => setMonday(mondayOf(at))}>Esta semana</button>}
        </div>
        <div className="shift-toolbar-row">
          <SearchPicker label="Buscar persona" value={person} onChange={setPerson} items={personItems} placeholder="Escribe un nombre" />
          <button type="button" className="secondary-button" aria-expanded={panel} aria-controls="shift-filters" onClick={() => setPanel(v => !v)}><Icon name="grid" size={18} />Filtros{active.length > 0 && ` (${active.length})`}</button>
          {view === 'lista' && <div className="select-field"><label htmlFor="shift-sort">Ordenar cada día por</label>
            <select id="shift-sort" value={sort} onChange={e => setSort(e.target.value as Sort)}><option value="inicio">Hora de inicio</option><option value="persona">Persona (A–Z)</option></select></div>}
        </div>
        {panel && <div id="shift-filters" className="shift-filter-panel">
          <fieldset className="shift-filter-group"><legend>Rol del personal</legend><div className="shift-pills">
            {catalog.roles.map(r => <button key={r.code} type="button" className="shift-pill" aria-pressed={role === r.code} onClick={() => toggle(role, r.code, setRole)}><RoleChip code={r.code} label={r.name} /></button>)}
          </div></fieldset>
          <fieldset className="shift-filter-group"><legend>Área de trabajo</legend><div className="shift-pills">
            {catalog.areas.map(a => <button key={a.id} type="button" className="shift-pill" aria-pressed={area === a.id} onClick={() => toggle(area, a.id, setArea)}><AreaChip name={a.name} type={a.type} /></button>)}
          </div></fieldset>
          <fieldset className="shift-filter-group"><legend>Estado del turno</legend><div className="shift-pills">
            {STATES.map(([code, name]) => { const look = statusFilterLook(code); return <button key={code} type="button" className={look ? `shift-pill ${look.className}` : 'shift-pill'} aria-pressed={state === code} onClick={() => toggle(state, code, setState)}>{look && <Icon name={look.icon} size={14} />}{name}</button>; })}
          </div></fieldset>
        </div>}
        {active.length > 0 && <div className="shift-active" aria-label="Filtros activos">
          {active.map(a => <button key={a.key} type="button" className="shift-active-chip" aria-label={`Quitar filtro ${a.label}`} onClick={a.clear}>{a.label}<Icon name="close" size={14} /></button>)}
          <button type="button" className="secondary-button" onClick={clearAll}>Quitar filtros</button>
        </div>}
        {plan && view === 'semana' && <div className="shift-plan-tools" role="group" aria-label="Planificar la semana">
          <button type="button" className="secondary-button" onClick={() => setTool('rotacion')}>Generar rotación</button>
          {openBlocks.length > 0 && <button type="button" className="secondary-button" onClick={() => setFilling(true)} title="Turnos que faltan en la semana que estás viendo, desde ahora">Llenar los huecos de {gapWindow} ({openBlocks.length} {openBlocks.length === 1 ? 'turno' : 'turnos'})</button>}
          <button type="button" className="secondary-button" onClick={() => void copyPrevious()}>Copiar semana anterior</button>
          <button type="button" className="secondary-button" onClick={() => setTool('masiva')}>Asignación masiva</button>
          <button type="button" className="secondary-button" onClick={() => setTool('plantillas')}>Plantillas</button>
          {publish && drafts > 0 && <button type="button" className="primary-button" onClick={() => setTool('publicar')}>{`Publicar semana (${drafts === 1 ? '1 borrador' : `${drafts} borradores`})`}</button>}
        </div>}
        {view === 'semana' && <div className="shift-scale">
          <div className="shift-views" role="group" aria-label="Escala del calendario">
            <button type="button" className="shift-pill" aria-pressed={scale === 'semana'} onClick={() => setScale('semana')}>Toda la semana</button>
            <button type="button" className="shift-pill" aria-pressed={scale === 'dia'} onClick={() => setScale('dia')}>Día</button>
          </div>
          {scale === 'dia' && <div className="shift-day-picker" role="group" aria-label="Día que se muestra">
            {days.map(d => { const h = dayHeading(d.date, today); return <button key={d.date} type="button" className="shift-pill" aria-pressed={d.date === shownDay.date} onClick={() => setDayDate(d.date)}>{`${h.weekday} ${h.dayNumber}`}</button>; })}
          </div>}
        </div>}
        <div className="shift-announce" role="status" aria-live="polite">
          {(undo || move.error) ? <div className="shift-undo">
            {move.error ? <WriteError error={move.error} /> : <span>{announce}</span>}
            {undo && <button type="button" className="secondary-button" onClick={() => void undoMove()} disabled={move.busy}>Deshacer</button>}
          </div> : announce && <Notice kind="info">{announce}</Notice>}
        </div>
        <div className="shift-toolbar-foot">
          <p className="shift-count" role="status">{rows.length} de {assigned} turnos de la semana</p>
          {view === 'semana' && <StateLegend />}
        </div>
      </div>
      <RemoteState state={source}>{() => view === 'semana' ? <section className="shift-week-wrap" aria-label={scale === 'dia' ? dayName(shownDay.date) : `Semana del ${weekLabel(monday)}`}>
        {coverage.error && coverage.error.status !== 403 && <Notice kind="error">No pudimos dibujar los huecos de cobertura de esta semana: {coverage.error.message} <button type="button" className="secondary-button" onClick={coverage.refresh}>Volver a intentar</button></Notice>}
        <ShiftWeek days={visibleDays} today={today} now={at} shifts={drawn} gaps={gaps} onOpen={setDetail} onShowDay={date => { setFocusDay(date); setView('lista'); }}
          planning={planning} highlight={highlight} maxLanes={scale === 'dia' ? DAY_VIEW_LANES : undefined} />
        {plan && (openBlocks.length > 0 || pending.inDraft.length > 0) && <section id="huecos-por-cubrir" className="gap-list" aria-label="Huecos por cubrir"><h3>{gapCountLabel(openBlocks.length, gapWindow).replace(/^./, c => c.toUpperCase())}</h3>
          {openBlocks.length > 0 && <ul>
            {gapFold.shown.map(b => <li key={b.key}><span>{blockLabel(b)}{b.missing > 1 ? ` · faltan ${b.missing}` : ''}</span><button type="button" className="secondary-button" aria-label={`Cubrir hueco: ${blockLabel(b)}`} onClick={() => setCovering(b)}>Cubrir hueco</button></li>)}
          </ul>}{gapFold.more}
          {pending.inDraft.length > 0 && <p className="muted">{draftCountLabel(pending.inDraft.length).replace(/^./, c => c.toUpperCase())}: cuentan cuando publiques la semana.</p>}</section>}
        {!drawn.length && <Empty title="Sin turnos en esta semana" description={active.length ? 'Ajusta los filtros o la búsqueda para consultar otros horarios.' : plan ? 'Haz clic en una hora del calendario, usa el botón + de cada día, genera una rotación o copia la semana anterior.' : 'Cambia de semana.'} />}
      </section> : drawn.length ? <ShiftDayList days={days} today={today} now={at} rows={drawn} plan={plan} byPerson={sort === 'persona'} typeOf={typeOf} actions={actions} />
        : <Empty title="Sin turnos en esta vista" description="Ajusta los filtros, la búsqueda o la semana para consultar otros horarios." />}</RemoteState>
    </section>}
    </>}
    {detail && <ShiftDetail shift={detail} now={at} plan={plan} typeOf={typeOf} actions={actions} onClose={() => setDetail(null)} />}
    {open && <ShiftForm api={api} shift={editing} draft={editing ? undefined : draft} catalog={catalog} shifts={covered ? all : [...all, ...shown.filter(t => !all.some(a => a.id === t.id))]} onClose={() => setOpen(false)} onSaved={id => { setOpen(false); if (id) { setHighlight(id); setAnnounce(editing ? 'Turno guardado; está resaltado en el calendario.' : 'Turno asignado; está resaltado en el calendario.'); } reload(); }} />}
    {moving && <MoveDialog api={api} shift={moving.shift} start={moving.start} end={moving.end} onClose={() => setMoving(null)} onSaved={version => { moved(moving.shift, moving.start, moving.end, version); setMoving(null); }} />}
    {tool === 'rotacion' && <RotationDialog api={api} catalog={catalog} areaId={areaId} defaultFrom={addWeeks(monday, 1)} defaultTo={localDay(weekDays(addWeeks(monday, 1))[6].start)} hidden={!!batch} onClose={() => setTool(null)} onPreview={(items, initial) => setBatch({ items, initial })} />}
    {tool === 'masiva' && <BulkDialog catalog={catalog} areaId={areaId} defaultDate={days.find(d => d.date >= today)?.date ?? monday} onClose={() => setTool(null)} onPreview={items => { setTool(null); setBatch({ items }); }} />}
    {tool === 'plantillas' && <TemplatesDialog api={api} catalog={catalog} days={days} rows={inWeek} version={version} areaId={areaId} onClose={() => setTool(null)} onApply={items => { setTool(null); setBatch({ items }); }} />}
    {tool === 'publicar' && <PublishWeekDialog api={api} drafts={drafts} byArea={draftsByArea} label={weekLabel(monday)} from={monday} to={sunday} areaId={areaId} areaName={catalog.areas.find(a => a.id === areaId)?.name} onClose={() => setTool(null)}
      onPublished={result => { setTool(null); setAnnounce(`${result.published === 1 ? 'Se publicó 1 turno' : `Se publicaron ${result.published} turnos`}. El personal ya los ve en Mis turnos.${result.warnings?.length ? ` Quedan ${result.warnings.length === 1 ? '1 hueco' : `${result.warnings.length} huecos`} de cobertura.` : ''}`); reload(); }} />}
    {batch && <BatchPreview api={api} catalog={catalog} items={batch.items} initial={batch.initial} onClose={() => { setBatch(null); setTool(null); }} onBack={tool === 'rotacion' ? () => setBatch(null) : undefined} onCreated={count => { setTool(null); created(count); }} />}
    {marking && <AttendanceDialog api={api} shift={marking} onClose={() => setMarking(null)} onSaved={() => { setMarking(null); data.refresh(); if (!covered) weekData.refresh(); }} onAssignSubstitute={plan ? id => assignSubstitute(marking, id) : undefined} />}
    {covering && <GapCoverDialog api={api} block={covering} onClose={() => setCovering(null)} onPick={item => { setCovering(null); setBatch({ items: [item] }); }} />}
    {filling && <FillGapsDialog api={api} blocks={openBlocks} onClose={() => setFilling(false)} onPreview={items => { setFilling(false); setBatch({ items }); }} />}
    {cancelling && <CancelShiftForm api={api} shift={cancelling} onClose={() => { setCancelling(null); source.refresh(); }} onSaved={() => { setCancelling(null); source.refresh(); }} />}

  </>;
}

type CancelResult = { id: string; version: number; huecos?: { area: string; role: string; start: string; end: string }[] };
/**
 * Cancela con `PATCH /turnos/{id}` y `state:'cancelado'`; la API exige versión y motivo de al menos 10 caracteres.
 * Si el médico tiene citas en ese horario la API responde `turno_con_citas` con la lista (MA-TUR-05); si la cancelación
 * deja huecos de cobertura, se muestran antes de cerrar (RN-15).
 */
function CancelShiftForm({api,shift,onClose,onSaved}:{api:Api;shift:Shift;onClose:()=>void;onSaved:()=>void}){
 const [reason,setReason]=useState(''),[problem,setProblem]=useState(''),[gaps,setGaps]=useState<CancelResult['huecos']|null>(null),action=useAction(api);
 async function save(e:FormEvent){e.preventDefault();if(reason.trim().length<10){setProblem('Indica el motivo de la cancelación, de al menos 10 caracteres.');return;}setProblem('');const body={staffId:shift.staffId,areaId:shift.areaId,start:shift.start,end:shift.end,type:shift.type,state:'cancelado',version:shift.version,reason:reason.trim()};const saved=await action.run<CancelResult>(`/turnos/${shift.id}`,body,'PATCH');if(!saved)return;if(saved.huecos?.length)setGaps(saved.huecos);else onSaved();}
 const appointments=action.error?.code==='turno_con_citas'?((action.error.details?.citas as {id:string;start:string}[]|undefined)??[]):[];
 if(gaps)return <Dialog title="Turno cancelado" onClose={onSaved}><div className="module-form"><Notice kind="info">El turno quedó cancelado y deja huecos de cobertura. Asigna a otra persona para cubrirlos.</Notice><ul className="attendance-followup">{gaps.slice(0,6).map((g,i)=><li key={i}>{g.area} · {roleIdentity(g.role).label}: {formatDateTime(g.start)} a {formatDateTime(g.end)}</li>)}</ul><div className="dialog-actions"><button type="button" className="primary-button" onClick={onSaved}>Listo</button></div></div></Dialog>;
 return <Dialog title="Cancelar turno" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save} noValidate>{isVersionConflict(action.error)?<><Notice kind="error">El turno cambió. Cierra y vuelve a abrirlo para ver su estado actual; la cancelación no se guardó.</Notice><button type="button" className="secondary-button" onClick={onSaved}>Cerrar y recargar</button></>:appointments.length?<Notice kind="error">El médico tiene {appointments.length===1?'una cita':`${appointments.length} citas`} en este turno ({appointments.map(c=>formatDateTime(c.start)).join(', ')}). Pide a Recepción que las reprograme o cancele desde Citas, con aviso al paciente, y vuelve a intentar.</Notice>:<WriteError error={action.error}/>}<p>Se cancelará el turno de <strong>{shift.person}</strong> en {shift.area}, del {formatDateTime(shift.start)} al {formatDateTime(shift.end)}. El registro se conserva con tu motivo.</p><Field label="Motivo de la cancelación" value={reason} onChange={setReason} required minLength={10} maxLength={500} autoFocus error={problem||undefined}/><div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} label="Cancelar turno"/></div></form></Dialog>;
}
