import { BoolProp, ClassArrayProp, ClassProp, DateProp, DateTimeProp, EnumProp, IntProp, NumProp, StrProp, UuidProp } from '../platform/responses';
import { CATEGORIA_HABITACION, ESTADO_CAMA, ESTADO_TURNO } from '../platform/states';

export const TIPO_PERSONAL = ['medico', 'enfermero', 'asistente', 'recepcionista', 'laboratorista', 'paramedico', 'motorista', 'limpieza', 'administrativo', 'otro'] as const;
export const JUNTA_PROFESIONAL = ['JVPM', 'JVPE', 'JVPL', 'JVPO', 'otra'] as const;
export const TIPO_TURNO = ['diurno', 'nocturno', 'guardia'] as const;
export const TIPO_ESPACIO = ['hospital', 'planta', 'area', 'habitacion', 'cama', 'consultorio', 'cubiculo', 'bodega', 'bahia'] as const;

// ---- Inicio ----

export class CountActiveResponse {
  @IntProp() total!: number;
  @IntProp() active!: number;
}

export class DashboardBedsResponse {
  @IntProp() total!: number;
  @IntProp() free!: number;
  @IntProp() occupied!: number;
  @IntProp() cleaning!: number;
}

export class DashboardShiftsResponse {
  @IntProp() current!: number;
  @IntProp({ optional: true, description: 'Solo con turnos.planificar' }) draft?: number;
}

export class HomeDashboardResponse {
  @DateTimeProp() lastUpdate!: string;
  @ClassProp(DashboardBedsResponse, { optional: true, description: 'Con espacios.ver o metricas.ver' }) beds?: DashboardBedsResponse;
  @ClassProp(CountActiveResponse, { optional: true, description: 'Con pacientes.buscar o metricas.ver' }) patients?: CountActiveResponse;
  @ClassProp(CountActiveResponse, { optional: true, description: 'Con personal.ver' }) staff?: CountActiveResponse;
  @ClassProp(CountActiveResponse, { optional: true, description: 'Con usuarios.ver' }) users?: CountActiveResponse;
  @ClassProp(DashboardShiftsResponse, { optional: true, description: 'Con turnos.planificar o metricas.ver' }) shifts?: DashboardShiftsResponse;
}

// ---- Personal ----

export class StaffRegistrationResponse {
  @UuidProp() id!: string;
  @EnumProp(JUNTA_PROFESIONAL, 'JuntaProfesional') board!: string;
  @StrProp() number!: string;
  @DateProp() validFrom!: string;
  @DateProp() validTo!: string;
}

export class SpecialtyResponse {
  @StrProp() code!: string;
  @StrProp() name!: string;
  @EnumProp(['medico', 'enfermero'] as const, 'CategoriaEspecialidad') category!: string;
}

export class StaffResponse {
  @UuidProp() id!: string;
  @StrProp() givenNames!: string;
  @StrProp() surnames!: string;
  @EnumProp(TIPO_PERSONAL, 'TipoPersonal') type!: string;
  @StrProp({ nullable: true }) specialty!: string | null;
  @UuidProp({ nullable: true }) areaId!: string | null;
  @StrProp({ nullable: true }) area!: string | null;
  @BoolProp() active!: boolean;
  @IntProp() version!: number;
  @StrProp({ optional: true, nullable: true, description: 'Solo con personal.ver_datos_personales' }) phone?: string | null;
  @StrProp({ optional: true, nullable: true, description: 'Solo con personal.ver_datos_personales' }) dui?: string | null;
  @ClassArrayProp(StaffRegistrationResponse) registrations!: StaffRegistrationResponse[];
}

// ---- Turnos ----

export class ShiftCatalogRoleResponse {
  @EnumProp(TIPO_PERSONAL, 'TipoPersonal') code!: string;
  @StrProp() name!: string;
}

export class ShiftCatalogAreaResponse {
  @UuidProp() id!: string;
  @UuidProp({ nullable: true }) parentId!: string | null;
  @EnumProp(TIPO_ESPACIO, 'TipoEspacio') type!: string;
  @StrProp() code!: string;
  @StrProp() name!: string;
}

export class ShiftCatalogValidityResponse {
  @StrProp() validFrom!: string;
  @StrProp() validTo!: string;
}

export class ShiftCatalogStaffResponse {
  @UuidProp() id!: string;
  @StrProp() name!: string;
  @EnumProp(TIPO_PERSONAL, 'TipoPersonal') type!: string;
  @StrProp({ nullable: true }) specialty!: string | null;
  @UuidProp({ nullable: true }) areaId!: string | null;
  @StrProp({ nullable: true }) area!: string | null;
  @ClassArrayProp(ShiftCatalogValidityResponse) registrations!: ShiftCatalogValidityResponse[];
}

export class ShiftCatalogResponse {
  @ClassArrayProp(ShiftCatalogRoleResponse) roles!: ShiftCatalogRoleResponse[];
  @ClassArrayProp(ShiftCatalogAreaResponse) areas!: ShiftCatalogAreaResponse[];
  @ClassArrayProp(ShiftCatalogStaffResponse) staff!: ShiftCatalogStaffResponse[];
}

export class ShiftResponse {
  @UuidProp() id!: string;
  @UuidProp() staffId!: string;
  @StrProp() person!: string;
  @EnumProp(TIPO_PERSONAL, 'TipoPersonal', { description: 'Función de la persona; permite filtrar por rol sin consultar /personal' }) staffType!: string;
  @UuidProp() areaId!: string;
  @StrProp() area!: string;
  @DateTimeProp() start!: string;
  @DateTimeProp() end!: string;
  @EnumProp(TIPO_TURNO, 'TipoTurno') type!: string;
  @EnumProp(ESTADO_TURNO, 'EstadoTurno') state!: string;
  @StrProp({ nullable: true }) justification!: string | null;
  @IntProp() version!: number;
}

export class CoverageGapResponse {
  @UuidProp() areaId!: string;
  @StrProp() area!: string;
  @StrProp() role!: string;
  @DateTimeProp() start!: string;
  @DateTimeProp() end!: string;
  @IntProp() required!: number;
  @IntProp() actual!: number;
}

export class CoverageResponse {
  @DateProp() from!: string;
  @DateProp() to!: string;
  @ClassArrayProp(CoverageGapResponse) gaps!: CoverageGapResponse[];
}

export class PublishShiftsResponse {
  @DateProp() from!: string;
  @DateProp() to!: string;
  @IntProp() published!: number;
  @UuidProp() publishedBy!: string;
  @DateTimeProp() publishedAt!: string;
  @ClassArrayProp(CoverageGapResponse) warnings!: CoverageGapResponse[];
}

export class ShiftWarningResponse {
  @StrProp({ description: 'Código de la advertencia, por ejemplo horas_semanales_excedidas' }) codigo!: string;
  @NumProp() horasSemana!: number;
  @NumProp() limite!: number;
}

export class ShiftSavedResponse {
  @UuidProp() id!: string;
  @IntProp() version!: number;
  @ClassArrayProp(ShiftWarningResponse) advertencias!: ShiftWarningResponse[];
}

// ---- Espacios y camas ----

export class SpaceResponse {
  @UuidProp() id!: string;
  @UuidProp({ nullable: true }) parentId!: string | null;
  @EnumProp(TIPO_ESPACIO, 'TipoEspacio') type!: string;
  @StrProp() code!: string;
  @StrProp() name!: string;
  @EnumProp(CATEGORIA_HABITACION, 'CategoriaHabitacion', { nullable: true }) category!: string | null;
  @IntProp({ nullable: true }) capacity!: number | null;
  @IntProp({ nullable: true }) level!: number | null;
  @BoolProp() active!: boolean;
  @IntProp() version!: number;
  @StrProp({ nullable: true }) path!: string | null;
  @IntProp() totalBeds!: number;
  @IntProp() freeBeds!: number;
}

export class BedBoardResponse {
  @UuidProp() id!: string;
  @StrProp() code!: string;
  @StrProp() name!: string;
  @UuidProp() roomId!: string;
  @StrProp() room!: string;
  @EnumProp(CATEGORIA_HABITACION, 'CategoriaHabitacion') category!: string;
  @IntProp({ nullable: true }) level!: number | null;
  @EnumProp(ESTADO_CAMA, 'EstadoCama') state!: string;
  @IntProp() version!: number;
  @BoolProp() cleaningPending!: boolean;
  @BoolProp() cleaningCompleted!: boolean;
  @BoolProp() cleanedByCurrentUser!: boolean;
  @StrProp({ nullable: true }) path!: string | null;
  @StrProp({ optional: true, description: 'Nombre completo o iniciales según camas.ver_ocupante; solo si la cama tiene paciente' }) occupant?: string;
  @UuidProp({ optional: true, description: 'Solo con acceso completo al ocupante' }) patientId?: string;
  @BoolProp({ optional: true, description: 'Solo si la cama tiene paciente' }) occupantRestricted?: boolean;
}

export class BedStateResponse {
  @UuidProp() id!: string;
  @EnumProp(ESTADO_CAMA, 'EstadoCama') state!: string;
  @IntProp() version!: number;
}

export class BedCleaningResponse {
  @UuidProp({ description: 'Id del registro de limpieza' }) id!: string;
  @UuidProp() camaId!: string;
  @EnumProp(ESTADO_CAMA, 'EstadoCama') state!: string;
  @IntProp() version!: number;
}

export class BedCleaningRequestedResponse extends BedCleaningResponse {
  @DateTimeProp() pendienteDesde!: string;
}

export class BedCleaningCompletedResponse extends BedCleaningResponse {
  @DateTimeProp() limpiadaEn!: string;
}

export class BedCleaningVerifiedResponse extends BedCleaningResponse {
  @DateTimeProp() verificadaEn!: string;
}
