import { can,type AccessProfile } from '../../lib/api';
import { type AmbulanceStatus } from './types';

/** Códigos de la API cuando falta tripulación mínima (RN-30: paramédico y motorista con turno en curso). */
export const crewCodes=['sin_paramedico_de_turno','sin_motorista_de_turno','sin_tripulacion_de_turno'] as const;
/** Una API anterior no manda `driverOnDuty`: se asume cubierto para no mostrar una alarma falsa. */
export const driverOnDuty=(s:AmbulanceStatus)=>s.driverOnDuty!==false;
/** Quién falta para que la unidad pueda estar Disponible o despacharse; null si están los dos. */
export function missingCrew(s:AmbulanceStatus):string|null{
 const medic=s.paramedicOnDuty,driver=driverOnDuty(s);
 return !medic&&!driver?'paramédico ni motorista':!medic?'paramédico':!driver?'motorista':null;
}
/** Texto del error 409 por falta de tripulación (POST /ambulancia/mantenimiento y /ambulancia/servicios). */
export function crewProblem(code?:string):string|null{
 return code==='sin_paramedico_de_turno'?'No hay un paramédico con turno en curso.':code==='sin_motorista_de_turno'?'No hay un motorista con turno en curso.':code==='sin_tripulacion_de_turno'?'No hay paramédico ni motorista con turno en curso.':null;
}
/** Cobertura de la tripulación para la franja de estado: paramédico y motorista por separado. */
export function CrewCoverage({status:s}:{status:AmbulanceStatus}){
 return <><div><strong>{s.paramedicOnDuty?'Paramédico de turno':'Sin paramédico con turno en curso'}</strong><span>Paramédico</span></div><div><strong>{driverOnDuty(s)?'Motorista de turno':'Sin motorista con turno en curso'}</strong><span>Motorista</span></div></>;
}
/**
 * Qué hacer cuando falta tripulación: quien planifica turnos va directo a publicar el turno que falta;
 * quien no, sabe a quién avisar (la Jefatura de Operaciones planifica los turnos).
 */
export function CrewAction({profile,missing}:{profile:AccessProfile;missing:string}){
 const who=missing==='paramédico ni motorista'?'un paramédico y un motorista':`un ${missing}`;
 return can(profile,'turnos.planificar')
  ?<a className="secondary-button amb-crew-link" href="#/turnos?accion=planificar">Planificar turno de {missing==='paramédico ni motorista'?'paramédico y motorista':missing}</a>
  :<span className="amb-crew-contact">Avisa a la Jefatura de Operaciones para que publique el turno de {who} que cubra la hora actual.</span>;
}
