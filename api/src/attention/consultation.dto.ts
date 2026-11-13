import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsOptional, IsUUID, Min, IsInt } from 'class-validator';
import { Text } from '../platform/dto';

export class ConsultationStartDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() appointmentId!: string;
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
