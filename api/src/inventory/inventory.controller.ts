import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { ArticleDto, MovementDto } from './inventory.dto';
import { InventoryService } from './inventory.service';
@ApiTags('inventory') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('inventario')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}
  @Get('existencias') @RequirePermission('inventario.ver') @ApiOperation({ summary: 'Existencias por bodega, lote y vencimiento' }) existences(@Req() r: ActorRequest) { return this.service.existences(r.actor); }
  @Get('movimientos') @RequirePermission('inventario.ver') @ApiOperation({ summary: 'Historial de movimientos' }) movements(@Req() r: ActorRequest) { return this.service.movements(r.actor); }
  @Post('movimientos') @RequirePermission('inventario.mover') @ApiOperation({ summary: 'Registrar entrada, salida, ajuste, traslado o consumo' }) move(@Req() r: ActorRequest, @Body() d: MovementDto, @Headers('idempotency-key') k?: string) { return this.service.move(r.actor, d, k); }
  @Post('articulos') @RequirePermission('inventario.configurar') @ApiOperation({ summary: 'Crear artículo de inventario' }) create(@Req() r: ActorRequest, @Body() d: ArticleDto, @Headers('idempotency-key') k?: string) { return this.service.saveArticle(r.actor, null, d, k); }
  @Put('articulos/:id') @RequirePermission('inventario.configurar') @ApiOperation({ summary: 'Editar artículo de inventario' }) edit(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: ArticleDto, @Headers('idempotency-key') k?: string) { return this.service.saveArticle(r.actor, id, d, k); }
}
