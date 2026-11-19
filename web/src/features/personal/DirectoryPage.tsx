import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Field, Icon, Notice } from '../../components/ui';
import { can, roleNames, staffTypeNames, type AccessProfile, type Api, type Space, type Staff, type UserAccount, type AccountAction } from '../../lib/api';
import { CompactHeader, Empty, RemoteState, Select, Tag, useData, type Remote } from '../common';
import { StaffFicha } from '../personnel-ficha';
import { DeactivateForm, InvitationActionForm, InviteForm, RolesForm, StateForm } from './account-forms';
import { useQuickAction } from './accion';
import { accountOptions, activeStaffFilters, matchesAccount, needsStaffLink, shiftLabel, shiftOptions, staffEmptyState, staffFilterDefaults, type StaffFilters } from './filters';
import { AreaChip, RoleChip } from '../../components/identity';
import { CrudActions, CrudButton, ReadOnlyBadge } from '../../components/system';
import { ActiveFilters, ChipGroup } from '../listas/chips';
import '../listas/lists.css';
import './personal.css';
import { readHashParams, useHashFilters, writeHashParams } from '../../lib/hash-params';
import { StaffForm, type Specialty, type StaffSaved } from './StaffForm';

type Row = { key: string; staff: Staff | null; account: UserAccount | null };
/** S5: the directory shows 50 people per page; the range says where the reader is. */
export const PAGE_SIZE = 50;
/** The server lists what this actor may do on each account (MA-CTA-01/03); an older API without the list falls back to the permission. */
const allows = (account: UserAccount, action: AccountAction) => !account.allowedActions || account.allowedActions.includes(action);
const invitationLabels: Record<string, string> = { enviada: 'Invitación enviada', cancelada: 'Invitación cancelada', expirada: 'Invitación vencida' };
const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es');
const withCount = (label: string, count: number) => `${label} (${count})`;

/** S6: one mark for the account: a check when it works, a cross when there is none or it is off; the email in normal size. */
function AccountCell({ account, showEmail }: { account: UserAccount | null; showEmail: boolean }) {
  if (!account) return <span className="personal-account-mark is-none" role="img" aria-label="Sin cuenta" title="Sin cuenta"><Icon name="close" size={18} /></span>;
  const invitation = account.invitationState && invitationLabels[account.invitationState];
  const active = account.state === 'activo';
  const label = active ? 'Cuenta activa' : 'Cuenta desactivada';
  return <div className="personal-account">
    {invitation
      ? <Tag value={account.invitationState === 'enviada' ? 'pendiente' : 'cancelada'} label={invitation} />
      : <span className={`personal-account-mark ${active ? 'is-on' : 'is-off'}`} role="img" aria-label={label} title={label}><Icon name={active ? 'check' : 'close'} size={18} /></span>}
    {showEmail && <span className="personal-account-email">{account.email}</span>}
  </div>;
}

/** Personal: directorio del equipo con su cuenta de acceso (ficha, roles, invitación y estado) en un solo módulo (obs. 9). */
export function PersonnelPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const canStaff = can(profile, 'personal.ver'), canAccounts = can(profile, 'usuarios.ver');
  const staffData = useData<Staff[]>(api, '/personal', version, canStaff);
  const users = useData<UserAccount[]>(api, '/usuarios', version, canAccounts);
  const areas = useData<Space[]>(api, '/espacios', version, can(profile, 'espacios.ver'));
  const specialties = useData<Specialty[]>(api, '/personal/especialidades', version, canStaff);
  // Filtros en la dirección (#/personal?turno=de_turno&area=…): se comparten y sobreviven a recargar. La lista llega completa del servidor.
  const [query, setQuery] = useState(''), [filters, setFilters] = useHashFilters<keyof StaffFilters>(staffFilterDefaults);
  const { estado: state, funcion: type, cuenta: account, area, turno, rol } = filters;
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false), [editing, setEditing] = useState<string | null>(null), [ficha, setFicha] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ person: Staff | null } | null>(null), [linking, setLinking] = useState<UserAccount | null>(null), [accountState, setAccountState] = useState<UserAccount | null>(null), [invitation, setInvitation] = useState<{ user: UserAccount; mode: 'resend' | 'cancel' } | null>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);
  const [quick, consumeQuick] = useQuickAction();
  // G1: what the last registration did (notice) and its row (highlighted); addresses typed while registering, by staff id,
  // so a later «Dar acceso a la app» from the row starts with the address already known.
  const [saved, setSaved] = useState<{ id: string; text: string; ok: boolean } | null>(null), [knownEmails, setKnownEmails] = useState<Record<string, string>>({});
  const manage = can(profile, 'personal.gestionar'), canInvite = can(profile, 'usuarios.invitar');
  const canAssign = can(profile, 'usuarios.asignar_roles'), canDeactivate = can(profile, 'usuarios.desactivar');
  // Sin `personal.ver` (Protección de datos) el módulo es la lista de cuentas en solo lectura: sin columna de área ni función, que no tienen dato.
  const accountsOnly = !canStaff;
  // S4: one create flow. With `personal.gestionar` it is the record plus optional access; with only `usuarios.invitar`, the invitation.
  const openCreate = () => { if (manage) setCreating(true); else if (canInvite) setInvite({ person: null }); };
  useEffect(() => {
    if (!quick) return;
    if (quick === 'invitar' || quick === 'registrar') openCreate();
    consumeQuick();
  }, [quick, canInvite, manage, consumeQuick]); // eslint-disable-line react-hooks/exhaustive-deps

  const staff = staffData.data ?? [], accounts = users.data ?? [];
  // `#/personal?cuenta=sin_ficha&vincular=<cuenta>` (Inicio, «Cuentas sin personal vinculado»): open the link of that account.
  const [linkTarget, setLinkTarget] = useState(() => readHashParams().get('vincular'));
  useEffect(() => {
    if (!linkTarget || !users.data) return;
    const user = users.data.find(u => u.id === linkTarget);
    if (user && canAssign) setLinking(user);
    setLinkTarget(null); writeHashParams({ vincular: null });
  }, [linkTarget, users.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo<Row[]>(() => {
    const byStaff = new Map(accounts.filter(a => a.staffId).map(a => [a.staffId as string, a]));
    const known = new Set(staff.map(p => p.id));
    return [
      ...staff.map(p => ({ key: p.id, staff: p, account: byStaff.get(p.id) ?? null })),
      ...accounts.filter(a => !a.staffId || !known.has(a.staffId)).map(a => ({ key: `u-${a.id}`, staff: null, account: a })),
    ];
  }, [staff, accounts]);
  const isActive = (row: Row) => (row.staff ? row.staff.active : row.account?.state === 'activo');
  /** `skip`: the filter whose options are being counted, so each option says how many rows it would leave. */
  const passes = (row: Row, skip?: keyof StaffFilters) => {
    if (skip !== 'estado' && state !== 'todos' && isActive(row) !== (state === 'activos')) return false;
    if (skip !== 'funcion' && type !== 'todos' && row.staff?.type !== type) return false;
    if (skip !== 'cuenta' && !matchesAccount(row.account, !!row.staff, account)) return false;
    if (skip !== 'area' && area === 'sin_area' && (!row.staff || row.staff.areaId)) return false;
    if (skip !== 'area' && area && area !== 'sin_area' && row.staff?.areaId !== area) return false;
    if (skip !== 'turno' && turno && row.staff?.shiftToday !== turno) return false;
    if (skip !== 'rol' && rol && !row.account?.roles.includes(rol)) return false;
    if (!query.trim()) return true;
    const text = [row.staff?.givenNames, row.staff?.surnames, row.staff?.specialty, row.account?.name, row.account?.email, ...(row.account?.roles ?? [])].filter(Boolean).join(' ');
    return plain(text).includes(plain(query.trim()));
  };
  const count = (skip: keyof StaffFilters, test: (row: Row) => boolean) => rows.filter(row => passes(row, skip) && test(row)).length;
  const filtered = rows.filter(row => passes(row));
  // A new search or filter starts again on the first page.
  useEffect(() => { setPage(0); }, [query, state, type, account, area, turno, rol]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)), current = Math.min(page, pages - 1);
  const visible = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const areaOptions = [...new Map(staff.filter(p => p.areaId).map(p => [p.areaId as string, p.area ?? 'Área sin nombre'])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const roleOptions = [...new Set(accounts.flatMap(a => a.roles))].sort((a, b) => (roleNames[a] ?? a).localeCompare(roleNames[b] ?? b, 'es'));
  const chips = activeStaffFilters(filters, { accountsOnly, area: areaOptions.find(([id]) => id === area)?.[1] }).map(chip => ({ ...chip, remove: () => setFilters({ [chip.key]: staffFilterDefaults[chip.key] }) }));
  const empty = staffEmptyState(filters, { accountsOnly, canCreate: manage });
  const fichaPerson = staff.find(p => p.id === ficha) ?? null;
  const editRow = rows.find(r => r.key === editing) ?? null, offRow = rows.find(r => r.key === deactivating) ?? null;
  const done = () => { setInvite(null); setLinking(null); setEditing(null); setAccountState(null); setInvitation(null); setDeactivating(null); staffData.refresh(); users.refresh(); };
  const primary: Remote<unknown> = canStaff ? staffData : users;
  function staffSaved(result?: StaffSaved) {
    const wasEditing = !!editing;
    setCreating(false); setEditing(null); staffData.refresh(); users.refresh();
    if (!result) return;
    if (result.email) setKnownEmails(known => ({ ...known, [result.id]: result.email! }));
    const text = wasEditing ? `Cambios guardados en la ficha de ${result.name}`
      : result.invited === true ? `${result.name} registrada · Invitación enviada`
      : result.invited === false ? `${result.name} registrada · La invitación no se envió: usa «Dar acceso a la app» en su fila`
      : `${result.name} registrada`;
    setSaved({ id: result.id, text, ok: result.invited !== false });
  }
  const own = (a: UserAccount) => a.id === profile.id;
  const rolesEditable = (a: UserAccount | null) => !!a && canAssign && !own(a) && allows(a, 'roles');
  /** S6: account actions the server allows that are not «Editar» or «Desactivar»; they live inside the edit screen. */
  function accountExtras(a: UserAccount): ReactNode {
    const reopen = (open: () => void) => () => { setEditing(null); setLinking(null); open(); };
    const list = [
      canInvite && a.allowedActions?.includes('reenviar_invitacion') && <button key="resend" type="button" className="secondary-button" onClick={reopen(() => setInvitation({ user: a, mode: 'resend' }))}>Reenviar invitación</button>,
      canInvite && a.allowedActions?.includes('cancelar_invitacion') && <button key="cancel" type="button" className="secondary-button" onClick={reopen(() => setInvitation({ user: a, mode: 'cancel' }))}>Cancelar invitación</button>,
      canDeactivate && !own(a) && a.state !== 'activo' && allows(a, 'reactivar') && <button key="reactivate" type="button" className="secondary-button" onClick={reopen(() => setAccountState(a))}>Reactivar cuenta</button>,
    ].filter(Boolean);
    return list.length ? <>{list}</> : null;
  }
  const canEdit = (row: Row) => (row.staff && manage) || (!!row.account && (rolesEditable(row.account) || !!accountExtras(row.account)));
  const staffToDeactivate = (row: Row) => (row.staff && manage && row.staff.active ? row.staff : null);
  const accountToDeactivate = (row: Row) => (row.account && canDeactivate && !own(row.account) && row.account.state === 'activo' && allows(row.account, 'desactivar') ? row.account : null);
  const canGiveAccess = (row: Row) => !!row.staff && !row.account && row.staff.active && canInvite && canAccounts;
  const nameOf = (row: Row) => row.staff ? `${row.staff.givenNames} ${row.staff.surnames}` : row.account?.name || 'Sin nombre registrado';
  /** S6: icon-only CRUD actions, one color and symbol each: view (eye), edit (pencil), give access (plus), deactivate (trash). */
  function rowActions(row: Row) {
    const list = [
      row.staff && <CrudButton key="view" kind="view" iconOnly label="Ver ficha" onClick={() => setFicha(row.staff!.id)} />,
      canEdit(row) && <CrudButton key="edit" kind="edit" iconOnly label={row.account && !row.staff && rolesEditable(row.account) && needsStaffLink(row.account) ? 'Vincular con su ficha' : 'Editar'} onClick={() => setEditing(row.key)} />,
      canGiveAccess(row) && <CrudButton key="access" kind="create" iconOnly label="Dar acceso a la app" onClick={() => setInvite({ person: row.staff })} />,
      (staffToDeactivate(row) || accountToDeactivate(row)) && <CrudButton key="off" kind="deactivate" iconOnly label="Desactivar" onClick={() => setDeactivating(row.key)} />,
    ].filter(Boolean);
    return list.length ? <CrudActions>{list}</CrudActions> : <span className="muted">Solo consulta</span>;
  }
  const noun = accountsOnly ? ['cuenta', 'cuentas'] : ['persona', 'personas'];
  const range = filtered.length ? `Mostrando ${current * PAGE_SIZE + 1}–${current * PAGE_SIZE + visible.length} de ${filtered.length} ${filtered.length === 1 ? noun[0] : noun[1]}` : '';
  const pager = pages > 1 && <div className="personal-pager" role="group" aria-label="Páginas del directorio">
    <button type="button" className="secondary-button" disabled={current === 0} onClick={() => setPage(current - 1)}>Anterior</button>
    <span>Página {current + 1} de {pages}</span>
    <button type="button" className="secondary-button" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>Siguiente</button>
  </div>;
  const readOnly = !manage && !canInvite && !canAssign && !canDeactivate;
  const createLabel = manage ? 'Agregar personal' : 'Invitar persona';

  return <>
    <CompactHeader breadcrumb={accountsOnly ? 'Protección de datos / Cuentas' : 'Administración / Equipo'} title="Personal"
      actions={readOnly ? <ReadOnlyBadge who="Administración" what={accountsOnly ? 'las cuentas de acceso' : 'el directorio de personal'} /> : undefined} />
    {saved && <Notice kind={saved.ok ? 'success' : 'info'}>{saved.text}</Notice>}
    <section className="data-workbench">
      <div className="table-toolbar personal-toolbar">
        <Field label="Buscar en el directorio" value={query} onChange={setQuery} placeholder={accountsOnly ? 'Nombre, correo o rol' : 'Nombre, correo, especialidad o rol'} />
        <Select label="Mostrar" value={state} onChange={estado => setFilters({ estado })}>
          <option value="activos">{withCount(accountsOnly ? 'Cuentas activas' : 'Personal activo', count('estado', isActive))}</option>
          <option value="inactivos">{withCount(accountsOnly ? 'Cuentas inactivas' : 'Personal inactivo', count('estado', r => !isActive(r)))}</option>
          <option value="todos">{withCount(accountsOnly ? 'Todas las cuentas' : 'Todo el directorio', count('estado', () => true))}</option>
        </Select>
        {canStaff && <Select label="Función" value={type} onChange={funcion => setFilters({ funcion })}><option value="todos">{withCount('Todas las funciones', count('funcion', () => true))}</option>{Object.entries(staffTypeNames).map(([k, v]) => <option key={k} value={k}>{withCount(v, count('funcion', r => r.staff?.type === k))}</option>)}</Select>}
        {canStaff && <Select label="Área" value={area} onChange={value => setFilters({ area: value })}><option value="">{withCount('Todas las áreas', count('area', () => true))}</option>{areaOptions.map(([id, name]) => <option key={id} value={id}>{withCount(name, count('area', r => r.staff?.areaId === id))}</option>)}<option value="sin_area">{withCount('Sin área asignada', count('area', r => !!r.staff && !r.staff.areaId))}</option></Select>}
        {canAccounts && <Select label="Rol" value={rol} onChange={value => setFilters({ rol: value })}><option value="">Todos los roles</option>{roleOptions.map(r => <option key={r} value={r}>{withCount(roleNames[r] ?? r, count('rol', row => !!row.account?.roles.includes(r)))}</option>)}</Select>}
        {(manage || canInvite) && <CrudButton kind="create" label={createLabel} className="personal-create" onClick={openCreate} />}
      </div>
      {canStaff && <div className="cl-filter-row personal-filter-row">
        {canAccounts && <Select label="Cuenta de acceso" value={account} onChange={cuenta => setFilters({ cuenta })}>{accountOptions.map(o => <option key={o.value} value={o.value}>{withCount(o.label, count('cuenta', r => matchesAccount(r.account, !!r.staff, o.value)))}</option>)}</Select>}
        <div className="personal-shift-filter"><span className="cl-filter-label">Turno de hoy</span><ChipGroup label="Turno de hoy" value={turno} onChange={value => setFilters({ turno: value })} options={[{ value: '', label: 'Cualquiera' }, ...shiftOptions.map(o => ({ value: o.value, label: o.label, count: count('turno', row => row.staff?.shiftToday === o.value), tone: o.tone }))]} /></div>
      </div>}
      <ActiveFilters filters={chips} onClear={() => { setQuery(''); setFilters(staffFilterDefaults); }} />
      <RemoteState state={primary}>{() => filtered.length
        ? <>
          <div className="personal-results"><p role="status">{range}</p>{pager}</div>
          <table className="record-table personal-table"><caption className="sr-only">Directorio de personal y cuentas</caption>
            <thead><tr>
              <th>Persona</th>
              {!accountsOnly && <th>Función</th>}
              {canAccounts && <th>{accountsOnly ? 'Roles' : 'Roles de acceso'}</th>}
              {!accountsOnly && <th>Área</th>}
              {canAccounts && <th>Cuenta</th>}
              {!accountsOnly && <th>Turno hoy</th>}
              <th>Acciones</th>
            </tr></thead>
            <tbody>{visible.map(row => <tr key={row.key} className={saved && row.staff?.id === saved.id ? 'is-new' : undefined}>
              <td data-label="Persona" className="cell-person"><strong>{nameOf(row)}{row.account && own(row.account) && <span className="own-account">Tu cuenta</span>}</strong>{row.staff?.specialty && <small>Especialidad: {row.staff.specialty}</small>}</td>
              {!accountsOnly && <td data-label="Función">{row.staff ? <RoleChip code={row.staff.type} label={staffTypeNames[row.staff.type] ?? row.staff.type} /> : <span className="muted">{needsStaffLink(row.account) ? 'Sin ficha: falta vincularla' : 'Sin ficha'}</span>}</td>}
              {canAccounts && <td data-label={accountsOnly ? 'Roles' : 'Roles de acceso'}>{row.account ? <div className="role-tags">{row.account.roles.map(r => <RoleChip key={r} code={r} />)}</div> : <span className="muted">Sin cuenta</span>}</td>}
              {!accountsOnly && <td data-label="Área">{row.staff?.area ? <AreaChip name={row.staff.area} /> : <span className="muted">{row.staff ? 'Sin asignar' : '—'}</span>}</td>}
              {canAccounts && <td data-label="Cuenta"><AccountCell account={row.account} showEmail /></td>}
              {!accountsOnly && <td data-label="Turno hoy">{row.staff && !row.staff.active ? <Tag value="inactivo" /> : row.staff?.shiftToday ? <span className={`personal-shift is-${row.staff.shiftToday}`}>{shiftLabel(row.staff.shiftToday)}</span> : <span className="muted">—</span>}</td>}
              <td data-label="Acciones" className="cell-actions">{rowActions(row)}</td>
            </tr>)}</tbody></table>
          {pager && <div className="personal-results is-bottom"><p>{range}</p>{pager}</div>}
        </>
        : <Empty title={empty.title} description={empty.description} />}</RemoteState>
    </section>
    {fichaPerson && <StaffFicha api={api} profile={profile} person={fichaPerson} version={version} onClose={() => setFicha(null)} onEdit={() => { setFicha(null); setEditing(fichaPerson.id); }} onChanged={staffData.refresh} />}
    {creating && <StaffForm api={api} staff={null} spaces={areas.data ?? []} specialties={specialties.data ?? []} access={{ allowAdmin: !!profile.canInviteAdmin, invite: canInvite && canAccounts }} onClose={() => setCreating(false)} onSaved={staffSaved} />}
    {editRow?.staff && manage && <StaffForm key={editRow.key} api={api} staff={editRow.staff} spaces={areas.data ?? []} specialties={specialties.data ?? []} access={{ allowAdmin: !!profile.canInviteAdmin, account: editRow.account, editRoles: rolesEditable(editRow.account), extras: editRow.account ? accountExtras(editRow.account) : null }} onClose={() => setEditing(null)} onSaved={staffSaved} />}
    {editRow?.account && !(editRow.staff && manage) && <RolesForm api={api} user={editRow.account} staff={staff} canInviteAdmin={!!profile.canInviteAdmin} linking={!editRow.staff && rolesEditable(editRow.account) && needsStaffLink(editRow.account)} editable={rolesEditable(editRow.account)} extras={accountExtras(editRow.account)} onClose={() => setEditing(null)} onSaved={done} />}
    {linking && <RolesForm api={api} user={linking} linking staff={staff} canInviteAdmin={!!profile.canInviteAdmin} onClose={() => setLinking(null)} onSaved={done} />}
    {offRow && <DeactivateForm api={api} name={nameOf(offRow)} staff={staffToDeactivate(offRow)} account={accountToDeactivate(offRow)} onClose={() => setDeactivating(null)} onSaved={done} />}
    {invite && <InviteForm api={api} staff={staff} person={invite.person} email={invite.person ? knownEmails[invite.person.id] : undefined} canInviteAdmin={!!profile.canInviteAdmin} onClose={() => setInvite(null)} onSaved={done} />}
    {accountState && <StateForm api={api} user={accountState} onClose={() => setAccountState(null)} onSaved={done} />}
    {invitation && <InvitationActionForm api={api} user={invitation.user} mode={invitation.mode} onClose={() => setInvitation(null)} onSaved={done} />}
  </>;
}
