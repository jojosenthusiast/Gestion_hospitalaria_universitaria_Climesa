import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsIn, IsOptional, IsUUID, Min } from 'class-validator';
import { Text } from '../platform/dto';

export const QUEUE_SERVICES = ['consulta_general', 'emergencia', 'laboratorio', 'admisiones'] as const;
export type QueueService = typeof QUEUE_SERVICES[number];

export class QueueIssueDto {
  @ApiProperty({ enum: QUEUE_SERVICES }) @IsIn(QUEUE_SERVICES) service!: QueueService;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() patientId?: string;
}

export class QueueTransitionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() officeId?: string;
  @Text(0, 500, true) reason?: string;
}

