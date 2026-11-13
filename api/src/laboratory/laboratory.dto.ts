import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator';

export enum LabPriority { ROUTINE = 'rutina', URGENT = 'urgente' }
export enum LabMark { NORMAL = 'normal', HIGH = 'alto', LOW = 'bajo', CRITICAL_HIGH = 'critico_alto', CRITICAL_LOW = 'critico_bajo', NO_RANGE = 'sin_rango' }

export class LabOrderDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() consultationId!: string;
  @ApiProperty({ type: [String], minItems: 1 }) @IsArray() @IsUUID('4', { each: true }) exams!: string[];
  @ApiPropertyOptional({ enum: LabPriority }) @IsOptional() @IsEnum(LabPriority) priority?: LabPriority;
}

export class LabVersionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class LabResultDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() orderItemId!: string;
  @ApiPropertyOptional() @ValidateIf(value => value.text === undefined) @IsNumber() value?: number;
  @ApiPropertyOptional() @ValidateIf(value => value.value === undefined) @IsString() @IsNotEmpty() @MaxLength(5000) text?: string;
  @ApiProperty({ enum: LabMark }) @IsEnum(LabMark) mark!: LabMark;
}

export class LabCancelDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}
