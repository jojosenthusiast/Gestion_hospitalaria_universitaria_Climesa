import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID, Min, IsInt } from 'class-validator';
import { Text } from '../platform/dto';

/** API-08, RN-22: a consultation starts from a confirmed appointment or from a called queue number; exactly one of them. */
export class ConsultationStartDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Cita confirmada del médico. Excluye `ticketId`.' }) @IsOptional() @IsUUID() appointmentId?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Número de fila llamado o en atención. Excluye `appointmentId`.' }) @IsOptional() @IsUUID() ticketId?: string;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() officeId?: string;
  @Text(0, 2000, true) reason?: string;
}

export class ConsultationUpdateDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @Text(0, 2000, true) reason?: string;
  @Text(0, 10000, true) physicalExam?: string;
  @Text(0, 5000, true) plan?: string;
}

export class ConsultationSignDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
}
