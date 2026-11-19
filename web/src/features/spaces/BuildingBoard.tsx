import { useMemo, useState, type FormEvent, type ReactElement } from 'react';
import './building.css';
import { Field, Icon, Notice, type IconName } from '../../components/ui';
import { AreaTag, CrudButton, areaOf, type AreaCode } from '../../components/system';
import { can, type AccessProfile, type Api, type Bed, type BedBlockInput, type BedTransitionInput, type Space } from '../../lib/api';
import { Empty, SaveButton, Select, Tag, WriteError, useAction, useData } from '../common';
import { BED_STATES, bedStateMap, bedsOf, categoryName, countBeds, floorsOf, plain, spaceTypeNames, stateLabel, type Floor, type SpaceNode, type SpaceWithState } from './building';

type BedActionKind = 'block' | 'unblock' | 'request' | 'complete' | 'verify';
const bedActionText: Record<BedActionKind, string> = { block: 'Bloquear', unblock: 'Retirar bloqueo', request: 'Solicitar limpieza', complete: 'Completar limpieza', verify: 'Verificar limpieza' };
const bedActionConfirm: Record<BedActionKind, string> = { block: 'Confirmar bloqueo', unblock: 'Confirmar retiro', request: 'Confirmar solicitud', complete: 'Confirmar limpieza', verify: 'Confirmar verificación' };
const bedActionPath: Record<BedActionKind, string> = { block: 'bloquear', unblock: 'desbloquear', request: 'limpieza', complete: 'limpieza/completar', verify: 'limpieza/verificar' };
const bedActionSuccess: Record<BedActionKind, string> = { block: 'Bloqueo registrado.', unblock: 'Bloqueo retirado.', request: 'Limpieza solicitada.', complete: 'Limpieza registrada; queda pendiente de verificación.', verify: 'Limpieza verificada. La cama está libre.' };
const tileIcons: Record<string, IconName> = { consultorio: 'user', cubiculo: 'user', bodega: 'inventory', bahia: 'ambulance', area: 'building', habitacion: 'bed' };

/** Acciones que la cama admite según su estado y los permisos de la cuenta. */
export function availableBedActions(profile: AccessProfile, b: Bed): BedActionKind[] {
  const result: BedActionKind[] = [];
  if (b.state === 'libre' && can(profile, 'camas.bloquear')) result.push('block');
  if (b.state === 'bloqueada' && can(profile, 'camas.bloquear')) result.push('unblock');
  if ((b.state === 'libre' || b.state === 'ocupada') && b.cleaningPending !== true && can(profile, 'camas.registrar_limpieza')) result.push('request');
  if (b.state === 'limpieza' && b.cleaningPending && !b.cleaningCompleted && can(profile, 'camas.registrar_limpieza')) result.push('complete');
  if (b.state === 'limpieza' && b.cleaningPending && b.cleaningCompleted && !b.cleanedByCurrentUser && can(profile, 'camas.verificar_limpieza')) result.push('verify');
  return result;
}

type Props = {
  api: Api; profile: AccessProfile; version: number; spaces: SpaceWithState[]; beds: Bed[] | null;
  onRefresh: () => void;
  onEdit?: (space: Space | null, parent?: Space) => void;
};

/** Mapa interactivo del hospital: plantas (de los datos) → áreas → habitaciones → camas, con estados, filtros y panel de acciones. */
export function BuildingBoard({ api, profile, version, spaces, beds, onRefresh, onEdit }: Props) {
  const floors = useMemo(() => floorsOf(spaces), [spaces]);
  const bedMap = useMemo(() => (beds ? new Map(beds.map(b => [b.id, b])) : null), [beds]);
  /** Owner obs. 7: the bed state comes from the board or, for accounts without it (ADM), from the building tree. */
  const states = useMemo(() => bedStateMap(spaces, beds), [spaces, beds]);
  const byId = useMemo(() => new Map(spaces.map(s => [s.id, s])), [spaces]);
  const [floorId, setFloorId] = useState(''), [filter, setFilter] = useState('todos'), [query, setQuery] = useState(''), [showInactive, setShowInactive] = useState(false), [selectedId, setSelectedId] = useState<string | null>(null), [feedback, setFeedback] = useState('');
  const floor = floors.find(f => f.id === floorId) ?? floors[0];
  const q = plain(query.trim());
  const canConfigure = can(profile, 'espacios.configurar') && !!onEdit;

  const stateOf = (space: Space) => states?.get(space.id);
  const stateOk = (space: Space) => filter === 'todos' || stateOf(space) === filter;
  const textOk = (node: SpaceNode) => !q || plain(`${node.space.code} ${node.space.name}`).includes(q);
  /** Un nodo se muestra si está activo (o se piden inactivos) y, según el filtro, él o algún descendiente coincide. */
  const shown = (node: SpaceNode, ancestorMatches: boolean): boolean => {
    if (!node.space.active && !showInactive) return false;
    const self = ancestorMatches || textOk(node);
    if (node.space.type === 'cama') return self && stateOk(node.space);
    if (node.children.length === 0) return self && filter === 'todos';
    return node.children.some(child => shown(child, self));
  };
  const visibleChildren = (node: SpaceNode, ancestorMatches: boolean) => node.children.filter(child => shown(child, ancestorMatches || textOk(node)));

  const floorStats = (f: Floor) => {
    const list = f.children.flatMap(bedsOf), counts = countBeds(list, states);
    const free = states ? counts.byState.libre : f.node?.space.freeBeds ?? 0;
    return { counts, free, total: list.length };
  };
  const current = floor ? floorStats(floor) : null;
  const select = (id: string) => { setSelectedId(id); setFeedback(''); };
  const sel = selectedId ? byId.get(selectedId) ?? null : null;

  if (!floors.length) return <Empty title="Todavía no hay espacios" description={canConfigure ? 'Crea la primera planta con “Crear espacio” para armar el mapa del hospital.' : 'Cuando Administración configure el edificio, aparecerá aquí.'} />;

  const visibleTop = floor ? floor.children.filter(child => shown(child, false)) : [];
  const areas = visibleTop.filter(node => node.children.length > 0 && node.space.type !== 'habitacion');
  const rooms = visibleTop.filter(node => node.space.type === 'habitacion');
  const others = visibleTop.filter(node => node.children.length === 0 && node.space.type !== 'habitacion');

  /** R4a: a room takes the area of the nearest ancestor with an area code (`P1-EMG`), else its own code (`HAB-201`). */
  const areaFor = (space: Space): AreaCode => {
    for (let s: Space | undefined = space; s; s = s.parentId ? byId.get(s.parentId) : undefined) { const area = areaOf(s.code); if (area !== 'GEN') return area; }
    return 'GEN';
  };
  const bedGlyph = (node: SpaceNode, room: SpaceNode) => {
    const state = stateOf(node.space), short = node.space.code.startsWith(`${room.space.code}-`) ? node.space.code.slice(room.space.code.length + 1) : node.space.code;
    return <button type="button" key={node.space.id} className={`bed-glyph bed-state-${state ?? 'desconocida'} ${selectedId === node.space.id ? 'is-selected' : ''}`} aria-pressed={selectedId === node.space.id} aria-label={`Cama ${node.space.code}${state ? `, ${stateLabel(state)}` : ''}`} title={`${node.space.code}${state ? ` · ${stateLabel(state)}` : ''}`} onClick={() => select(node.space.id)}><span className="bed-glyph-mark" aria-hidden="true" /><strong>{short}</strong>{state && <small>{stateLabel(state)}</small>}</button>;
  };
  const roomTile = (room: SpaceNode, ancestor: boolean) => {
    const roomBeds = room.children.filter(child => child.space.type === 'cama' && shown(child, ancestor || textOk(room)));
    const free = room.space.freeBeds;
    const area = areaFor(room.space);
    return <article className={`plan-room area-surface area-${area.toLowerCase()} ${selectedId === room.space.id ? 'is-selected' : ''} ${room.space.active ? '' : 'is-inactive'}`} key={room.space.id} aria-label={`Habitación ${room.space.code}`}>
      <header><h3><button type="button" className="plan-room-title" aria-pressed={selectedId === room.space.id} aria-label={`Ver habitación ${room.space.code}`} onClick={() => select(room.space.id)}><AreaTag code={area} /><strong className="nowrap-code">{room.space.code}</strong>{categoryName(room.space.category) && <span className="plan-room-category">{categoryName(room.space.category)}</span>}{!room.space.active && <span>Inactiva</span>}</button></h3></header>
      {/* Obs. 7/17: the coloured beds already say which are free; a count only appears when states are unknown. */}
      <div className="plan-beds">{roomBeds.map(bed => bedGlyph(bed, room))}{!roomBeds.length && <small className="muted">Sin camas con este filtro</small>}{!states && room.space.totalBeds > 0 && <span className="plan-free-pill">{free} {free === 1 ? 'libre' : 'libres'}</span>}</div>
    </article>;
  };
  const leafTile = (node: SpaceNode) => <button type="button" key={node.space.id} className={`plan-tile ${selectedId === node.space.id ? 'is-selected' : ''} ${node.space.active ? '' : 'is-inactive'}`} aria-pressed={selectedId === node.space.id} onClick={() => select(node.space.id)}><Icon name={tileIcons[node.space.type] ?? 'grid'} size={18} /><span><strong>{node.space.code}</strong><small>{node.space.name !== node.space.code ? node.space.name : spaceTypeNames[node.space.type]}{!node.space.active ? ' · Inactivo' : ''}</small></span></button>;
  const group = (node: SpaceNode, ancestor: boolean): ReactElement => {
    const kids = visibleChildren(node, ancestor), counts = countBeds(bedsOf(node), states), typeName = spaceTypeNames[node.space.type] ?? 'Espacio';
    return <section className={`plan-area ${selectedId === node.space.id ? 'is-selected' : ''}`} key={node.space.id} aria-label={`${typeName} ${node.space.name}`}>
      <header><h3><button type="button" className="plan-area-title" aria-pressed={selectedId === node.space.id} aria-label={`Ver ${typeName.toLowerCase()} ${node.space.name}`} onClick={() => select(node.space.id)}><strong>{node.space.name}</strong><span className="nowrap-code">{node.space.code}</span></button></h3>{counts.total > 0 && <span className="plan-free">{states ? counts.byState.libre : node.space.freeBeds}/{counts.total} libres</span>}</header>
      <div className="plan-grid">{kids.map(kid => kid.space.type === 'habitacion' ? roomTile(kid, ancestor || textOk(node)) : kid.children.length ? group(kid, ancestor || textOk(node)) : leafTile(kid))}</div>
    </section>;
  };

  return <div className="building">
    <div className="table-toolbar building-toolbar">
      <div className="floor-switch" role="group" aria-label="Planta">{floors.map(f => { const stats = floorStats(f); return <button type="button" key={f.id} aria-pressed={floor?.id === f.id} onClick={() => { setFloorId(f.id); setSelectedId(null); }}><span>{f.label}</span>{stats.total > 0 && <small>{stats.free}/{stats.total} libres</small>}</button>; })}</div>
      {states && <Select label="Estado de cama" value={filter} onChange={setFilter}><option value="todos">Todos los estados</option>{BED_STATES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</Select>}
      <Field label="Buscar espacio o cama" value={query} onChange={setQuery} placeholder="Código o nombre" />
      {canConfigure && <label className="check-field"><input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />Mostrar inactivos</label>}
    </div>
    {states && current && <ul className="state-legend" aria-label="Leyenda y conteo de camas de la planta">{BED_STATES.map(s => <li key={s.key}><button type="button" className={`legend-chip bed-state-${s.key}`} aria-pressed={filter === s.key} title={s.hint} onClick={() => setFilter(filter === s.key ? 'todos' : s.key)}><span className="bed-glyph-mark" aria-hidden="true" /><span>{s.label}</span><strong>{current.counts.byState[s.key]}</strong></button></li>)}</ul>}
    {feedback && <Notice kind="success">{feedback}</Notice>}
    <div className={`building-split${sel ? '' : ' is-collapsed'}`}>
      <div className="floor-plan" aria-label={`Plano de ${floor?.label ?? 'la planta'}`}>
        {areas.map(node => group(node, false))}
        {rooms.length > 0 && <section className="plan-area" aria-label="Habitaciones"><header><h3><span className="plan-area-title"><strong>Habitaciones</strong></span></h3></header><div className="plan-grid">{rooms.map(room => roomTile(room, false))}</div></section>}
        {others.length > 0 && <section className="plan-area" aria-label="Otros espacios"><header><h3><span className="plan-area-title"><strong>Otros espacios</strong></span></h3></header><div className="plan-grid">{others.map(leafTile)}</div></section>}
        {!visibleTop.length && <Empty title="No hay espacios con este filtro" description="Cambia el estado, la búsqueda o la planta para ver otros espacios." />}
      </div>
      {/* R4a: the detail column only exists while something is selected; the plan takes the full width otherwise. */}
      {sel && <aside className="plan-side" aria-label="Detalle del espacio">
        <SpaceDetail key={sel.id} api={api} profile={profile} version={version} space={sel} bed={bedMap?.get(sel.id) ?? null} parent={sel.parentId ? byId.get(sel.parentId) : undefined} spaces={spaces} states={states} onEdit={canConfigure ? onEdit : undefined} onSelect={select} onChanged={message => { setFeedback(message); onRefresh(); }} />
      </aside>}
    </div>
  </div>;
}

type Admission = { id: string; patientName: string; requestedCategory: string; state: string; isolation: boolean };
type DetailProps = { api: Api; profile: AccessProfile; version: number; space: Space; bed: Bed | null; parent?: Space; spaces: Space[]; states: Map<string, string> | null; onEdit?: (space: Space | null, parent?: Space) => void; onSelect: (id: string) => void; onChanged: (message: string) => void };

/** Obs. 7: the detail lists everything the building tree knows about the space, editable or not. */
function SpaceDetail({ api, profile, version, space, bed, parent, spaces, states, onEdit, onSelect, onChanged }: DetailProps) {
  const children = spaces.filter(s => s.parentId === space.id && s.active), isBed = space.type === 'cama';
  const nodeBeds = isBed ? [space] : spaces.filter(s => s.type === 'cama' && s.active && (s.parentId === space.id || spaces.find(p => p.id === s.parentId)?.parentId === space.id));
  const counts = countBeds(nodeBeds, states), state = states?.get(space.id), typeName = spaceTypeNames[space.type] ?? space.type;
  const facts: [string, string][] = [['Tipo', typeName]];
  if (categoryName(space.category)) facts.push(['Categoría', categoryName(space.category)]);
  if (space.level != null) facts.push(['Planta', String(space.level)]);
  if (space.capacity != null) facts.push(['Capacidad', `${space.capacity} ${space.capacity === 1 ? 'cama' : 'camas'}${!isBed && counts.total !== space.capacity ? ` · ${counts.total} creadas` : ''}`]);
  else if (!isBed && counts.total > 0) facts.push(['Camas', String(counts.total)]);
  facts.push(['Estado', space.active ? 'Activo' : 'Inactivo']);
  return <div className="plan-side-body">
    <header><span className="eyebrow">{typeName}</span><h3>{space.code}{space.name !== space.code ? ` · ${space.name}` : ''}</h3>{space.path && <p className="muted">{space.path}</p>}</header>
    <dl className="plan-facts">{facts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {isBed && bed && <BedPanel api={api} profile={profile} version={version} bed={bed} onChanged={onChanged} />}
    {isBed && !bed && state && <p className="bed-state-line"><Tag value={state} /><span className="muted">{BED_STATES.find(s => s.key === state)?.hint}</span></p>}
    {!isBed && <>
      {states && counts.total > 0 && <dl className="plan-counts" aria-label="Camas por estado">{BED_STATES.filter(s => counts.byState[s.key] > 0).map(s => <div key={s.key}><dt>{s.label}</dt><dd>{counts.byState[s.key]}</dd></div>)}</dl>}
      {!states && counts.total > 0 && <dl className="plan-counts"><div><dt>Libres</dt><dd>{space.freeBeds}</dd></div></dl>}
      {children.length > 0 && <ul className="plan-children" aria-label="Contenido">{children.map(child => <li key={child.id}><button type="button" onClick={() => onSelect(child.id)}><span><strong>{child.code}</strong><small>{spaceTypeNames[child.type]}</small></span>{child.type === 'cama' && states?.get(child.id) ? <Tag value={states.get(child.id)!} /> : child.totalBeds > 0 ? <span className="mono-data">{child.freeBeds}/{child.totalBeds} libres</span> : null}</button></li>)}</ul>}
    </>}
    {onEdit && <div className="plan-actions"><CrudButton kind="edit" label={`Editar ${typeName.toLowerCase()}`} onClick={() => onEdit(space)} />{!isBed && space.type !== 'hospital' && <CrudButton kind="create" label="Agregar espacio dentro" onClick={() => onEdit(null, space)} />}</div>}
    {parent && <button type="button" className="row-action" onClick={() => onSelect(parent.id)}>Ver {spaceTypeNames[parent.type]?.toLowerCase() ?? 'espacio'} {parent.code}</button>}
  </div>;
}

function BedPanel({ api, profile, version, bed, onChanged }: { api: Api; profile: AccessProfile; version: number; bed: Bed; onChanged: (message: string) => void }) {
  const [kind, setKind] = useState<BedActionKind | null>(null), [reason, setReason] = useState(''), action = useAction(api);
  const choices = availableBedActions(profile, bed);
  async function submit(e: FormEvent, k: BedActionKind) {
    e.preventDefault();
    const body: BedBlockInput | BedTransitionInput = k === 'block' ? { version: bed.version, motivo: reason.trim() } : { version: bed.version, reason: reason.trim() };
    if (await action.run(`/camas/${bed.id}/${bedActionPath[k]}`, body)) { setKind(null); setReason(''); onChanged(bedActionSuccess[k]); }
  }
  return <div className="bed-panel">
    <p><Tag value={bed.state} />{bed.state === 'libre' && <span className="muted"> Lista para asignar a una admisión.</span>}</p>
    {bed.state === 'ocupada' && <p><strong>{bed.occupant ?? 'Ocupada'}</strong>{bed.occupantRestricted && <small> · Identidad restringida</small>}</p>}
    {bed.state === 'ocupada' && bed.cleaningPending && <p className="refresh-hint">Limpieza solicitada; quedará disponible para completar al cerrar la ocupación.</p>}
    {bed.state === 'limpieza' && bed.cleaningPending && bed.cleaningCompleted && bed.cleanedByCurrentUser && <p className="refresh-hint">Tu registro está listo; otra persona debe verificarlo.</p>}
    {bed.state === 'limpieza' && bed.cleaningPending && bed.cleaningCompleted && !bed.cleanedByCurrentUser && !can(profile, 'camas.verificar_limpieza') && <p className="refresh-hint">Limpieza completada; espera la verificación de personal autorizado.</p>}
    {bed.state === 'reservada' && <p className="refresh-hint">Apartada para una admisión; se ocupa al confirmar el ingreso.</p>}
    {bed.state === 'libre' && can(profile, 'camas.asignar') && can(profile, 'admision.ver') && <AssignBed api={api} version={version} bed={bed} onAssigned={() => onChanged(`Cama ${bed.code} asignada.`)} />}
    {bed.state === 'ocupada' && can(profile, 'admision.ver') && <a className="row-action" href="#/hospitalizacion">Trasladar o dar de alta en Hospitalización</a>}
    {choices.length > 0 && !kind && <div className="plan-actions" role="group" aria-label="Acciones de la cama">{choices.map(choice => <button type="button" className="secondary-button" key={choice} aria-label={`${bedActionText[choice]} cama ${bed.code}`} onClick={() => { setKind(choice); setReason(''); }}>{bedActionText[choice]}</button>)}</div>}
    {kind && <form className="module-form" aria-label={`${bedActionText[kind]} ${bed.code}`} onSubmit={e => submit(e, kind)}>
      <Field label="Motivo" value={reason} onChange={setReason} required minLength={kind === 'block' ? 5 : 10} maxLength={500} autoFocus />
      <div className="dialog-actions"><button className="secondary-button" type="button" disabled={action.busy} onClick={() => setKind(null)}>Cancelar</button><SaveButton busy={action.busy} label={bedActionConfirm[kind]} /></div>
      {action.error && <><Notice kind="error">{action.error.message}</Notice>{action.error.status === 409 && <button className="row-action" type="button" onClick={() => { setKind(null); onChanged('Estado de la cama actualizado.'); }}>Actualizar estado de la cama</button>}</>}
    </form>}
  </div>;
}

/** Asigna esta cama libre a una admisión que espera cama (`POST /admisiones/{id}/cama`); la base valida las reglas de asignación. */
function AssignBed({ api, version, bed, onAssigned }: { api: Api; version: number; bed: Bed; onAssigned: () => void }) {
  const data = useData<Admission[]>(api, '/admisiones', version), [admissionId, setAdmissionId] = useState(''), [reason, setReason] = useState(''), action = useAction(api);
  const pending = (data.data ?? []).filter(a => a.state === 'pendiente_cama');
  async function assign(e: FormEvent) { e.preventDefault(); if (await action.run(`/admisiones/${admissionId}/cama`, { bedId: bed.id, version: bed.version, ...(reason.trim() ? { reason: reason.trim() } : {}) })) onAssigned(); }
  if (data.loading && !data.data) return <p className="refresh-hint">Buscando admisiones que esperan cama…</p>;
  if (data.error) return null;
  if (!pending.length) return <p className="refresh-hint">No hay admisiones esperando cama. Crea una en Hospitalización para poder asignar esta cama.</p>;
  return <form className="module-form" aria-label={`Asignar cama ${bed.code}`} onSubmit={assign}>
    <WriteError error={action.error} onReload={onAssigned} />
    <Select label="Admisión que espera cama" value={admissionId} onChange={setAdmissionId} required><option value="">Selecciona una admisión</option>{pending.map(a => <option key={a.id} value={a.id}>{a.patientName} · {categoryName(a.requestedCategory)}{a.isolation ? ' · Aislamiento' : ''}</option>)}</Select>
    <Field label="Motivo · opcional" value={reason} onChange={setReason} maxLength={500} hint="Si lo escribes, mínimo 10 caracteres." />
    <SaveButton busy={action.busy} disabled={!admissionId || (reason.trim().length > 0 && reason.trim().length < 10)} label="Asignar esta cama" />
  </form>;
}
