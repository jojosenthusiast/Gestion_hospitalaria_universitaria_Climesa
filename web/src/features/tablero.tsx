import type { ReactNode } from 'react';
import { can, type AccessProfile, type Api, type CoverageGap, type Space, type Summary } from '../lib/api';
import { Notice } from '../components/ui';
import type { AmbulanceStatus } from './ambulance';
import { RemoteState, formatDateTime, useData } from './common';

// WEB-03: el tablero solo muestra tarjetas con datos reales que la cuenta puede leer; nunca marcadores
// de entregas futuras. Órdenes de laboratorio no tiene un agregado en la API y la cola completa exige
// `laboratorio.ver_cola`, que ADM y JOP no tienen, así que esa tarjeta no se muestra.
type QueueState = { state: string };
const ambulanceStates: Record<string, string> = { disponible: 'Disponible', en_servicio: 'En servicio', en_mantenimiento: 'En mantenimiento' };

const Cifra = ({ valor, etiqueta }: { valor: number; etiqueta: string }) => <div><strong>{valor}</strong><span>{etiqueta}</span></div>;
const Tarjeta = ({ titulo, children, className = '' }: { titulo: string; children: ReactNode; className?: string }) => <section className={`board-card ${className}`.trim()} aria-label={titulo}><h2>{titulo}</h2>{children}</section>;

function Tarjetas({ resumen, extra }: { resumen: Summary; extra?: ReactNode }) {
  const { beds, shifts, patients, staff } = resumen;
  return <>
    <div className="board-grid board-grid-main">
      {beds && <Tarjeta titulo="Camas">
        {beds.total === 0
          ? <p className="muted">Todavía no hay camas registradas.</p>
          : <><div className="board-figures"><Cifra valor={beds.free} etiqueta="Libres" /><Cifra valor={beds.occupied} etiqueta="Ocupadas" /><Cifra valor={beds.cleaning ?? 0} etiqueta="En limpieza" /></div><p className="board-note">de {beds.total} camas de hospitalización</p></>}
      </Tarjeta>}
      {staff && <Tarjeta titulo="Personal"><div className="board-figures"><Cifra valor={staff.active} etiqueta="Activas" /></div><p className="board-note">de {staff.total} personas registradas</p></Tarjeta>}
      {shifts && <Tarjeta titulo="Turnos"><div className="board-figures"><Cifra valor={shifts.current} etiqueta="En curso ahora" /></div></Tarjeta>}
      {patients && <Tarjeta titulo="Pacientes"><div className="board-figures"><Cifra valor={patients.active} etiqueta="Activos" /></div></Tarjeta>}
      {extra}
    </div>
    <p className="updated-at">Actualizado: {formatDateTime(resumen.lastUpdate)}</p>
  </>;
}

function Ambulancia({ estado }: { estado: AmbulanceStatus }) {
  return <Tarjeta titulo="Ambulancia">
    <p><span className={`status-tag status-${estado.unit.state}`}>{ambulanceStates[estado.unit.state] ?? estado.unit.state}</span></p>
    <p className="board-note">{estado.paramedicOnDuty ? 'Paramédico de turno' : 'Sin paramédico con turno en curso'}</p>
  </Tarjeta>;
}

function Fila({ numeros }: { numeros: QueueState[] }) {
  const count = (state: string) => numeros.filter(n => n.state === state).length;
  return <Tarjeta titulo="Números en fila">
    {numeros.length === 0
      ? <p className="muted">Todavía no se han emitido números hoy.</p>
      : <><div className="board-figures"><Cifra valor={count('en_espera')} etiqueta="En espera" /><Cifra valor={count('llamado')} etiqueta="Llamados" /><Cifra valor={count('en_atencion')} etiqueta="En atención" /></div><p className="board-note">de {numeros.length} números emitidos hoy</p></>}
  </Tarjeta>;
}

function fechaLocal(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/El_Salvador', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function OcupacionPorPlanta({ espacios }: { espacios: Space[] }) {
  const plantas = espacios.filter(space => space.type === 'planta' && space.totalBeds > 0).sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  return <Tarjeta titulo="Ocupación por planta" className="board-card-wide">
    {plantas.length === 0
      ? <p className="muted">Todavía no hay plantas de hospitalización registradas.</p>
      : <div className="floor-occupancy">{plantas.map(planta => {
        const unavailable = Math.max(0, planta.totalBeds - planta.freeBeds);
        const percent = planta.totalBeds ? Math.round((unavailable / planta.totalBeds) * 100) : 0;
        return <div className="floor-row" key={planta.id}>
          <div><strong>{planta.name}</strong><span>{unavailable} no disponibles de {planta.totalBeds}</span></div>
          <div className="floor-meter" role="img" aria-label={`${planta.name}: ${percent}% de camas no disponibles`}><span style={{ width: `${percent}%` }} /></div>
          <span className="mono-data">{percent}%</span>
        </div>;
      })}</div>}
  </Tarjeta>;
}

function CoberturaTurnos({ huecos }: { huecos: CoverageGap[] }) {
  return <Tarjeta titulo="Cobertura de turnos" className="board-card-wide">
    {huecos.length === 0
      ? <p className="coverage-ok">Cobertura completa para hoy.</p>
      : <><p className="coverage-count">{huecos.length} {huecos.length === 1 ? 'hueco de cobertura' : 'huecos de cobertura'}</p><ul className="coverage-list">{huecos.slice(0, 4).map((gap, index) => <li key={`${gap.areaId}-${gap.role}-${gap.start}-${index}`}><strong>{gap.area} · {gap.role}</strong><span>{gap.actual} de {gap.required} personas</span></li>)}</ul></>}
  </Tarjeta>;
}

/** W03 · tablero inicial: solo agregados. `version` sube con cada evento de tiempo real y vuelve a pedir los datos. */
export function Tablero({ api, profile, version }: { api: Api; profile: AccessProfile; version: number }) {
  const permitido = can(profile, 'metricas.ver');
  const espaciosPermitidos = permitido && can(profile, 'espacios.ver');
  const coberturaPermitida = permitido && can(profile, 'turnos.ver');
  const fecha = fechaLocal();
  const data = useData<Summary>(api, '/inicio', version, permitido);
  const espacios = useData<Space[]>(api, '/espacios', version, espaciosPermitidos);
  const cobertura = useData<CoverageGap[]>(api, `/turnos/cobertura?from=${fecha}&to=${fecha}`, version, coberturaPermitida);
  const ambulancia = useData<AmbulanceStatus>(api, '/ambulancia', version, permitido && can(profile, 'ambulancia.ver_estado'));
  const fila = useData<QueueState[]>(api, '/fila', version, permitido && can(profile, 'fila.ver'));
  if (!permitido) return <div className="module-state"><Notice kind="info">Tu cuenta no tiene permiso para ver el tablero.</Notice></div>;
  return <RemoteState state={data}>{resumen => <>
    <Tarjetas resumen={resumen} extra={<>{ambulancia.data && <Ambulancia estado={ambulancia.data} />}{fila.data && <Fila numeros={fila.data} />}</>} />
    {(espacios.data || cobertura.data) && <div className="board-grid board-grid-detail">
      {espacios.data && <OcupacionPorPlanta espacios={espacios.data} />}
      {cobertura.data && <CoberturaTurnos huecos={cobertura.data} />}
    </div>}
    {espacios.error && <Notice kind="info">No se pudo cargar la ocupación por planta.</Notice>}
    {cobertura.error && <Notice kind="info">No se pudo cargar la cobertura de turnos.</Notice>}
    {ambulancia.error && <Notice kind="info">No se pudo cargar el estado de la ambulancia.</Notice>}
    {fila.error && <Notice kind="info">No se pudo cargar la fila del día.</Notice>}
  </>}</RemoteState>;
}
