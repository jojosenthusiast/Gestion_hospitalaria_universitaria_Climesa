import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { AdmissionDto, AuthorizationDto, BedAssignmentDto, BedSuggestionQuery, DischargeDto, ExitDto, NursingNoteDto, TransferDto } from './hospitalization.dto';
import { HospitalizationService } from './hospitalization.service';
import { AdmissionCommandResponse, AdmissionExitResponse, AdmissionResponse, BedAssignmentResponse, BedMapResponse, BedSuggestionResponse, DoctorAvailabilityResponse, FeasibilityResponse, NursingNoteResponse, OriginOptionResponse } from './hospitalization.responses';
import { AdmissionIntakeService } from './admission-intake.service';
import { FeasibilityQuery, MapQuery, OriginsQuery, ShiftQuery } from './admission-intake.dto';
import { IdVersionResponse } from '../platform/responses';

@ApiTags('hospitalization') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard, PermissionGuard) @Controller('admisiones')
export class HospitalizationController {
  constructor(private readonly service: HospitalizationService, private readonly intake: AdmissionIntakeService) {}
  // Ingreso guiado: lecturas de apoyo. Van antes de las rutas con `:id`.
  @Get('origenes') @RequirePermission('admision.crear') @ApiOperation({ summary: 'Registros recientes del paciente que pueden originar el ingreso' }) @ApiOkResponse({ type: [OriginOptionResponse] }) origins(@Req() r: ActorRequest, @Query() q: OriginsQuery) { return this.intake.origins(r.actor, q); }
  @Get('medicos-disponibles') @RequirePermission('admision.crear') @ApiOperation({ summary: 'Médicos con su disponibilidad (turno) en el instante de ingreso' }) @ApiOkResponse({ type: [DoctorAvailabilityResponse] }) doctors(@Req() r: ActorRequest, @Query() q: ShiftQuery) { return this.intake.doctors(r.actor, q); }
  @Get('mapa-camas') @RequirePermission('admision.crear') @ApiOperation({ summary: 'Camas por planta y habitación con su compatibilidad para el paciente' }) @ApiOkResponse({ type: BedMapResponse }) bedMap(@Req() r: ActorRequest, @Query() q: MapQuery) { return this.intake.bedMap(r.actor, q); }
  @Get('factibilidad') @RequirePermission('admision.crear') @ApiOperation({ summary: 'Comprobación previa a confirmar el ingreso (sin escribir)' }) @ApiOkResponse({ type: FeasibilityResponse }) feasibility(@Req() r: ActorRequest, @Query() q: FeasibilityQuery) { return this.intake.feasibility(r.actor, q); }
  @Get() @RequirePermission('admision.ver') @ApiOperation({ summary: 'Admisiones visibles para el actor' }) @ApiOkResponse({ type: [AdmissionResponse] }) list(@Req() r: ActorRequest) { return this.service.list(r.actor); }
  @Post() @RequirePermission('admision.crear') @ApiOperation({ summary: 'Crear una admisión' }) @ApiCreatedResponse({ type: AdmissionCommandResponse }) create(@Req() r: ActorRequest, @Body() d: AdmissionDto, @Headers('idempotency-key') k?: string) { return this.service.create(r.actor, d, k); }
  @Get(':id/sugerencias-cama') @RequirePermission('camas.asignar') @ApiOkResponse({ type: [BedSuggestionResponse] }) suggestions(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Query() q: BedSuggestionQuery) { return this.service.suggestions(r.actor, id, q); }
  @Post(':id/cama') @RequirePermission('camas.asignar') @ApiCreatedResponse({ type: BedAssignmentResponse }) assignBed(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: BedAssignmentDto, @Headers('idempotency-key') k?: string) { return this.service.assignBed(r.actor, id, d, k); }
  @Post(':id/autorizar') @RequirePermission('admision.autorizar') @ApiCreatedResponse({ type: IdVersionResponse }) authorize(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: AuthorizationDto, @Headers('idempotency-key') k?: string) { return this.service.authorize(r.actor, id, d, k); }
  @Post(':id/notas-enfermeria') @RequirePermission('enfermeria.registrar') @ApiCreatedResponse({ type: NursingNoteResponse }) note(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: NursingNoteDto, @Headers('idempotency-key') k?: string) { return this.service.note(r.actor, id, d, k); }
  @Post(':id/alta') @RequirePermission('alta.firmar') @ApiCreatedResponse({ type: AdmissionCommandResponse }) discharge(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: DischargeDto, @Headers('idempotency-key') k?: string) { return this.service.discharge(r.actor, id, d, k); }
  @Post(':id/salida') @RequirePermission('admision.registrar_salida') @ApiCreatedResponse({ type: AdmissionExitResponse }) exit(@Req() r: ActorRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: ExitDto, @Headers('idempotency-key') k?: string) { return this.service.exit(r.actor, id, d, k); }
  @Post('indicaciones') @RequirePermission('admision.solicitar') @ApiCreatedResponse({ type: AdmissionCommandResponse }) indication(@Req() r: ActorRequest, @Body() d: AdmissionDto, @Headers('idempotency-key') k?: string) { return this.service.createIndication(r.actor, d, k); }
}
