import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsOptional, Matches, Min } from 'class-validator';
import { Text } from '../platform/dto';

export const NOTICE_PRIORITIES = ['atencion', 'urgente', 'critico'] as const;

/** POST /avisos (FR-112-03). Las fechas llevan zona horaria; sin `desde`, el aviso empieza al publicarse. */
export class NoticeDto {
  @Text(3, 120) titulo!: string;
  @Text(3, 1000) cuerpo!: string;
  @ApiPropertyOptional({ format: 'date-time', description: 'Inicio de la vigencia, con zona horaria' }) @IsOptional() @IsISO8601({ strict: true }) desde?: string;
  @ApiProperty({ format: 'date-time', description: 'Fin de la vigencia, con zona horaria' }) @IsISO8601({ strict: true }) hasta!: string;
  @ApiPropertyOptional({ enum: NOTICE_PRIORITIES, default: 'atencion', description: 'Escalera de avisos (D-071): atencion, urgente o critico' }) @IsOptional() @IsIn(NOTICE_PRIORITIES) prioridad?: (typeof NOTICE_PRIORITIES)[number];
  @ApiPropertyOptional({ default: true, description: 'Visible en la pantalla pública y en las apps sin sesión. Sin roles, debe ser true' }) @IsOptional() @IsBoolean() publico?: boolean;
  @ApiPropertyOptional({ type: [String], description: 'Códigos de rol que ven el aviso en su tablero de inicio; deben existir en acceso.rol' }) @IsOptional() @IsArray() @ArrayUnique() @Matches(/^[A-Z]{2,4}$/, { each: true }) roles?: string[];
  @ApiPropertyOptional({ description: 'Publicar aunque el texto parezca contener un DUI, expediente o teléfono (FR-112-05)' }) @IsOptional() @IsBoolean() confirmarDatosPersonales?: boolean;
}

/** PUT /avisos/{id} (MA-AVI-02): el aviso completo otra vez, con la versión que se leyó. Sin `desde`, conserva el inicio vigente. */
export class NoticeEditDto extends NoticeDto {
  @ApiProperty({ minimum: 1, description: 'Versión que se leyó; otra distinta responde version_conflicto' }) @IsInt() @Min(1) version!: number;
}

/** POST /avisos/{id}/retirar (MA-AVI-02, D-13): el aviso deja de verse en todas partes; el motivo queda auditado. */
export class NoticeWithdrawDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value) @Text(10, 500) motivo!: string;
}
