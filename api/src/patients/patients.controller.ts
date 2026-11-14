import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth';
import { PermissionGuard } from '../auth';
import { RequirePermission } from '../auth';
import { ActorRequest } from '../platform/actor';
import { PatientSearchDto, PatientSearchQueryDto } from './patient.dto';
import { PatientCreateDto, PatientUpdateDto, PatientStateDto } from './patient-write.dto';
import { PatientsService } from './patients.service';
import { DuplicateCaseResponse, PatientCandidateResponse, PatientCreatedResponse, PatientDetailResponse, PatientSearchRecordResponse, PatientStateResponse } from './patients.responses';
import { IdVersionResponse } from '../platform/responses';
@ApiTags('patients')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, PermissionGuard)
@Controller('pacientes')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}
  @Get() @RequirePermission('pacientes.buscar') @ApiOperation({summary:'Buscar por nombre, fonética, DUI o expediente; devuelve campos mínimos'}) @ApiOkResponse({ type: [PatientCandidateResponse] })
  search(@Req() req:ActorRequest,@Query() q:PatientSearchQueryDto) { return this.patients.search(req.actor,q.query,q.limit); }
  @Post('busquedas') @RequirePermission('pacientes.buscar') @ApiOperation({summary:'Buscar y obtener constancia de diez minutos, ligada a la cuenta y criterios'}) @ApiCreatedResponse({ type: PatientSearchRecordResponse })
  recordSearch(@Req() req:ActorRequest,@Body() dto:PatientSearchDto) { return this.patients.recordSearch(req.actor,dto.query); }
  @Get('casos-duplicado') @RequirePermission('pacientes.gestionar_duplicados') @ApiOperation({summary:'Casos abiertos de posible duplicado con los dos pacientes mínimos'}) @ApiOkResponse({ type: [DuplicateCaseResponse] })
  duplicateCases(@Req() req:ActorRequest,@Query() q:PatientSearchQueryDto) { return this.patients.duplicateCases(req.actor,q.limit); }
  @Get(':id') @RequirePermission('pacientes.ver_ficha') @ApiOperation({summary:'Ficha filtrada por rol y relación de atención'}) @ApiOkResponse({ type: PatientDetailResponse })
  get(@Req() req:ActorRequest,@Param('id',ParseUUIDPipe) id:string) { return this.patients.get(req.actor,id); }
  @Post() @RequirePermission('pacientes.registrar') @ApiOperation({summary:'Registrar después de buscar; expediente y DUI exclusivos'}) @ApiCreatedResponse({ type: PatientCreatedResponse })
  create(@Req() req:ActorRequest,@Body() dto:PatientCreateDto,@Headers('idempotency-key') key?:string) { return this.patients.create(req.actor,dto,key); }
  @Post('provisionales') @RequirePermission('pacientes.registrar_provisional') @ApiOperation({summary:'Registrar identidad provisional sin inventar fecha exacta'}) @ApiCreatedResponse({ type: PatientCreatedResponse })
  provisional(@Req() req:ActorRequest,@Body() dto:PatientCreateDto,@Headers('idempotency-key') key?:string) { return this.patients.create(req.actor,{...dto,provisional:true},key); }
  @Patch(':id') @RequirePermission('pacientes.editar_demograficos') @ApiOperation({summary:'Corregir ficha con versión, motivo e historial'}) @ApiOkResponse({ type: IdVersionResponse })
  update(@Req() req:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:PatientUpdateDto,@Headers('idempotency-key') key?:string) { return this.patients.update(req.actor,id,dto,key); }
  @Post(':id/estado') @RequirePermission('pacientes.editar_demograficos') @ApiOperation({summary:'Inactivar o reactivar sin eliminar historial'}) @ApiCreatedResponse({ type: PatientStateResponse })
  state(@Req() req:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() dto:PatientStateDto,@Headers('idempotency-key') key?:string) { return this.patients.setState(req.actor,id,dto,key); }
}
