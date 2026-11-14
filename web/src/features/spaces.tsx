import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Field, Icon } from '../components/ui';
import { can, type AccessProfile, type Api, type Bed, type Space, type SpaceInput } from '../lib/api';
import { Dialog, Heading, RemoteState, SaveButton, Select, WriteError, useAction, useData } from './common';
import { useQuickAction } from './personal/accion';
import { BuildingBoard } from './spaces/BuildingBoard';
import { spaceTypeNames, spacesFromBeds } from './spaces/building';

/** Tipos de espacio que pueden contener a cada tipo: hospital → planta → área → habitación → cama. */
const parentTypes: Record<string, string[]> = { planta: ['hospital'], area: ['planta'], habitacion: ['area', 'planta'], cama: ['habitacion'], consultorio: ['area', 'planta'], cubiculo: ['area', 'planta'], bodega: ['area', 'planta'], bahia: ['area', 'planta'] };

/** Edificio (ADM y consulta): mapa interactivo por planta. La asignación de espacios es definir dónde está cada cosa; las camas se asignan a pacientes desde el plano. */
export function SpacesPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<Space[]>(api, '/espacios', version);
  const beds = useData<Bed[]>(api, '/camas', version, can(profile, 'camas.ver_tablero'));
  const [form, setForm] = useState<{ space: Space | null; parent?: Space } | null>(null);
  const [quick, consumeQuick] = useQuickAction(), configure = can(profile, 'espacios.configurar');
  useEffect(() => { if (!quick) return; if (quick === 'crear' && configure) setForm({ space: null }); consumeQuick(); }, [quick, configure, consumeQuick]);
  const rows = data.data ?? [];
  const refresh = () => { data.refresh(); beds.refresh(); };
  return <>
    <Heading eyebrow="Hospital / Edificio" title="Espacios" description="El mapa del hospital: plantas, áreas, habitaciones y camas en un solo lugar."
      actions={configure && <button className="primary-button" onClick={() => setForm({ space: null })}><Icon name="plus" size={18} />Crear espacio</button>} />
    <p className="form-intro space-guide">Asignar espacios es decidir dónde está cada cosa: cada planta contiene áreas, cada área sus habitaciones o consultorios y cada habitación sus camas. Con esa estructura, Recepción y Operaciones asignan camas a los pacientes. Toca una cama o un espacio del plano para ver su detalle{configure ? ' y editarlo' : ''}.</p>
    <section className="data-workbench">
      <RemoteState state={data}>{() => <BuildingBoard api={api} profile={profile} version={version} spaces={rows} beds={beds.data} focus="estructura" onRefresh={refresh} onEdit={(space, parent) => setForm({ space, parent })} />}</RemoteState>
    </section>
    {form && <SpaceForm api={api} space={form.space} parent={form.parent} spaces={rows} onClose={() => setForm(null)} onSaved={() => { setForm(null); refresh(); }} />}
  </>;
}

function SpaceForm({ api, space, parent, spaces, onClose, onSaved }: { api: Api; space: Space | null; parent?: Space; spaces: Space[]; onClose: () => void; onSaved: () => void }) {
  const childTypes = parent ? Object.keys(parentTypes).filter(type => parentTypes[type].includes(parent.type)) : [];
  const initialType = (space?.type ?? (childTypes.includes('habitacion') ? 'habitacion' : childTypes[0] ?? 'habitacion')) as SpaceInput['type'];
  const [form, setForm] = useState<SpaceInput>({ code: space?.code ?? '', name: space?.name ?? '', type: initialType, parentId: space?.parentId ?? parent?.id ?? undefined, category: (space?.category ?? 'semiprivada') as SpaceInput['category'], capacity: space?.capacity ?? 2, level: space?.level ?? parent?.level ?? undefined, active: space?.active ?? true });
  const [reason, setReason] = useState('');
  const action = useAction(api), put = <K extends keyof SpaceInput>(k: K, v: SpaceInput[K]) => setForm(f => ({ ...f, [k]: v }));
  const parents = useMemo(() => spaces.filter(s => s.id !== space?.id && s.active && (parentTypes[form.type] ?? []).includes(s.type)), [spaces, space?.id, form.type]);
  async function save(e: FormEvent) {
    e.preventDefault();
    const body = { ...form, parentId: form.parentId || undefined, category: form.type === 'habitacion' ? form.category : undefined, capacity: form.type === 'habitacion' ? form.capacity : undefined, ...(space ? { version: space.version, reason } : {}) };
    if (await action.run(space ? `/espacios/${space.id}` : '/espacios', body, space ? 'PATCH' : 'POST')) onSaved();
  }
  return <Dialog title={space ? 'Editar espacio' : parent ? `Agregar dentro de ${parent.code}` : 'Crear espacio'} onClose={onClose} busy={action.busy}>
    <form className="module-form" onSubmit={save}>
      <WriteError error={action.error} onReload={onSaved} />
      <p className="form-intro">Jerarquía: hospital → planta → área → habitación → cama. El árbol y la capacidad se verifican al guardar; una cama ocupada, reservada o en limpieza conserva su ubicación.</p>
      <div className="form-grid">
        <Field label="Código" value={form.code} onChange={v => put('code', v)} required minLength={2} maxLength={40} autoFocus hint="Letras, números y guiones; se guarda en mayúsculas." />
        <Field label="Nombre" value={form.name} onChange={v => put('name', v)} required minLength={2} maxLength={120} />
        <Select label="Tipo de espacio" value={form.type} onChange={v => put('type', v as SpaceInput['type'])} disabled={space?.type === 'hospital'}>{Object.entries(spaceTypeNames).filter(([k]) => k !== 'hospital' || space?.type === 'hospital').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        {form.type !== 'hospital' && <Select label="Dentro de" value={form.parentId ?? ''} onChange={v => { put('parentId', v); const level = spaces.find(s => s.id === v)?.level; if (level != null && form.level == null) put('level', level); }} required>
          <option value="">Selecciona dónde va</option>
          {(parentTypes[form.type] ?? []).map(type => { const list = parents.filter(s => s.type === type); return list.length > 0 && <optgroup key={type} label={`${spaceTypeNames[type]}s`}>{list.map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</optgroup>; })}
        </Select>}
        <Field label="Número de planta" type="number" value={String(form.level ?? '')} onChange={v => put('level', v ? Number(v) : undefined)} hint="Opcional; se hereda del espacio donde va." />
        {form.type === 'habitacion' && <>
          <Select label="Categoría" value={form.category ?? 'semiprivada'} onChange={v => put('category', v as SpaceInput['category'])}><option value="semiprivada">Semiprivada</option><option value="vip">VIP</option></Select>
          <Field label="Capacidad de camas" type="number" value={String(form.capacity ?? '')} onChange={v => put('capacity', v ? Number(v) : undefined)} required min="1" />
        </>}
      </div>
      {space && <>
        <label className="check-field"><input type="checkbox" checked={form.active ?? true} onChange={e => put('active', e.target.checked)} />Espacio activo</label>
        <Field label="Motivo del cambio" value={reason} onChange={setReason} required minLength={10} maxLength={500} />
      </>}
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label={space ? 'Guardar espacio' : 'Crear espacio'} /></div>
    </form>
  </Dialog>;
}

/** Camas (Operaciones y Recepción): el mismo plano por planta con el estado de cada cama, filtros y acciones por permiso. */
export function BedsPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<Bed[]>(api, '/camas', version);
  const spaces = useMemo(() => spacesFromBeds(data.data ?? []), [data.data]);
  const all = data.data ?? [];
  return <>
    <Heading eyebrow="Operaciones / Disponibilidad" title="Camas" description="Estado, asignación, bloqueo y limpieza de cada cama sobre el plano del hospital." />
    <div className="number-strip"><div><strong>{all.length}</strong><span>Camas de hospitalización</span></div><div><strong>{all.filter(b => b.state === 'libre').length}</strong><span>Libres</span></div><div><strong>{all.filter(b => b.state === 'ocupada').length}</strong><span>Ocupadas</span></div></div>
    <section className="data-workbench">
      <RemoteState state={data}>{beds => <BuildingBoard api={api} profile={profile} version={version} spaces={spaces} beds={beds} focus="camas" onRefresh={data.refresh} />}</RemoteState>
    </section>
  </>;
}
