import type { ReactNode } from 'react';
import { can, roleNames, type AccessProfile, type Api } from '../lib/api';
import { Notice } from '../components/ui';
import { HBarList, StackedBar, type Tone } from '../components/charts';
import { RemoteState, formatDateTime, useData } from './common';

/** Respuesta de `GET /metricas/tablero` (spec 113): solo agregados, sin datos personales. */
export type MetricsBoard = {
  actualizadoEn: string;
  fecha: string;
  camas: { total: number; libres: number; ocupadas: number; limpieza: number; bloqueadas: number; reservadas: number };
  ocupacionPorPlanta: { planta: number | null; camas: number; libres: number; ocupadas: number; limpieza: number; bloqueadas: number; reservadas: number }[];
  ambulancia: { estado: string; paramedicoDeTurno: boolean } | null;
  fila: { emitidos: number; enEspera: number; llamados: number; enAtencion: number; atendidos: number; noSePresento: number };
  laboratorio: { pendiente: number; enProceso: number; completadoHoy: number; canceladoHoy: number };
  cobertura: { huecos: number; detalle: { area: string; rol: string; inicio: string; fin: string; requeridos: number; actuales: number }[] };
  turnosEnCurso: number;
  pacientesActivos: number;
};

const ambulanceStates: Record<string, string> = { disponible: 'Disponible', en_servicio: 'En servicio', en_mantenimiento: 'En mantenimiento' };
const Cifra = ({ valor, etiqueta }: { valor: number; etiqueta: string }) => <div><strong>{valor}</strong><span>{etiqueta}</span></div>;
const Tarjeta = ({ titulo, children, className = '' }: { titulo: string; children: ReactNode; className?: string }) => <section className={`board-card ${className}`.trim()} aria-label={titulo}><h2>{titulo}</h2>{children}</section>;
const nombrePlanta = (planta: number | null) => planta == null ? 'Sin planta' : `Planta ${planta}`;

/** Semáforo de ocupación: hasta 70 % holgura, hasta 90 % atención, más de eso crítico (solo el rojo es crítico, como en el prototipo). */
export const occupancyTone = (percent: number): Tone => percent >= 90 ? 'danger' : percent >= 70 ? 'warn' : 'ok';
export const bedSegments = (c: { libres: number; ocupadas: number; limpieza: number; bloqueadas: number; reservadas: number }) => [
  { label: 'Libres', value: c.libres, tone: 'ok' as Tone },
  { label: 'Ocupadas', value: c.ocupadas, tone: 'ink' as Tone },
  { label: 'Reservadas', value: c.reservadas, tone: 'violet' as Tone },
  { label: 'En limpieza', value: c.limpieza, tone: 'warn' as Tone },
  { label: 'Bloqueadas', value: c.bloqueadas, tone: 'slate' as Tone },
];

function OcupacionPorPlanta({ plantas }: { plantas: MetricsBoard['ocupacionPorPlanta'] }) {
  return <Tarjeta titulo="Ocupación por planta" className="board-card-wide">
    {plantas.length === 0
      ? <p className="muted">Todavía no hay plantas de hospitalización registradas.</p>
      : <div className="floor-occupancy">{plantas.map(planta => {
        const noDisponibles = Math.max(0, planta.camas - planta.libres);
        const percent = planta.camas ? Math.round((noDisponibles / planta.camas) * 100) : 0;
        const nombre = nombrePlanta(planta.planta);
        return <div className="floor-block" key={nombre}>
          <div className="floor-head"><strong>{nombre}</strong><span>{noDisponibles} no disponibles de {planta.camas}</span><span className={`floor-percent tone-${occupancyTone(percent)}`}>{percent}%</span></div>
          <StackedBar title={`${nombre}: ${percent}% de camas no disponibles`} segments={bedSegments(planta)} empty="Sin camas en esta planta." />
        </div>;
      })}</div>}
  </Tarjeta>;
}

function CoberturaTurnos({ cobertura }: { cobertura: MetricsBoard['cobertura'] }) {
  return <Tarjeta titulo="Cobertura de turnos" className="board-card-wide">
    {cobertura.huecos === 0
      ? <p className="coverage-ok">Cobertura completa para hoy.</p>
      : <><p className="coverage-count tone-warn">{cobertura.huecos} {cobertura.huecos === 1 ? 'hueco de cobertura' : 'huecos de cobertura'}</p><ul className="coverage-list">{cobertura.detalle.slice(0, 4).map((gap, index) => <li key={`${gap.area}-${gap.rol}-${gap.inicio}-${index}`}><strong>{gap.area} · {roleNames[gap.rol] ?? gap.rol}</strong><span>{gap.actuales} de {gap.requeridos} personas</span></li>)}</ul></>}
  </Tarjeta>;
}

/** Tarjetas del tablero ya cargado: los inicios por rol reutilizan el mismo dato sin pedirlo otra vez. */
export function BoardView({ board: t }: { board: MetricsBoard }) {
  return <>
    <div className="board-grid board-grid-main">
      <Tarjeta titulo="Camas">
        {t.camas.total === 0
          ? <p className="muted">Todavía no hay camas registradas.</p>
          : <><div className="board-figures"><Cifra valor={t.camas.libres} etiqueta="Libres" /><Cifra valor={t.camas.ocupadas} etiqueta="Ocupadas" /><Cifra valor={t.camas.limpieza} etiqueta="En limpieza" /></div><StackedBar title="Camas por estado" segments={bedSegments(t.camas)} /><p className="board-note">de {t.camas.total} camas de hospitalización</p></>}
      </Tarjeta>
      <Tarjeta titulo="Ambulancia">
        {t.ambulancia
          ? <><p><span className={`status-tag status-${t.ambulancia.estado}`}>{ambulanceStates[t.ambulancia.estado] ?? t.ambulancia.estado}</span></p><p className="board-note">{t.ambulancia.paramedicoDeTurno ? 'Paramédico de turno' : 'Sin paramédico con turno en curso'}</p></>
          : <p className="muted">No hay una unidad registrada.</p>}
      </Tarjeta>
      <Tarjeta titulo="Números en fila">
        {t.fila.emitidos === 0
          ? <p className="muted">Todavía no se han emitido números hoy.</p>
          : <><div className="board-figures"><Cifra valor={t.fila.enEspera} etiqueta="En espera" /><Cifra valor={t.fila.llamados} etiqueta="Llamados" /><Cifra valor={t.fila.enAtencion} etiqueta="En atención" /></div>
            <HBarList title="Números de hoy por estado" total={t.fila.emitidos} data={[{ label: 'En espera', value: t.fila.enEspera, tone: 'warn' }, { label: 'Llamados', value: t.fila.llamados, tone: 'info' }, { label: 'En atención', value: t.fila.enAtencion, tone: 'primary' }, { label: 'Atendidos', value: t.fila.atendidos, tone: 'ok' }, { label: 'No se presentó', value: t.fila.noSePresento, tone: 'slate' }]} />
            <p className="board-note">de {t.fila.emitidos} números emitidos hoy</p></>}
      </Tarjeta>
      <Tarjeta titulo="Órdenes de laboratorio">
        <div className="board-figures"><Cifra valor={t.laboratorio.pendiente} etiqueta="Pendientes" /><Cifra valor={t.laboratorio.enProceso} etiqueta="En proceso" /><Cifra valor={t.laboratorio.completadoHoy} etiqueta="Completadas hoy" /></div>
        <HBarList title="Laboratorio por estado" data={[{ label: 'Pendientes', value: t.laboratorio.pendiente, tone: 'warn' }, { label: 'En proceso', value: t.laboratorio.enProceso, tone: 'info' }, { label: 'Completadas hoy', value: t.laboratorio.completadoHoy, tone: 'ok' }, { label: 'Canceladas hoy', value: t.laboratorio.canceladoHoy, tone: 'slate' }]} />
      </Tarjeta>
      <Tarjeta titulo="Turnos"><div className="board-figures"><Cifra valor={t.turnosEnCurso} etiqueta="En curso ahora" /></div></Tarjeta>
      <Tarjeta titulo="Pacientes"><div className="board-figures"><Cifra valor={t.pacientesActivos} etiqueta="Activos" /></div></Tarjeta>
    </div>
    <div className="board-grid board-grid-detail">
      <OcupacionPorPlanta plantas={t.ocupacionPorPlanta} />
      <CoberturaTurnos cobertura={t.cobertura} />
    </div>
    <p className="updated-at">Actualizado: {formatDateTime(t.actualizadoEn)}</p>
  </>;
}

/**
 * W03 · tablero sobre `GET /metricas/tablero`: solo agregados (FR-113-03). `version` sube con cada
 * evento de tiempo real (`metricas.recalculadas` llega a los roles con `metricas.ver`) y vuelve a pedir.
 */
export function Tablero({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const permitido = can(profile, 'metricas.ver');
  const data = useData<MetricsBoard>(api, '/metricas/tablero', version, permitido);
  if (!permitido) return <div className="module-state"><Notice kind="info">Tu cuenta no tiene permiso para ver el tablero.</Notice></div>;
  return <RemoteState state={data}>{t => <BoardView board={t} />}</RemoteState>;
}
