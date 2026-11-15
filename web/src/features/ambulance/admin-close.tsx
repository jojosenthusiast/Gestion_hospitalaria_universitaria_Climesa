import { useState, type FormEvent } from 'react';
import { Field } from '../../components/ui';
import { type Api } from '../../lib/api';
import { Dialog, SaveButton, WriteError, useAction } from '../common';
import { spanishProblem } from '../problems';
import { type AmbulanceStatus } from './types';

type ActiveService = NonNullable<AmbulanceStatus['activeService']>;

/** BL-05: Jefatura cierra un servicio que la tripulación no puede terminar desde la app; queda cancelado y la unidad disponible. */
export function AdminCloseAction({ api, service, onSaved }: { api: Api; service: ActiveService; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  if (!service.allowedActions?.includes('cerrar')) return null;
  return <>
    <button type="button" className="secondary-button" onClick={() => setOpen(true)}>Cierre administrativo</button>
    {open && <AdminCloseDialog api={api} service={service} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); onSaved(); }} />}
  </>;
}

function AdminCloseDialog({ api, service, onClose, onSaved }: { api: Api; service: ActiveService; onClose: () => void; onSaved: () => void }) {
  const [reason, setReason] = useState(''), action = useAction(api), valid = reason.trim().length >= 10;
  async function save(event: FormEvent) { event.preventDefault(); if (valid && await action.run(`/ambulancia/servicios/${service.id}/cerrar`, { version: service.version, reason: reason.trim() })) onSaved(); }
  return <Dialog title="Cierre administrativo" onClose={onClose} busy={action.busy}><form className="module-form" onSubmit={save}>
    <p className="form-intro">Servicio de {service.origin} hacia {service.destination}. El servicio queda cancelado como cierre administrativo y la unidad vuelve a estar disponible. Úsalo solo si la tripulación no puede terminarlo desde la app.</p>
    <WriteError error={spanishProblem(action.error)} onReload={onSaved} />
    <Field label="Motivo" value={reason} onChange={setReason} required minLength={10} maxLength={500} hint="Al menos 10 caracteres. Queda en la bitácora y la auditoría." autoFocus />
    <div className="dialog-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={action.busy}>Volver</button><SaveButton busy={action.busy} label="Cerrar servicio" disabled={!valid} /></div>
  </form></Dialog>;
}
