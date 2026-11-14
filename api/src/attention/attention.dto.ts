import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsInt, IsOptional, IsUUID, Min } from 'class-validator';
import { Text } from '../platform/dto';

export class AppointmentCreateDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() patientId!: string;
  @ApiProperty({ format: 'uuid' }) @IsUUID() doctorId!: string;
  @ApiProperty({ format: 'date-time' }) @IsISO8601({ strict: true }) start!: string;
  @ApiProperty({ format: 'date-time' }) @IsISO8601({ strict: true }) end!: string;
  @Text(0, 500, true) reason?: string;
}

export class PatientAppointmentRequestDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() doctorId!: string;
  @ApiProperty({ format: 'date-time' }) @IsISO8601({ strict: true }) start!: string;
  @ApiProperty({ format: 'date-time' }) @IsISO8601({ strict: true }) end!: string;
  @Text(0, 500, true) reason?: string;
}

export class AppointmentStatusDto {
  @ApiProperty({ enum: ['confirmada', 'rechazada', 'atendida', 'no_asistio'] })
  @IsIn(['confirmada', 'rechazada', 'atendida', 'no_asistio']) status!: string;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @Text(0, 500, true) rejectionReason?: string;
}

/** API-10: the version is mandatory and compared on every transition. */
export class AppointmentDecisionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @Text(0, 500, true) rejectionReason?: string;
}

export class AppointmentCancelDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @Text(10, 500) reason!: string;
}
