import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiGoneResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { LinkRejectDto } from './account-linking.dto';
import { AccountLinkingService } from './account-linking.service';
import { LinkRequestResponse, MyLinkResponse, PendingLinkResponse } from './accounts.responses';

@ApiTags('accounts') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('cuentas')
export class AccountLinkingController {
  constructor(private readonly linking: AccountLinkingService) {}

  // The body is not read: any request, even with the old DUI and birth date, gets the same 410 with what to do instead.
  @Post('vinculacion') @RequirePermission('cuenta.vincular') @ApiOperation({ deprecated: true, summary: 'Retirado: la cuenta se une sola al expediente que tiene su correo verificado. Responde 410 (codigo vinculacion_automatica).' }) @ApiCreatedResponse({ type: LinkRequestResponse, description: 'Ya no se responde; se conserva para los clientes generados con el contrato anterior' }) @ApiGoneResponse({ description: 'La vinculación ahora es automática por correo verificado (codigo vinculacion_automatica)' })
  request() { return this.linking.request(); }

  @Get('vinculaciones') @RequirePermission('cuentas.verificar') @ApiOperation({ deprecated: true, summary: 'Retirado: ya no hay vinculaciones por verificar; responde siempre una lista vacía' }) @ApiOkResponse({ type: [PendingLinkResponse] })
  pending() { return this.linking.pending(); }

  @Post('vinculaciones/:id/aprobar') @RequirePermission('cuentas.verificar') @ApiOperation({ deprecated: true, summary: 'Retirado: aprobar con DUI y nacimiento ya no vincula. Responde 410 (codigo vinculacion_automatica).' }) @ApiCreatedResponse({ type: LinkRequestResponse, description: 'Ya no se responde; se conserva para los clientes generados con el contrato anterior' }) @ApiGoneResponse({ description: 'La vinculación ahora es automática por correo verificado (codigo vinculacion_automatica)' })
  @ApiParam({ name: 'id', type: String, format: 'uuid' }) approve() { return this.linking.approve(); }

  @Post('vinculaciones/:id/rechazar') @RequirePermission('cuentas.verificar') @ApiOperation({ summary: 'Rechazar vinculación con motivo obligatorio' }) @ApiCreatedResponse({ type: LinkRequestResponse })
  reject(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkRejectDto, @Headers('idempotency-key') key?: string) { return this.linking.reject(r.actor, id, dto, key); }
}

/** The patient's app shows whether the account is linked or which email Recepción must write on the record. */
@ApiTags('accounts') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('me')
export class MyLinkController {
  constructor(private readonly linking: AccountLinkingService) {}

  @Get('vinculacion') @RequirePermission('cuenta.vincular') @ApiOperation({ summary: 'Estado de la vinculación automática: si la cuenta ya está unida a su expediente y el correo que Recepción debe anotar en él' }) @ApiOkResponse({ type: MyLinkResponse })
  mine(@Req() r: ActorRequest) { return this.linking.mine(r.actor); }
}
