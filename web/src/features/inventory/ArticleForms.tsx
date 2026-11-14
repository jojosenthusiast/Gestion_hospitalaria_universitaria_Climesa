import { useState, type FormEvent } from 'react';
import { Field } from '../../components/ui';
import type { Api } from '../../lib/api';
import { Dialog, SaveButton, Select, WriteError, useAction } from '../common';
import { categories, type ArticleDetail, type ArticleType, type Lot } from './model';

export function ArticleDialog({ api, article, onClose, onSaved }: { api: Api; article: ArticleDetail | null; onClose: () => void; onSaved: (id: string) => void }) {
  const [code, setCode] = useState(article?.code ?? ''), [name, setName] = useState(article?.name ?? ''), [type, setType] = useState<ArticleType>(article?.type ?? 'insumo'),
    [unit, setUnit] = useState(article?.unit ?? ''), [minimum, setMinimum] = useState(String(article?.minimum ?? 0)), [active, setActive] = useState(article?.active ?? true), [reason, setReason] = useState('');
  const action = useAction(api);
  const minimumNumber = Number(minimum), invalidMinimum = minimum.trim() === '' || !Number.isFinite(minimumNumber) || minimumNumber < 0;
  async function save(event: FormEvent) {
    event.preventDefault();
    const body = { code: code.trim(), name: name.trim(), type, unit: unit.trim(), minimum: minimumNumber, ...(article ? { active, version: article.version, reason: reason.trim() } : {}) };
    const saved = await action.run<{ id: string }>(article ? `/inventario/articulos/${article.id}` : '/inventario/articulos', body, article ? 'PUT' : 'POST');
    if (saved) onSaved(saved.id);
  }
  return <Dialog title={article ? 'Editar artículo' : 'Nuevo artículo'} onClose={onClose} busy={action.busy}>
    <form className="module-form" onSubmit={save}>
      <WriteError error={action.error} onReload={() => onSaved(article?.id ?? '')} />
      <div className="form-grid">
        <Field label="Código" value={code} onChange={setCode} required minLength={2} maxLength={40} />
        <Field label="Nombre" value={name} onChange={setName} required minLength={2} maxLength={160} />
        <Select label="Categoría" value={type} onChange={value => setType(value as ArticleType)}>{(Object.keys(categories) as ArticleType[]).map(key => <option key={key} value={key}>{categories[key].label}</option>)}</Select>
        <Field label="Unidad" value={unit} onChange={setUnit} required maxLength={30} hint="Tableta, caja, frasco, unidad…" />
        <Field label="Existencia mínima" type="number" min="0" step="any" value={minimum} onChange={setMinimum} required error={invalidMinimum ? 'Indica un número igual o mayor que cero.' : undefined} hint="Cuando la existencia baje de este número se avisa." />
        {article && <Select label="Estado" value={active ? 'si' : 'no'} onChange={value => setActive(value === 'si')}><option value="si">Activo</option><option value="no">Inactivo: no se puede mover</option></Select>}
        {article && <Field label="Motivo del cambio" value={reason} onChange={setReason} required minLength={10} maxLength={500} hint="Queda en la auditoría." />}
      </div>
      <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><SaveButton busy={action.busy} label={article ? 'Guardar cambios' : 'Crear artículo'} disabled={invalidMinimum || (!!article && reason.trim().length < 10)} /></div>
    </form>
  </Dialog>;
}

export function LotDialog({ api, article, lot, onClose, onSaved }: { api: Api; article: ArticleDetail; lot: Lot | null; onClose: () => void; onSaved: () => void }) {
  const [number, setNumber] = useState(lot?.number ?? ''), [expiresAt, setExpiresAt] = useState(lot?.expiresAt ?? ''), [active, setActive] = useState(lot?.active ?? true), [reason, setReason] = useState('');
  const action = useAction(api);
  async function save(event: FormEvent) {
    event.preventDefault();
    const body = { number: number.trim(), ...(expiresAt ? { expiresAt } : {}), ...(lot ? { active, version: lot.version, reason: reason.trim() } : {}) };
    const saved = await action.run(lot ? `/inventario/lotes/${lot.id}` : `/inventario/articulos/${article.id}/lotes`, body, lot ? 'PUT' : 'POST');
    if (saved) onSaved();
  }
  return <Dialog title={lot ? `Editar lote ${lot.number}` : `Nuevo lote de ${article.name}`} onClose={onClose} busy={action.busy}>
    <form className="module-form" onSubmit={save}>
      <WriteError error={action.error} onReload={onSaved} />
      <p className="form-intro">Aquí se define el lote y su vencimiento. Las unidades entran con un movimiento de entrada.</p>
      <div className="form-grid">
        <Field label="Número de lote" value={number} onChange={setNumber} required maxLength={40} />
        <Field label="Vencimiento" type="date" value={expiresAt} onChange={setExpiresAt} hint="Déjalo vacío si el lote no vence." />
        {lot && <Select label="Estado del lote" value={active ? 'si' : 'no'} onChange={value => setActive(value === 'si')}><option value="si">Activo</option><option value="no">Dado de baja (solo sin existencia)</option></Select>}
        {lot && <Field label="Motivo del cambio" value={reason} onChange={setReason} required minLength={10} maxLength={500} hint="Queda en la auditoría." />}
      </div>
      <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><SaveButton busy={action.busy} label={lot ? 'Guardar lote' : 'Crear lote'} disabled={!number.trim() || (!!lot && reason.trim().length < 10)} /></div>
    </form>
  </Dialog>;
}
