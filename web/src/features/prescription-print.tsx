import { createPortal } from 'react-dom';
import { Icon } from '../components/ui';
import { Dialog, formatDateTime } from './common';
import './prescription-print.css';

export type PrescriptionItem = { medication: string; dose: string; route: string; frequency: string; duration: string; instructions?: string | null };
export type PrintablePrescription = {
  patient: { name: string; record?: string | null };
  doctor: { name: string; specialty?: string | null };
  issuedAt: string;
  diagnosis?: string | null;
  items: PrescriptionItem[];
};

/** The sheet itself: the same markup on screen (preview) and on paper. */
export function PrescriptionSheet({ rx }: { rx: PrintablePrescription }) {
  return <article className="rx-sheet" aria-label="Receta médica">
    <header className="rx-head">
      <div><strong className="rx-brand">CLIMESA</strong><span>Hospital universitario</span></div>
      <h2>Receta médica</h2>
    </header>
    <dl className="rx-meta">
      <div><dt>Paciente</dt><dd>{rx.patient.name}</dd></div>
      {rx.patient.record && <div><dt>Expediente</dt><dd className="mono-data">{rx.patient.record}</dd></div>}
      <div><dt>Médico</dt><dd>{rx.doctor.name}{rx.doctor.specialty ? ` · ${rx.doctor.specialty}` : ''}</dd></div>
      <div><dt>Fecha</dt><dd>{formatDateTime(rx.issuedAt, { withYear: true })}</dd></div>
      {rx.diagnosis && <div className="rx-wide"><dt>Diagnóstico</dt><dd>{rx.diagnosis}</dd></div>}
    </dl>
    <ol className="rx-items">{rx.items.map((item, i) => <li key={i}>
      <strong>{item.medication}</strong>
      <span>{item.dose} · Vía {item.route.toLocaleLowerCase('es')}</span>
      <span>{item.frequency} durante {item.duration}</span>
      {item.instructions && <span className="rx-note">{item.instructions}</span>}
    </li>)}</ol>
    <footer className="rx-sign"><span className="rx-line" aria-hidden="true" /><span>{rx.doctor.name}</span><small>Firma y sello del médico</small></footer>
  </article>;
}

/**
 * S19: «Imprimir receta» opens this print-friendly view; «Imprimir» uses the browser dialog, which also saves a PDF.
 * A copy of the sheet lives at the end of <body>; on paper only that copy prints (prescription-print.css).
 */
export function PrescriptionPrintDialog({ rx, onClose }: { rx: PrintablePrescription; onClose: () => void }) {
  return <>
    <Dialog title="Receta" onClose={onClose}>
      <div className="rx-preview"><PrescriptionSheet rx={rx} /></div>
      <div className="dialog-actions">
        <button type="button" className="secondary-button" onClick={onClose}>Cerrar</button>
        <button type="button" className="primary-button" onClick={() => window.print()}><Icon name="clipboard" size={18} /><span>Imprimir</span></button>
      </div>
    </Dialog>
    {createPortal(<div className="rx-print-root" aria-hidden="true"><PrescriptionSheet rx={rx} /></div>, document.body)}
  </>;
}

/** «Imprimir receta» button, shown only when the consultation has prescription items. */
export function PrintPrescriptionButton({ onClick, label = 'Imprimir receta' }: { onClick: () => void; label?: string }) {
  return <button type="button" className="secondary-button rx-print-button" onClick={onClick}><Icon name="clipboard" size={18} /><span>{label}</span></button>;
}
