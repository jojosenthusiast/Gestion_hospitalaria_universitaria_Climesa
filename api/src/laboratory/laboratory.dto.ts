import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';

export enum LabPriority { ROUTINE = 'rutina', URGENT = 'urgente' }
export enum LabMark { NORMAL = 'normal', HIGH = 'alto', LOW = 'bajo', CRITICAL_HIGH = 'critico_alto', CRITICAL_LOW = 'critico_bajo', NO_RANGE = 'sin_rango' }

export class LabOrderDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() consultationId!: string;
  @ApiProperty({ type: [String], minItems: 1 }) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsUUID('4', { each: true }) exams!: string[];
  @ApiPropertyOptional({ enum: LabPriority }) @IsOptional() @IsEnum(LabPriority) priority?: LabPriority;
}

export class LabVersionDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class LabSampleDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty({ description: 'Número de expediente verificado en la identificación del paciente.' }) @IsString() @IsNotEmpty() @MaxLength(40) expediente!: string;
  @ApiProperty({ description: 'Nombre completo repetido durante la toma de muestra.' }) @IsString() @IsNotEmpty() @MaxLength(200) nombreCompleto!: string;
}

export class LabResultDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() orderItemId!: string;
  /** API-10, MA-LAB-01: mandatory, so two technicians never overwrite each other's capture. */
  @ApiProperty({ minimum: 1, description: 'Versión vigente de la orden; cada captura la incrementa (`orderVersion` en la respuesta).' }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional() @ValidateIf(value => value.text === undefined) @IsNumber() value?: number;
  @ApiPropertyOptional() @ValidateIf(value => value.value === undefined) @IsString() @IsNotEmpty() @MaxLength(5000) text?: string;
  @ApiPropertyOptional({ description: 'Unidad del catálogo; si se envía debe coincidir.' }) @IsOptional() @IsString() @MaxLength(80) unit?: string;
  @ApiPropertyOptional({ description: 'Obligatorio al corregir un resultado existente.' }) @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @ApiPropertyOptional({ enum: LabMark, deprecated: true, description: 'Ignorado: la marca se calcula en el servidor.' }) @IsOptional() @IsEnum(LabMark) mark?: LabMark;
}

/** MA-LAB-02 (D-13): amend a result of a completed order; the order goes back to the doctor's review (D-040). */
export class LabAmendDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() orderItemId!: string;
  @ApiProperty({ minimum: 1, description: 'Versión vigente de la orden.' }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional() @ValidateIf(value => value.text === undefined) @IsNumber() value?: number;
  @ApiPropertyOptional() @ValidateIf(value => value.value === undefined) @IsString() @IsNotEmpty() @MaxLength(5000) text?: string;
  @ApiPropertyOptional({ description: 'Unidad del catálogo; si se envía debe coincidir.' }) @IsOptional() @IsString() @MaxLength(80) unit?: string;
  @ApiProperty({ minLength: 10, maxLength: 500, description: 'Por qué se corrige el resultado; queda en el historial y en la auditoría.' }) @IsString() @MinLength(10) @MaxLength(500) reason!: string;
}

export class LabCancelDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(500) reason!: string;
}

export const RANGE_SEXES = ['femenino', 'masculino', 'cualquiera'] as const;

/** One reference range of a numeric exam. Ages are whole years, `ageTo` excluded (`[ageFrom, ageTo)`); null means no upper limit. */
export class LabRangeDto {
  @ApiProperty({ enum: RANGE_SEXES, enumName: 'SexoRangoReferencia' }) @IsIn([...RANGE_SEXES]) sex!: string;
  @ApiProperty({ minimum: 0, maximum: 150 }) @IsInt() @Min(0) @Max(150) ageFrom!: number;
  @ApiPropertyOptional({ minimum: 1, maximum: 151, nullable: true, description: 'Edad en años excluida; null = sin límite.' }) @IsOptional() @IsInt() @Min(1) @Max(151) ageTo?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber() min?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber() max?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber() criticalLow?: number | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsNumber() criticalHigh?: number | null;
  @ApiProperty({ minLength: 3, maxLength: 200, description: 'Fuente bibliográfica o del laboratorio.' }) @IsString() @MinLength(3) @MaxLength(200) source!: string;
}

/**
 * MA-LAB-06 (W10): edit an exam. Only the fields sent change. `ranges` replaces the ranges valid today: they close at
 * today and the new ones start today, so results captured before keep the range they were marked with.
 */
export class LabExamUpdateDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @ApiPropertyOptional({ minLength: 2, maxLength: 120 }) @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @ApiPropertyOptional({ minLength: 1, maxLength: 40, description: 'Solo exámenes numéricos; no cambia si el examen ya tiene resultados.' }) @IsOptional() @IsString() @MinLength(1) @MaxLength(40) unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional({ type: [LabRangeDto], maxItems: 20 }) @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => LabRangeDto) ranges?: LabRangeDto[];
}
