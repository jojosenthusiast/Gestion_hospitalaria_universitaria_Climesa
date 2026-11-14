import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PermissionGuard, RequirePermission, SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { AmbulanceService, LogFilters } from './ambulance.service';
import { AmbulanceRequestDto, DiscardRequestDto, DispatchDto, LocationDto, MaintenanceDto, MilestoneDto, PrehospitalDto } from './ambulance.dto';
import { AmbulanceRequestCreatedResponse, AmbulanceRequestStateResponse, AmbulanceStatusResponse, AmbulanceUnitStateResponse, DispatchResponse, LocationRecordedResponse, MilestoneResponse, PrehospitalCreatedResponse, PrehospitalViewResponse, ServiceLogEntryResponse } from './ambulance.responses';

/** Spec 109: rutas de `endpoints.csv`, cada una con su permiso de `permisos.csv`. */
@ApiTags('ambulancia') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard,PermissionGuard) @Controller('ambulancia')
export class AmbulanceController {
  constructor(private readonly ambulance:AmbulanceService) {}
  @Get() @RequirePermission('ambulancia.ver_estado') @ApiOperation({summary:'Estado de la unidad, servicio activo con hitos y, para despacho, solicitudes por confirmar'}) @ApiOkResponse({ type: AmbulanceStatusResponse })
  status(@Req() r:ActorRequest){return this.ambulance.status(r.actor);}
  @Post('mantenimiento') @RequirePermission('ambulancia.mantenimiento') @ApiOperation({summary:'Entrar o salir de mantenimiento; salir exige paramédico con turno en curso'}) @ApiCreatedResponse({ type: AmbulanceUnitStateResponse })
  maintenance(@Req() r:ActorRequest,@Body() d:MaintenanceDto,@Headers('idempotency-key') k?:string){return this.ambulance.setMaintenance(r.actor,d,k);}
  @Post('solicitudes') @RequirePermission('ambulancia.solicitar') @ApiOperation({summary:'Solicitar ambulancia; queda por confirmar (paciente verificado o recepción por teléfono)'}) @ApiCreatedResponse({ type: AmbulanceRequestCreatedResponse })
  request(@Req() r:ActorRequest,@Body() d:AmbulanceRequestDto,@Headers('idempotency-key') k?:string){return this.ambulance.request(r.actor,d,k);}
  @Post('solicitudes/:id/descartar') @RequirePermission('ambulancia.despachar') @ApiOperation({summary:'Descartar una solicitud por confirmar con motivo'}) @ApiCreatedResponse({ type: AmbulanceRequestStateResponse })
  discard(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:DiscardRequestDto,@Headers('idempotency-key') k?:string){return this.ambulance.discard(r.actor,id,d,k);}
  @Post('servicios') @RequirePermission('ambulancia.despachar') @ApiOperation({summary:'Despachar: solo si la unidad está Disponible; la pasa a En Servicio en la misma transacción'}) @ApiCreatedResponse({ type: DispatchResponse })
  dispatch(@Req() r:ActorRequest,@Body() d:DispatchDto,@Headers('idempotency-key') k?:string){return this.ambulance.dispatch(r.actor,d,k);}
  @Post('servicios/:id/hitos') @RequirePermission('ambulancia.operar') @ApiOperation({summary:'Registrar hito en orden: salida, en escena, trasladando, en hospital, finalizado'}) @ApiCreatedResponse({ type: MilestoneResponse })
  milestone(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:MilestoneDto,@Headers('idempotency-key') k?:string){return this.ambulance.milestone(r.actor,id,d,k);}
  @Post('servicios/:id/prehospital') @RequirePermission('ambulancia.reportar_prehospital') @ApiOperation({summary:'Reporte prehospital; el reenvío con la misma Idempotency-Key no duplica'}) @ApiCreatedResponse({ type: PrehospitalCreatedResponse })
  prehospital(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:PrehospitalDto,@Headers('idempotency-key') k?:string){return this.ambulance.prehospital(r.actor,id,d,k);}
  @Get('servicios/:id/prehospital') @RequirePermission('ambulancia.recibir_prehospital') @ApiOperation({summary:'Ver el reporte prehospital; el contenido clínico solo con relación de atención'}) @ApiOkResponse({ type: PrehospitalViewResponse })
  readPrehospital(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string){return this.ambulance.readPrehospital(r.actor,id);}
  @Post('ubicacion') @RequirePermission('ambulancia.operar') @ApiOperation({summary:'Ubicación en vivo de la tripulación; solo con servicio activo'}) @ApiCreatedResponse({ type: LocationRecordedResponse })
  location(@Req() r:ActorRequest,@Body() d:LocationDto,@Headers('idempotency-key') k?:string){return this.ambulance.location(r.actor,d,k);}
  @Get('bitacora') @RequirePermission('ambulancia.ver_bitacora') @ApiOperation({summary:'Bitácora filtrable (D-056); sin datos del paciente (solo el expediente enmascarado)'})
  @ApiQuery({name:'from',type:String,required:false,description:'Primer día local, yyyy-MM-dd'}) @ApiQuery({name:'to',type:String,required:false,description:'Último día local, yyyy-MM-dd'})
  @ApiQuery({name:'type',type:String,required:false}) @ApiQuery({name:'finalState',type:String,required:false}) @ApiQuery({name:'priority',type:String,required:false})
  @ApiQuery({name:'crewId',type:String,required:false}) @ApiQuery({name:'municipality',type:String,required:false}) @ApiQuery({name:'minResponseMinutes',type:Number,required:false}) @ApiQuery({name:'q',type:String,required:false,description:'Texto libre sin acentos: origen, destino, municipio o tripulación'}) @ApiOkResponse({ type: [ServiceLogEntryResponse] })
  log(@Req() r:ActorRequest,@Query() q:LogFilters){return this.ambulance.log(r.actor,q);}
}
