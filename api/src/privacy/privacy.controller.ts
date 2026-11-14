import { Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { AuditQueryDto } from './privacy.dto';
import { PrivacyService } from './privacy.service';
import { AuditEntryResponse, AuditVerificationResponse, MyAccessResponse } from './privacy.responses';

/** Spec 110: audit search and chain verification, and "who saw my record". */
@ApiTags('privacy') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller()
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  @Get('auditoria') @RequirePermission('auditoria.ver') @ApiOperation({ summary: 'Metadatos de auditoría por persona, paciente, acción y fecha; no contiene valores clínicos' }) @ApiOkResponse({ type: [AuditEntryResponse] })
  audit(@Req() r: ActorRequest, @Query() q: AuditQueryDto) { return this.privacy.audit(r.actor, q); }

  @Post('auditoria/verificacion') @RequirePermission('auditoria.ver') @ApiOperation({ summary: 'Verificar la integridad de la cadena de hash de la auditoría' }) @ApiCreatedResponse({ type: AuditVerificationResponse })
  verify(@Req() r: ActorRequest) { return this.privacy.verify(r.actor); }

  @Get('me/accesos') @RequirePermission('auditoria.mis_accesos') @ApiOperation({ summary: 'Quién vio mi expediente: fecha, rol y motivo, sin nombres del personal' }) @ApiOkResponse({ type: [MyAccessResponse] })
  mine(@Req() r: ActorRequest) { return this.privacy.myAccesses(r.actor); }
}
