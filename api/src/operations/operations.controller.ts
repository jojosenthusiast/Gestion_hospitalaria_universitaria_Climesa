import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth';
import { PermissionGuard } from '../auth';
import { RequirePermission } from '../auth';
import { ActorRequest } from '../platform/actor';
import { DatabaseService } from '../platform/database.service';
import { PersonnelService } from './personnel.service';
import { InfrastructureService } from './infrastructure.service';
import { BedBlockDto, BedTransitionDto, PublishDto, RegistrationDto, ShiftDto, SpaceDto, StaffDto } from './operations.dto';
import { BedBoardResponse, BedCleaningCompletedResponse, BedCleaningRequestedResponse, BedCleaningVerifiedResponse, BedStateResponse, CoverageResponse, HomeDashboardResponse, PublishShiftsResponse, ShiftCatalogResponse, ShiftResponse, ShiftSavedResponse, SpaceResponse, SpecialtyResponse, StaffResponse } from './operations.responses';
import { IdVersionResponse } from '../platform/responses';
@ApiTags('operations') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard,PermissionGuard) @Controller()
export class OperationsController {
  constructor(private readonly people:PersonnelService,private readonly infra:InfrastructureService,private readonly db:DatabaseService) {}
  @Get('inicio') @RequirePermission('sesion.perfil') @ApiOperation({summary:'Resumen permitido para la cuenta actual'}) @ApiOkResponse({ type: HomeDashboardResponse })
  dashboard(@Req() r:ActorRequest){return this.infra.dashboard(r.actor);}
  @Get('personal') @RequirePermission('personal.ver') @ApiOperation({summary:'Directorio de personal con o sin cuenta'}) @ApiOkResponse({ type: [StaffResponse] })
  personnel(@Req() r:ActorRequest){return this.people.list(r.actor);}
  @Get('personal/especialidades') @RequirePermission('personal.ver') @ApiOperation({summary:'Catálogo de especialidades por categoría (tipo de personal)'}) @ApiQuery({name:'categoria',required:false,enum:['medico','enfermero']}) @ApiOkResponse({ type: [SpecialtyResponse] })
  specialties(@Query('categoria') categoria?:string){return this.people.specialties(categoria==='medico'||categoria==='enfermero'?categoria:undefined);}
  @Post('personal') @RequirePermission('personal.gestionar') @ApiOperation({summary:'Registrar personal'}) @ApiCreatedResponse({ type: IdVersionResponse })
  createStaff(@Req() r:ActorRequest,@Body() d:StaffDto,@Headers('idempotency-key') k?:string){return this.people.save(r.actor,null,d,k);}
  @Patch('personal/:id') @RequirePermission('personal.gestionar') @ApiOperation({summary:'Editar o inactivar personal con versión y motivo'}) @ApiOkResponse({ type: IdVersionResponse })
  editStaff(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:StaffDto,@Headers('idempotency-key') k?:string){return this.people.save(r.actor,id,d,k);}
  @Post('personal/:id/inscripciones') @RequirePermission('personal.gestionar') @ApiOperation({summary:'Registrar inscripción profesional con vigencia, versión y motivo'}) @ApiCreatedResponse({ type: IdVersionResponse })
  registerRegistration(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:RegistrationDto,@Headers('idempotency-key') k?:string){return this.people.register(r.actor,id,d,k);}
  @Get('turnos') @RequirePermission('turnos.ver') @ApiOperation({summary:'Consultar la planificación de turnos'}) @ApiOkResponse({ type: [ShiftResponse] })
  shifts(@Req() r:ActorRequest){return this.people.shifts(r.actor);}
  @Get('turnos/catalogo') @RequirePermission('turnos.ver') @ApiOperation({summary:'Catálogo completo de áreas, funciones y personal para filtrar y asignar turnos'}) @ApiOkResponse({ type: ShiftCatalogResponse })
  shiftCatalog(){return this.people.shiftCatalog();}
  @Get('turnos/mios') @RequirePermission('turnos.ver') @ApiOperation({summary:'Turnos publicados de la persona vinculada a la cuenta'}) @ApiOkResponse({ type: [ShiftResponse] })
  myShifts(@Req() r:ActorRequest){return this.people.shifts(r.actor,true);}
  @Get('turnos/cobertura') @RequirePermission('turnos.ver') @ApiOperation({summary:'Huecos de cobertura por área y hora frente al mínimo vigente'}) @ApiQuery({name:'from',type:String,description:'Primer día local, yyyy-MM-dd'}) @ApiQuery({name:'to',type:String,description:'Último día local, yyyy-MM-dd'}) @ApiQuery({name:'areaId',type:String,format:'uuid',required:false}) @ApiOkResponse({ type: CoverageResponse })
  coverage(@Query('from') from='',@Query('to') to='',@Query('areaId') areaId?:string){return this.people.coverage(from,to,areaId);}
  @Post('turnos/publicar') @RequirePermission('turnos.publicar') @ApiOperation({summary:'Publicar los borradores de un rango; con huecos de cobertura advierte y registra quién publicó'}) @ApiCreatedResponse({ type: PublishShiftsResponse })
  publishShifts(@Req() r:ActorRequest,@Body() d:PublishDto,@Headers('idempotency-key') k?:string){return this.people.publish(r.actor,d,k);}
  @Post('turnos') @RequirePermission('turnos.planificar') @ApiOperation({summary:'Planificar turno con duración, traslapes y descanso'}) @ApiCreatedResponse({ type: ShiftSavedResponse })
  createShift(@Req() r:ActorRequest,@Body() d:ShiftDto,@Headers('idempotency-key') k?:string){return this.people.saveShift(r.actor,null,d,k);}
  @Patch('turnos/:id') @RequirePermission('turnos.planificar') @ApiOperation({summary:'Mover o cancelar turno con versión y motivo'}) @ApiOkResponse({ type: ShiftSavedResponse })
  editShift(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:ShiftDto,@Headers('idempotency-key') k?:string){return this.people.saveShift(r.actor,id,d,k);}
  @Get('espacios') @RequirePermission('espacios.ver') @ApiOperation({summary:'Árbol, rutas y disponibilidad recursiva por espacio'}) @ApiOkResponse({ type: [SpaceResponse] })
  spaces(){return this.infra.tree();}
  @Post('espacios') @RequirePermission('espacios.configurar') @ApiOperation({summary:'Crear espacio respetando árbol y capacidad'}) @ApiCreatedResponse({ type: IdVersionResponse })
  createSpace(@Req() r:ActorRequest,@Body() d:SpaceDto,@Headers('idempotency-key') k?:string){return this.infra.save(r.actor,null,d,k);}
  @Patch('espacios/:id') @RequirePermission('espacios.configurar') @ApiOperation({summary:'Editar espacio con versión, capacidad y ocupación'}) @ApiOkResponse({ type: IdVersionResponse })
  editSpace(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:SpaceDto,@Headers('idempotency-key') k?:string){return this.infra.save(r.actor,id,d,k);}
  @Get('camas') @RequirePermission('camas.ver_tablero') @ApiOperation({summary:'Tablero con ocupante filtrado por permiso y área'}) @ApiOkResponse({ type: [BedBoardResponse] })
  beds(@Req() r:ActorRequest){return this.infra.beds(r.actor);}
  @Post('camas/:id/bloquear') @RequirePermission('camas.bloquear') @ApiOperation({summary:'Bloquear una cama libre con motivo y versión'}) @ApiCreatedResponse({ type: BedStateResponse })
  blockBed(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:BedBlockDto,@Headers('idempotency-key') k?:string){return this.infra.blockBed(r.actor,id,d,k);}
  @Post('camas/:id/desbloquear') @RequirePermission('camas.bloquear') @ApiOperation({summary:'Retirar el bloqueo activo con versión y motivo'}) @ApiCreatedResponse({ type: BedStateResponse })
  unblockBed(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:BedTransitionDto,@Headers('idempotency-key') k?:string){return this.infra.unblockBed(r.actor,id,d,k);}
  @Post('camas/:id/limpieza') @RequirePermission('camas.registrar_limpieza') @ApiOperation({summary:'Solicitar limpieza para una cama ocupada'}) @ApiCreatedResponse({ type: BedCleaningRequestedResponse })
  requestBedCleaning(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:BedTransitionDto,@Headers('idempotency-key') k?:string){return this.infra.requestBedCleaning(r.actor,id,d,k);}
  @Post('camas/:id/limpieza/completar') @RequirePermission('camas.registrar_limpieza') @ApiOperation({summary:'Registrar la limpieza realizada con versión y motivo'}) @ApiCreatedResponse({ type: BedCleaningCompletedResponse })
  completeBedCleaning(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:BedTransitionDto,@Headers('idempotency-key') k?:string){return this.infra.completeBedCleaning(r.actor,id,d,k);}
  @Post('camas/:id/limpieza/verificar') @RequirePermission('camas.verificar_limpieza') @ApiOperation({summary:'Verificar la limpieza realizada por otra persona'}) @ApiCreatedResponse({ type: BedCleaningVerifiedResponse })
  verifyBedCleaning(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:BedTransitionDto,@Headers('idempotency-key') k?:string){return this.infra.verifyBedCleaning(r.actor,id,d,k);}
  @Get('eventos') @RequirePermission('sesion.perfil') @ApiOperation({summary:'Eventos delgados de canales autorizados para recuperar cambios tras reconexión'}) @ApiQuery({name:'after',type:String,required:false,description:'Último seq recibido; sin él (o 0) se devuelve solo la cabeza'})
  @ApiOkResponse({description:'Cursor y eventos delgados posteriores',schema:{type:'object',required:['cursor','events'],properties:{cursor:{type:'string'},events:{type:'array',items:{$ref:'#/components/schemas/EventoDelgado'}}}}})
  async events(@Req() r:ActorRequest,@Query('after') after='0'){
    const cursor=/^\d{1,18}$/.test(after)?after:'0';
    // Sin cursor (o "0") el cliente no tiene punto de partida: se le da la cabeza actual y ningún evento viejo.
    // Al reconectar ya invalida todas sus vistas, así que no necesita el historial.
    if(cursor==='0'){
      const head=(await this.db.query<{head:string|null}>('SELECT max(seq)::text AS head FROM plataforma.outbox'))[0]?.head??'0';
      return {cursor:head,events:[]};
    }
    // DAT-06: same shape as the live broadcast (EventoDelgado); `type`/`entity` stay as deprecated aliases while clients migrate.
    const events=await this.db.query<{seq:string}>('SELECT o.seq::text AS seq,o.tipo,o.entidad,o.entidad_id AS id,o.version,o.ocurrido_en AS ocurrido,o.tipo AS type,o.entidad AS entity FROM plataforma.outbox o WHERE o.seq>$1 AND o.canales && $2::text[] ORDER BY o.seq LIMIT 200',[cursor,r.actor.channels]);
    return {cursor:events.at(-1)?.seq??cursor,events};
  }
}
