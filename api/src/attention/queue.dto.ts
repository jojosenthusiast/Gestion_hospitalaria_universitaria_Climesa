import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsIn, IsOptional, IsUUID, Min } from 'class-validator';
import { Text } from '../platform/dto';
import { QUEUE_PRIORITIES, QueuePriority } from './attention.rules';

export const QUEUE_SERVICES = ['consulta_general', 'emergencia', 'laboratorio', 'admisiones'] as const;
export type QueueService = typeof QUEUE_SERVICES[number];

export class QueueIssueDto {
  @ApiProperty({ enum: QUEUE_SERVICES }) @IsIn(QUEUE_SERVICES) service!: QueueService;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() patientId?: string;
  @ApiPropertyOptional({ enum: QUEUE_PRIORITIES, description: 'Prioridad clínica; por omisión rutina' }) @IsOptional() @IsIn(QUEUE_PRIORITIES) priority?: QueuePriority;
  /**
   * D-1 (R7 U1): registra la llegada de una cita confirmada de hoy. El número queda ligado a la cita (servicio
   * consulta_general); el paciente sale de la cita si no se indica, y firmar la consulta cierra la cita y el número.
   */
  @ApiPropertyOptional({ format: 'uuid', description: 'Cita de hoy cuya llegada se registra con este número' }) @IsOptional() @IsUUID() appointmentId?: string;
}

/** B-3: version of the number being voided right after it was issued by mistake. */
export class QueueVoidDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
}

export class QueueTransitionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() officeId?: string;
  @Text(0, 500, true) reason?: string;
}

export class QueueCallNextDto {
  @ApiProperty({ enum: QUEUE_SERVICES }) @IsIn(QUEUE_SERVICES) service!: QueueService;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() officeId?: string;
}

export class QueuePriorityDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ enum: QUEUE_PRIORITIES }) @IsIn(QUEUE_PRIORITIES) priority!: QueuePriority;
  @Text(0, 500, true) reason?: string;
}

export class QueueUndoDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
}
