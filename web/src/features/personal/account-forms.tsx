import { useState, type FormEvent, type ReactNode } from 'react';
import { Field, Icon, Notice } from '../../components/ui';
import { RETIRED_ROLES, roleNames, type Api, type Staff, type StaffInput, type UserAccount } from '../../lib/api';
import { RoleChip } from '../../components/identity';
import { Dialog, SaveButton, Select, WriteError, useAction } from '../common';

/** Rol de trabajo que corresponde a cada función del directorio; se sugiere al invitar a alguien ya registrado. */
export const roleForType: Record<string, string> = { medico: 'MED', enfermero: 'ENF', asistente: 'ENF', recepcionista: 'REC', laboratorista: 'LAB', paramedico: 'PAR' };
export const workingRoles = ['REC', 'AST', 'ENF', 'MED', 'LAB', 'PAR'];
const working = (roles: string[]) => roles.some(r => workingRoles.includes(r));

/** The patient role is never invited (MA-CTA-02, `rol_no_invitable`): patients create their account in the mobile apps. */
const PATIENT_ROLE = 'PAC';
/** Roles an invitation may name: never the patient role, and Administración only for who may invite it. */
export const invitableRoles = (allowAdmin: boolean) => Object.keys(roleNames).filter(key => key !== PATIENT_ROLE && !RETIRED_ROLES.includes(key) && (key !== 'ADM' || allowAdmin));
/** A plain address check before sending; the API still decides. */
export const validEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
/** The account's roles as checkboxes; an account may hold several roles. */
export function RoleChecks({ selected, onChange, allowAdmin, invitation = false, legend = 'Roles de la cuenta' }: { selected: string[]; onChange: (roles: string[]) => void; allowAdmin: boolean; invitation?: boolean; legend?: string }) {
  return <fieldset className="role-checks"><legend>{legend}</legend>{Object.entries(roleNames).filter(([key]) => (key !== 'ADM' || allowAdmin || selected.includes(key)) && (!invitation || key !== PATIENT_ROLE) && (!RETIRED_ROLES.includes(key) || (!invitation && selected.includes(key)))).map(([key, label]) => <label key={key}><input type="checkbox" checked={selected.includes(key)} onChange={e => onChange(e.target.checked ? [...selected, key] : selected.filter(r => r !== key))} /><span><strong>{label}</strong><small>{key}</small></span></label>)}</fieldset>;
}
function StaffBinding({ staff, value, onChange, required }: { staff: Staff[]; value: string; onChange: (v: string) => void; required: boolean }) {
  return <Select label="Persona del directorio" value={value} onChange={onChange} required={required}><option value="">Sin vínculo de personal</option>{staff.filter(p => p.active).map(p => <option key={p.id} value={p.id}>{p.givenNames} {p.surnames}</option>)}</Select>;
}

/**
 * Invita por correo; con `person` la invitación ya trae el nombre, el vínculo con el directorio y el rol sugerido.
 * G1: `email` prefills the address when it is already known (typed while registering the person).
 */
export function InviteForm({ api, staff, person, email: knownEmail, canInviteAdmin, onClose, onSaved }: { api: Api; staff: Staff[]; person?: Staff | null; email?: string; canInviteAdmin: boolean; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(person ? `${person.givenNames} ${person.surnames}` : ''), [email, setEmail] = useState(knownEmail ?? ''), [roles, setRoles] = useState<string[]>(person ? (roleForType[person.type] ? [roleForType[person.type]] : []) : []), [staffId, setStaff] = useState(person?.id ?? ''), [sent, setSent] = useState(false);
  const action = useAction(api);
  async function save(e: FormEvent) { e.preventDefault(); if (await action.run('/usuarios/invitaciones', { email, displayName: name, roles, staffId: staffId || undefined })) setSent(true); }
  // S4: from a staff row this is the same «Acceso a la app» section as the create form, already bound to that record.
  return <Dialog title={person ? 'Dar acceso a la app' : 'Invitar persona'} onClose={onClose} busy={action.busy}>{sent
    ? <div className="module-form"><Notice kind="success">Invitación enviada a {email}. La persona definirá su propia contraseña desde el enlace.</Notice><button className="primary-button" onClick={onSaved}>Volver al personal <Icon name="arrow" size={18} /></button></div>
    : <form onSubmit={save} className="module-form">
      <p className="form-intro">{person
        ? `${person.givenNames} ${person.surnames} recibirá un enlace privado por correo para definir su contraseña. La cuenta queda vinculada con su ficha.`
        : 'Cada persona recibe un enlace privado por correo para definir su contraseña. Las cuentas de trabajo (recepción, enfermería, medicina, laboratorio…) se vinculan con su ficha del directorio.'}</p>
      <WriteError error={action.error} onReload={onSaved} />
      <div className="form-grid"><Field label="Nombre completo" value={name} onChange={setName} required minLength={2} maxLength={120} autoFocus={!person} /><Field label="Correo electrónico" type="email" value={email} onChange={setEmail} required maxLength={254} autoFocus={!!person} /></div>
      <RoleChecks selected={roles} onChange={setRoles} allowAdmin={canInviteAdmin} invitation />
      {!person && <StaffBinding staff={staff} value={staffId} onChange={setStaff} required={working(roles)} />}
      <p className="muted">Los pacientes no se invitan: crean su cuenta en la app CLIMESA para Android o iOS.</p>
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Cancelar</button><button type="submit" className="primary-button" disabled={action.busy || !roles.length}>{action.busy ? 'Enviando…' : 'Enviar invitación'}<Icon name="mail" size={18} /></button></div>
    </form>}</Dialog>;
}

/**
 * Edit an account that has no staff record the actor may edit (S6: roles live inside «Editar», not in a separate action).
 * `linking`: the account works shifts but has no record: the binding comes first and the reason is prefilled.
 * `editable` false: the server refuses role changes for this account; only `extras` (resend, cancel, reactivate) remain.
 */
export function RolesForm({ api, user, staff, canInviteAdmin, onClose, onSaved, linking = false, editable = true, extras }: { api: Api; user: UserAccount; staff: Staff[]; canInviteAdmin: boolean; onClose: () => void; onSaved: () => void; linking?: boolean; editable?: boolean; extras?: ReactNode }) {
  const [roles, setRoles] = useState(user.roles), [staffId, setStaff] = useState(user.staffId ?? ''), [reason, setReason] = useState(linking ? 'Vincular la cuenta con su ficha de personal' : '');
  const action = useAction(api);
  async function save(e: FormEvent) { e.preventDefault(); if (await action.run(`/usuarios/${user.id}/roles`, { roles, staffId: staffId || undefined, version: user.version, reason }, 'PATCH')) onSaved(); }
  return <Dialog title={linking ? 'Vincular con su ficha' : 'Editar cuenta de acceso'} onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}>
    <p>{user.name || user.email}<span className="form-subtext">{user.email}</span></p>
    {linking && <p className="form-intro">Elige a la persona del directorio que corresponde a esta cuenta. Sin ficha no se le pueden asignar turnos.</p>}
    <WriteError error={action.error} onReload={onSaved} />
    {editable ? <>
      {linking && <StaffBinding staff={staff} value={staffId} onChange={setStaff} required />}
      <RoleChecks selected={roles} onChange={setRoles} allowAdmin={canInviteAdmin} />
      {!linking && <StaffBinding staff={staff} value={staffId} onChange={setStaff} required={working(roles)} />}
      <Field label="Motivo del cambio" value={reason} onChange={setReason} required minLength={10} maxLength={500} />
    </> : <div className="role-tags" aria-label="Roles de la cuenta">{user.roles.map(r => <RoleChip key={r} code={r} />)}</div>}
    {extras && <div className="personal-account-extras">{extras}</div>}
    <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={action.busy}>{editable ? 'Cancelar' : 'Cerrar'}</button>{editable && <SaveButton busy={action.busy} />}</div>
  </form></Dialog>;
}

/** Everything PATCH /personal/:id needs besides the change itself: the endpoint takes the whole record. */
export const staffBody = (person: Staff): StaffInput => ({ givenNames: person.givenNames, surnames: person.surnames, type: person.type as StaffInput['type'], specialty: person.specialty ?? '', areaId: person.areaId ?? undefined, phone: person.phone ?? '', dui: person.dui ?? '', active: person.active });

/**
 * S6: the trash action. Nothing is deleted: the record and/or the account are deactivated with a reason, for audit.
 * `staff` is present when the actor may deactivate the record, `account` when the server lets them deactivate the account.
 */
export function DeactivateForm({ api, name, staff, account, onClose, onSaved }: { api: Api; name: string; staff: Staff | null; account: UserAccount | null; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState(''), [withAccount, setWithAccount] = useState(true), action = useAction(api);
  // A retry after the account step failed must not PATCH the record again with its old version.
  const [staffDone, setStaffDone] = useState(false);
  const deactivateAccount = !!account && (!staff || withAccount);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (staff && !staffDone) {
      if (!(await action.run(`/personal/${staff.id}`, { ...staffBody(staff), active: false, version: staff.version, reason }, 'PATCH'))) return;
      setStaffDone(true);
    }
    if (deactivateAccount && !(await action.run(`/usuarios/${account!.id}/estado`, { state: 'desactivado', version: account!.version, reason }, 'PATCH'))) return;
    onSaved();
  }
  return <Dialog title={`Desactivar a ${name}`} onClose={staffDone ? onSaved : onClose} busy={action.busy}><form onSubmit={save} className="module-form">
    <Notice kind="info">Desactivar no borra a nadie. Por auditoría y seguridad se conservan su ficha, sus turnos pasados y todo lo que registró.</Notice>
    <ul className="personal-deactivate-effects">
      {staff && <li>Deja de aparecer en el personal activo y no se le pueden asignar turnos nuevos.</li>}
      {deactivateAccount && <li>Su cuenta pierde el acceso a la app.</li>}
      <li>Se puede reactivar después: en «Mostrar» elige los inactivos y usa «Editar».</li>
    </ul>
    {staff && account && <label className="check-field"><input type="checkbox" checked={withAccount} onChange={e => setWithAccount(e.target.checked)} disabled={staffDone} />Desactivar también su cuenta de acceso ({account.email})</label>}
    <WriteError error={action.error} onReload={onSaved} />
    <Field label="Motivo" value={reason} onChange={setReason} minLength={10} maxLength={500} required autoFocus />
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={staffDone ? onSaved : onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label="Desactivar" /></div>
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
