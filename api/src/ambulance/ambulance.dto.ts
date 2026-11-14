import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsUUID, Matches, Max, Min, ValidateNested } from 'class-validator';
import { Text } from '../platform/dto';
import { finalStates, milestoneTypes, priorities, serviceTypes } from './ambulance.rules';

export class MaintenanceDto {
  @ApiProperty({minimum:1}) @IsInt() @Min(1) version!:number;
  @ApiProperty({description:'true entra a mantenimiento; false sale y deja la unidad Disponible'}) @IsBoolean() inMaintenance!:boolean;
  @Text(10,500) reason!:string;
}
/** FR-109-02 y FR-109-03: solicitud del paciente (app) o registrada por recepción (teléfono). */
export class AmbulanceRequestDto {
  @Text(5,300) address!:string;
  @Text(0,80,true) municipality?:string;
  @ApiPropertyOptional({minimum:-90,maximum:90}) @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?:number;
  @ApiPropertyOptional({minimum:-180,maximum:180}) @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?:number;
  @Text(5,500) reason!:string;
  @ApiProperty({example:'7000-0000'}) @Matches(/^[0-9+ -]{8,20}$/,{message:'contactPhone debe ser un teléfono de 8 a 20 dígitos.'}) contactPhone!:string;
  @ApiPropertyOptional({format:'uuid',description:'Solo recepción: paciente ya registrado que pide el servicio por teléfono'}) @IsOptional() @IsUUID() patientId?:string;
}
export class DiscardRequestDto {
  @ApiProperty({minimum:1}) @IsInt() @Min(1) version!:number;
  @Text(5,500) reason!:string;
}
/** FR-109-04: despacho. `version` es la de la unidad que se vio Disponible. */
export class DispatchDto {
  @ApiProperty({minimum:1}) @IsInt() @Min(1) version!:number;
  @ApiPropertyOptional({format:'uuid'}) @IsOptional() @IsUUID() requestId?:string;
  @ApiProperty({enum:serviceTypes}) @IsIn([...serviceTypes]) type!:string;
  @ApiProperty({enum:priorities}) @IsIn([...priorities]) priority!:string;
  @Text(5,300,true) origin?:string;
  @Text(3,300) destination!:string;
  @Text(0,80,true) municipality?:string;
}
/** FR-109-07: hito del servicio; `finalState` y `reason` solo al finalizar. */
export class MilestoneDto {
  @ApiProperty({enum:milestoneTypes}) @IsIn([...milestoneTypes]) type!:string;
  @ApiPropertyOptional({format:'date-time',description:'Hora del teléfono; si falta, la del servidor'}) @IsOptional() @IsISO8601({strict:true}) occurredAt?:string;
  @ApiPropertyOptional({enum:finalStates}) @IsOptional() @IsIn([...finalStates]) finalState?:string;
  @Text(0,500,true) reason?:string;
}
export class VitalSignsDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(20) @Max(250) heartRate?:number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(40) @Max(300) systolic?:number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(20) @Max(200) diastolic?:number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(4) @Max(60) respiratoryRate?:number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(50) @Max(100) oxygenSaturation?:number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(30) @Max(45) temperature?:number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(3) @Max(15) glasgow?:number;
}
/** FR-109-10: reporte prehospital; el reenvío con la misma Idempotency-Key no duplica (RN-34). */
export class PrehospitalDto {
  @Text(5,500) reason!:string;
  @ApiProperty({enum:priorities}) @IsIn([...priorities]) priority!:string;
  @ApiPropertyOptional({type:VitalSignsDto}) @IsOptional() @ValidateNested() @Type(()=>VitalSignsDto) vitalSigns?:VitalSignsDto;
  @ApiPropertyOptional({format:'date-time'}) @IsOptional() @IsISO8601({strict:true}) estimatedArrival?:string;
  @ApiProperty({format:'date-time',description:'Hora en que el teléfono capturó el reporte'}) @IsISO8601({strict:true}) capturedAt!:string;
  @ApiPropertyOptional({format:'uuid',description:'Paciente del servicio, por ejemplo uno provisional (FR-109-12)'}) @IsOptional() @IsUUID() patientId?:string;
}
export class LocationDto {
  @ApiProperty({minimum:-90,maximum:90}) @IsNumber() @Min(-90) @Max(90) latitude!:number;
  @ApiProperty({minimum:-180,maximum:180}) @IsNumber() @Min(-180) @Max(180) longitude!:number;
  @ApiProperty({format:'date-time'}) @IsISO8601({strict:true}) capturedAt!:string;
}
