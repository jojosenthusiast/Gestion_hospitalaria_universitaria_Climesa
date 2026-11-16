import { BoolProp, ClassArrayProp, ClassProp, DateTimeProp, EnumArrayProp, EnumProp, IntProp, JsonProp, NumProp, StrProp, UuidProp } from '../platform/responses';
import { ESTADO_AMBULANCIA, ESTADO_FINAL_SERVICIO, ESTADO_SOLICITUD_AMBULANCIA, HITO_SERVICIO, PRIORIDAD_AMBULANCIA } from '../platform/states';
import { serviceTypes } from './ambulance.rules';

export const FUNCION_TRIPULACION = ['paramedico', 'motorista', 'medico', 'enfermero'] as const;
export const CANAL_SOLICITUD = ['app_paciente', 'telefono'] as const;

export class AmbulanceUnitResponse {
  @UuidProp() id!: string;
  @StrProp() plate!: string;
  @EnumProp(ESTADO_AMBULANCIA, 'EstadoAmbulancia') state!: string;
  @IntProp() version!: number;
  @StrProp({ nullable: true, description: 'Motivo del último cambio a este estado' }) stateReason!: string | null;
  @DateTimeProp({ nullable: true, description: 'Desde cuándo está en este estado' }) stateSince!: string | null;
}

export class CrewMemberResponse {
  @UuidProp() staffId!: string;
  @EnumProp(FUNCION_TRIPULACION, 'FuncionTripulacion') role!: string;
  @StrProp() name!: string;
  @BoolProp({ description: 'Tiene cuenta activa en la app: puede registrar hitos' }) hasAccount!: boolean;
}

export class MilestoneEntryResponse {
  @EnumProp(HITO_SERVICIO, 'HitoServicio') type!: string;
  @DateTimeProp() occurredAt!: string;
}

export class LocationPointResponse {
  @NumProp() latitude!: number;
  @NumProp() longitude!: number;
  @DateTimeProp() capturedAt!: string;
}

export class ActiveServiceResponse {
  @UuidProp() id!: string;
  @UuidProp({ nullable: true }) requestId!: string | null;
  @EnumProp(serviceTypes, 'TipoServicioAmbulancia') type!: string;
  @EnumProp(PRIORIDAD_AMBULANCIA, 'PrioridadAmbulancia') priority!: string;
  @StrProp() origin!: string;
  @StrProp() destination!: string;
  @StrProp({ nullable: true }) municipality!: string | null;
  @DateTimeProp() dispatchedAt!: string;
  @IntProp() version!: number;
  @BoolProp() hasPrehospital!: boolean;
  @ClassArrayProp(CrewMemberResponse) crew!: CrewMemberResponse[];
  @ClassArrayProp(MilestoneEntryResponse) milestones!: MilestoneEntryResponse[];
  @EnumArrayProp(HITO_SERVICIO, 'HitoServicio') nextMilestones!: string[];
  @ClassProp(LocationPointResponse, { nullable: true }) lastLocation!: LocationPointResponse | null;
  @EnumArrayProp(['cerrar'], 'AccionServicioAmbulancia', { description: 'Acciones que el actor puede hacer sobre el servicio (cerrar: cierre administrativo)' }) allowedActions!: string[];
  @EnumArrayProp(ESTADO_FINAL_SERVICIO, 'EstadoFinalServicio', { description: 'Estados finales que admite el hito finalizado con los hitos ya registrados (MA-AMB-03)' }) finalStates!: string[];
}

export class PendingAmbulanceRequestResponse {
  @UuidProp() id!: string;
  @EnumProp(CANAL_SOLICITUD, 'CanalSolicitudAmbulancia') channel!: string;
  @StrProp() address!: string;
  @StrProp({ nullable: true }) municipality!: string | null;
  @NumProp({ nullable: true }) latitude!: number | null;
  @NumProp({ nullable: true }) longitude!: number | null;
  @StrProp() reason!: string;
  @StrProp() contactPhone!: string;
  @DateTimeProp() createdAt!: string;
  @IntProp() version!: number;
  @BoolProp() registeredPatient!: boolean;
  @StrProp({ nullable: true, description: 'Quién pidió: paciente (nombre o alias provisional) o la persona que llamó' }) requesterName!: string | null;
  @StrProp({ nullable: true, description: 'Nombre de quien llamó, si recepción lo anotó' }) callerName!: string | null;
  @StrProp({ nullable: true, description: 'Expediente del paciente registrado' }) patientRecord!: string | null;
}

export class DispatchBlockResponse {
  @EnumProp(['en_servicio', 'en_mantenimiento', 'sin_paramedico_de_turno', 'sin_motorista_de_turno', 'sin_tripulacion_de_turno'] as const, 'MotivoBloqueoDespacho') code!: string;
  @StrProp() message!: string;
  @StrProp({ description: 'Qué hacer para poder despachar' }) action!: string;
}

export class AmbulanceStatusResponse {
  @ClassProp(AmbulanceUnitResponse) unit!: AmbulanceUnitResponse;
  @ClassProp(ActiveServiceResponse, { nullable: true }) activeService!: ActiveServiceResponse | null;
  @BoolProp() paramedicOnDuty!: boolean;
  @BoolProp({ description: 'Hay motorista con turno en curso (RN-30 exige paramédico y motorista)' }) driverOnDuty!: boolean;
  @BoolProp({ description: 'Hay un paramédico con cuenta activa y turno en curso (BL-05: sin él no se despacha)' }) paramedicWithAccountOnDuty!: boolean;
  @ClassProp(DispatchBlockResponse, { nullable: true, description: 'Por qué no se puede despachar ahora; null si se puede' }) dispatchBlock!: DispatchBlockResponse | null;
  @ClassArrayProp(PendingAmbulanceRequestResponse, { optional: true, description: 'Solo con ambulancia.despachar' }) pendingRequests?: PendingAmbulanceRequestResponse[];
  @ClassArrayProp(CrewMemberResponse, { optional: true, description: 'Solo con ambulancia.despachar: paramédicos y motoristas de turno entre los que se elige la tripulación (MA-AMB-02)' }) availableCrew?: CrewMemberResponse[];
}

/** MA-AMB-04: servicio cuya llegada recibe el hospital (activo, o llegado sin entrega en las últimas 24 h). */
export class ArrivalServiceResponse {
  @UuidProp({ nullable: true }) serviceId!: string | null;
}

export class AmbulanceUnitStateResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_AMBULANCIA, 'EstadoAmbulancia') state!: string;
  @IntProp() version!: number;
}

export class CloseServiceResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_FINAL_SERVICIO, 'EstadoFinalServicio') finalState!: string;
  @IntProp() version!: number;
  @EnumProp(ESTADO_AMBULANCIA, 'EstadoAmbulancia') unitState!: string;
  @IntProp() unitVersion!: number;
}

export class AmbulanceRequestCreatedResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_SOLICITUD_AMBULANCIA, 'EstadoSolicitudAmbulancia') state!: string;
  @EnumProp(CANAL_SOLICITUD, 'CanalSolicitudAmbulancia') channel!: string;
  @IntProp() version!: number;
  @DateTimeProp() createdAt!: string;
  @StrProp() notice!: string;
}

export class AmbulanceRequestStateResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_SOLICITUD_AMBULANCIA, 'EstadoSolicitudAmbulancia') state!: string;
  @IntProp() version!: number;
}

export class DispatchedCrewResponse {
  @UuidProp() staffId!: string;
  @StrProp({ description: 'Tipo de personal (personal.persona.tipo)' }) role!: string;
}

export class DispatchResponse {
  @UuidProp() id!: string;
  @IntProp() version!: number;
  @EnumProp(ESTADO_AMBULANCIA, 'EstadoAmbulancia') unitState!: string;
  @IntProp() unitVersion!: number;
  @ClassArrayProp(DispatchedCrewResponse) crew!: DispatchedCrewResponse[];
}

export class MilestoneResponse {
  @UuidProp() id!: string;
  @EnumProp(HITO_SERVICIO, 'HitoServicio') type!: string;
  @DateTimeProp() occurredAt!: string;
  @IntProp() version!: number;
  @EnumProp(ESTADO_FINAL_SERVICIO, 'EstadoFinalServicio', { nullable: true }) finalState!: string | null;
  @EnumProp(ESTADO_AMBULANCIA, 'EstadoAmbulancia') unitState!: string;
  @IntProp() unitVersion!: number;
  @EnumArrayProp(HITO_SERVICIO, 'HitoServicio') nextMilestones!: string[];
}

export class PrehospitalCreatedResponse {
  @UuidProp() id!: string;
  @UuidProp() serviceId!: string;
  @DateTimeProp() receivedAt!: string;
  @IntProp() version!: number;
  @BoolProp() patientLinked!: boolean;
}

export class PrehospitalReportResponse {
  @UuidProp() id!: string;
  @EnumProp(PRIORIDAD_AMBULANCIA, 'PrioridadAmbulancia') priority!: string;
  @DateTimeProp({ nullable: true }) estimatedArrival!: string | null;
  @DateTimeProp() capturedAt!: string;
  @DateTimeProp() receivedAt!: string;
  @StrProp({ optional: true, description: 'Solo con contenido clínico' }) reason?: string;
  @JsonProp({ optional: true, description: 'Solo con contenido clínico' }) vitalSigns?: Record<string, unknown>;
}

/** MA-AMB-04: quién recibió al paciente en el hospital y cuándo. */
export class HandoverInfoResponse {
  @DateTimeProp() receivedAt!: string;
  @StrProp({ nullable: true, description: 'Nombre de quien recibió (personal clínico)' }) receivedByName!: string | null;
}

export class PrehospitalViewResponse {
  @UuidProp() serviceId!: string;
  @IntProp({ description: 'Versión del servicio; la entrega al hospital la envía' }) version!: number;
  @BoolProp() active!: boolean;
  @BoolProp({ description: 'La ambulancia registró la llegada al hospital' }) arrived!: boolean;
  @EnumProp(PRIORIDAD_AMBULANCIA, 'PrioridadAmbulancia') priority!: string;
  @BoolProp() patientLinked!: boolean;
  @BoolProp() clinical!: boolean;
  @ClassArrayProp(PrehospitalReportResponse) reports!: PrehospitalReportResponse[];
  @ClassProp(HandoverInfoResponse, { nullable: true, description: 'Entrega del paciente al hospital; null si aún no se registra' }) handover!: HandoverInfoResponse | null;
  @EnumArrayProp(['recibir'], 'AccionPrehospital', { description: 'recibir: el actor puede marcar recibido al paciente (personal clínico, después de la llegada)' }) allowedActions!: string[];
}

export class HandoverResponse {
  @UuidProp() serviceId!: string;
  @IntProp() version!: number;
  @DateTimeProp() receivedAt!: string;
  @StrProp({ nullable: true }) receivedByName!: string | null;
}

/** MA-AMB-05: avance del servicio que atiende la solicitud, sin tripulación ni ubicación. */
export class OwnRequestServiceResponse {
  @DateTimeProp() dispatchedAt!: string;
  @ClassArrayProp(MilestoneEntryResponse) milestones!: MilestoneEntryResponse[];
  @EnumProp(ESTADO_FINAL_SERVICIO, 'EstadoFinalServicio', { nullable: true }) finalState!: string | null;
  @DateTimeProp({ nullable: true }) finishedAt!: string | null;
}

/** MA-AMB-05: solicitud de ambulancia de la propia cuenta (o del propio expediente) con su estado en el servidor. */
export class OwnAmbulanceRequestResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_SOLICITUD_AMBULANCIA, 'EstadoSolicitudAmbulancia') state!: string;
  @EnumProp(CANAL_SOLICITUD, 'CanalSolicitudAmbulancia') channel!: string;
  @StrProp() address!: string;
  @StrProp() reason!: string;
  @DateTimeProp() createdAt!: string;
  @IntProp() version!: number;
  @ClassProp(OwnRequestServiceResponse, { nullable: true, description: 'Servicio despachado para la solicitud; null si aún no se confirma' }) service!: OwnRequestServiceResponse | null;
  @EnumArrayProp(['cancelar'], 'AccionSolicitudAmbulancia', { description: 'cancelar: quien pidió puede cancelarla (solo por confirmar)' }) allowedActions!: string[];
  @StrProp() notice!: string;
}

export class LocationRecordedResponse {
  @UuidProp() serviceId!: string;
  @DateTimeProp() capturedAt!: string;
}

export class ServiceLogCrewResponse {
  @UuidProp() staffId!: string;
  @EnumProp(FUNCION_TRIPULACION, 'FuncionTripulacion') role!: string;
  @StrProp() name!: string;
}

export class ServiceLogEntryResponse {
  @UuidProp() id!: string;
  @EnumProp(serviceTypes, 'TipoServicioAmbulancia') type!: string;
  @EnumProp(PRIORIDAD_AMBULANCIA, 'PrioridadAmbulancia') priority!: string;
  @StrProp() origin!: string;
  @StrProp() destination!: string;
  @StrProp({ nullable: true }) municipality!: string | null;
  @DateTimeProp() dispatchedAt!: string;
  @DateTimeProp({ nullable: true }) finishedAt!: string | null;
  @EnumProp(ESTADO_FINAL_SERVICIO, 'EstadoFinalServicio', { nullable: true }) finalState!: string | null;
  @BoolProp({ description: 'Lo cerró Jefatura (cierre administrativo), no la tripulación' }) administrativeClose!: boolean;
  @ClassArrayProp(ServiceLogCrewResponse) crew!: ServiceLogCrewResponse[];
  @NumProp({ nullable: true }) responseMinutes!: number | null;
  @ClassArrayProp(MilestoneEntryResponse) milestones!: MilestoneEntryResponse[];
  @StrProp({ nullable: true, description: 'Expediente enmascarado del paciente; nunca el nombre' }) patientRef!: string | null;
}
