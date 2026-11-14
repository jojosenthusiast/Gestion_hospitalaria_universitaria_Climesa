import { useState } from 'react';
import { Icon } from '../../components/ui';
import type { Api, ChainCheck } from '../../lib/api';
import { WriteError, useAction } from '../common';
import { fullDate } from './query';

/** Verificación de la cadena de hash (FR-110-07): resultado claro y, si falla, el registro exacto donde se rompe. */
export function ChainPanel({ api, onOpen }: { api: Api; onOpen: (seq: string) => void }) {
  const verify = useAction(api);
  const [check, setCheck] = useState<ChainCheck | null>(null);
  async function run() {
    setCheck(null);
    const result = await verify.run<ChainCheck>('/auditoria/verificacion', {});
    if (result) setCheck(result);
  }
  return <section className={`audit-chain${check ? (check.integra ? ' is-ok' : ' is-broken') : ''}`} aria-label="Verificación de la cadena">
    <span className="audit-chain-icon" aria-hidden="true"><Icon name={check && !check.integra ? 'alert' : 'shield'} size={24} /></span>
    <div className="audit-chain-text">
      <strong>{!check ? 'Integridad de la cadena' : check.integra ? 'Cadena íntegra' : 'Cadena alterada'}</strong>
      {!check && <span>Recorre todos los registros y comprueba que ninguno fue modificado después de escribirse.</span>}
      {check?.integra && <span role="status">Se revisaron {check.revisados} registros sin diferencias. Verificado el {fullDate(check.verificadoEn)}.</span>}
      {check && !check.integra && <span role="alert">La cadena está alterada en el registro {check.primeraFallida}: {check.motivo}. Se revisaron {check.revisados} registros íntegros antes de él.</span>}
      <WriteError error={verify.error} />
    </div>
    <div className="audit-chain-actions">
      {check && !check.integra && check.primeraFallida != null && <button type="button" className="secondary-button" onClick={() => onOpen(String(check.primeraFallida))}>Ver registro {check.primeraFallida}</button>}
      <button type="button" className="primary-button" onClick={() => void run()} disabled={verify.busy}><Icon name="shield" size={18} />{verify.busy ? 'Verificando…' : check ? 'Verificar de nuevo' : 'Verificar integridad'}</button>
    </div>
  </section>;
}
