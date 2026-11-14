import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { ProblemException } from '../platform/problem';
import { PatientsService } from './patients.service';
import { PatientDetailResponse } from './patients.responses';

/** Spec 102: the authenticated patient's own record. RN-39: an unlinked account sees nothing personal. */
@ApiTags('patients') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('me')
export class MePatientController {
  constructor(private readonly patients: PatientsService) {}
  @Get('paciente') @RequirePermission('pacientes.ver_ficha') @ApiOperation({ summary: 'Ficha del paciente autenticado' }) @ApiOkResponse({ type: PatientDetailResponse })
  mine(@Req() req: ActorRequest) {
    if (!req.actor.patientId) throw new ProblemException('sin_vinculacion', 404, 'Tu cuenta todavía no está vinculada a un expediente.');
    return this.patients.get(req.actor, req.actor.patientId);
  }
}
