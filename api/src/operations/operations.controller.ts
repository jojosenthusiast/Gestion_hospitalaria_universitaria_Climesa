import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth';
import { PermissionGuard } from '../auth';
import { RequirePermission } from '../auth';
import { ActorRequest } from '../platform/actor';
import { DatabaseService } from '../platform/database.service';
import { PersonnelService } from './personnel.service';
import { InfrastructureService } from './infrastructure.service';
import { BedBlockDto, BedTransitionDto, RegistrationDto, ShiftDto, SpaceDto, StaffDto } from './operations.dto';
@ApiTags('operations') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard,PermissionGuard) @Controller()
export class OperationsController {
  constructor(private readonly people:PersonnelService,private readonly infra:InfrastructureService,private readonly db:DatabaseService) {}
  @Get('inicio') @RequirePermission('sesion.perfil') @ApiOperation({summary:'Resumen permitido para la cuenta actual'})
  dashboard(@Req() r:ActorRequest){return this.infra.dashboard(r.actor);}
  @Get('personal') @RequirePermission('personal.ver') @ApiOperation({summary:'Directorio de personal con o sin cuenta'})
  personnel(@Req() r:ActorRequest){return this.people.list(r.actor);}
  @Post('personal') @RequirePermission('personal.gestionar') @ApiOperation({summary:'Registrar personal'})
  createStaff(@Req() r:ActorRequest,@Body() d:StaffDto,@Headers('idempotency-key') k?:string){return this.people.save(r.actor,null,d,k);}
  @Patch('personal/:id') @RequirePermission('personal.gestionar') @ApiOperation({summary:'Editar o inactivar personal con versión y motivo'})
  editStaff(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:StaffDto,@Headers('idempotency-key') k?:string){return this.people.save(r.actor,id,d,k);}
  @Post('personal/:id/inscripciones') @RequirePermission('personal.gestionar') @ApiOperation({summary:'Registrar inscripción profesional con vigencia, versión y motivo'})
  registerRegistration(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:RegistrationDto,@Headers('idempotency-key') k?:string){return this.people.register(r.actor,id,d,k);}
  @Get('turnos') @RequirePermission('turnos.ver') @ApiOperation({summary:'Consultar la planificación de turnos'})
  shifts(@Req() r:ActorRequest){return this.people.shifts(r.actor);}
  @Get('turnos/mios') @RequirePermission('turnos.ver') @ApiOperation({summary:'Turnos publicados de la persona vinculada a la cuenta'})
  myShifts(@Req() r:ActorRequest){return this.people.shifts(r.actor,true);}
  @Post('turnos') @RequirePermission('turnos.planificar') @ApiOperation({summary:'Planificar turno con duración, traslapes y descanso'})
  createShift(@Req() r:ActorRequest,@Body() d:ShiftDto,@Headers('idempotency-key') k?:string){return this.people.saveShift(r.actor,null,d,k);}
  @Patch('turnos/:id') @RequirePermission('turnos.planificar') @ApiOperation({summary:'Mover o cancelar turno con versión y motivo'})
  editShift(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:ShiftDto,@Headers('idempotency-key') k?:string){return this.people.saveShift(r.actor,id,d,k);}
  @Get('espacios') @RequirePermission('espacios.ver') @ApiOperation({summary:'Árbol, rutas y disponibilidad recursiva por espacio'})
  spaces(){return this.infra.tree();}
  @Post('espacios') @RequirePermission('espacios.configurar') @ApiOperation({summary:'Crear espacio respetando árbol y capacidad'})
  createSpace(@Req() r:ActorRequest,@Body() d:SpaceDto,@Headers('idempotency-key') k?:string){return this.infra.save(r.actor,null,d,k);}
  @Patch('espacios/:id') @RequirePermission('espacios.configurar') @ApiOperation({summary:'Editar espacio con versión, capacidad y ocupación'})
  editSpace(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:SpaceDto,@Headers('idempotency-key') k?:string){return this.infra.save(r.actor,id,d,k);}
  @Get('camas') @RequirePermission('camas.ver_tablero') @ApiOperation({summary:'Tablero con ocupante filtrado por permiso y área'})
  beds(@Req() r:ActorRequest){return this.infra.beds(r.actor);}
  @Post('camas/:id/bloquear') @RequirePermission('camas.bloquear') @ApiOperation({summary:'Bloquear una cama libre con motivo y versión'})
  blockBed(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:BedBlockDto,@Headers('idempotency-key') k?:string){return this.infra.blockBed(r.actor,id,d,k);}
  @Post('camas/:id/desbloquear') @RequirePermission('camas.bloquear') @ApiOperation({summary:'Retirar el bloqueo activo con versión y motivo'})
  unblockBed(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:BedTransitionDto,@Headers('idempotency-key') k?:string){return this.infra.unblockBed(r.actor,id,d,k);}
  @Post('camas/:id/limpieza') @RequirePermission('camas.registrar_limpieza') @ApiOperation({summary:'Solicitar limpieza para una cama ocupada'})
  requestBedCleaning(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:BedTransitionDto,@Headers('idempotency-key') k?:string){return this.infra.requestBedCleaning(r.actor,id,d,k);}
  @Post('camas/:id/limpieza/completar') @RequirePermission('camas.registrar_limpieza') @ApiOperation({summary:'Registrar la limpieza realizada con versión y motivo'})
  completeBedCleaning(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:BedTransitionDto,@Headers('idempotency-key') k?:string){return this.infra.completeBedCleaning(r.actor,id,d,k);}
  @Post('camas/:id/limpieza/verificar') @RequirePermission('camas.verificar_limpieza') @ApiOperation({summary:'Verificar la limpieza realizada por otra persona'})
  verifyBedCleaning(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:BedTransitionDto,@Headers('idempotency-key') k?:string){return this.infra.verifyBedCleaning(r.actor,id,d,k);}
  @Get('auditoria') @RequirePermission('auditoria.ver') @ApiOperation({summary:'Metadatos de auditoría; no contiene valores clínicos'})
  audit(){return this.db.query('SELECT a.seq,a.registrado_en AS at,a.actor_rol AS role,u.nombre_mostrar AS actor,a.accion AS action,a.entidad AS entity,a.entidad_id AS "entityId",a.resultado AS result,a.motivo AS reason FROM plataforma.auditoria a LEFT JOIN acceso.usuario u ON u.id=a.actor_id ORDER BY a.seq DESC LIMIT 100');}
  @Get('eventos') @RequirePermission('sesion.perfil') @ApiOperation({summary:'Eventos delgados de canales autorizados para recuperar cambios tras reconexión'})
  async events(@Req() r:ActorRequest,@Query('after') after='0'){
    const cursor=/^\d{1,18}$/.test(after)?after:'0';
    const events=await this.db.query('SELECT seq,tipo AS type,entidad AS entity,entidad_id AS id,version FROM plataforma.outbox WHERE seq>$1 AND canales && $2::text[] ORDER BY seq LIMIT 200',[cursor,r.actor.channels]);
    return {cursor:events.at(-1)?.seq??cursor,events};
  }
}
