import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsISO8601, IsOptional } from 'class-validator';
import { Text } from '../platform/dto';

export const NOTICE_PRIORITIES = ['atencion', 'urgente', 'critico'] as const;
export const NOTICE_ROLES = ['ADM', 'JOP', 'REC', 'AST', 'ENF', 'MED', 'LAB', 'PAR', 'DPD', 'PAC'] as const;

/** POST /avisos (FR-112-03). Las fechas llevan zona horaria; sin `desde`, el aviso empieza al publicarse. */
export class NoticeDto {
  @Text(3, 120) titulo!: string;
  @Text(3, 1000) cuerpo!: string;
  @ApiPropertyOptional({ format: 'date-time', description: 'Inicio de la vigencia, con zona horaria' }) @IsOptional() @IsISO8601({ strict: true }) desde?: string;
  @ApiProperty({ format: 'date-time', description: 'Fin de la vigencia, con zona horaria' }) @IsISO8601({ strict: true }) hasta!: string;
  @ApiPropertyOptional({ enum: NOTICE_PRIORITIES, default: 'atencion', description: 'Escalera de avisos (D-071): atencion, urgente o critico' }) @IsOptional() @IsIn(NOTICE_PRIORITIES) prioridad?: (typeof NOTICE_PRIORITIES)[number];
  @ApiPropertyOptional({ default: true, description: 'Visible en la pantalla pública y en las apps sin sesión. Sin roles, debe ser true' }) @IsOptional() @IsBoolean() publico?: boolean;
  @ApiPropertyOptional({ type: [String], enum: NOTICE_ROLES, description: 'Roles que ven el aviso en su tablero de inicio' }) @IsOptional() @IsArray() @ArrayUnique() @IsIn(NOTICE_ROLES, { each: true }) roles?: string[];
  @ApiPropertyOptional({ description: 'Publicar aunque el texto parezca contener un DUI, expediente o teléfono (FR-112-05)' }) @IsOptional() @IsBoolean() confirmarDatosPersonales?: boolean;
}
