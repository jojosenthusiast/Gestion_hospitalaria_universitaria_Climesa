import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { QueueCallNextDto, QueueIssueDto, QueuePriorityDto, QueueTransitionDto, QueueUndoDto, QueueVoidDto } from './queue.dto';
import { QueueService } from './queue.service';
import { QueueCallNextResponse, QueueCallResponse, QueueIssuedResponse, QueueMyPostResponse, QueueNextProposalResponse, QueuePriorityResponse, QueueTicketResponse, QueueTransitionResponse } from './attention.responses';

@ApiTags('queue') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('fila')
export class QueueController {
  constructor(private readonly queue: QueueService) {}

  @Get() @RequirePermission('fila.ver') @ApiOperation({ summary: 'Consultar la fila del día' })
  @ApiQuery({ name: 'date', type: String, required: false, description: 'Día local, yyyy-MM-dd; por omisión hoy' }) @ApiQuery({ name: 'service', type: String, required: false }) @ApiOkResponse({ type: [QueueTicketResponse] })
  list(@Req() r: ActorRequest, @Query('date') date?: string, @Query('service') service?: string) { return this.queue.list(r.actor, date, service); }

  @Post() @RequirePermission('fila.emitir') @ApiOperation({ summary: 'Emitir un número para el paciente actual o indicado' }) @ApiCreatedResponse({ type: QueueIssuedResponse })
  issue(@Req() r: ActorRequest, @Body() dto: QueueIssueDto, @Headers('idempotency-key') key?: string) { return this.queue.issue(r.actor, dto, key); }

  @Post('llamar-siguiente') @RequirePermission('fila.llamar') @ApiOperation({ summary: 'Llamar al siguiente según RN-FILA-SIGUIENTE (emergencias, urgentes, citas en su ventana y luego orden de llegada)' }) @ApiCreatedResponse({ type: QueueCallNextResponse })
  callNext(@Req() r: ActorRequest, @Body() dto: QueueCallNextDto, @Headers('idempotency-key') key?: string) { return this.queue.callNext(r.actor, dto, key); }

  @Get('siguiente') @RequirePermission('fila.ver') @ApiOperation({ summary: 'Quién pasa después en un servicio (regla RN-FILA-SIGUIENTE)' })
  @ApiQuery({ name: 'service', type: String, required: true }) @ApiOkResponse({ type: QueueNextProposalResponse })
  next(@Req() r: ActorRequest, @Query('service') service?: string) { return this.queue.proposal(r.actor, service); }

  @Get('mi-puesto') @RequirePermission('fila.llamar') @ApiOperation({ summary: 'Servicio y consultorio de quien llama, según su turno en curso (B-5): "Llamar siguiente" sin elegir servicio' }) @ApiOkResponse({ type: QueueMyPostResponse })
  myPost(@Req() r: ActorRequest) { return this.queue.myPost(r.actor); }

  @Post(':id/anular') @RequirePermission('fila.emitir') @ApiOperation({ summary: 'Anular un número recién emitido por error: solo quien lo emitió, mientras espera y dentro de 10 minutos (B-3)' }) @ApiCreatedResponse({ type: QueueTransitionResponse })
  voidIssued(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QueueVoidDto, @Headers('idempotency-key') key?: string) { return this.queue.voidIssued(r.actor, id, dto, key); }

  @Post(':id/deshacer-llamado') @RequirePermission('fila.llamar') @ApiOperation({ summary: 'Deshacer el último llamado de un número' }) @ApiCreatedResponse({ type: QueueCallResponse })
  undoCall(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QueueUndoDto, @Headers('idempotency-key') key?: string) { return this.queue.undoCall(r.actor, id, dto, key); }

  @Post(':id/prioridad') @RequirePermission('fila.gestionar') @ApiOperation({ summary: 'Cambiar la prioridad de un número antes de la atención' }) @ApiCreatedResponse({ type: QueuePriorityResponse })
  priority(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QueuePriorityDto, @Headers('idempotency-key') key?: string) { return this.queue.setPriority(r.actor, id, dto, key); }

  @Post(':id/llamar') @RequirePermission('fila.llamar') @ApiOperation({ summary: 'Llamar un número de fila' }) @ApiCreatedResponse({ type: QueueCallResponse })
  call(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QueueTransitionDto, @Headers('idempotency-key') key?: string) { return this.queue.call(r.actor, id, dto, key); }

  @Post(':id/atender') @RequirePermission('fila.gestionar') @ApiOperation({ summary: 'Pasar un número llamado a atención' }) @ApiCreatedResponse({ type: QueueTransitionResponse })
  attend(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QueueTransitionDto, @Headers('idempotency-key') key?: string) { return this.queue.transition(r.actor, id, 'en_atencion', dto, key); }

  @Post(':id/completar') @RequirePermission('fila.gestionar') @ApiOperation({ summary: 'Marcar un número como atendido' }) @ApiCreatedResponse({ type: QueueTransitionResponse })
  complete(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QueueTransitionDto, @Headers('idempotency-key') key?: string) { return this.queue.transition(r.actor, id, 'atendido', dto, key); }

  @Post(':id/no-se-presento') @RequirePermission('fila.gestionar') @ApiOperation({ summary: 'Marcar que el paciente no se presentó' }) @ApiCreatedResponse({ type: QueueTransitionResponse })
  absent(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QueueTransitionDto, @Headers('idempotency-key') key?: string) { return this.queue.transition(r.actor, id, 'no_se_presento', dto, key); }
}

