import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Field } from '../../components/ui';
import { SearchPicker, type PickerItem } from '../../components/search-picker';
import { can, type AccessProfile, type Api } from '../../lib/api';
import { Dialog, SaveButton, Select, WriteError, useAction, useData } from '../common';
import { categories, emptyMovement, expiryText, fieldsFor, movementBody, movementLabels, quantityText, todayIso, validateMovement, type ArticleDetail, type ArticleSummary, type AvailableLot, type MovementForm, type MovementType, type Warehouse } from './model';

type PickerPatient = { items: { id: string; record: string; fullName: string; age?: number }[]; hasMore: boolean };

/**
 * Flujo guiado: primero el tipo, y solo se piden los campos que ese tipo necesita. El lote se sugiere filtrado por
 * artículo y bodega, con su cantidad y vencimiento, y el que vence primero (FEFO) queda elegido.
 */
export function MovementDialog({ api, profile, articles, allowedTypes, initialArticleId, onClose, onSaved }: { api: Api; profile: AccessProfile; articles: ArticleSummary[]; allowedTypes: MovementType[]; initialArticleId?: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState<MovementForm>({ ...emptyMovement(allowedTypes[0]), articleId: initialArticleId ?? '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({}), [submitted, setSubmitted] = useState(false), [patient, setPatient] = useState<PickerItem | null>(null);
  const set = (patch: Partial<MovementForm>) => setForm(current => ({ ...current, ...patch }));
  const touch = (name: string) => setTouched(current => ({ ...current, [name]: true }));
  const action = useAction(api), need = fieldsFor(form.type), article = articles.find(a => a.id === form.articleId) ?? null;
  const warehouses = useData<Warehouse[]>(api, '/inventario/bodegas'), detail = useData<ArticleDetail>(api, `/inventario/articulos/${form.articleId}`, 0, !!form.articleId && need.origin && form.type !== 'ajuste');
  const lotsPath = `/inventario/lotes?articleId=${form.articleId}&warehouseId=${form.origin}${form.type === 'merma' || form.type === 'ajuste' ? '&includeExpired=true' : ''}`;
  // Los lotes se piden por (artículo, bodega); una respuesta de otra consulta nunca se usa para elegir el lote.
  const lotsEnabled = !!form.articleId && !!form.origin && need.existingLot;
  const [lotsState, setLotsState] = useState<{ path: string; data: AvailableLot[] } | null>(null);
  useEffect(() => {
    if (!lotsEnabled) return;
    let alive = true;
    api.request<AvailableLot[]>(lotsPath).then(data => { if (alive) setLotsState({ path: lotsPath, data }); }).catch(() => { if (alive) setLotsState({ path: lotsPath, data: [] }); });
    return () => { alive = false; };
  }, [api, lotsPath, lotsEnabled]);
  const lotsData = lotsEnabled && lotsState?.path === lotsPath ? lotsState.data : null;
  const allWarehouses = warehouses.data ?? [];
  // Origen: solo las bodegas donde el artículo tiene existencia (el ajuste cuenta cualquier bodega).
  const origins = useMemo(() => {
    if (form.type === 'ajuste' || detail.data?.id !== form.articleId) return allWarehouses;
    const withStock = new Set(detail.data.warehouses.filter(w => w.quantity > 0).map(w => w.warehouseId));
    return allWarehouses.filter(w => withStock.has(w.id));
  }, [allWarehouses, detail.data, form.type]);
  const lot = (lotsData ?? []).find(l => l.id === form.lotId) ?? null;
  const lotItems: PickerItem[] = (lotsData ?? []).map(l => ({ id: l.id, label: `Lote ${l.number}${l.fefo ? ' · sugerido (vence primero)' : ''}`, detail: `${quantityText(l.quantity, article?.unit ?? '')} · ${l.expiresAt ? `${expiryText(l.expiresAt, todayIso())}` : 'No vence'}`, disabled: l.expired && form.type !== 'merma' && form.type !== 'ajuste', reason: 'Vencido' }));
  // FEFO por defecto: al cargar los lotes de la bodega se elige el que vence primero.
  useEffect(() => {
    if (!need.existingLot || form.lotId || !lotsData?.length) return;
    const first = lotsData.find(l => l.fefo) ?? lotsData[0];
    set({ lotId: first.id });
  }, [lotsData, need.existingLot, form.lotId]);
  const errors = validateMovement(form, lot);
  const show = (name: keyof typeof errors) => (submitted || touched[name]) && errors[name] ? errors[name] : undefined;
  const articleItems: PickerItem[] = articles.filter(a => a.active).map(a => ({ id: a.id, label: `${a.code} · ${a.name}`, detail: `${categories[a.type].label} · ${quantityText(a.available, a.unit)}` }));
  const searchPatients = async (query: string, offset: number) => {
    const page = await api.request<PickerPatient>(`/pacientes/selector?query=${encodeURIComponent(query)}&limit=10&offset=${offset}`);
    return { items: page.items.map(p => ({ id: p.id, label: p.fullName, detail: `${p.record}${p.age != null ? ` · ${p.age} años` : ''}` })), hasMore: page.hasMore };
  };
  function chooseType(type: MovementType) { setForm(current => ({ ...emptyMovement(type), articleId: current.articleId })); setPatient(null); setTouched({}); setSubmitted(false); }
  async function save(event: FormEvent) {
    event.preventDefault(); setSubmitted(true);
    if (Object.keys(errors).length) return;
    if (await action.run('/inventario/movimientos', movementBody(form))) onSaved();
  }
  const originLabel = form.type === 'ajuste' ? 'Bodega donde contaste' : form.type === 'traslado' ? 'Sale de la bodega' : 'Bodega de origen';
  return <Dialog title="Registrar movimiento" onClose={onClose} busy={action.busy}>
    <form className="module-form inv" onSubmit={save} noValidate>
      <WriteError error={action.error} onReload={onSaved} />
      <fieldset className="inv-types"><legend>¿Qué pasó con el artículo?</legend>
        {allowedTypes.map(type => <button type="button" key={type} className="inv-type" aria-pressed={form.type === type} onClick={() => chooseType(type)}><strong>{movementLabels[type].label}</strong><small>{movementLabels[type].help}</small></button>)}
      </fieldset>
      <div className="form-grid">
        <div>
          <SearchPicker label="Artículo" value={article ? articleItems.find(i => i.id === article.id) ?? null : null} items={articleItems} required placeholder="Busca por nombre o código"
            onChange={item => { set({ articleId: item?.id ?? '', lotId: '', origin: '', lotNumber: '' }); touch('article'); }} />
          {show('article') && <span className="inv-field-error" role="alert">{show('article')}</span>}
        </div>
        {need.origin && <div><Select label={originLabel} value={form.origin} required disabled={!form.articleId} onChange={value => { set({ origin: value, lotId: '' }); touch('origin'); }}>
            <option value="">{form.articleId ? (origins.length ? 'Elige la bodega' : 'Sin existencia en ninguna bodega') : 'Primero elige el artículo'}</option>{origins.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
          {show('origin') && <span className="inv-field-error" role="alert">{show('origin')}</span>}</div>}
        {need.destination && <div><Select label={form.type === 'entrada' ? 'Llega a la bodega' : 'Va a la bodega'} value={form.destination} required onChange={value => { set({ destination: value }); touch('destination'); }}>
            <option value="">Elige la bodega</option>{allWarehouses.filter(w => w.id !== form.origin).map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select>
          {show('destination') && <span className="inv-field-error" role="alert">{show('destination')}</span>}</div>}
        {need.existingLot && <div>
          <SearchPicker label="Lote" value={lotItems.find(i => i.id === form.lotId) ?? null} items={lotItems} disabled={!form.origin} placeholder={form.origin ? 'Busca por número de lote' : 'Elige antes la bodega'}
            emptyText="Ese artículo no tiene lotes con existencia en la bodega." onChange={item => { set({ lotId: item?.id ?? '' }); touch('lot'); }} />
          {show('lot') && <span className="inv-field-error" role="alert">{show('lot')}</span>}</div>}
        {need.newLot && <><div><Field label="Número de lote" value={form.lotNumber} onChange={value => set({ lotNumber: value })} onBlur={() => touch('lotNumber')} required maxLength={40} hint="Si el lote ya existe se suma a él." error={show('lotNumber')} /></div>
          <Field label="Vencimiento" type="date" min={todayIso()} value={form.expiresAt} onChange={value => set({ expiresAt: value })} hint="Déjalo vacío si no vence." /></>}
        <Field label="Cantidad" type="number" step="any" value={form.quantity} onChange={value => set({ quantity: value })} onBlur={() => touch('quantity')} required error={show('quantity')}
          hint={lot ? `Disponible en el lote: ${quantityText(lot.quantity, article?.unit ?? '')}` : form.type === 'ajuste' ? 'Número negativo para restar un faltante; positivo para un sobrante.' : article ? `En ${article.unit}` : undefined} />
        {need.patient && can(profile, 'pacientes.buscar') && <SearchPicker label="Paciente (opcional)" value={patient} search={searchPatients} onChange={item => { setPatient(item); set({ patientId: item?.id ?? '' }); }} hint="Liga el consumo a su expediente." />}
        <Field label="Motivo" value={form.reason} onChange={value => set({ reason: value })} onBlur={() => touch('reason')} required minLength={5} maxLength={500} error={show('reason')} />
      </div>
      {lot?.expiresAt && <p className="inv-lot-note">Lote {lot.number}: {expiryText(lot.expiresAt, todayIso())}{lot.fefo ? ' · es el que vence primero' : ' · hay otro lote que vence antes'}.</p>}
      <div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><SaveButton busy={action.busy} label="Guardar movimiento" /></div>
    </form>
  </Dialog>;
}
