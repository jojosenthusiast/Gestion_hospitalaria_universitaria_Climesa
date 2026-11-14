import { ApiProperty } from '@nestjs/swagger';
import { BoolProp, ClassArrayProp, DateProp, DateTimeProp, DecimalProp, EnumProp, IntProp, NumProp, StrArrayProp, StrProp, UuidProp } from '../platform/responses';

export const TIPO_ARTICULO = ['insumo', 'reactivo', 'equipo_menor'] as const;
export const TIPO_MOVIMIENTO = ['entrada', 'salida', 'ajuste', 'traslado', 'consumo', 'merma'] as const;

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

export const ESTADO_STOCK = ['ok', 'bajo_minimo', 'agotado', 'por_vencer', 'inactivo'] as const;

/** One row of the article master list with its stock summary and status. */
export class ArticleSummaryResponse {
  @UuidProp() id!: string;
  @StrProp() code!: string;
  @StrProp() name!: string;
  @EnumProp(TIPO_ARTICULO, 'TipoArticulo') type!: string;
  @StrProp() unit!: string;
  @NumProp() minimum!: number;
  @BoolProp() active!: boolean;
  @IntProp() version!: number;
  @NumProp({ description: 'Existencia usable: sin lotes vencidos ni dados de baja' }) available!: number;
  @NumProp() expired!: number;
  @NumProp({ description: 'Existencia que vence en los próximos 30 días' }) expiringSoon!: number;
  @DateProp({ nullable: true }) nextExpiry!: string | null;
  @IntProp() lots!: number;
  @EnumProp(ESTADO_STOCK, 'EstadoStock') status!: string;
}

export class LotStockResponse {
  @UuidProp() warehouseId!: string;
  @StrProp() warehouseCode!: string;
  @StrProp() warehouseName!: string;
  @NumProp() quantity!: number;
}

export class LotResponse {
  @UuidProp() id!: string;
  @StrProp() number!: string;
  @DateProp({ nullable: true }) expiresAt!: string | null;
  @BoolProp() active!: boolean;
  @IntProp() version!: number;
  @BoolProp() expired!: boolean;
  @NumProp() total!: number;
  @ClassArrayProp(LotStockResponse) warehouses!: LotStockResponse[];
}

export class WarehouseStockResponse {
  @UuidProp() warehouseId!: string;
  @StrProp() warehouseCode!: string;
  @StrProp() warehouseName!: string;
  @NumProp() quantity!: number;
}

export class ArticleMovementResponse {
  @UuidProp() id!: string;
  @EnumProp(TIPO_MOVIMIENTO, 'TipoMovimiento') type!: string;
  @StrProp() lotNumber!: string;
  @NumProp({ description: 'Negativo en un ajuste que resta' }) quantity!: number;
  @StrProp() reason!: string;
  @StrProp({ nullable: true }) originWarehouseCode!: string | null;
  @StrProp({ nullable: true }) destinationWarehouseCode!: string | null;
  @StrProp() authorName!: string;
  @DateTimeProp() registeredAt!: string;
}

export class ArticleDetailResponse extends ArticleSummaryResponse {
  @ClassArrayProp(LotResponse) lotList!: LotResponse[];
  @ClassArrayProp(WarehouseStockResponse) warehouses!: WarehouseStockResponse[];
  @ClassArrayProp(ArticleMovementResponse) movements!: ArticleMovementResponse[];
  @StrArrayProp({ description: 'Tipos de movimiento que el rol puede registrar sobre este artículo, según el contexto de inventario.mover' }) allowedMovements!: string[];
}

export class WarehouseResponse {
  @UuidProp() id!: string;
  @StrProp() code!: string;
  @StrProp() name!: string;
}

export class AvailableLotResponse {
  @UuidProp() id!: string;
  @StrProp() number!: string;
  @DateProp({ nullable: true }) expiresAt!: string | null;
  @BoolProp() expired!: boolean;
  @NumProp({ description: 'Cantidad del lote en la bodega consultada' }) quantity!: number;
  @BoolProp({ description: 'Verdadero en el lote que se debe usar primero (vence antes)' }) fefo!: boolean;
}

export class LotCreatedResponse {
  @UuidProp() id!: string;
  @StrProp() number!: string;
  @DateProp({ nullable: true }) expiresAt!: string | null;
  @BoolProp() active!: boolean;
  @IntProp() version!: number;
}

export class ArticleDeletedResponse {
  @UuidProp() id!: string;
  @BoolProp() deleted!: boolean;
}
