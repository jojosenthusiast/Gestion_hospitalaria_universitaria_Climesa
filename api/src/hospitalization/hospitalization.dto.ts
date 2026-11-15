import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Text } from '../platform/dto';

/** `programada` only survives in legacy rows: a new admission always links to its source record. */
export const admissionOrigins = ['cita', 'consulta', 'emergencia', 'ambulancia'] as const;
export const isolationTypes = ['contacto', 'gotitas', 'aerea', 'protector'] as const;
export class AdmissionDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() patientId!: string;
  @ApiProperty({ enum: admissionOrigins }) @IsIn(admissionOrigins) origin!: string;
  @ApiProperty({ format: 'uuid', description: 'Registro de origen (cita, consulta, ticket de emergencia o servicio de ambulancia) del mismo paciente.' }) @IsUUID() originId!: string;
  @ApiProperty({ enum: ['vip', 'semiprivada'] }) @IsIn(['vip', 'semiprivada']) requestedCategory!: string;
  @ApiProperty() @IsBoolean() isolation!: boolean;
  @ApiProperty({ format: 'uuid' }) @IsUUID() attendingDoctorId!: string;
  @ApiPropertyOptional({ format: 'date-time' }) @IsOptional() @IsISO8601({ strict: true }) scheduledAt?: string;
  @Text(10, 500, true) reason?: string;
  @Text(10, 500) motive!: string;
  @ApiPropertyOptional({ enum: isolationTypes }) @IsOptional() @IsIn(isolationTypes) isolationType?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() unstable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() postSurgical?: boolean;
  @ApiPropertyOptional({ description: 'Por omisión, sí.' }) @IsOptional() @IsBoolean() visitorsAllowed?: boolean;
  @ApiPropertyOptional({ minimum: 0, maximum: 4, description: 'Acompañantes permitidos; 0 si no se permiten visitas.' }) @IsOptional() @IsInt() @Min(0) @Max(4) visitorsMax?: number;
  @ApiPropertyOptional({ format: 'uuid', description: 'Cama elegida: se asigna en el mismo comando (ingreso inmediato).' }) @IsOptional() @IsUUID() bedId?: string;
  @ApiPropertyOptional({ minimum: 1 }) @IsOptional() @IsInt() @Min(1) bedVersion?: number;
}
/**
 * Indication from a consultation (`admision.solicitar`): the doctor who indicates is the attending doctor, so
 * `attendingDoctorId` may be omitted (it defaults to the actor's own staff id). `origin` must be `consulta` and
 * `originId` a consultation of that patient led by that doctor.
 */
export class AdmissionIndicationDto extends OmitType(AdmissionDto, ['attendingDoctorId'] as const) {
  @ApiPropertyOptional({ format: 'uuid', description: 'Por omisión, el médico que indica; si se envía, debe ser ese mismo médico.' }) @IsOptional() @IsUUID() attendingDoctorId?: string;
}
export class BedAssignmentDto { @ApiProperty({ format: 'uuid' }) @IsUUID() bedId!: string; @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number; @Text(10, 500, true) reason?: string; }
export class BedSuggestionQuery { @ApiPropertyOptional({ enum: ['vip', 'semiprivada'] }) @IsOptional() @IsIn(['vip', 'semiprivada']) category?: string; }
/** API-10: authorizing changes the admission, so it carries and compares its version. */
export class AuthorizationDto { @Text(10, 500) reason!: string; @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number; }
export class TransferDto { @ApiProperty({ format: 'uuid' }) @IsUUID() bedId!: string; @Text(10, 500) reason!: string; @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number; }
/** RN-11: a discharge pending item always names who is responsible for it. */
export class DischargePendingDto {
  @Text(1, 500) description!: string;
  @Text(1, 200) responsible!: string;
}
export class DischargeDto {
  @ApiProperty({ enum: ['medica', 'voluntaria', 'traslado', 'defuncion'] }) @IsIn(['medica', 'voluntaria', 'traslado', 'defuncion']) type!: string;
  @ApiProperty({ minimum: 1, description: 'Versión vigente de la admisión (control de concurrencia).' }) @IsInt() @Min(1) version!: number;
  @Text(10, 2000, true) summary?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() voluntaryConsent?: boolean;
  @ApiPropertyOptional({ type: [DischargePendingDto], maxItems: 50, description: 'Pendientes al alta, cada uno con su responsable.' })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => DischargePendingDto) pending?: DischargePendingDto[];
}
/** API-04: the physical exit validates its body and compares the admission version. */
export class ExitDto { @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number; @Text(10, 500) reason!: string; }
export class NursingNoteDto { @Text(1, 4000) text!: string; }
