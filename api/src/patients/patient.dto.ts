import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PatientSearchQueryDto {
  @ApiPropertyOptional({minLength:2,maxLength:100})
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  query?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @ApiPropertyOptional({type:Number,minimum:1,maximum:50,default:50})
  limit: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  @ApiPropertyOptional({type:Number,minimum:0,default:0})
  offset: number = 0;
}

/** Estados del expediente (`pacientes.paciente.estado`) que la lista puede filtrar; `vigente` es provisional o activo. */
export const PATIENT_LIST_STATES = ['vigente', 'provisional', 'activo', 'inactivo'] as const;
/**
 * Situación de atención hoy: `hospitalizado`, `pendiente_cama` y `alta_firmada` salen de la admisión activa; `en_fila` de un
 * número de hoy sin terminar; `cita_hoy` de una cita de hoy solicitada, confirmada o atendida.
 */
export const PATIENT_SITUATIONS = ['hospitalizado', 'pendiente_cama', 'alta_firmada', 'en_fila', 'cita_hoy'] as const;

/** Lista de pacientes con filtros del servidor (la lista es paginada: filtrar en el cliente perdería filas). */
export class PatientListQueryDto extends PatientSearchQueryDto {
  @ApiPropertyOptional({enum:PATIENT_LIST_STATES,enumName:'EstadoExpediente',description:'Estado del expediente; vigente = provisional o activo'})
  @IsOptional()
  @IsIn(PATIENT_LIST_STATES)
  estado?: string;

  @ApiPropertyOptional({enum:PATIENT_SITUATIONS,enumName:'SituacionPaciente',description:'Situación de atención hoy. Hospitalización exige admision.ver global; fila, fila.ver; citas, citas.ver'})
  @IsOptional()
  @IsIn(PATIENT_SITUATIONS)
  situacion?: string;

  @ApiPropertyOptional({format:'uuid',description:'Área (o planta) donde está su cama hoy. Exige admision.ver global'})
  @IsOptional()
  @IsUUID()
  areaId?: string;

  @ApiPropertyOptional({format:'uuid',description:'Médico tratante de su admisión activa. Exige admision.ver global'})
  @IsOptional()
  @IsUUID()
  medicoId?: string;
}

export class PatientSearchDto {
  @ApiProperty({minLength:2,maxLength:100})
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  query!: string;
}

/** Selector con búsqueda mientras se escribe: mínimo dos caracteres y páginas cortas. */
export class PatientPickerQueryDto {
  @ApiProperty({minLength:2,maxLength:100})
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  query!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  @ApiPropertyOptional({type:Number,minimum:1,maximum:20,default:10})
  limit: number = 10;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100000)
  @ApiPropertyOptional({type:Number,minimum:0,default:0})
  offset: number = 0;
}
