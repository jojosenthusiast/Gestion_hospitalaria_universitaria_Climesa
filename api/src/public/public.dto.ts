import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';
import { Text } from '../platform/dto';

/** POST /avisos (FR-112-03). Las fechas llevan zona horaria; sin `desde`, el aviso empieza al publicarse. */
export class NoticeDto {
  @Text(3, 120) titulo!: string;
  @Text(3, 1000) cuerpo!: string;
  @ApiPropertyOptional({ format: 'date-time', description: 'Inicio de la vigencia, con zona horaria' }) @IsOptional() @IsISO8601({ strict: true }) desde?: string;
  @ApiProperty({ format: 'date-time', description: 'Fin de la vigencia, con zona horaria' }) @IsISO8601({ strict: true }) hasta!: string;
  @ApiPropertyOptional({ description: 'Publicar aunque el texto parezca contener un DUI, expediente o teléfono (FR-112-05)' }) @IsOptional() @IsBoolean() confirmarDatosPersonales?: boolean;
}
