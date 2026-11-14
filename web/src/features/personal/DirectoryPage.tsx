import { useEffect, useMemo, useState } from 'react';
import { Field, Icon } from '../../components/ui';
import { can, roleNames, staffTypeNames, type AccessProfile, type Api, type Space, type Staff, type UserAccount } from '../../lib/api';
import { Empty, Heading, RemoteState, Select, Tag, useData, type Remote } from '../common';
import { StaffFicha } from '../personnel-ficha';
import { InviteForm, RolesForm, StateForm } from './account-forms';
import { useQuickAction } from './accion';
import { StaffForm, type Specialty } from './StaffForm';

type Row = { key: string; staff: Staff | null; account: UserAccount | null };
const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es');

/** Personal: directorio del equipo con su cuenta de acceso (ficha, roles, invitación y estado) en un solo módulo (obs. 9). */
export function PersonnelPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const canStaff = can(profile, 'personal.ver'), canAccounts = can(profile, 'usuarios.ver');
  const staffData = useData<Staff[]>(api, '/personal', version, canStaff);
  const users = useData<UserAccount[]>(api, '/usuarios', version, canAccounts);
  const areas = useData<Space[]>(api, '/espacios', version, can(profile, 'espacios.ver'));
  const specialties = useData<Specialty[]>(api, '/personal/especialidades', version, canStaff);
  const [query, setQuery] = useState(''), [state, setState] = useState('activos'), [type, setType] = useState('todos'), [account, setAccount] = useState('todas');
  const [edit, setEdit] = useState<Staff | null>(null), [staffOpen, setStaffOpen] = useState(false), [ficha, setFicha] = useState<string | null>(null);
  const [invite, setInvite] = useState<{ person: Staff | null } | null>(null), [roles, setRoles] = useState<UserAccount | null>(null), [accountState, setAccountState] = useState<UserAccount | null>(null);
  const [quick, consumeQuick] = useQuickAction();
  const manage = can(profile, 'personal.gestionar'), canInvite = can(profile, 'usuarios.invitar');
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
  const filtered = rows.filter(row => {
    if (state !== 'todos' && isActive(row) !== (state === 'activos')) return false;
    if (type !== 'todos' && row.staff?.type !== type) return false;
    if (account === 'con' && !row.account) return false;
    if (account === 'sin' && (row.account || !row.staff)) return false;
    if (!query.trim()) return true;
    const text = [row.staff?.givenNames, row.staff?.surnames, row.staff?.specialty, row.account?.name, row.account?.email, ...(row.account?.roles ?? [])].filter(Boolean).join(' ');
    return plain(text).includes(plain(query.trim()));
  });
  const withAccount = rows.filter(r => r.staff && r.account).length, withoutAccount = rows.filter(r => r.staff && !r.account).length;
  const fichaPerson = staff.find(p => p.id === ficha) ?? null;
  const done = () => { setInvite(null); setRoles(null); setAccountState(null); users.refresh(); };
  const primary: Remote<unknown> = canStaff ? staffData : users;
  const nameOf = (row: Row) => row.staff ? `${row.staff.givenNames} ${row.staff.surnames}` : row.account?.name || 'Sin nombre registrado';

  return <>
    <Heading eyebrow="Administración / Equipo" title="Personal" description="El equipo del hospital y su acceso al sistema: ficha, función, roles, invitación por correo y estado de la cuenta en un solo lugar."
      actions={<>{manage && <button className="primary-button" onClick={() => { setEdit(null); setStaffOpen(true); }}><Icon name="plus" size={18} />Registrar personal</button>}{canInvite && <button className={manage ? 'secondary-button' : 'primary-button'} onClick={() => setInvite({ person: null })}><Icon name="mail" size={18} />Invitar persona</button>}</>} />
    {canStaff && canAccounts && <div className="number-strip"><div><strong>{rows.filter(r => r.staff && r.staff.active).length}</strong><span>Personal activo</span></div><div><strong>{withAccount}</strong><span>Con cuenta de acceso</span></div><div><strong>{withoutAccount}</strong><span>Sin cuenta todavía</span></div></div>}
    <section className="data-workbench">
      <div className="table-toolbar">
        <Field label="Buscar en el directorio" value={query} onChange={setQuery} placeholder="Nombre, correo, especialidad o rol" />
        <Select label="Mostrar" value={state} onChange={setState}><option value="activos">Personal activo</option><option value="inactivos">Personal inactivo</option><option value="todos">Todo el directorio</option></Select>
        {canStaff && <Select label="Filtrar por función" value={type} onChange={setType}><option value="todos">Todas las funciones</option>{Object.entries(staffTypeNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>}
        {canStaff && canAccounts && <Select label="Cuenta de acceso" value={account} onChange={setAccount}><option value="todas">Con o sin cuenta</option><option value="con">Con cuenta</option><option value="sin">Sin cuenta todavía</option></Select>}
      </div>
      <RemoteState state={primary}>{() => filtered.length
        ? <table className="record-table"><caption className="sr-only">Directorio de personal y cuentas</caption>
          <thead><tr><th>Persona</th><th>Función y roles</th><th>Área</th><th>Cuenta</th><th>Estado</th><th>Acción</th></tr></thead>
          <tbody>{filtered.map(row => <tr key={row.key}>
            <td data-label="Persona"><strong>{nameOf(row)}{row.account?.id === profile.id && <span className="own-account">Tu cuenta</span>}</strong><small>{row.staff ? row.staff.specialty || 'Sin especialidad registrada' : row.account?.email}</small></td>
            <td data-label="Función y roles">{row.staff ? staffTypeNames[row.staff.type] ?? row.staff.type : 'Solo cuenta'}{row.account && <div className="role-tags">{row.account.roles.map(r => <span key={r} title={roleNames[r]}>{r}</span>)}</div>}</td>
            <td data-label="Área">{row.staff ? row.staff.area || 'Sin asignar' : '—'}</td>
            <td data-label="Cuenta">{row.account ? <><Tag value={row.account.state} /><small>{row.account.email}</small></> : <span className="muted">Sin cuenta</span>}</td>
            <td data-label="Estado"><Tag value={isActive(row) ? 'activo' : 'inactivo'} /></td>
            <td data-label="Acción"><div className="row-actions">
              {row.staff && <button className="row-action" aria-label={`Ver ficha de ${nameOf(row)}`} onClick={() => setFicha(row.staff!.id)}>Ver ficha <Icon name="arrow" size={16} /></button>}
              {row.staff && manage && <button className="row-action" aria-label={`Editar ${nameOf(row)}`} onClick={() => { setEdit(row.staff); setStaffOpen(true); }}>Editar <Icon name="arrow" size={16} /></button>}
              {row.staff && !row.account && canInvite && row.staff.active && <button className="row-action" aria-label={`Invitar a ${nameOf(row)}`} onClick={() => setInvite({ person: row.staff })}>Invitar <Icon name="mail" size={16} /></button>}
              {row.account && can(profile, 'usuarios.asignar_roles') && row.account.id !== profile.id && <button className="row-action" aria-label={`Roles de ${nameOf(row)}`} onClick={() => setRoles(row.account)}>Roles <Icon name="arrow" size={16} /></button>}
              {row.account && can(profile, 'usuarios.desactivar') && <button className="row-action" aria-label={`${row.account.state === 'activo' ? 'Desactivar' : 'Reactivar'} cuenta de ${nameOf(row)}`} onClick={() => setAccountState(row.account)}>{row.account.state === 'activo' ? 'Desactivar' : 'Reactivar'}</button>}
              {row.account && !can(profile, 'usuarios.desactivar') && !row.staff && <span className="muted">Solo consulta</span>}
            </div></td>
          </tr>)}</tbody></table>
        : <Empty title="No hay personas en esta vista" description="Cambia la búsqueda o los filtros para consultar el directorio. Con “Registrar personal” sumas a alguien nuevo." />}</RemoteState>
    </section>
    {fichaPerson && <StaffFicha api={api} profile={profile} person={fichaPerson} version={version} onClose={() => setFicha(null)} onEdit={() => { setFicha(null); setEdit(fichaPerson); setStaffOpen(true); }} onChanged={staffData.refresh} />}
    {staffOpen && <StaffForm api={api} staff={edit} spaces={areas.data ?? []} specialties={specialties.data ?? []} onClose={() => setStaffOpen(false)} onSaved={() => { setStaffOpen(false); staffData.refresh(); }} />}
    {invite && <InviteForm api={api} staff={staff} person={invite.person} canInviteAdmin={!!profile.canInviteAdmin} onClose={() => setInvite(null)} onSaved={done} />}
    {roles && <RolesForm api={api} user={roles} staff={staff} canInviteAdmin={!!profile.canInviteAdmin} onClose={() => setRoles(null)} onSaved={done} />}
    {accountState && <StateForm api={api} user={accountState} onClose={() => setAccountState(null)} onSaved={done} />}
  </>;
}
