import { useEffect, useMemo, useState } from 'react';
import { Field, Icon } from '../../components/ui';
import { can, roleNames, staffTypeNames, type AccessProfile, type Api, type Space, type Staff, type UserAccount, type AccountAction } from '../../lib/api';
import { CompactHeader, Empty, RemoteState, Select, Tag, useData, type Remote } from '../common';
import { StaffFicha } from '../personnel-ficha';
import { InvitationActionForm, InviteForm, RolesForm, StateForm } from './account-forms';
import { useQuickAction } from './accion';
import { accountOptions, activeStaffFilters, matchesAccount, shiftLabel, shiftOptions, staffEmptyState, staffFilterDefaults, type StaffFilters } from './filters';
import { ActiveFilters, ChipGroup } from '../listas/chips';
import '../listas/lists.css';
import { useHashFilters } from '../../lib/hash-params';
import { StaffForm, type Specialty } from './StaffForm';

type Row = { key: string; staff: Staff | null; account: UserAccount | null };
/** The server lists what this actor may do on each account (MA-CTA-01/03); an older API without the list falls back to the permission. */
const allows = (account: UserAccount, action: AccountAction) => !account.allowedActions || account.allowedActions.includes(action);
const invitationLabels: Record<string, string> = { enviada: 'Invitación enviada', cancelada: 'Invitación cancelada', expirada: 'Invitación vencida' };
const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es');

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
  const [edit, setEdit] = useState<Staff | null>(null), [staffOpen, setStaffOpen] = useState(false), [ficha, setFicha] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ person: Staff | null } | null>(null), [roles, setRoles] = useState<UserAccount | null>(null), [accountState, setAccountState] = useState<UserAccount | null>(null), [invitation, setInvitation] = useState<{ user: UserAccount; mode: 'resend' | 'cancel' } | null>(null);
  const [quick, consumeQuick] = useQuickAction();
  const manage = can(profile, 'personal.gestionar'), canInvite = can(profile, 'usuarios.invitar');
  // Sin `personal.ver` (Protección de datos) el módulo es la lista de cuentas en solo lectura: sin columna de área ni función, que no tienen dato.
  const accountsOnly = !canStaff;
  useEffect(() => {
    if (!quick) return;
    if (quick === 'invitar' && canInvite) setInvite({ person: null });
    if (quick === 'registrar' && manage) { setEdit(null); setStaffOpen(true); }
    consumeQuick();
  }, [quick, canInvite, manage, consumeQuick]);

  const staff = staffData.data ?? [], accounts = users.data ?? [];
  const rows = useMemo<Row[]>(() => {
    const byStaff = new Map(accounts.filter(a => a.staffId).map(a => [a.staffId as string, a]));
    const known = new Set(staff.map(p => p.id));
    return [
      ...staff.map(p => ({ key: p.id, staff: p, account: byStaff.get(p.id) ?? null })),
      ...accounts.filter(a => !a.staffId || !known.has(a.staffId)).map(a => ({ key: `u-${a.id}`, staff: null, account: a })),
    ];
  }, [staff, accounts]);
  const isActive = (row: Row) => (row.staff ? row.staff.active : row.account?.state === 'activo');
  const passes = (row: Row, skip?: keyof StaffFilters) => {
    if (state !== 'todos' && isActive(row) !== (state === 'activos')) return false;
    if (type !== 'todos' && row.staff?.type !== type) return false;
    if (!matchesAccount(row.account, !!row.staff, account)) return false;
    if (area === 'sin_area' && (!row.staff || row.staff.areaId)) return false;
    if (area && area !== 'sin_area' && row.staff?.areaId !== area) return false;
    if (skip !== 'turno' && turno && row.staff?.shiftToday !== turno) return false;
    if (rol && !row.account?.roles.includes(rol)) return false;
    if (!query.trim()) return true;
    const text = [row.staff?.givenNames, row.staff?.surnames, row.staff?.specialty, row.account?.name, row.account?.email, ...(row.account?.roles ?? [])].filter(Boolean).join(' ');
    return plain(text).includes(plain(query.trim()));
  };
  const filtered = rows.filter(row => passes(row));
  const shiftCount = (value: string) => rows.filter(row => passes(row, 'turno') && row.staff?.shiftToday === value).length;
  const areaOptions = [...new Map(staff.filter(p => p.areaId).map(p => [p.areaId as string, p.area ?? 'Área sin nombre'])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const roleOptions = [...new Set(accounts.flatMap(a => a.roles))].sort((a, b) => (roleNames[a] ?? a).localeCompare(roleNames[b] ?? b, 'es'));
  const chips = activeStaffFilters(filters, { accountsOnly, area: areaOptions.find(([id]) => id === area)?.[1] }).map(chip => ({ ...chip, remove: () => setFilters({ [chip.key]: staffFilterDefaults[chip.key] }) }));
  const empty = staffEmptyState(filters, { accountsOnly, canCreate: manage });
  const withAccount = rows.filter(r => r.staff && r.account).length, withoutAccount = rows.filter(r => r.staff && !r.account).length;
  const fichaPerson = staff.find(p => p.id === ficha) ?? null;
  const done = () => { setInvite(null); setRoles(null); setAccountState(null); setInvitation(null); users.refresh(); };
  const primary: Remote<unknown> = canStaff ? staffData : users;
  const nameOf = (row: Row) => row.staff ? `${row.staff.givenNames} ${row.staff.surnames}` : row.account?.name || 'Sin nombre registrado';

  return <>
    <CompactHeader breadcrumb={accountsOnly ? 'Protección de datos / Cuentas' : 'Administración / Equipo'} title="Personal"
      actions={manage ? <button className="primary-button" onClick={() => { setEdit(null); setStaffOpen(true); }}><Icon name="plus" size={18} />Registrar personal</button> : canInvite && <button className="primary-button" onClick={() => setInvite({ person: null })}><Icon name="mail" size={18} />Invitar persona</button>} />
    {/* R1 (S3): figures only once both lists arrived; never zeros while loading or after an error. */}
    {canStaff && canAccounts && staffData.data && users.data && !staffData.error && !users.error && <div className="number-strip"><div><strong>{rows.filter(r => r.staff && r.staff.active).length}</strong><span>Personal activo</span></div><div><strong>{withAccount}</strong><span>Con cuenta de acceso</span></div><div><strong>{withoutAccount}</strong><span>Sin cuenta todavía</span></div></div>}
    <section className="data-workbench">
      <div className="table-toolbar">
        <Field label="Buscar en el directorio" value={query} onChange={setQuery} placeholder={accountsOnly ? 'Nombre, correo o rol' : 'Nombre, correo, especialidad o rol'} />
        <Select label="Mostrar" value={state} onChange={estado => setFilters({ estado })}><option value="activos">{accountsOnly ? 'Cuentas activas' : 'Personal activo'}</option><option value="inactivos">{accountsOnly ? 'Cuentas inactivas' : 'Personal inactivo'}</option><option value="todos">{accountsOnly ? 'Todas las cuentas' : 'Todo el directorio'}</option></Select>
        {canStaff && <Select label="Filtrar por función" value={type} onChange={funcion => setFilters({ funcion })}><option value="todos">Todas las funciones</option>{Object.entries(staffTypeNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
        {canStaff && <Select label="Área" value={area} onChange={value => setFilters({ area: value })}><option value="">Todas las áreas</option>{areaOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}<option value="sin_area">Sin área asignada</option></Select>}
        {canStaff && canAccounts && <Select label="Cuenta de acceso" value={account} onChange={cuenta => setFilters({ cuenta })}>{accountOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>}
        {canAccounts && <Select label="Rol" value={rol} onChange={value => setFilters({ rol: value })}><option value="">Todos los roles</option>{roleOptions.map(r => <option key={r} value={r}>{roleNames[r] ?? r}</option>)}</Select>}
      </div>
      {canStaff && <div className="cl-filter-row"><span className="cl-filter-label">Turno de hoy</span><ChipGroup label="Turno de hoy" value={turno} onChange={value => setFilters({ turno: value })} options={[{ value: '', label: 'Cualquiera' }, ...shiftOptions.map(o => ({ value: o.value, label: o.label, count: shiftCount(o.value), tone: o.tone }))]} /></div>}
      {/* S13: one header action. Registered staff are invited from their row; this link covers accounts without a record (ADM, DPD). */}
      {manage && canInvite && <p className="dir-invite-note">¿Alguien sin ficha en el directorio? <button type="button" className="cl-link-button" onClick={() => setInvite({ person: null })}>Invitar persona</button></p>}
      <ActiveFilters filters={chips} onClear={() => { setQuery(''); setFilters(staffFilterDefaults); }} />
      <RemoteState state={primary}>{() => filtered.length
        ? <table className="record-table"><caption className="sr-only">Directorio de personal y cuentas</caption>
          <thead><tr><th>Persona</th><th>{accountsOnly ? 'Roles' : 'Función y roles'}</th>{!accountsOnly && <th>Área</th>}<th>Cuenta</th>{!accountsOnly && <th>Estado</th>}<th>Acción</th></tr></thead>
          <tbody>{filtered.map(row => <tr key={row.key}>
            <td data-label="Persona"><strong>{nameOf(row)}{row.account?.id === profile.id && <span className="own-account">Tu cuenta</span>}</strong><small>{row.staff ? row.staff.specialty || 'Sin especialidad registrada' : row.account?.email}</small></td>
            <td data-label={accountsOnly ? 'Roles' : 'Función y roles'}>{row.staff ? staffTypeNames[row.staff.type] ?? row.staff.type : accountsOnly ? null : 'Solo cuenta'}{row.account && <div className="role-tags">{row.account.roles.map(r => <span key={r} title={roleNames[r]}>{r}</span>)}</div>}</td>
            {!accountsOnly && <td data-label="Área">{row.staff ? row.staff.area || 'Sin asignar' : '—'}</td>}
            <td data-label="Cuenta">{row.account ? <>{row.account.invitationState && invitationLabels[row.account.invitationState] ? <Tag value={row.account.invitationState === 'enviada' ? 'pendiente' : 'cancelada'} label={invitationLabels[row.account.invitationState]} /> : <Tag value={row.account.state} />}{!accountsOnly && <small>{row.account.email}</small>}</> : <span className="muted">Sin cuenta</span>}</td>
            {!accountsOnly && <td data-label="Estado"><Tag value={isActive(row) ? 'activo' : 'inactivo'} />{row.staff?.shiftToday && row.staff.active && <small className="shift-today">{shiftLabel(row.staff.shiftToday)}</small>}</td>}
            <td data-label="Acción"><div className="row-actions">
              {row.staff && <button className="row-action" aria-label={`Ver ficha de ${nameOf(row)}`} onClick={() => setFicha(row.staff!.id)}>Ver ficha <Icon name="arrow" size={16} /></button>}
              {row.staff && manage && <button className="row-action" aria-label={`Editar ${nameOf(row)}`} onClick={() => { setEdit(row.staff); setStaffOpen(true); }}>Editar <Icon name="arrow" size={16} /></button>}
              {row.staff && !row.account && canInvite && row.staff.active && <button className="row-action" aria-label={`Invitar a ${nameOf(row)}`} onClick={() => setInvite({ person: row.staff })}>Invitar <Icon name="mail" size={16} /></button>}
              {row.account && can(profile, 'usuarios.asignar_roles') && row.account.id !== profile.id && allows(row.account, 'roles') && <button className="row-action" aria-label={`Roles de ${nameOf(row)}`} onClick={() => setRoles(row.account)}>Roles <Icon name="arrow" size={16} /></button>}
              {row.account && can(profile, 'usuarios.invitar') && row.account.allowedActions?.includes('reenviar_invitacion') && <button className="row-action" aria-label={`Reenviar invitación a ${nameOf(row)}`} onClick={() => setInvitation({ user: row.account!, mode: 'resend' })}>Reenviar invitación <Icon name="mail" size={16} /></button>}
              {row.account && can(profile, 'usuarios.invitar') && row.account.allowedActions?.includes('cancelar_invitacion') && <button className="row-action" aria-label={`Cancelar invitación de ${nameOf(row)}`} onClick={() => setInvitation({ user: row.account!, mode: 'cancel' })}>Cancelar invitación</button>}
              {row.account && can(profile, 'usuarios.desactivar') && allows(row.account, row.account.state === 'activo' ? 'desactivar' : 'reactivar') && <button className="row-action" aria-label={`${row.account.state === 'activo' ? 'Desactivar' : 'Reactivar'} cuenta de ${nameOf(row)}`} onClick={() => setAccountState(row.account)}>{row.account.state === 'activo' ? 'Desactivar' : 'Reactivar'}</button>}
              {row.account && !can(profile, 'usuarios.desactivar') && !row.staff && <span className="muted">Solo consulta</span>}
            </div></td>
          </tr>)}</tbody></table>
        : <Empty title={empty.title} description={empty.description} />}</RemoteState>
    </section>
    {fichaPerson && <StaffFicha api={api} profile={profile} person={fichaPerson} version={version} onClose={() => setFicha(null)} onEdit={() => { setFicha(null); setEdit(fichaPerson); setStaffOpen(true); }} onChanged={staffData.refresh} />}
    {staffOpen && <StaffForm api={api} staff={edit} spaces={areas.data ?? []} specialties={specialties.data ?? []} onClose={() => setStaffOpen(false)} onSaved={() => { setStaffOpen(false); staffData.refresh(); }} />}
    {invite && <InviteForm api={api} staff={staff} person={invite.person} canInviteAdmin={!!profile.canInviteAdmin} onClose={() => setInvite(null)} onSaved={done} />}
    {roles && <RolesForm api={api} user={roles} staff={staff} canInviteAdmin={!!profile.canInviteAdmin} onClose={() => setRoles(null)} onSaved={done} />}
    {accountState && <StateForm api={api} user={accountState} onClose={() => setAccountState(null)} onSaved={done} />}
    {invitation && <InvitationActionForm api={api} user={invitation.user} mode={invitation.mode} onClose={() => setInvitation(null)} onSaved={done} />}
  </>;
}
