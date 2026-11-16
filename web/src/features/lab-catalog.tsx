import { useState } from 'react';
import './laboratory.css';
import { Field } from '../components/ui';
import { can, type AccessProfile, type Api } from '../lib/api';
import { Empty, Heading, RemoteState, SaveButton, Select, Tag, WriteError, useAction, useData } from './common';
import { LiveSearch, ListToolbar, matches } from './listas/chips';
import './listas/lists.css';

type Range = { id?: string; sex: string; ageFrom: number; ageTo: number | null; min: number | null; max: number | null; criticalLow: number | null; criticalHigh: number | null; validFrom?: string; source: string };
export type CatalogExam = { id: string; code: string; name: string; isPanel: boolean; unit: string | null; resultType: string; active: boolean; version: number; hasResults: boolean; components: { id: string; code: string; name: string }[]; ranges: Range[] };

const SEX_LABEL: Record<string, string> = { cualquiera: 'Cualquier sexo', femenino: 'Femenino', masculino: 'Masculino' };
const kindLabel = (exam: CatalogExam) => exam.isPanel ? 'Panel' : exam.resultType === 'texto' ? 'Resultado de texto' : 'Numérico';

/**
 * W10 (MA-LAB-06): the administrator edits the exam catalog. Ranges are versioned by validity: saving closes the ranges
 * valid today and opens the new ones from today, so past results keep the range their mark was computed with.
 */
export function LabCatalogPage({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const data = useData<CatalogExam[]>(api, '/catalogo/examenes', version, can(profile, 'catalogo.configurar'));
  const [query, setQuery] = useState(''), [selectedId, setSelectedId] = useState<string | null>(null);
  return <>
    <Heading eyebrow="Configuración / Laboratorio" title="Catálogo de laboratorio" description="Exámenes y paneles que Medicina puede ordenar, con su unidad y sus rangos de referencia" />
    <section className="data-workbench" aria-label="Catálogo de exámenes"><RemoteState state={data}>{all => {
      const rows = all.filter(exam => matches(query, exam.code, exam.name));
      const selected = rows.find(exam => exam.id === selectedId) ?? rows[0] ?? null;
      return <>
        <ListToolbar><LiveSearch label="Buscar exámenes" placeholder="Código o nombre" value={query} onChange={setQuery} /></ListToolbar>
        {rows.length ? <div className="cl-master-detail">
          <ul className="cl-master" aria-label="Exámenes">{rows.map(exam => <li key={exam.id}><button type="button" className="lw-row" aria-current={exam.id === selected?.id} onClick={() => setSelectedId(exam.id)}>
            <span className="lw-patient"><strong>{exam.name}</strong><small>{exam.code} · {kindLabel(exam)}{exam.unit ? ` · ${exam.unit}` : ''}</small></span>
            <span className="lw-end">{exam.active ? <Tag value="activo" label="Activo" /> : <Tag value="inactivo" label="Inactivo" />}</span>
          </button></li>)}</ul>
          {selected && <ExamEditor key={`${selected.id}-${selected.version}`} api={api} exam={selected} onSaved={data.refresh} />}
        </div> : all.length ? <Empty title="Ningún examen coincide" description="Cambia lo que buscas." /> : <Empty title="El catálogo está vacío" description="No hay exámenes registrados." />}
      </>;
    }}</RemoteState></section>
  </>;
}

const num = (value: string) => value.trim() === '' ? null : Number(value);
const text = (value: number | null) => value === null ? '' : String(value);
type RangeForm = { sex: string; ageFrom: string; ageTo: string; min: string; max: string; criticalLow: string; criticalHigh: string; source: string };
const toForm = (r: Range): RangeForm => ({ sex: r.sex, ageFrom: String(r.ageFrom), ageTo: text(r.ageTo), min: text(r.min), max: text(r.max), criticalLow: text(r.criticalLow), criticalHigh: text(r.criticalHigh), source: r.source });
const emptyRange: RangeForm = { sex: 'cualquiera', ageFrom: '18', ageTo: '120', min: '', max: '', criticalLow: '', criticalHigh: '', source: '' };
const sameRanges = (a: RangeForm[], b: RangeForm[]) => JSON.stringify(a) === JSON.stringify(b);

/** Problem with the ranges as typed, in plain Spanish (the API checks the same rules). */
export function rangeFormProblem(ranges: RangeForm[]): string | null {
  for (const r of ranges) {
    if (r.ageFrom.trim() === '' || Number.isNaN(Number(r.ageFrom))) return 'Indica la edad inicial de cada rango.';
    if (r.ageTo.trim() !== '' && Number(r.ageTo) <= Number(r.ageFrom)) return 'La edad final debe ser mayor que la inicial.';
    if (![r.min, r.max, r.criticalLow, r.criticalHigh].some(v => v.trim() !== '')) return 'Cada rango necesita al menos un límite.';
    if (r.min.trim() && r.max.trim() && Number(r.min) > Number(r.max)) return 'El mínimo no puede ser mayor que el máximo.';
    if (r.source.trim().length < 3) return 'Indica la fuente de cada rango.';
  }
  return null;
}

function ExamEditor({ api, exam, onSaved }: { api: Api; exam: CatalogExam; onSaved: () => void }) {
  const action = useAction(api), numeric = !exam.isPanel && exam.resultType === 'numerico';
  const initial = exam.ranges.map(toForm);
  const [name, setName] = useState(exam.name), [unit, setUnit] = useState(exam.unit ?? ''), [active, setActive] = useState(exam.active), [ranges, setRanges] = useState<RangeForm[]>(initial);
  const rangesChanged = !sameRanges(ranges, initial), problem = numeric && rangesChanged ? rangeFormProblem(ranges) : null;
  const changed = name.trim() !== exam.name || (numeric && unit.trim() !== (exam.unit ?? '')) || active !== exam.active || rangesChanged;
  const update = (index: number, patch: Partial<RangeForm>) => setRanges(list => list.map((r, i) => i === index ? { ...r, ...patch } : r));
  async function save() {
    const body = {
      version: exam.version,
      ...(name.trim() !== exam.name ? { name: name.trim() } : {}),
      ...(numeric && unit.trim() !== (exam.unit ?? '') ? { unit: unit.trim() } : {}),
      ...(active !== exam.active ? { active } : {}),
      ...(numeric && rangesChanged ? { ranges: ranges.map(r => ({ sex: r.sex, ageFrom: Number(r.ageFrom), ageTo: num(r.ageTo), min: num(r.min), max: num(r.max), criticalLow: num(r.criticalLow), criticalHigh: num(r.criticalHigh), source: r.source.trim() })) } : {}),
    };
    if (await action.run(`/catalogo/examenes/${exam.id}`, body, 'PUT')) onSaved();
  }
  return <aside className="cl-detail" aria-label={`Editar ${exam.name}`}><form className="module-form" onSubmit={event => { event.preventDefault(); void save(); }}>
    <header><h3>{exam.name}</h3><p className="muted">{exam.code} · {kindLabel(exam)}</p></header>
    <WriteError error={action.error} onReload={onSaved} reloadLabel="Recargar el catálogo" />
    <Field label="Nombre" value={name} onChange={setName} required minLength={2} maxLength={120} />
    {numeric && <Field label="Unidad" value={unit} onChange={setUnit} required maxLength={40} disabled={exam.hasResults} />}
    {numeric && exam.hasResults && <p className="muted">La unidad no se cambia porque ya hay resultados capturados con ella.</p>}
    <label className="check-field"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} /> Disponible para nuevas órdenes</label>
    {exam.isPanel && <div><strong>Componentes</strong><ul>{exam.components.map(c => <li key={c.id}>{c.code} · {c.name}</li>)}</ul></div>}
    {numeric && <fieldset className="lab-ranges"><legend>Rangos de referencia vigentes</legend>
      <p className="muted">Al guardar, los rangos de hoy se cierran y los nuevos rigen desde hoy; los resultados anteriores conservan su rango.</p>
      {ranges.length === 0 && <p className="muted">Sin rangos: los resultados se marcan «sin rango».</p>}
      {ranges.map((r, index) => <div className="form-grid" key={index} role="group" aria-label={`Rango ${index + 1}`}>
        <Select label="Sexo" value={r.sex} onChange={sex => update(index, { sex })}>{Object.entries(SEX_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select>
        <Field label="Edad desde (años)" type="number" value={r.ageFrom} onChange={ageFrom => update(index, { ageFrom })} required />
        <Field label="Edad hasta (sin incluir)" type="number" value={r.ageTo} onChange={ageTo => update(index, { ageTo })} />
        <Field label="Mínimo normal" type="number" value={r.min} onChange={min => update(index, { min })} />
        <Field label="Máximo normal" type="number" value={r.max} onChange={max => update(index, { max })} />
        <Field label="Crítico bajo" type="number" value={r.criticalLow} onChange={criticalLow => update(index, { criticalLow })} />
        <Field label="Crítico alto" type="number" value={r.criticalHigh} onChange={criticalHigh => update(index, { criticalHigh })} />
        <Field label="Fuente" value={r.source} onChange={source => update(index, { source })} required />
        <button type="button" className="secondary-button" onClick={() => setRanges(list => list.filter((_, i) => i !== index))}>Quitar rango</button>
      </div>)}
      <button type="button" className="secondary-button" onClick={() => setRanges(list => [...list, emptyRange])}>Agregar rango</button>
    </fieldset>}
    {problem && <p className="field-error" role="alert">{problem}</p>}
    <div className="dialog-actions"><SaveButton busy={action.busy} disabled={!changed || !!problem} label="Guardar examen" /></div>
  </form></aside>;
}
