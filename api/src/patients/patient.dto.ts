import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
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
