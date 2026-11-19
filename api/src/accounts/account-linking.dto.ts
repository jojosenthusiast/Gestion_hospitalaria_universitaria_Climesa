import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { Text } from '../platform/dto';

/** FR-101-10: rejection always carries the reason the patient will see. */
export class LinkRejectDto {
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) version!: number;
  @Text(10, 500) reason!: string;
}
