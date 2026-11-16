import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';
import { ROTATION_PATTERNS } from './rotation.rules';
import { Text } from '../platform/dto';
export const staffTypes=['medico','enfermero','asistente','recepcionista','laboratorista','paramedico','motorista','limpieza','administrativo','otro'];
export class StaffDto {
  @Text(2,80) givenNames!:string;
  @Text(2,100) surnames!:string;
  @ApiProperty({enum:staffTypes}) @IsIn(staffTypes) type!:string;
  @Text(0,120,true) specialty?:string;
  @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() areaId?:string;
  @Text(0,9,true) phone?:string;
  @Text(0,10,true) dui?:string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?:boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) version?:number;
  @Text(10,500,true) reason?:string;
}
export const boards=['JVPM','JVPE','JVPL','JVPO','otra'];
export class RegistrationDto {
  @ApiProperty({enum:boards}) @IsIn(boards) board!:string;
  @Text(2,40) number!:string;
  @ApiProperty({format:'date',example:'2026-01-01'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) validFrom!:string;
  @ApiProperty({format:'date',example:'2026-12-31'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) validTo!:string;
  @ApiProperty({minimum:1}) @IsInt() @Min(1) version!:number;
  @Text(10,500) reason!:string;
}
export class ShiftDto {
  @ApiProperty({format:'uuid'}) @IsUUID() staffId!:string;
  @ApiProperty({format:'uuid'}) @IsUUID() areaId!:string;
  @ApiProperty({format:'date-time'}) @IsISO8601({strict:true}) start!:string;
  @ApiProperty({format:'date-time'}) @IsISO8601({strict:true}) end!:string;
  @ApiProperty({enum:['diurno','nocturno','guardia']}) @IsIn(['diurno','nocturno','guardia']) type!:string;
  @Text(0,500,true) justification?:string;
  // MA-TUR-01/02 (D-10): los turnos nacen publicados; `state` solo sirve para cancelar un turno existente.
  @ApiPropertyOptional({enum:['cancelado'],description:'Solo en PATCH, para cancelar un turno que no ha empezado'}) @IsOptional() @IsIn(['cancelado']) state?:string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) version?:number;
  @Text(10,500,true) reason?:string;
  /** CARGA-01/02: motivo de emergencia para superar el tope de horas en 7 días o de días seguidos; queda en el turno y en la auditoría. */
  @Text(10,500,true) emergencyReason?:string;
}
export const attendanceStates=['presente','ausente','pendiente'];
export const absenceTypes=['justificada','injustificada'];
/** ASIS-01/03: la entrada es automática; JOP corrige la hora real (`presente`), marca la ausencia (con tipo) o deshace una ausencia (`pendiente`); siempre con motivo. */
export class AttendanceDto {
  @ApiProperty({enum:attendanceStates}) @IsIn(attendanceStates) state!:string;
  @ApiPropertyOptional({enum:absenceTypes}) @IsOptional() @IsIn(absenceTypes) absenceType?:string;
  @ApiPropertyOptional({format:'date-time',description:'Hora real de entrada al corregirla; por omisión, ahora. Obligatoria si el turno ya terminó'}) @IsOptional() @IsISO8601({strict:true}) at?:string;
  @ApiProperty({minimum:1}) @IsInt() @Min(1) version!:number;
  @Text(10,500,true) reason?:string;
}
export class PublishDto {
  @ApiProperty({format:'date',example:'2026-11-10'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) from!:string;
  @ApiProperty({format:'date',example:'2026-11-16'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) to!:string;
  @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() areaId?:string;
}
/** Fase 2, flujo F: one shift of a batch. Same fields and rules as a single new shift (`ShiftDto`), always a draft. */
export class ShiftBatchItemDto {
  @ApiProperty({format:'uuid'}) @IsUUID() staffId!:string;
  @ApiProperty({format:'uuid'}) @IsUUID() areaId!:string;
  @ApiProperty({format:'date-time'}) @IsISO8601({strict:true}) start!:string;
  @ApiProperty({format:'date-time'}) @IsISO8601({strict:true}) end!:string;
  @ApiProperty({enum:['diurno','nocturno','guardia']}) @IsIn(['diurno','nocturno','guardia']) type!:string;
  @Text(0,500,true) justification?:string;
}
/** Up to 400 shifts (about 45 people for a week with room for 24 h coverage). */
export class ShiftBatchDto {
  @ApiProperty({type:[ShiftBatchItemDto],minItems:1,maxItems:400}) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(400) @ValidateNested({each:true}) @Type(()=>ShiftBatchItemDto) items!:ShiftBatchItemDto[];
  /** Applied to every item without its own justification: required by the 44 h daytime warning (RN-14), for example in 12x36. */
  @Text(10,500,true) justification?:string;
}
/** Rotation generator (preview only): people or a group by function and area, a pattern and a date range of up to 31 days. */
export class RotationDto {
  @ApiProperty({format:'uuid',description:'Área donde se asignan los turnos'}) @IsUUID() areaId!:string;
  @ApiPropertyOptional({type:[String],description:'Personas elegidas; sin ellas se usa el grupo de `role` asignado al área'}) @IsOptional() @IsArray() @ArrayMaxSize(60) @ArrayUnique() @IsUUID('all',{each:true}) staffIds?:string[];
  @ApiPropertyOptional({enum:staffTypes,description:'Función del grupo (con el área de cada persona igual a `areaId`)'}) @IsOptional() @IsIn(staffTypes) role?:string;
  @ApiProperty({enum:ROTATION_PATTERNS}) @IsIn(ROTATION_PATTERNS as unknown as string[]) pattern!:string;
  @ApiProperty({format:'date',example:'2026-11-16'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) from!:string;
  @ApiProperty({format:'date',example:'2026-11-22'}) @Matches(/^\d{4}-\d{2}-\d{2}$/) to!:string;
  @ApiPropertyOptional({example:'07:00',description:'Hora local de inicio; por omisión 07:00'}) @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime?:string;
  @ApiPropertyOptional({minimum:4,maximum:24,description:'Solo en personalizado'}) @IsOptional() @IsInt() @Min(4) @Max(24) hours?:number;
  @ApiPropertyOptional({minimum:1,maximum:6,description:'Solo en personalizado'}) @IsOptional() @IsInt() @Min(1) @Max(6) workDays?:number;
  @ApiPropertyOptional({minimum:1,maximum:6,description:'Solo en personalizado'}) @IsOptional() @IsInt() @Min(1) @Max(6) restDays?:number;
  @Text(10,500,true) justification?:string;
}
/** A week template slot: day of the week (0 = Monday), local start time, hours, kind and person. */
export class TemplateShiftDto {
  @ApiProperty({minimum:0,maximum:6,description:'0 = lunes'}) @IsInt() @Min(0) @Max(6) day!:number;
  @ApiProperty({example:'07:00'}) @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!:string;
  @ApiProperty({minimum:4,maximum:24}) @IsInt() @Min(4) @Max(24) hours!:number;
  @ApiProperty({enum:['diurno','nocturno','guardia']}) @IsIn(['diurno','nocturno','guardia']) type!:string;
  @ApiProperty({format:'uuid'}) @IsUUID() staffId!:string;
}
export class WeekTemplateDto {
  @ApiProperty({format:'uuid'}) @IsUUID() areaId!:string;
  @Text(3,80) name!:string;
  @ApiProperty({type:[TemplateShiftDto],minItems:1,maxItems:400}) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(400) @ValidateNested({each:true}) @Type(()=>TemplateShiftDto) shifts!:TemplateShiftDto[];
}
/** Retire a template (it stays stored; its name is freed for the area). */
export class WeekTemplateRetireDto {
  @ApiProperty({minimum:1}) @IsInt() @Min(1) version!:number;
}
export const spaceTypes=['hospital','planta','area','habitacion','cama','consultorio','cubiculo','bodega','bahia'];
export class SpaceDto {
  @Text(2,40) code!:string;
  @Text(2,120) name!:string;
  @ApiProperty({enum:spaceTypes}) @IsIn(spaceTypes) type!:string;
  @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() parentId?:string;
  @ApiPropertyOptional({enum:['vip','semiprivada']}) @IsOptional() @IsIn(['vip','semiprivada']) category?:string;
  @ApiPropertyOptional({minimum:1}) @IsOptional() @IsInt() @Min(1) capacity?:number;
  @ApiPropertyOptional() @IsOptional() @IsInt() level?:number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?:boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) version?:number;
  @Text(10,500,true) reason?:string;
}
export class BedBlockDto {
  @ApiProperty({minimum:1}) @IsInt() @Min(1) version!:number;
  @Text(5,500) motivo!:string;
}
export class BedTransitionDto {
  @ApiProperty({minimum:1}) @IsInt() @Min(1) version!:number;
  @Text(10,500) reason!:string;
}
