import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequireCatalogPermission, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { AuditQueryDto, ExceptionalAccessApproveDto, ExceptionalAccessDenyDto, ExceptionalAccessQueryDto, ExceptionalAccessRequestDto } from './privacy.dto';
import { PrivacyService } from './privacy.service';

/** Spec 110: exceptional access, audit search and chain verification, and "who saw my record". */
@ApiTags('privacy') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller()
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Post('accesos-excepcionales') @RequirePermission('privacidad.solicitar_acceso') @ApiOperation({ summary: 'Pedir acceso excepcional con motivo y duración (o de urgencia, pendiente de revisión)' })
  request(@Req() r: ActorRequest, @Body() d: ExceptionalAccessRequestDto, @Headers('idempotency-key') k?: string) { return this.privacy.request(r.actor, d, k); }

  @Post('accesos-excepcionales/:id/aprobar') @RequirePermission('privacidad.aprobar_acceso') @ApiOperation({ summary: 'Aprobar un acceso excepcional (nunca el propio) o confirmar uno de urgencia' })
  approve(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: ExceptionalAccessApproveDto, @Headers('idempotency-key') k?: string) { return this.privacy.approve(r.actor, id, d, k); }

  @Post('accesos-excepcionales/:id/negar') @RequirePermission('privacidad.aprobar_acceso') @ApiOperation({ summary: 'Negar un acceso excepcional o cerrar uno de urgencia' })
  deny(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: ExceptionalAccessDenyDto, @Headers('idempotency-key') k?: string) { return this.privacy.deny(r.actor, id, d, k); }

  @Get('accesos-excepcionales') @RequireCatalogPermission('privacidad.aprobar_acceso', 'privacidad.solicitar_acceso') @ApiOperation({ summary: 'Solicitudes de acceso excepcional; el solicitante ve solo las suyas' })
  list(@Req() r: ActorRequest, @Query() q: ExceptionalAccessQueryDto) { return this.privacy.list(r.actor, q); }

  @Get('auditoria') @RequirePermission('auditoria.ver') @ApiOperation({ summary: 'Metadatos de auditoría por persona, paciente, acción y fecha; no contiene valores clínicos' })
  audit(@Req() r: ActorRequest, @Query() q: AuditQueryDto) { return this.privacy.audit(r.actor, q); }

  @Post('auditoria/verificacion') @RequirePermission('auditoria.ver') @ApiOperation({ summary: 'Verificar la integridad de la cadena de hash de la auditoría' })
  verify(@Req() r: ActorRequest) { return this.privacy.verify(r.actor); }

  @Get('me/accesos') @RequirePermission('auditoria.mis_accesos') @ApiOperation({ summary: 'Quién vio mi expediente: fecha, rol y motivo, sin nombres del personal' })
  mine(@Req() r: ActorRequest) { return this.privacy.myAccesses(r.actor); }
}
