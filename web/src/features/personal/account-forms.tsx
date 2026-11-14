import { useState, type FormEvent } from 'react';
import { Field, Icon, Notice } from '../../components/ui';
import { roleNames, type Api, type Staff, type UserAccount } from '../../lib/api';
import { Dialog, SaveButton, Select, WriteError, useAction } from '../common';

/** Rol de trabajo que corresponde a cada función del directorio; se sugiere al invitar a alguien ya registrado. */
const roleForType: Record<string, string> = { medico: 'MED', enfermero: 'ENF', asistente: 'AST', recepcionista: 'REC', laboratorista: 'LAB', paramedico: 'PAR' };
export const workingRoles = ['REC', 'AST', 'ENF', 'MED', 'LAB', 'PAR'];
const working = (roles: string[]) => roles.some(r => workingRoles.includes(r));

function RoleChecks({ selected, onChange, allowAdmin }: { selected: string[]; onChange: (roles: string[]) => void; allowAdmin: boolean }) {
  return <fieldset className="role-checks"><legend>Roles de la cuenta</legend>{Object.entries(roleNames).filter(([key]) => key !== 'ADM' || allowAdmin || selected.includes(key)).map(([key, label]) => <label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={e => onChange(e.target.checked ? [...selected, key] : selected.filter(r => r !== key))} /><span><strong>{label}</strong><small>{key}</small></span></label>)}</fieldset>;
}
function StaffBinding({ staff, value, onChange, required }: { staff: Staff[]; value: string; onChange: (v: string) => void; required: boolean }) {
  return <Select label="Persona del directorio" value={value} onChange={onChange} required={required}><option value="">Sin vínculo de personal</option>{staff.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.givenNames} {p.surnames}</option>)}</Select>;
}

/** Invita por correo; con `person` la invitación ya trae el nombre, el vínculo con el directorio y el rol sugerido. */
export function InviteForm({ api, staff, person, canInviteAdmin, onClose, onSaved }: { api: Api; staff: Staff[]; person?: Staff | null; canInviteAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(person ? `${person.givenNames} ${person.surnames}` : ''), [email, setEmail] = useState(''), [roles, setRoles] = useState<string[]>(person ? (roleForType[person.type] ? [roleForType[person.type]] : []) : ['PAC']), [staffId, setStaff] = useState(person?.id ?? ''), [sent, setSent] = useState(false);
  const action = useAction(api);
  async function save(e: FormEvent) { e.preventDefault(); if (await action.run('/usuarios/invitaciones', { email, displayName: name, roles, staffId: staffId || undefined })) setSent(true); }
  return <Dialog title="Invitar persona" onClose={onClose} busy={action.busy}>{sent
    ? <div className="module-form"><Notice kind="success">Invitación enviada a {email}. La persona definirá su propia contraseña desde el enlace.</Notice><button className="primary-button" onClick={onSaved}>Volver al personal <Icon name="arrow" size={18} /></button></div>
    : <form onSubmit={save} className="module-form">
      <p className="form-intro">Cada persona recibe un enlace privado por correo para definir su contraseña. Las cuentas de trabajo (recepción, enfermería, medicina, laboratorio…) se vinculan con su ficha del directorio.</p>
      <WriteError error={action.error} onReload={onSaved} />
      <div className="form-grid"><Field label="Nombre completo" value={name} onChange={setName} required minLength={2} maxLength={120} autoFocus /><Field label="Correo electrónico" type="email" value={email} onChange={setEmail} required maxLength={254} /></div>
      <RoleChecks selected={roles} onChange={setRoles} allowAdmin={canInviteAdmin} />
      <StaffBinding staff={staff} value={staffId} onChange={setStaff} required={working(roles)} />
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><button type="submit" className="primary-button" disabled={action.busy || !roles.length}>{action.busy ? 'Enviando…' : 'Enviar invitación'}<Icon name="mail" size={18} /></button></div>
    </form>}</Dialog>;
}

export function RolesForm({ api, user, staff, canInviteAdmin, onClose, onSaved }: { api: Api; user: UserAccount; staff: Staff[]; canInviteAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const [roles, setRoles] = useState(user.roles), [staffId, setStaff] = useState(user.staffId ?? ''), [reason, setReason] = useState('');
  const action = useAction(api);
  async function save(e: FormEvent) { e.preventDefault(); if (await action.run(`/usuarios/${user.id}/roles`, { roles, staffId: staffId || undefined, version: user.version, reason }, 'PATCH')) onSaved(); }
  return <Dialog title="Cambiar roles" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}>
    <p>{user.name || user.email}<span className="form-subtext">{user.email}</span></p>
    <WriteError error={action.error} onReload={onSaved} />
    <RoleChecks selected={roles} onChange={setRoles} allowAdmin={canInviteAdmin} />
    <StaffBinding staff={staff} value={staffId} onChange={setStaff} required={working(roles)} />
    <Field label="Motivo del cambio" value={reason} onChange={setReason} required minLength={10} maxLength={500} />
    <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} /></div>
  </form></Dialog>;
}

export function StateForm({ api, user, onClose, onSaved }: { api: Api; user: UserAccount; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState(''), action = useAction(api), active = user.state === 'activo';
  async function save(e: FormEvent) { e.preventDefault(); if (await action.run(`/usuarios/${user.id}/estado`, { state: active ? 'desactivado' : 'activo', version: user.version, reason }, 'PATCH')) onSaved(); }
  return <Dialog title={active ? 'Desactivar cuenta' : 'Reactivar cuenta'} onClose={onClose} busy={action.busy}><form onSubmit={save} className="module-form">
    <p>{user.name || user.email}</p>
    <p className="muted">{active ? 'La cuenta perderá el acceso a las operaciones del sistema. Se conservarán sus registros.' : 'La cuenta recuperará el acceso correspondiente a sus roles.'}</p>
    <WriteError error={action.error} onReload={onSaved} />
    <Field label="Motivo" value={reason} onChange={setReason} minLength={10} maxLength={500} required autoFocus />
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Confirmar cambio" /></div>
  </form></Dialog>;
}
