import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { LabAmendDto, LabCancelDto, LabOrderDto, LabResultDto, LabSampleDto, LabVersionDto } from './laboratory.dto';
import { LaboratoryService } from './laboratory.service';
import { LabCompleteResponse, LabExamResponse, LabOrderCreatedResponse, LabOrderDetailResponse, LabOrderResponse, LabOrderStateResponse, LabResultResponse, LabReviewResponse, LabSampleResponse } from './laboratory.responses';

@ApiTags('laboratory') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('laboratorio')
export class LaboratoryController {
  constructor(private readonly laboratory: LaboratoryService) {}

  @Get('catalogo') @RequirePermission('laboratorio.ordenar', 'catalogo.configurar') @ApiOperation({ summary: 'Catálogo activo de exámenes y paneles' }) @ApiOkResponse({ type: [LabExamResponse] })
  catalog() { return this.laboratory.catalog(); }

  @Get('ordenes') @RequirePermission('laboratorio.ver_cola', 'resultados.ver') @ApiOperation({ summary: 'Cola de laboratorio o resultados permitidos' }) @ApiOkResponse({ type: [LabOrderResponse] })
  list(@Req() r: ActorRequest) { return this.laboratory.list(r.actor); }

  @Get('ordenes/:id') @RequirePermission('resultados.ver') @ApiOperation({ summary: 'Detalle de una orden: resultados permitidos, motivo de cancelación e historial de correcciones' }) @ApiOkResponse({ type: LabOrderDetailResponse })
  detail(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string) { return this.laboratory.detail(r.actor, id); }

  @Post('ordenes') @RequirePermission('laboratorio.ordenar') @ApiOperation({ summary: 'Crear una orden de laboratorio desde una consulta' }) @ApiCreatedResponse({ type: LabOrderCreatedResponse })
  create(@Req() r: ActorRequest, @Body() dto: LabOrderDto, @Headers('idempotency-key') key?: string) { return this.laboratory.create(r.actor, dto, key); }

  @Post('ordenes/:id/muestra') @RequirePermission('laboratorio.procesar') @ApiOperation({ summary: 'Tomar muestra y pasar la orden a proceso' }) @ApiCreatedResponse({ type: LabSampleResponse })
  sample(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LabSampleDto, @Headers('idempotency-key') key?: string) { return this.laboratory.sample(r.actor, id, dto, key); }

  @Post('ordenes/:id/resultados') @RequirePermission('laboratorio.procesar') @ApiOperation({ summary: 'Capturar o actualizar el resultado de un examen' }) @ApiCreatedResponse({ type: LabResultResponse })
  result(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LabResultDto, @Headers('idempotency-key') key?: string) { return this.laboratory.result(r.actor, id, dto, key); }

  @Post('ordenes/:id/enmendar') @RequirePermission('laboratorio.validar') @ApiOperation({ summary: 'Enmendar un resultado de una orden completada; vuelve a revisión médica' }) @ApiCreatedResponse({ type: LabResultResponse })
  amend(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LabAmendDto, @Headers('idempotency-key') key?: string) { return this.laboratory.amend(r.actor, id, dto, key); }

  @Post('ordenes/:id/completar') @RequirePermission('laboratorio.validar') @ApiOperation({ summary: 'Completar una orden con todos sus resultados' }) @ApiCreatedResponse({ type: LabCompleteResponse })
  complete(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LabVersionDto, @Headers('idempotency-key') key?: string) { return this.laboratory.complete(r.actor, id, dto, key); }

  @Post('ordenes/:id/revisar') @RequirePermission('laboratorio.revisar') @ApiOperation({ summary: 'Revisar y liberar resultados al paciente' }) @ApiCreatedResponse({ type: LabReviewResponse })
  review(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LabVersionDto, @Headers('idempotency-key') key?: string) { return this.laboratory.review(r.actor, id, dto, key); }

  @Post('ordenes/:id/cancelar') @RequirePermission('laboratorio.cancelar') @ApiOperation({ summary: 'Cancelar una orden pendiente o en proceso' }) @ApiCreatedResponse({ type: LabOrderStateResponse })
  cancel(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LabCancelDto, @Headers('idempotency-key') key?: string) { return this.laboratory.cancel(r.actor, id, dto, key); }
}
