import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsISO8601, Matches, Min } from 'class-validator';
import { Text } from '../platform/dto';

/** FR-101-08: the patient declares DUI and date of birth; the record is never chosen by the patient. */
export class LinkRequestDto {
  @ApiProperty({ example: '00000000-0', description: 'DUI con o sin guion.' }) @Matches(/^\d{8}-?\d$/, { message: 'El DUI debe tener 9 dígitos.' }) dui!: string;
  @ApiProperty({ format: 'date', example: '1990-01-31' }) @IsISO8601({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha de nacimiento debe ser yyyy-MM-dd.' }) birth!: string;
}

export class LinkApproveDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
}

/** FR-101-10: rejection always carries the reason the patient will see. */
export class LinkRejectDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @Text(10, 500) reason!: string;
}
