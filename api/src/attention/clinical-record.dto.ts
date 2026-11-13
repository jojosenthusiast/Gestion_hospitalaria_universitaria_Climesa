import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, ValidateNested } from 'class-validator';

export class VitalSignsDto {
  @ApiPropertyOptional({ minimum: 40, maximum: 300 }) @IsOptional() @IsInt() @Min(40) @Max(300) systolic?: number;
  @ApiPropertyOptional({ minimum: 20, maximum: 200 }) @IsOptional() @IsInt() @Min(20) @Max(200) diastolic?: number;
  @ApiPropertyOptional({ minimum: 20, maximum: 250 }) @IsOptional() @IsInt() @Min(20) @Max(250) heartRate?: number;
  @ApiPropertyOptional({ minimum: 4, maximum: 80 }) @IsOptional() @IsInt() @Min(4) @Max(80) respiratoryRate?: number;
  @ApiPropertyOptional({ minimum: 30, maximum: 45 }) @IsOptional() @IsNumber() @Min(30) @Max(45) temperature?: number;
  @ApiPropertyOptional({ minimum: 40, maximum: 100 }) @IsOptional() @IsInt() @Min(40) @Max(100) oxygenSaturation?: number;
  @ApiPropertyOptional({ minimum: 0.3, maximum: 400 }) @IsOptional() @IsNumber() @Min(0.3) @Max(400) weightKg?: number;
  @ApiPropertyOptional({ minimum: 20, maximum: 250 }) @IsOptional() @IsNumber() @Min(20) @Max(250) heightCm?: number;
  @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() admissionId?: string;
}

export class DiagnosisDto {
  @ApiProperty({ example: 'J06.9' }) @IsString() @IsNotEmpty() @MaxLength(20) code!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() principal?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class PrescriptionItemDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) medication!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) dose!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) route!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(200) frequency!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100) duration!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) instructions?: string;
}

export class PrescriptionDto {
  @ApiProperty({ type: [PrescriptionItemDto], minItems: 1, maxItems: 20 })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => PrescriptionItemDto)
  items!: PrescriptionItemDto[];
}
