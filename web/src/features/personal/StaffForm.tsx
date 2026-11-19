import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Field, Notice } from '../../components/ui';
import { validDui, validPersonName, validPhone } from '../../lib/identity';
import { staffTypeNames, type Api, type Space, type Staff, type StaffInput, type UserAccount } from '../../lib/api';
import { Dialog, SaveButton, Select, WriteError, isVersionConflict, useAction } from '../common';
import { RoleChecks, roleForType, validEmail } from './account-forms';

export type Specialty = { code: string; name: string; category: 'medico' | 'enfermero' };
/**
 * What the form saved, so the directory can say it and highlight the row (G1). `invited` is null when no invitation
 * was asked, false when the record was saved but the invitation was not sent.
 */
export type StaffSaved = { id: string; name: string; invited: boolean | null; email?: string };
/** WEB-11: a validation problem and the field it belongs to. */
type Problem = { field: string; message: string } | null;
/**
 * S4/S6: the account part of the one person form. `invite`: a new person may get an account in the same act.
 * `account` + `editRoles`: editing a person with an account also edits its roles (no separate «Roles» action).
 * `extras`: account actions the server allows (resend, cancel, reactivate), shown inside the same screen.
 */
export type AccessOptions = { allowAdmin: boolean; invite?: boolean; account?: UserAccount | null; editRoles?: boolean; extras?: ReactNode };

/** Tipos de personal con catálogo de especialidades; los demás no llevan especialidad. */
export const specialtyCategories = ['medico', 'enfermero'];
const defaultSpecialty = (type: string) => (type === 'medico' ? 'Medicina general' : '');
const suggestedRoles = (type: string) => (roleForType[type] ? [roleForType[type]] : []);
const sameRoles = (a: string[], b: string[]) => a.length === b.length && a.every(r => b.includes(r));

/**
 * Alta y edición de una persona del directorio. La especialidad es un select dependiente del tipo (obs. 9).
 * S4: one create flow: the record plus an optional «Acceso a la app» section that sends the invitation in the same act.
 * If only the invitation fails, the record stays and only the invitation is retried.
 */
export function StaffForm({ api, staff, spaces, specialties, access, onClose, onSaved }: { api: Api; staff: Staff | null; spaces: Space[]; specialties: Specialty[]; access?: AccessOptions; onClose: () => void; onSaved: (saved?: StaffSaved) => void }) {
  const initialType = (staff?.type ?? 'medico') as StaffInput['type'];
  const [form, setForm] = useState<StaffInput>({ givenNames: staff?.givenNames ?? '', surnames: staff?.surnames ?? '', type: initialType, specialty: staff ? staff.specialty ?? defaultSpecialty(initialType) : defaultSpecialty(initialType), areaId: staff?.areaId ?? undefined, phone: staff?.phone ?? '', dui: staff?.dui ?? '', active: staff?.active ?? true });
  const [reason, setReason] = useState(''), [problem, setProblem] = useState<Problem>(null), action = useAction(api);
  const canInvite = !staff && !!access?.invite;
  const account = staff ? access?.account ?? null : null, editRoles = !!account && !!access?.editRoles;
  const [inviting, setInviting] = useState(canInvite), [email, setEmail] = useState('');
  const [roles, setRoles] = useState<string[]>(account ? account.roles : suggestedRoles(initialType));
  const rolesChosen = useRef(false), sendInvite = useAction(api), saveRoles = useAction(api);
  // The record already saved in this act: a retry sends only the invitation, never a second POST /personal.
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  // Editing: the record was saved but the roles were not; a retry sends only the roles, never the record again.
  const [staffSaved, setStaffSaved] = useState(false);
  const put = <K extends keyof StaffInput>(k: K, v: StaffInput[K]) => setForm(f => ({ ...f, [k]: v }));
  const options = specialties.filter(s => s.category === form.type);
  const hasCatalog = specialtyCategories.includes(form.type);
  // Un valor histórico que no está en el catálogo se conserva como opción para no perderlo al editar.
  const legacy = staff?.specialty && form.specialty === staff.specialty && !options.some(o => o.name === staff.specialty) ? staff.specialty : null;
  function changeType(type: StaffInput['type']) {
    const next = specialties.filter(s => s.category === type);
    setForm(f => ({ ...f, type, specialty: next.some(s => s.name === f.specialty) ? f.specialty : defaultSpecialty(type) }));
    if (!rolesChosen.current && !account) setRoles(suggestedRoles(type));
  }
  const chooseRoles = (next: string[]) => { rolesChosen.current = true; setRoles(next); };
  function checkInvite(): Problem {
    if (!validEmail(email)) return { field: 'email', message: 'Escribe un correo válido para la invitación.' };
    if (!roles.length) return { field: 'role', message: 'Elige al menos un rol para su cuenta.' };
    return null;
  }
  async function sendInvitation(person: { id: string; name: string }) {
    const sent = await sendInvite.run('/usuarios/invitaciones', { email: email.trim(), displayName: person.name, roles, staffId: person.id });
    if (sent) onSaved({ ...person, invited: true, email: email.trim() });
  }
  /** Closing after a failed invitation still reports the saved record, so the directory never closes silently. */
  const closeCreated = () => (created ? onSaved({ ...created, invited: false, email: email.trim() }) : onClose());
  /** FR-103-01: avisa en español lo que la API también rechazaría; devuelve el primer problema, con su campo (WEB-11), o null. */
  function check(): Problem {
    const given = form.givenNames.trim(), surnames = form.surnames.trim();
    if (given.length < 2 || surnames.length < 2) return { field: given.length < 2 ? 'givenNames' : 'surnames', message: 'Escribe nombres y apellidos de al menos 2 letras.' };
    if (!validPersonName(given + surnames)) return { field: validPersonName(given) ? 'surnames' : 'givenNames', message: 'Los nombres y apellidos no pueden contener números.' };
    if (form.phone && !validPhone(form.phone)) return { field: 'phone', message: 'Revisa el teléfono de ocho dígitos.' };
    if (form.dui && (!/^\d{8}-?\d$/.test(form.dui) || !validDui(form.dui))) return { field: 'dui', message: 'Revisa el dígito verificador del DUI.' };
    if (editRoles && !roles.length) return { field: 'role', message: 'La cuenta necesita al menos un rol. Para quitarle el acceso, usa «Desactivar».' };
    if (staff && reason.trim().length < 10) return { field: 'reason', message: 'Indica el motivo de la modificación, de al menos 10 caracteres.' };
    return null;
  }
  const fieldError = (field: string) => (problem?.field === field ? problem.message : undefined);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (created) {
      const found = checkInvite();
      setProblem(found);
      if (!found) await sendInvitation(created);
      return;
    }
    const found = check() ?? (canInvite && inviting ? checkInvite() : null);
    setProblem(found);
    if (found) return;
    const person = { id: staff?.id ?? '', name: `${form.givenNames.trim()} ${form.surnames.trim()}` };
    if (!staffSaved) {
      const body = { ...form, specialty: hasCatalog ? form.specialty : '', areaId: form.areaId || undefined, ...(staff ? { version: staff.version, reason } : {}) };
      const result = await action.run<{ id: string }>(staff ? `/personal/${staff.id}` : '/personal', body, staff ? 'PATCH' : 'POST');
      if (!result) return;
      person.id = staff?.id ?? result.id;
    }
    if (canInvite && inviting) { setCreated(person); await sendInvitation(person); return; }
    if (editRoles && account && !sameRoles(roles, account.roles)) {
      setStaffSaved(true);
      if (!(await saveRoles.run(`/usuarios/${account.id}/roles`, { roles, staffId: staff!.id, version: account.version, reason }, 'PATCH'))) return;
    }
    onSaved({ ...person, invited: null });
  }
  const busy = action.busy || sendInvite.busy || saveRoles.busy;
  const roleProblem = problem?.field === 'role' && <Notice kind="error">{problem.message}</Notice>;
  const inviteFields = <div className="personal-access-fields">
    <Field label="Correo electrónico" type="email" value={email} onChange={setEmail} required maxLength={254} error={problem?.field === 'email' ? problem.message : undefined} />
    <RoleChecks legend="Roles en la app" selected={roles} onChange={chooseRoles} allowAdmin={!!access?.allowAdmin} invitation />
    {roleProblem}
  </div>;
  if (created) return <Dialog title="Agregar personal" onClose={closeCreated} busy={busy}>
    <form className="module-form" onSubmit={save} noValidate>
      <Notice kind="error">{created.name} quedó registrada, pero la invitación no se envió. Su ficha ya está en el directorio: reintenta solo la invitación.</Notice>
      <WriteError error={sendInvite.error} />
      {inviteFields}
      <div className="dialog-actions"><button className="secondary-button" type="button" onClick={closeCreated} disabled={busy}>Cerrar sin invitar</button><SaveButton busy={busy} label="Reintentar invitación" /></div>
    </form>
  </Dialog>;
  return <Dialog title={staff ? 'Editar persona' : 'Agregar personal'} onClose={staffSaved ? () => onSaved() : onClose} busy={busy}>
    <form className="module-form" onSubmit={save} noValidate>
      {isVersionConflict(action.error) ? <><Notice kind="error">La ficha cambió. Vuelve a abrirla para ver los datos actuales; tus cambios no se guardaron.</Notice><button type="button" className="secondary-button" onClick={() => onSaved()}>Cerrar y recargar</button></> : <WriteError error={action.error} />}
      {staffSaved && <><Notice kind="error">La ficha quedó guardada, pero los roles de su cuenta no cambiaron.</Notice><WriteError error={saveRoles.error} onReload={() => onSaved()} /></>}
      <div className="form-grid">
        <Field label="Nombres" value={form.givenNames} onChange={v => put('givenNames', v)} required minLength={2} maxLength={80} autoFocus error={fieldError('givenNames')} />
        <Field label="Apellidos" value={form.surnames} onChange={v => put('surnames', v)} required minLength={2} maxLength={100} error={fieldError('surnames')} />
        <Select label="Función" value={form.type} onChange={v => changeType(v as StaffInput['type'])}>{Object.entries(staffTypeNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        {hasCatalog
          ? <Select label={form.type === 'enfermero' ? 'Área de enfermería · opcional' : 'Especialidad'} value={form.specialty ?? ''} onChange={v => put('specialty', v)}>
            {form.type === 'enfermero' && <option value="">Sin área específica</option>}
            {legacy && <option value={legacy}>{legacy} (valor anterior)</option>}
            {options.map(o => <option key={o.code} value={o.name}>{o.name}</option>)}
          </Select>
          : <p className="form-intro">{staffTypeNames[form.type]} no lleva especialidad: solo médicos y enfermería la registran.</p>}
        <Select label="Área de trabajo" value={form.areaId ?? ''} onChange={v => put('areaId', v || undefined)}><option value="">Sin asignar</option>{spaces.filter(s => s.active && ['area', 'planta', 'consultorio', 'hospital'].includes(s.type)).map(s => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</Select>
        <Field label="Teléfono · opcional" type="tel" value={form.phone ?? ''} onChange={v => put('phone', v)} maxLength={9} error={fieldError('phone')} />
        <Field label="DUI · opcional" value={form.dui ?? ''} onChange={v => put('dui', v)} maxLength={10} error={fieldError('dui')} />
      </div>
      {/* S6: deactivation is the row's trash action; here only an inactive person can be brought back. */}
      {staff && !staff.active && <label className="check-field"><input type="checkbox" checked={form.active ?? false} onChange={e => put('active', e.target.checked)} />Reactivar: persona activa en el directorio</label>}
      {canInvite && <fieldset className="personal-access">
        <legend>Acceso a la app · opcional</legend>
        <label className="check-field"><input type="checkbox" checked={inviting} onChange={e => setInviting(e.target.checked)} />Darle acceso a la app</label>
        <p className="form-intro">{inviting ? 'Le llega un correo para definir su contraseña; su cuenta queda vinculada con esta ficha.' : 'Solo se registra la ficha. Podrás darle acceso después desde su fila.'}</p>
        {inviting && inviteFields}
      </fieldset>}
      {account && <fieldset className="personal-access">
        <legend>Acceso a la app</legend>
        <p className="form-intro">Cuenta: <strong>{account.email}</strong></p>
        {editRoles && <RoleChecks legend="Roles en la app" selected={roles} onChange={chooseRoles} allowAdmin={!!access?.allowAdmin} />}
        {roleProblem}
        {access?.extras && <div className="personal-account-extras">{access.extras}</div>}
      </fieldset>}
      {staff && <Field label="Motivo de la modificación" value={reason} onChange={setReason} required minLength={10} maxLength={500} error={fieldError('reason')} />}
      <div className="dialog-actions"><button className="secondary-button" type="button" onClick={staffSaved ? () => onSaved() : onClose} disabled={busy}>Cancelar</button><SaveButton busy={busy} label={staff ? 'Guardar cambios' : canInvite && inviting ? 'Agregar e invitar' : 'Agregar persona'} /></div>
    </form>
  </Dialog>;
}
