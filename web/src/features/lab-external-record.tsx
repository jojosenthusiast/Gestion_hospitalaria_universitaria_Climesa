import { useId, useState } from 'react';
import './laboratory.css';
import { Field, Notice } from '../components/ui';
import { ApiError, type Api } from '../lib/api';
import { uploadAttachment } from '../lib/lab-attachments';
import { ATTACHMENT_ACCEPT, attachmentMimeType, attachmentProblem, fingerprintFile, formatBytes } from '../lib/lab-flow';
import { Dialog, SaveButton, WriteError, useAction, useData } from './common';
import type { LabExam } from './consultations';
import { spanishProblem } from './problems';

type Picked = LabExam & { numeric: boolean };

/**
 * R7 U3, journey C2 gap C-5 (D-5): the patient brings an exam done elsewhere that nobody ordered here. The doctor with a
 * care relationship records it from the patient record (`POST /laboratorio/pacientes/{id}/resultado-externo`); the API
 * attaches it to the patient's latest consultation and leaves it completed, waiting for the doctor's release. Then the
 * file goes up to the private storage; if it fails, the values stay and the file can be uploaded later from the order.
 */
export function RegisterExternalResultDialog({ api, patient, onClose, onSaved }: { api: Api; patient: { id: string; fullName: string }; onClose: () => void; onSaved: (message: string) => void }) {
  const catalog = useData<LabExam[]>(api, '/laboratorio/catalogo', 0);
  const action = useAction(api), selectId = useId(), fileId = useId();
  const [place, setPlace] = useState(''), [choice, setChoice] = useState(''), [exams, setExams] = useState<Picked[]>([]);
  const [values, setValues] = useState<Record<string, string>>({}), [file, setFile] = useState<File | null>(null), [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false), [uploadError, setUploadError] = useState<ApiError | null>(null);
  const options = (catalog.data ?? []).filter(e => !e.isPanel && !exams.some(x => x.id === e.id)).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  const problem = attachmentProblem(file);
  const missing = exams.some(e => !(values[e.id] ?? '').trim() || (e.numeric && !Number.isFinite(Number((values[e.id] ?? '').replace(',', '.')))));
  const ready = place.trim().length >= 3 && exams.length > 0 && !missing && !!file && !problem;
  const done = `Resultado externo de ${patient.fullName} registrado: queda en «Resultados por revisar» para liberarlo.`;

  function add() {
    const exam = (catalog.data ?? []).find(e => e.id === choice);
    if (!exam) return;
    setExams(current => [...current, { ...exam, numeric: (exam.resultType ?? 'numerico') === 'numerico' }]);
    setChoice('');
  }
  async function save() {
    if (!ready || !file) return;
    const sha256 = await fingerprintFile(file);
    const body = {
      place: place.trim(),
      attachment: { fileName: file.name, mimeType: attachmentMimeType(file) ?? file.type, sizeBytes: file.size, ...(sha256 ? { sha256 } : {}) },
      results: exams.map(e => e.numeric ? { examId: e.id, value: Number(values[e.id].replace(',', '.')) } : { examId: e.id, text: values[e.id].trim() }),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    const saved = await action.run<{ attachmentId?: string }>(`/laboratorio/pacientes/${patient.id}/resultado-externo`, body);
    if (!saved) return;
    if (saved.attachmentId) {
      setUploading(true);
      try { await uploadAttachment(api, saved.attachmentId, file); } catch (e) {
        setUploadError(spanishProblem(e instanceof ApiError ? e : new ApiError('No se pudo conectar. Revisa tu conexión y vuelve a intentarlo.')));
        return;
      } finally { setUploading(false); }
    }
    onSaved(done);
  }

  if (uploadError && file) return <Dialog title="Registrar resultado externo" onClose={() => onSaved(done)}><div className="module-form">
    <Notice kind="error">Los valores se guardaron, pero el archivo no se subió: {uploadError.message}</Notice>
    <p className="form-intro">Archivo pendiente: «{file.name}» ({formatBytes(file.size)}). Súbelo desde la orden, en Laboratorio › «Informe externo» › Reintentar.</p>
    <div className="dialog-actions"><button className="primary-button" type="button" onClick={() => onSaved(done)}>Entendido</button></div>
  </div></Dialog>;
  const busy = action.busy || uploading;
  return <Dialog title="Registrar resultado externo" onClose={onClose} busy={busy}><form className="module-form" onSubmit={event => { event.preventDefault(); void save(); }}>
    <p className="form-intro">{patient.fullName} trae un examen que se hizo en otro sitio y que no se pidió aquí. Queda unido a su última consulta, completado y esperando tu revisión; el paciente no ve los valores hasta que los liberes.</p>
    <WriteError error={spanishProblem(action.error)} onReload={onClose} reloadLabel="Cerrar" />
    <Field label="Dónde se hizo" value={place} onChange={setPlace} required minLength={3} maxLength={200} autoFocus placeholder="Por ejemplo: Laboratorio Ejemplo, San Salvador" />
    <div className="select-field"><label htmlFor={selectId}>Examen</label>
      <div className="lab-external-add"><select id={selectId} value={choice} onChange={event => setChoice(event.target.value)} disabled={!catalog.data}>
        <option value="">Elige un examen</option>{options.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        <button type="button" className="secondary-button" onClick={add} disabled={!choice}>Agregar examen</button></div></div>
    {catalog.error && <Notice kind="error">No pudimos cargar el catálogo de exámenes.</Notice>}
    {exams.length > 0 && <fieldset className="lab-external-values"><legend>Valores del informe</legend>
      {exams.map(e => <div key={e.id} className="lab-external-value">
        <Field label={`${e.name}${e.numeric && e.unit ? ` (${e.unit})` : ''}`} inputMode={e.numeric ? 'decimal' : undefined} value={values[e.id] ?? ''} onChange={value => setValues(current => ({ ...current, [e.id]: value }))} required />
        <button type="button" className="cl-link-button" onClick={() => setExams(current => current.filter(x => x.id !== e.id))}>Quitar {e.name}</button></div>)}
    </fieldset>}
    <div className="select-field"><label htmlFor={fileId}>Informe (PDF o foto, hasta 10 MB)</label><input id={fileId} type="file" accept={ATTACHMENT_ACCEPT} aria-required="true" onChange={event => setFile(event.target.files?.[0] ?? null)} /></div>
    {file && (problem ? <Notice kind="error">{problem}</Notice> : <p className="muted">{file.name} · {formatBytes(file.size)}</p>)}
    <Field label="Nota (opcional)" value={note} onChange={setNote} maxLength={1000} />
    <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose} disabled={busy}>Volver</button><SaveButton busy={busy} disabled={!ready} label={uploading ? 'Subiendo archivo…' : 'Registrar resultado'} /></div>
  </form></Dialog>;
}
