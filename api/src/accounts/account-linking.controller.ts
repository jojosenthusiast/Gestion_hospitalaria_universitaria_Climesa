import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { LinkApproveDto, LinkRejectDto, LinkRequestDto } from './account-linking.dto';
import { AccountLinkingService } from './account-linking.service';

@ApiTags('accounts') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('cuentas')
export class AccountLinkingController {
  constructor(private readonly linking: AccountLinkingService) {}

  @Post('vinculacion') @RequirePermission('cuenta.vincular') @ApiOperation({ summary: 'El paciente pide vincular su cuenta con DUI y fecha de nacimiento' })
  request(@Req() r: ActorRequest, @Body() dto: LinkRequestDto, @Headers('idempotency-key') key?: string) { return this.linking.request(r.actor, dto, key); }

  @Get('vinculaciones') @RequirePermission('cuentas.verificar') @ApiOperation({ summary: 'Vinculaciones pendientes con el expediente que coincide' })
  pending(@Req() r: ActorRequest) { return this.linking.pending(r.actor); }

  @Post('vinculaciones/:id/aprobar') @RequirePermission('cuentas.verificar') @ApiOperation({ summary: 'Aprobar vinculación tras verificar identidad' })
  approve(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkApproveDto, @Headers('idempotency-key') key?: string) { return this.linking.approve(r.actor, id, dto, key); }

  @Post('vinculaciones/:id/rechazar') @RequirePermission('cuentas.verificar') @ApiOperation({ summary: 'Rechazar vinculación con motivo obligatorio' })
  reject(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: LinkRejectDto, @Headers('idempotency-key') key?: string) { return this.linking.reject(r.actor, id, dto, key); }
}
