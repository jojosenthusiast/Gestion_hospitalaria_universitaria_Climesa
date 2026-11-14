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
}

export class CrewMemberResponse {
  @UuidProp() staffId!: string;
  @EnumProp(FUNCION_TRIPULACION, 'FuncionTripulacion') role!: string;
  @StrProp() name!: string;
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
}

export class AmbulanceStatusResponse {
  @ClassProp(AmbulanceUnitResponse) unit!: AmbulanceUnitResponse;
  @ClassProp(ActiveServiceResponse, { nullable: true }) activeService!: ActiveServiceResponse | null;
  @BoolProp() paramedicOnDuty!: boolean;
  @ClassArrayProp(PendingAmbulanceRequestResponse, { optional: true, description: 'Solo con ambulancia.despachar' }) pendingRequests?: PendingAmbulanceRequestResponse[];
}

export class AmbulanceUnitStateResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_AMBULANCIA, 'EstadoAmbulancia') state!: string;
  @IntProp() version!: number;
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

export class PrehospitalViewResponse {
  @UuidProp() serviceId!: string;
  @BoolProp() active!: boolean;
  @EnumProp(PRIORIDAD_AMBULANCIA, 'PrioridadAmbulancia') priority!: string;
  @BoolProp() patientLinked!: boolean;
  @BoolProp() clinical!: boolean;
  @ClassArrayProp(PrehospitalReportResponse) reports!: PrehospitalReportResponse[];
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
  @ClassArrayProp(ServiceLogCrewResponse) crew!: ServiceLogCrewResponse[];
  @NumProp({ nullable: true }) responseMinutes!: number | null;
}
