import { BoolProp, ClassArrayProp, DateTimeProp, EnumProp, IntProp, StrProp, UuidProp } from '../platform/responses';
import { CATEGORIA_HABITACION, ESTADO_ADMISION, ESTADO_CAMA, SEXO_PACIENTE } from '../platform/states';

export const ORIGEN_ADMISION = ['cita', 'consulta', 'emergencia', 'ambulancia', 'programada'] as const;
export const TIPO_AISLAMIENTO = ['contacto', 'gotitas', 'aerea', 'protector'] as const;

export class AdmissionResponse {
  @UuidProp() id!: string;
  @UuidProp() patientId!: string;
  @StrProp({ nullable: true }) patientName!: string | null;
  @EnumProp(ORIGEN_ADMISION, 'OrigenAdmision') origin!: string;
  @EnumProp(CATEGORIA_HABITACION, 'CategoriaHabitacion') requestedCategory!: string;
  @EnumProp(ESTADO_ADMISION, 'EstadoAdmision') state!: string;
  @BoolProp() isolation!: boolean;
  @DateTimeProp({ nullable: true }) scheduledAt!: string | null;
  @UuidProp() attendingDoctorId!: string;
  @IntProp() version!: number;
  @StrProp({ description: 'Código de la cama actual; cadena vacía si no tiene' }) bed!: string;
  @UuidProp({ nullable: true }) occupationId!: string | null;
  @UuidProp({ nullable: true }) originId!: string | null;
  @StrProp({ nullable: true, description: 'Motivo del ingreso; nulo solo en admisiones anteriores a la regla.' }) motive!: string | null;
  @EnumProp(TIPO_AISLAMIENTO, 'TipoAislamiento', { nullable: true }) isolationType!: string | null;
  @BoolProp() unstable!: boolean;
  @BoolProp() postSurgical!: boolean;
  @BoolProp() visitorsAllowed!: boolean;
  @IntProp() visitorsMax!: number;
}

export class AdmissionCommandResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_ADMISION, 'EstadoAdmision') state!: string;
  @IntProp() version!: number;
}

export class BedSuggestionResponse {
  @UuidProp() id!: string;
  @IntProp() version!: number;
  @StrProp() code!: string;
  @UuidProp() roomId!: string;
  @StrProp() room!: string;
  @EnumProp(CATEGORIA_HABITACION, 'CategoriaHabitacion') category!: string;
  @IntProp({ nullable: true }) level!: number | null;
  @EnumProp(ESTADO_CAMA, 'EstadoCama') state!: string;
  @EnumProp(SEXO_PACIENTE, 'SexoPaciente', { nullable: true }) roomSex!: string | null;
  @BoolProp() roomIsolation!: boolean;
  @IntProp() occupiedInRoom!: number;
  @StrProp() reason!: string;
}

export class BedAssignmentResponse {
  @UuidProp() id!: string;
  @UuidProp() bedId!: string;
  @EnumProp(ESTADO_ADMISION, 'EstadoAdmision') state!: string;
  @IntProp() version!: number;
}

export class NursingNoteResponse {
  @UuidProp() id!: string;
  @DateTimeProp() createdAt!: string;
}

export class AdmissionExitResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_ADMISION, 'EstadoAdmision') state!: string;
  @UuidProp() bedId!: string;
  @IntProp() version!: number;
}

export class TransferResponse {
  @UuidProp() admissionId!: string;
  @UuidProp() occupationId!: string;
  @UuidProp() fromBedId!: string;
  @UuidProp() toBedId!: string;
  @EnumProp(ESTADO_ADMISION, 'EstadoAdmision') state!: string;
  @IntProp() version!: number;
}

export class OriginOptionResponse {
  @EnumProp(['cita', 'consulta', 'emergencia', 'ambulancia'], 'OrigenAdmisionNueva') origin!: string;
  @UuidProp() id!: string;
  @DateTimeProp() at!: string;
  @StrProp() label!: string;
  @StrProp() detail!: string;
}

export class DoctorAvailabilityResponse {
  @UuidProp() id!: string;
  @StrProp() name!: string;
  @StrProp({ nullable: true }) specialty!: string | null;
  @BoolProp() available!: boolean;
  @StrProp({ nullable: true, description: 'Motivo por el que no está disponible' }) reason!: string | null;
}

export class BedMapBedResponse {
  @UuidProp() id!: string;
  @IntProp() version!: number;
  @StrProp() code!: string;
  @UuidProp() roomId!: string;
  @StrProp() room!: string;
  @IntProp({ nullable: true, description: 'Planta de la habitación' }) floor!: number | null;
  @EnumProp(CATEGORIA_HABITACION, 'CategoriaHabitacion') category!: string;
  @IntProp({ description: 'Camas de la habitación' }) capacity!: number;
  @EnumProp(ESTADO_CAMA, 'EstadoCama') state!: string;
  @IntProp() occupiedInRoom!: number;
  @BoolProp({ description: 'Libre y compatible con el sexo y el aislamiento del paciente' }) compatible!: boolean;
  @StrProp({ nullable: true }) reason!: string | null;
  @BoolProp() suggested!: boolean;
}

export class BedMapCategoryResponse {
  @EnumProp(CATEGORIA_HABITACION, 'CategoriaHabitacion') category!: string;
  @IntProp() free!: number;
  @IntProp() compatible!: number;
}

export class BedMapResponse {
  @ClassArrayProp(BedMapCategoryResponse) categories!: BedMapCategoryResponse[];
  @ClassArrayProp(BedMapBedResponse) beds!: BedMapBedResponse[];
}

export class FeasibilityCheckResponse {
  @StrProp() code!: string;
  @BoolProp() ok!: boolean;
  @StrProp() message!: string;
}

export class FeasibilityResponse {
  @BoolProp() feasible!: boolean;
  @ClassArrayProp(FeasibilityCheckResponse) checks!: FeasibilityCheckResponse[];
}
