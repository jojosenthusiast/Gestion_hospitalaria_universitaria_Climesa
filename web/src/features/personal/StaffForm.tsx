import { useState, type FormEvent } from 'react';
import { Field, Notice } from '../../components/ui';
import { validDui, validPersonName, validPhone } from '../../lib/identity';
import { staffTypeNames, type Api, type Space, type Staff, type StaffInput } from '../../lib/api';
import { Dialog, SaveButton, Select, WriteError, isVersionConflict, useAction } from '../common';

export type Specialty = { code: string; name: string; category: 'medico' | 'enfermero' };
/** WEB-11: a validation problem and the field it belongs to. */
type Problem = { field: string; message: string } | null;

/** Tipos de personal con catálogo de especialidades; los demás no llevan especialidad. */
export const specialtyCategories = ['medico', 'enfermero'];
const defaultSpecialty = (type: string) => (type === 'medico' ? 'Medicina general' : '');

/** Alta y edición de una persona del directorio. La especialidad es un select dependiente del tipo (obs. 9). */
export function StaffForm({ api, staff, spaces, specialties, onClose, onSaved }: { api: Api; staff: Staff | null; spaces: Space[]; specialties: Specialty[]; onClose: () => void; onSaved: () => void }) {
  const initialType = (staff?.type ?? 'medico') as StaffInput['type'];
  const [form, setForm] = useState<StaffInput>({ givenNames: staff?.givenNames ?? '', surnames: staff?.surnames ?? '', type: initialType, specialty: staff ? staff.specialty ?? defaultSpecialty(initialType) : defaultSpecialty(initialType), areaId: staff?.areaId ?? undefined, phone: staff?.phone ?? '', dui: staff?.dui ?? '', active: staff?.active ?? true });
  const [reason, setReason] = useState(''), [problem, setProblem] = useState<Problem>(null), action = useAction(api);
  const put = <K extends keyof StaffInput>(k: K, v: StaffInput[K]) => setForm(f => ({ ...f, [k]: v }));
  const options = specialties.filter(s => s.category === form.type);
  const hasCatalog = specialtyCategories.includes(form.type);
  // Un valor histórico que no está en el catálogo se conserva como opción para no perderlo al editar.
  const legacy = staff?.specialty && form.specialty === staff.specialty && !options.some(o => o.name === staff.specialty) ? staff.specialty : null;
  function changeType(type: StaffInput['type']) {
    const next = specialties.filter(s => s.category === type);
    setForm(f => ({ ...f, type, specialty: next.some(s => s.name === f.specialty) ? f.specialty : defaultSpecialty(type) }));
  }
  /** FR-103-01: avisa en español lo que la API también rechazaría; devuelve el primer problema, con su campo (WEB-11), o null. */
  function check(): Problem {
    const given = form.givenNames.trim(), surnames = form.surnames.trim();
    if (given.length < 2 || surnames.length < 2) return { field: given.length < 2 ? 'givenNames' : 'surnames', message: 'Escribe nombres y apellidos de al menos 2 letras.' };
    if (!validPersonName(given + surnames)) return { field: validPersonName(given) ? 'surnames' : 'givenNames', message: 'Los nombres y apellidos no pueden contener números.' };
    if (form.phone && !validPhone(form.phone)) return { field: 'phone', message: 'Revisa el teléfono de ocho dígitos.' };
    if (form.dui && (!/^\d{8}-?\d$/.test(form.dui) || !validDui(form.dui))) return { field: 'dui', message: 'Revisa el dígito verificador del DUI.' };
    if (staff && reason.trim().length < 10) return { field: 'reason', message: 'Indica el motivo de la modificación, de al menos 10 caracteres.' };
    return null;
  }
  const fieldError = (field: string) => (problem?.field === field ? problem.message : undefined);
  async function save(e: FormEvent) {
    e.preventDefault();
    const found = check();
    setProblem(found);
    if (found) return;
    const body = { ...form, specialty: hasCatalog ? form.specialty : '', areaId: form.areaId || undefined, ...(staff ? { version: staff.version, reason } : {}) };
    if (await action.run(staff ? `/personal/${staff.id}` : '/personal', body, staff ? 'PATCH' : 'POST')) onSaved();
  }
  return <Dialog title={staff ? 'Editar persona' : 'Registrar personal'} onClose={onClose} busy={action.busy}>
    <form className="module-form" onSubmit={save} noValidate>
      {isVersionConflict(action.error) ? <><Notice kind="error">La ficha cambió. Vuelve a abrirla para ver los datos actuales; tus cambios no se guardaron.</Notice><button type="button" className="secondary-button" onClick={onSaved}>Cerrar y recargar</button></> : <WriteError error={action.error} />}
      <p className="form-intro">Registrar a una persona en el directorio no crea una cuenta de acceso. Para darle acceso, usa “Invitar” en su fila: se envía un correo para que defina su contraseña.</p>
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
      {staff && <>
        <label className="check-field"><input type="checkbox" checked={form.active ?? true} onChange={e => put('active', e.target.checked)} />Persona activa en el directorio</label>
        <Field label="Motivo de la modificación" value={reason} onChange={setReason} required minLength={10} maxLength={500} error={fieldError('reason')} />
      </>}
      <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={action.busy}>Cancelar</button><SaveButton busy={action.busy} label={staff ? 'Guardar cambios' : 'Registrar persona'} /></div>
    </form>
  </Dialog>;
}
