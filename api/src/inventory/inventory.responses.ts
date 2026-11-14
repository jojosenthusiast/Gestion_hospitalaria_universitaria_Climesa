import { ApiProperty } from '@nestjs/swagger';
import { BoolProp, DateTimeProp, DecimalProp, EnumProp, IntProp, StrProp, UuidProp } from '../platform/responses';

export const TIPO_ARTICULO = ['insumo', 'reactivo', 'equipo_menor'] as const;
export const TIPO_MOVIMIENTO = ['entrada', 'salida', 'ajuste', 'traslado', 'consumo'] as const;

/** Row of inventario.v_existencias joined with each lot and warehouse; the view columns keep their database names. */
export class StockResponse {
  @UuidProp() articulo_id!: string;
  @StrProp() codigo!: string;
  @StrProp() nombre!: string;
  @EnumProp(TIPO_ARTICULO, 'TipoArticulo') tipo!: string;
  @StrProp() unidad!: string;
  @DecimalProp() minimo!: string;
  @DecimalProp() disponible!: string;
  @DecimalProp() vencido!: string;
  @BoolProp() bajo_minimo!: boolean;
  @UuidProp() lotId!: string;
  @StrProp() lotNumber!: string;
  @DateTimeProp({ nullable: true, description: 'Columna date de PostgreSQL serializada como instante' }) expiresAt!: string | null;
  @UuidProp({ nullable: true }) warehouseId!: string | null;
  @StrProp({ nullable: true }) warehouseCode!: string | null;
  @DecimalProp({ nullable: true }) quantity!: string | null;
}

export class MovementResponse {
  @UuidProp() id!: string;
  @EnumProp(TIPO_MOVIMIENTO, 'TipoMovimiento') type!: string;
  @UuidProp() lotId!: string;
  @UuidProp({ nullable: true }) originWarehouseId!: string | null;
  @UuidProp({ nullable: true }) destinationWarehouseId!: string | null;
  @DecimalProp({ description: 'Negativo en un ajuste de salida' }) quantity!: string;
  @StrProp() reason!: string;
  @UuidProp({ nullable: true }) patientId!: string | null;
  @UuidProp() authorId!: string;
  @DateTimeProp() registeredAt!: string;
  @StrProp() articleCode!: string;
  @StrProp() articleName!: string;
  @StrProp() lotNumber!: string;
}

export class MovementCreatedResponse {
  @UuidProp() id!: string;
  @EnumProp(TIPO_MOVIMIENTO, 'TipoMovimiento') type!: string;
  @ApiProperty({ oneOf: [{ type: 'string' }, { type: 'number' }], description: 'Decimal como texto; número negativo en un ajuste de salida' }) quantity!: string | number;
  @DateTimeProp() registeredAt!: string;
}

export class ArticleResponse {
  @UuidProp() id!: string;
  @StrProp() code!: string;
  @StrProp() nombre!: string;
  @EnumProp(TIPO_ARTICULO, 'TipoArticulo') tipo!: string;
  @StrProp() unidad!: string;
  @DecimalProp() minimo!: string;
  @BoolProp() activo!: boolean;
  @IntProp() version!: number;
}
