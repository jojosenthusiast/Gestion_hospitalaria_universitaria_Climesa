import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { LabCancelDto, LabOrderDto, LabResultDto, LabVersionDto } from './laboratory.dto';
import { LaboratoryService } from './laboratory.service';

@ApiTags('laboratory') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('laboratorio')
export class LaboratoryController {
  constructor(private readonly laboratory: LaboratoryService) {}

  @Get('catalogo') @RequirePermission('laboratorio.ordenar', 'catalogo.configurar') @ApiOperation({ summary: 'Catálogo activo de exámenes y paneles' })
  catalog() { return this.laboratory.catalog(); }

  @Get('ordenes') @RequirePermission('laboratorio.ver_cola', 'resultados.ver') @ApiOperation({ summary: 'Cola de laboratorio o resultados permitidos' })
  list(@Req() r: ActorRequest) { return this.laboratory.list(r.actor); }

  @Post('ordenes') @RequirePermission('laboratorio.ordenar') @ApiOperation({ summary: 'Crear una orden de laboratorio desde una consulta' })
  create(@Req() r: ActorRequest, @Body() dto: LabOrderDto, @Headers('idempotency-key') key?: string) { return this.laboratory.create(r.actor, dto, key); }

  @Post('ordenes/:id/muestra') @RequirePermission('laboratorio.procesar') @ApiOperation({ summary: 'Tomar muestra y pasar la orden a proceso' })
  sample(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LabVersionDto, @Headers('idempotency-key') key?: string) { return this.laboratory.sample(r.actor, id, dto, key); }

  @Post('ordenes/:id/resultados') @RequirePermission('laboratorio.procesar') @ApiOperation({ summary: 'Capturar o actualizar el resultado de un examen' })
  result(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LabResultDto, @Headers('idempotency-key') key?: string) { return this.laboratory.result(r.actor, id, dto, key); }

  @Post('ordenes/:id/completar') @RequirePermission('laboratorio.validar') @ApiOperation({ summary: 'Completar una orden con todos sus resultados' })
  complete(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LabVersionDto, @Headers('idempotency-key') key?: string) { return this.laboratory.complete(r.actor, id, dto, key); }

  @Post('ordenes/:id/revisar') @RequirePermission('laboratorio.revisar') @ApiOperation({ summary: 'Revisar y liberar resultados al paciente' })
  review(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LabVersionDto, @Headers('idempotency-key') key?: string) { return this.laboratory.review(r.actor, id, dto, key); }

  @Post('ordenes/:id/cancelar') @RequirePermission('laboratorio.cancelar') @ApiOperation({ summary: 'Cancelar una orden pendiente o en proceso' })
  cancel(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LabCancelDto, @Headers('idempotency-key') key?: string) { return this.laboratory.cancel(r.actor, id, dto, key); }
}
