import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { VitalSignsDto } from './clinical-record.dto';

/** Vital signs taken outside a consultation (ward round, queue triage): the same ranges as the consultation form plus pain, glucose and a note. */
export class PatientVitalsDto extends VitalSignsDto {
  @ApiPropertyOptional({ minimum: 0, maximum: 10, description: 'Dolor, escala 0 a 10' }) @IsOptional() @IsInt() @Min(0) @Max(10) pain?: number;
  @ApiPropertyOptional({ minimum: 20, maximum: 800, description: 'Glucemia en mg/dL' }) @IsOptional() @IsInt() @Min(20) @Max(800) glucoseMgDl?: number;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class PatientVitalsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 30 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
