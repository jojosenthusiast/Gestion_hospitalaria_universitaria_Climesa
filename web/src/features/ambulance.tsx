import { Heading,RemoteState,formatDateTime,useData } from './common';
import { type Api } from '../lib/api';
/** Respuesta de `GET /ambulancia`: la única unidad, su servicio activo (sin datos del paciente) y si hay paramédico de turno. */
export type AmbulanceStatus={
 unit:{id:string;plate:string;state:string;version:number};
 activeService:null|{id:string;type:string;priority:string;origin:string;destination:string;dispatchedAt:string;crew:{staffId:string;role:string;name:string}[]};
 paramedicOnDuty:boolean;
};
const stateNames:Record<string,string>={disponible:'Disponible',en_servicio:'En servicio',en_mantenimiento:'En mantenimiento'};
const priorityNames:Record<string,string>={roja:'Roja',naranja:'Naranja',amarilla:'Amarilla',verde:'Verde'};
const typeNames:Record<string,string>={emergencia_domicilio:'Emergencia a domicilio',traslado_interhospitalario:'Traslado interhospitalario'};
const roleNames:Record<string,string>={paramedico:'Paramédico',motorista:'Motorista',medico:'Médico',enfermero:'Enfermería'};
/** W18 en su versión mínima (FR-109-01): estado de la unidad y servicio activo; se vuelve a pedir cuando llega un evento en vivo (`version`). */
export function AmbulancePage({api,version}:{api:Api;version:number}){
 const data=useData<AmbulanceStatus>(api,'/ambulancia',version);
 return <><Heading eyebrow="Operaciones / Ambulancia" title="Ambulancia" description="Estado de la unidad y del servicio en curso, actualizado en vivo."/><RemoteState state={data}>{s=><section className="data-workbench" aria-label="Estado de la unidad">
  <div className="number-strip"><div><strong className="mono-data">{s.unit.plate}</strong><span>Unidad única</span></div><div><strong><span className={`status-tag status-${s.unit.state}`}>{stateNames[s.unit.state]??s.unit.state}</span></strong><span>Estado actual</span></div><div><strong>{s.paramedicOnDuty?'Paramédico de turno':'Sin paramédico con turno en curso'}</strong><span>Cobertura de la tripulación</span></div></div>
  {s.activeService?<section aria-label="Servicio activo"><h2>Servicio activo</h2><dl className="detail-grid"><div><dt>Tipo</dt><dd>{typeNames[s.activeService.type]??s.activeService.type}</dd></div><div><dt>Prioridad</dt><dd>{priorityNames[s.activeService.priority]??s.activeService.priority}</dd></div><div><dt>Origen</dt><dd>{s.activeService.origin}</dd></div><div><dt>Destino</dt><dd>{s.activeService.destination}</dd></div><div><dt>Despachado</dt><dd>{formatDateTime(s.activeService.dispatchedAt)}</dd></div><div><dt>Tripulación</dt><dd>{s.activeService.crew.length?s.activeService.crew.map(c=>`${c.name} (${roleNames[c.role]??c.role})`).join(' · '):'Sin tripulación registrada'}</dd></div></dl></section>:<p className="muted">Sin servicio activo</p>}
 </section>}</RemoteState></>;
}