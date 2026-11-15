import { useState, type FormEvent } from 'react';
import { Field, Icon, Notice } from '../../components/ui';
import { roleNames, type Api, type Staff, type UserAccount } from '../../lib/api';
import { Dialog, SaveButton, Select, WriteError, useAction } from '../common';

/** Rol de trabajo que corresponde a cada función del directorio; se sugiere al invitar a alguien ya registrado. */
const roleForType: Record<string, string> = { medico: 'MED', enfermero: 'ENF', asistente: 'AST', recepcionista: 'REC', laboratorista: 'LAB', paramedico: 'PAR' };
export const workingRoles = ['REC', 'AST', 'ENF', 'MED', 'LAB', 'PAR'];
const working = (roles: string[]) => roles.some(r => workingRoles.includes(r));

/** The patient role is never invited (MA-CTA-02, `rol_no_invitable`): patients create their account in the mobile apps. */
const PATIENT_ROLE = 'PAC';
function RoleChecks({ selected, onChange, allowAdmin, invitation = false }: { selected: string[]; onChange: (roles: string[]) => void; allowAdmin: boolean; invitation?: boolean }) {
  return <fieldset className="role-checks"><legend>Roles de la cuenta</legend>{Object.entries(roleNames).filter(([key]) => (key !== 'ADM' || allowAdmin || selected.includes(key)) && (!invitation || key !== PATIENT_ROLE)).map(([key, label]) => <label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={e => onChange(e.target.checked ? [...selected, key] : selected.filter(r => r !== key))} /><span><strong>{label}</strong><small>{key}</small></span></label>)}</fieldset>;
}
function StaffBinding({ staff, value, onChange, required }: { staff: Staff[]; value: string; onChange: (v: string) => void; required: boolean }) {
  return <Select label="Persona del directorio" value={value} onChange={onChange} required={required}><option value="">Sin vínculo de personal</option>{staff.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.givenNames} {p.surnames}</option>)}</Select>;
}

/** Invita por correo; con `person` la invitación ya trae el nombre, el vínculo con el directorio y el rol sugerido. */
export function InviteForm({ api, staff, person, canInviteAdmin, onClose, onSaved }: { api: Api; staff: Staff[]; person?: Staff | null; canInviteAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(person ? `${person.givenNames} ${person.surnames}` : ''), [email, setEmail] = useState(''), [roles, setRoles] = useState<string[]>(person ? (roleForType[person.type] ? [roleForType[person.type]] : []) : []), [staffId, setStaff] = useState(person?.id ?? ''), [sent, setSent] = useState(false);
  const action = useAction(api);
  async function save(e: FormEvent) { e.preventDefault(); if (await action.run('/usuarios/invitaciones', { email, displayName: name, roles, staffId: staffId || undefined })) setSent(true); }
  return <Dialog title="Invitar persona" onClose={onClose} busy={action.busy}>{sent
    ? <div className="module-form"><Notice kind="success">Invitación enviada a {email}. La persona definirá su propia contraseña desde el enlace.</Notice><button className="primary-button" onClick={onSaved}>Volver al personal <Icon name="arrow" size={18} /></button></div>
    : <form onSubmit={save} className="module-form">
      <p className="form-intro">Cada persona recibe un enlace privado por correo para definir su contraseña. Las cuentas de trabajo (recepción, enfermería, medicina, laboratorio…) se vinculan con su ficha del directorio.</p>
      <WriteError error={action.error} onReload={onSaved} />
      <div className="form-grid"><Field label="Nombre completo" value={name} onChange={setName} required minLength={2} maxLength={120} autoFocus /><Field label="Correo electrónico" type="email" value={email} onChange={setEmail} required maxLength={254} /></div>
      <RoleChecks selected={roles} onChange={setRoles} allowAdmin={canInviteAdmin} invitation />
      <StaffBinding staff={staff} value={staffId} onChange={setStaff} required={working(roles)} />
      <p className="muted">Los pacientes no se invitan: crean su cuenta en la app CLIMESA para Android o iOS.</p>
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

/** MA-CTA-01: resend a pending invitation (new link) or cancel it with a reason (the account is deactivated). */
export function InvitationActionForm({ api, user, mode, onClose, onSaved }: { api: Api; user: UserAccount; mode: 'resend' | 'cancel'; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState(''), [done, setDone] = useState(false), action = useAction(api), resend = mode === 'resend';
  const title = resend ? 'Reenviar invitación' : 'Cancelar invitación';
  async function save(e: FormEvent) { e.preventDefault(); if (await action.run(`/usuarios/${user.id}/invitacion/${resend ? 'reenvio' : 'cancelacion'}`, resend ? {} : { reason }, 'POST')) { if (resend) setDone(true); else onSaved(); } }
  return <Dialog title={title} onClose={onClose} busy={action.busy}>{done
    ? <div className="module-form"><Notice kind="success">Enviamos un enlace nuevo a {user.email}. El enlace anterior deja de funcionar.</Notice><button className="primary-button" onClick={onSaved}>Volver al personal <Icon name="arrow" size={18} /></button></div>
    : <form onSubmit={save} className="module-form">
      <p>{user.name || user.email}<span className="form-subtext">{user.email}</span></p>
      <p className="muted">{resend ? 'La persona recibirá un correo nuevo para crear su contraseña.' : 'El enlace de la invitación dejará de dar acceso y la cuenta quedará desactivada. Podrás invitar de nuevo a este correo.'}</p>
      <WriteError error={action.error} onReload={onSaved} />
      {!resend && <Field label="Motivo de la cancelación" value={reason} onChange={setReason} required minLength={10} maxLength={500} autoFocus />}
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} label={title} /></div>
    </form>}</Dialog>;
}
