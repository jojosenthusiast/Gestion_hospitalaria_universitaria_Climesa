import { BoolProp, ClassArrayProp, DateProp, DateTimeProp, EnumProp, IntProp, JsonProp, StrProp, UuidProp } from '../platform/responses';
import { ESTADO_CASO_DUPLICADO, ESTADO_PACIENTE, SEXO_PACIENTE } from '../platform/states';

export const PRECISION_NACIMIENTO = ['exacta', 'anio_mes', 'anio', 'estimada', 'desconocida'] as const;

export class PatientCandidateResponse {
  @UuidProp() id!: string;
  @StrProp({ description: 'Número de expediente' }) record!: string;
  @StrProp() fullName!: string;
  @StrProp() givenNames!: string;
  @StrProp() surnames!: string;
  @EnumProp(ESTADO_PACIENTE, 'EstadoPaciente') state!: string;
  @BoolProp() active!: boolean;
  @EnumProp(SEXO_PACIENTE, 'SexoPaciente') sex!: string;
  @DateProp({ optional: true, nullable: true, description: 'Solo para roles que ven la fecha de nacimiento en la búsqueda' }) birth?: string | null;
  @IntProp() version!: number;
  @StrProp() matchReason!: string;
}

export class PatientSearchRecordResponse {
  @UuidProp({ description: 'Constancia de búsqueda para registrar (10 minutos)' }) token!: string;
  @DateTimeProp() expiresAt!: string;
  @ClassArrayProp(PatientCandidateResponse) candidates!: PatientCandidateResponse[];
}

export class DuplicatePatientResponse {
  @UuidProp() id!: string;
  @StrProp() record!: string;
  @StrProp({ nullable: true }) fullName!: string | null;
}

export class DuplicateCaseResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_CASO_DUPLICADO, 'EstadoCasoDuplicado') state!: string;
  @StrProp() reason!: string;
  @DateTimeProp() openedAt!: string;
  @ClassArrayProp(DuplicatePatientResponse) patients!: DuplicatePatientResponse[];
}

export class PatientHistoryEntryResponse {
  @IntProp() version!: number;
  @DateTimeProp() at!: string;
  @StrProp() reason!: string;
  @JsonProp({ description: 'Campos cambiados con su valor anterior y nuevo' }) changes!: Record<string, unknown>;
}

/** Ficha filtrada por `docs/arquitectura/privacidad.md`: los campos opcionales solo aparecen si el rol los ve. */
export class PatientDetailResponse {
  @UuidProp() id!: string;
  @StrProp({ description: 'Número de expediente' }) record!: string;
  @StrProp() fullName!: string;
  @StrProp() givenNames!: string;
  @StrProp() surnames!: string;
  @EnumProp(ESTADO_PACIENTE, 'EstadoPaciente') state!: string;
  @BoolProp() active!: boolean;
  @EnumProp(SEXO_PACIENTE, 'SexoPaciente') sex!: string;
  @IntProp() version!: number;
  @BoolProp() provisional!: boolean;
  @DateProp({ optional: true, nullable: true }) birth?: string | null;
  @EnumProp(PRECISION_NACIMIENTO, 'PrecisionNacimiento', { optional: true }) birthPrecision?: string;
  @StrProp({ optional: true, nullable: true, description: 'Rango de edad, por ejemplo 30-39 o 90+' }) ageRange?: string | null;
  @StrProp({ optional: true, nullable: true }) dui?: string | null;
  @StrProp({ optional: true, nullable: true }) phone?: string | null;
  @StrProp({ optional: true, nullable: true }) email?: string | null;
  @StrProp({ optional: true, nullable: true }) address?: string | null;
  @ClassArrayProp(PatientHistoryEntryResponse, { optional: true, description: 'Solo con pacientes.editar_demograficos' }) history?: PatientHistoryEntryResponse[];
}

export class PatientCreatedResponse {
  @UuidProp() id!: string;
  @StrProp({ description: 'Número de expediente' }) record!: string;
  @IntProp() version!: number;
}

export class PatientStateResponse {
  @UuidProp() id!: string;
  @IntProp() version!: number;
  @EnumProp(ESTADO_PACIENTE, 'EstadoPaciente') state!: string;
}
