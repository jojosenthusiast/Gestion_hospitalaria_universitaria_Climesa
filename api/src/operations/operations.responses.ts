import { BoolProp, ClassArrayProp, ClassProp, DateProp, DateTimeProp, EnumArrayProp, EnumProp, IntProp, NumProp, StrProp, UuidProp } from '../platform/responses';
import { CATEGORIA_HABITACION, ESTADO_CAMA, ESTADO_TURNO } from '../platform/states';

export const TIPO_PERSONAL = ['medico', 'enfermero', 'asistente', 'recepcionista', 'laboratorista', 'paramedico', 'motorista', 'limpieza', 'administrativo', 'otro'] as const;
export const JUNTA_PROFESIONAL = ['JVPM', 'JVPE', 'JVPL', 'JVPO', 'otra'] as const;
export const TIPO_TURNO = ['diurno', 'nocturno', 'guardia'] as const;
/** Estados de `personal.turno.estado`, con `ausente` de 20261120003000_turnos_asistencia_carga.sql (ASIS-01). */
export const ESTADO_TURNO_ASISTENCIA = [...ESTADO_TURNO, 'ausente'] as const;
/** Asistencia derivada: `sin_confirmar` = pasó el margen de la política `turnos.asistencia` sin marcar entrada. */
export const ASISTENCIA_TURNO = ['pendiente', 'presente', 'sin_confirmar', 'ausente'] as const;
export const TIPO_AUSENCIA = ['justificada', 'injustificada'] as const;
/** Acciones que el servidor permite a quien consulta, según su permiso, el estado y la hora (la UI no ofrece otras). */
export const ACCION_TURNO = ['editar', 'cancelar', 'marcar_entrada', 'marcar_presente', 'marcar_ausente', 'deshacer_asistencia'] as const;
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
  @EnumProp(ESTADO_TURNO_ASISTENCIA, 'EstadoTurno') state!: string;
  @StrProp({ nullable: true }) justification!: string | null;
  @IntProp() version!: number;
  @EnumProp(ASISTENCIA_TURNO, 'AsistenciaTurno', { nullable: true, description: 'Null en turnos cancelados o en borrador' }) attendance!: string | null;
  @DateTimeProp({ nullable: true, description: 'Hora de entrada marcada por la persona o por JOP' }) presentSince!: string | null;
  @BoolProp({ description: 'Marcó la entrada después del margen de la política turnos.asistencia' }) late!: boolean;
  @EnumProp(TIPO_AUSENCIA, 'TipoAusencia', { nullable: true }) absenceType!: string | null;
  @StrProp({ optional: true, nullable: true, description: 'Motivo de la ausencia; solo con turnos.planificar' }) attendanceReason?: string | null;
  @StrProp({ optional: true, nullable: true, description: 'Motivo de emergencia que permitió superar el tope de carga; solo con turnos.planificar' }) emergencyReason?: string | null;
  @EnumArrayProp(ACCION_TURNO, 'AccionTurno', { description: 'Acciones que quien consulta puede hacer ahora sobre este turno' }) allowedActions!: string[];
}

export class AffectedAppointmentResponse {
  @UuidProp() id!: string;
  @DateTimeProp() start!: string;
  @DateTimeProp() end!: string;
  @StrProp() state!: string;
}

export class SubstituteResponse {
  @UuidProp() id!: string;
  @StrProp() name!: string;
  @EnumProp(TIPO_PERSONAL, 'TipoPersonal') type!: string;
  @StrProp({ nullable: true }) specialty!: string | null;
  @StrProp({ nullable: true }) area!: string | null;
}

export class ShiftAttendanceResponse {
  @UuidProp() id!: string;
  @IntProp() version!: number;
  @EnumProp(ESTADO_TURNO_ASISTENCIA, 'EstadoTurno') state!: string;
  @EnumProp(ASISTENCIA_TURNO, 'AsistenciaTurno', { nullable: true }) attendance!: string | null;
  @BoolProp() late!: boolean;
  @ClassArrayProp(AffectedAppointmentResponse, { description: 'ASIS-02: citas vivas del médico ausente que hay que reprogramar o cancelar' }) affectedAppointments!: AffectedAppointmentResponse[];
  @ClassArrayProp(SubstituteResponse, { description: 'ASIS-02: personal de la misma función (y especialidad) libre y con descanso cumplido' }) substitutes!: SubstituteResponse[];
}

export class SpecialistShiftResponse {
  @DateProp() date!: string;
  @StrProp() specialty!: string;
  @StrProp() name!: string;
  @StrProp() area!: string;
  @DateTimeProp() start!: string;
  @DateTimeProp() end!: string;
  @EnumProp(ASISTENCIA_TURNO, 'AsistenciaTurno', { nullable: true }) attendance!: string | null;
}

export class SpecialistWeekResponse {
  @DateProp() from!: string;
  @DateProp() to!: string;
  @ClassArrayProp(SpecialistShiftResponse) items!: SpecialistShiftResponse[];
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
  @ClassArrayProp(CoverageGapResponse, { optional: true, description: 'Al cancelar: huecos de cobertura que deja el turno (RN-15)' }) huecos?: CoverageGapResponse[];
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
