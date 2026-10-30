import type { ReactNode } from 'react';
import { can, type AccessProfile, type Api, type Summary } from '../lib/api';
import { Notice } from '../components/ui';
import { RemoteState, formatDateTime, useData } from './common';

// 113-T01 (FR-113-06): los módulos que aún no existen muestran en qué semana llegan, nunca un cero.
// La semana es la de 113-T03, que completa estas tarjetas con datos reales.
const pendientes = [
  { titulo: 'Ambulancia', semana: 4 },
  { titulo: 'Números en fila', semana: 4 },
  { titulo: 'Órdenes de laboratorio', semana: 4 },
];

const Cifra = ({ valor, etiqueta }: { valor: number; etiqueta: string }) => <div><strong>{valor}</strong><span>{etiqueta}</span></div>;
const Tarjeta = ({ titulo, children }: { titulo: string; children: ReactNode }) => <section className="board-card" aria-label={titulo}><h2>{titulo}</h2>{children}</section>;

function Tarjetas({ resumen }: { resumen: Summary }) {
  const { beds, shifts, patients } = resumen;
  return <>
    <div className="board-grid">
      {beds && <Tarjeta titulo="Camas">
        {beds.total === 0
          ? <p className="muted">Todavía no hay camas registradas.</p>
          : <><div className="board-figures"><Cifra valor={beds.free} etiqueta="Libres" /><Cifra valor={beds.occupied} etiqueta="Ocupadas" /><Cifra valor={beds.cleaning ?? 0} etiqueta="En limpieza" /></div><p className="board-note">de {beds.total} camas de hospitalización</p></>}
      </Tarjeta>}
      {shifts && <Tarjeta titulo="Turnos"><div className="board-figures"><Cifra valor={shifts.current} etiqueta="En curso ahora" /></div></Tarjeta>}
      {patients && <Tarjeta titulo="Pacientes"><div className="board-figures"><Cifra valor={patients.active} etiqueta="Activos" /></div></Tarjeta>}
      {pendientes.map(p => <section className="board-card board-card-pending" aria-label={p.titulo} key={p.titulo}><h2>{p.titulo}</h2><p className="board-pending">Disponible en la semana {p.semana}</p></section>)}
    </div>
    <p className="updated-at">Actualizado: {formatDateTime(resumen.lastUpdate)}</p>
  </>;
}

/** W03 · tablero inicial: solo agregados. `version` sube con cada evento de tiempo real y vuelve a pedir los datos. */
export function Tablero({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const permitido = can(profile, 'metricas.ver');
  const data = useData<Summary>(api, '/inicio', version, permitido);
  if (!permitido) return <div className="module-state"><Notice kind="info">Tu cuenta no tiene permiso para ver el tablero.</Notice></div>;
  return <RemoteState state={data}>{resumen => <Tarjetas resumen={resumen} />}</RemoteState>;
}
