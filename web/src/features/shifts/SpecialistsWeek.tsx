import { useMemo, useState } from 'react';
import { Icon } from '../../components/ui';
import type { Api } from '../../lib/api';
import { Empty, RemoteState, Tag, useData } from '../common';
import { HOUR, localDay, localMs, localTime } from './rules';

type SpecialistWeek = { from: string; to: string; items: { date: string; specialty: string; name: string; area: string; start: string; end: string; attendance: string | null }[] };

/** Lunes (día local) de la semana que contiene `ms`. */
export function mondayOf(ms: number): string {
  const day = localDay(ms), weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  return localDay(localMs(day, '12:00') - ((weekday + 6) % 7) * 24 * HOUR);
}
const dayName = (day: string) => new Intl.DateTimeFormat('es-SV', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`));

/** CARGA-04: qué especialistas atienden cada día de la semana (REC agenda, JOP revisa la cobertura por especialidad). */
export function SpecialistsWeek({ api, version }: { api: Api; version: number }) {
  const [from, setFrom] = useState(() => mondayOf(Date.now()));
  const data = useData<SpecialistWeek>(api, `/turnos/especialistas?from=${from}`, version);
  const move = (weeks: number) => setFrom(f => localDay(localMs(f, '12:00') + weeks * 7 * 24 * HOUR));
  const days = useMemo(() => {
    const out = new Map<string, Map<string, SpecialistWeek['items']>>();
    for (const item of data.data?.items ?? []) {
      const bySpecialty = out.get(item.date) ?? new Map();
      bySpecialty.set(item.specialty, [...(bySpecialty.get(item.specialty) ?? []), item]);
      out.set(item.date, bySpecialty);
    }
    return [...out.entries()];
  }, [data.data]);
  return <section className="data-workbench specialists-week" aria-label="Especialistas de la semana">
    <div className="shift-toolbar"><div className="shift-toolbar-row">
      <button type="button" className="secondary-button" onClick={() => move(-1)}>Semana anterior</button>
      <strong>Semana del {dayName(from)}</strong>
      <button type="button" className="secondary-button" onClick={() => move(1)}>Semana siguiente<Icon name="arrow" size={16} /></button>
    </div></div>
    <RemoteState state={data}>{() => days.length ? <div className="specialists-days">
      {days.map(([day, specialties]) => <article key={day} className="specialists-day">
        <h3>{dayName(day)}</h3>
        {[...specialties.entries()].sort((a, b) => a[0].localeCompare(b[0], 'es')).map(([specialty, doctors]) => <div key={specialty} className="specialists-group">
          <h4>{specialty}</h4>
          <ul>{doctors.map((d, i) => <li key={`${d.name}-${d.start}-${i}`}>
            <span>{d.name} · {d.area} · {localTime(Date.parse(d.start))} a {localTime(Date.parse(d.end))}</span>
            {d.attendance === 'ausente' && <Tag value="cancelado" label="Ausente" />}
          </li>)}</ul>
        </div>)}
      </article>)}
    </div> : <Empty title="Sin médicos programados esta semana" description="Cambia de semana o pide a la jefatura de operaciones que asigne turnos." />}</RemoteState>
  </section>;
}
