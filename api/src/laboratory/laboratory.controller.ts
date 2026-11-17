import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { readSingleFile } from '../platform/multipart';
import { MAX_ATTACHMENT_BYTES, LabAmendDto, LabCancelDto, LabExternalResultDto, LabFollowUpReviewDto, LabOrderDto, LabProposalConfirmDto, LabProposalDiscardDto, LabResultDto, LabSampleDto, LabSendExternalDto, LabVersionDto } from './laboratory.dto';
import { LaboratoryService } from './laboratory.service';
import { LabAttachmentLinkResponse, LabAttachmentStoredResponse, LabCompleteResponse, LabExamResponse, LabExternalResultResponse, LabExternalSentResponse, LabFollowUpResponse, LabFollowUpStateResponse, LabOrderCreatedResponse, LabOrderDetailResponse, LabOrderResponse, LabOrderStateResponse, LabProposalResponse, LabProposalStateResponse, LabResultResponse, LabReviewResponse, LabSampleResponse } from './laboratory.responses';

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

  @Post('ordenes/:id/externa') @RequirePermission('laboratorio.procesar', 'laboratorio.ordenar') @ApiOperation({ summary: 'Enviar una orden pendiente a externo (no disponible hoy o se realiza en otro sitio) con lugar e instrucciones para el paciente' }) @ApiCreatedResponse({ type: LabExternalSentResponse })
  sendExternal(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LabSendExternalDto, @Headers('idempotency-key') key?: string) { return this.laboratory.sendExternal(r.actor, id, dto, key); }

  @Post('ordenes/:id/resultado-externo') @RequirePermission('laboratorio.procesar', 'laboratorio.revisar') @ApiOperation({ summary: 'Cargar el resultado de una orden externa: referencia del adjunto (foto o PDF) y valor clave de cada examen; completa la orden' }) @ApiCreatedResponse({ type: LabExternalResultResponse })
  externalResult(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LabExternalResultDto, @Headers('idempotency-key') key?: string) { return this.laboratory.externalResult(r.actor, id, dto, key); }

  @Post('adjuntos/:id/archivo') @RequirePermission('laboratorio.procesar', 'laboratorio.revisar') @ApiOperation({ summary: 'Subir la foto o el PDF de un adjunto que solo tiene la referencia (T07b): bucket privado, tipo leído del contenido, huella SHA-256 calculada en el servidor; no reemplaza un archivo guardado' })
  @ApiConsumes('multipart/form-data') @ApiBody({ schema: { type: 'object', required: ['archivo'], properties: { archivo: { type: 'string', format: 'binary', description: 'PDF, JPG, PNG, HEIC o WEBP de hasta 10 MB' } } } }) @ApiCreatedResponse({ type: LabAttachmentStoredResponse })
  async storeAttachment(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Headers('idempotency-key') key?: string) {
    return this.laboratory.storeAttachment(r.actor, id, await readSingleFile(r, 'archivo', MAX_ATTACHMENT_BYTES), key);
  }

  @Get('adjuntos/:id/enlace') @RequirePermission('resultados.ver') @ApiOperation({ summary: 'Enlace firmado de 5 minutos para descargar un adjunto (T07b); solo personal que ve los valores de la orden, nunca el paciente; cada enlace queda auditado' }) @ApiOkResponse({ type: LabAttachmentLinkResponse })
  attachmentLink(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string) { return this.laboratory.attachmentLink(r.actor, id); }

  @Get('pendientes') @RequirePermission('laboratorio.revisar') @ApiOperation({ summary: 'Resultados por revisar: pendientes de seguimiento (valor crítico u observación relevante) de las órdenes que pidió quien lee' }) @ApiOkResponse({ type: [LabFollowUpResponse] })
  followUps(@Req() r: ActorRequest) { return this.laboratory.followUps(r.actor); }

  @Post('pendientes/:id/revisar') @RequirePermission('laboratorio.revisar') @ApiOperation({ summary: 'Marcar como revisado un pendiente de seguimiento' }) @ApiCreatedResponse({ type: LabFollowUpStateResponse })
  reviewFollowUp(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LabFollowUpReviewDto, @Headers('idempotency-key') key?: string) { return this.laboratory.reviewFollowUp(r.actor, id, dto, key); }

  @Get('seguimientos') @RequirePermission('citas.agendar') @ApiOperation({ summary: 'Citas de seguimiento propuestas al llegar resultados, por confirmar en recepción (sin exámenes ni valores)' }) @ApiOkResponse({ type: [LabProposalResponse] })
  proposals() { return this.laboratory.proposals(); }

  @Post('seguimientos/:id/confirmar') @RequirePermission('citas.agendar') @ApiOperation({ summary: 'Confirmar una propuesta de seguimiento con la cita agendada (POST /citas)' }) @ApiCreatedResponse({ type: LabProposalStateResponse })
  confirmProposal(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LabProposalConfirmDto, @Headers('idempotency-key') key?: string) { return this.laboratory.confirmProposal(r.actor, id, dto, key); }

  @Post('seguimientos/:id/descartar') @RequirePermission('citas.agendar') @ApiOperation({ summary: 'Descartar una propuesta de seguimiento con motivo' }) @ApiCreatedResponse({ type: LabProposalStateResponse })
  discardProposal(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LabProposalDiscardDto, @Headers('idempotency-key') key?: string) { return this.laboratory.discardProposal(r.actor, id, dto, key); }
}
