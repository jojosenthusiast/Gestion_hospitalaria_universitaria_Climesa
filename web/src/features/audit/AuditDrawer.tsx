import { useEffect, useRef } from 'react';
import { Icon, Notice } from '../../components/ui';
import { roleNames, type Api } from '../../lib/api';
import { RemoteState, Tag, useData } from '../common';
import { describeAction, fullDate, resultNames, type AuditDetailData } from './query';

const BEFORE = ['antes', 'before', 'anterior'];
const AFTER = ['despues', 'después', 'after', 'nuevo'];
const pick = (detail: Record<string, unknown>, names: string[]) => names.map(name => detail[name]).find(value => value !== undefined);
const show = (value: unknown) => (value !== null && typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '—'));

/** Panel lateral con el detalle de una fila: quién, qué, cuándo, dónde y la huella que la une a la cadena. */
export function AuditDrawer({ api, seq, version, onClose, onOpen }: { api: Api; seq: string; version: number; onClose: () => void; onOpen: (seq: string) => void }) {
  const state = useData<AuditDetailData>(api, `/auditoria/registros/${seq}`, version);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.focus();
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return <>
    <button type="button" className="audit-scrim" aria-label="Cerrar detalle" onClick={onClose} />
    <aside ref={panel} className="audit-drawer" role="dialog" aria-modal="true" aria-label={`Detalle del registro ${seq}`} tabIndex={-1}>
      <header>
        <div><span className="eyebrow">Registro de auditoría</span><h2>N.º {seq}</h2></div>
        <button type="button" className="icon-button" aria-label="Cerrar detalle" onClick={onClose}><Icon name="close" /></button>
      </header>
      <RemoteState state={state}>{row => {
        const before = pick(row.detail, BEFORE), after = pick(row.detail, AFTER);
        const extra = Object.entries(row.detail).filter(([key]) => ![...BEFORE, ...AFTER].includes(key));
        return <div className="audit-drawer-body">
          <p className="audit-drawer-action"><strong>{describeAction(row.action)}</strong><code>{row.action}</code></p>
          <dl className="audit-facts">
            <div><dt>Quién</dt><dd>{row.actor ?? 'Sistema'}<small>{(row.role ?? '').split(',').filter(Boolean).map(r => roleNames[r] ?? r).join(' · ') || 'Sin rol'}</small>{row.actorId && <small className="mono">{row.actorId}</small>}</dd></div>
            <div><dt>Qué</dt><dd>{row.entity}{row.entityId ? <small className="mono">{row.entityId}</small> : null}<small>Permiso: {row.permission ?? 'sin permiso asociado'}</small></dd></div>
            <div><dt>Cuándo</dt><dd>{fullDate(row.at)}<small className="mono">{row.at}</small></dd></div>
            <div><dt>Dónde</dt><dd>API CLIMESA<small>{row.correlation ? <>Petición <span className="mono">{row.correlation}</span></> : 'Sin identificador de petición'}</small><small>La auditoría no guarda direcciones IP ni ubicación del equipo.</small></dd></div>
            <div><dt>Paciente</dt><dd>{row.patientRecord ? <>Expediente <span className="mono">{row.patientRecord}</span></> : 'No se refiere a un paciente'}</dd></div>
            <div><dt>Resultado</dt><dd><Tag value={row.result} label={resultNames[row.result]} />{row.reason && <small>Motivo: {row.reason}</small>}</dd></div>
          </dl>
          <section aria-label="Antes y después" className="audit-diff">
            <h3>Antes y después</h3>
            {before !== undefined || after !== undefined
              ? <div className="audit-diff-grid"><div><span>Antes</span><pre>{show(before)}</pre></div><div><span>Después</span><pre>{show(after)}</pre></div></div>
              : <p className="muted">Esta operación no guarda valores anteriores ni nuevos: la auditoría registra quién hizo qué y cuándo, nunca contenido clínico.</p>}
          </section>
          {extra.length > 0 && <section aria-label="Datos del evento"><h3>Datos del evento</h3>
            <dl className="audit-meta">{extra.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{typeof value === 'object' && value !== null ? <pre>{show(value)}</pre> : show(value)}</dd></div>)}</dl></section>}
          <section aria-label="Cadena de hash"><h3>Cadena de hash</h3>
            <p className="muted">Cada fila guarda la huella de la anterior; si alguien altera una, la cadena deja de coincidir desde ahí.</p>
            <dl className="audit-meta"><div><dt>Huella de esta fila</dt><dd className="mono audit-hash">{row.hash}</dd></div><div><dt>Huella de la anterior</dt><dd className="mono audit-hash">{row.previousHash}</dd></div></dl>
            <div className="audit-drawer-nav">
              <button type="button" className="secondary-button" disabled={!row.previousSeq} onClick={() => row.previousSeq && onOpen(row.previousSeq)}><Icon name="back" size={16} />Registro anterior</button>
              <button type="button" className="secondary-button" disabled={!row.nextSeq} onClick={() => row.nextSeq && onOpen(row.nextSeq)}>Registro siguiente<Icon name="arrow" size={16} /></button>
            </div>
          </section>
          <Notice kind="info">Abrir este detalle también queda auditado.</Notice>
        </div>;
      }}</RemoteState>
    </aside>
  </>;
}
