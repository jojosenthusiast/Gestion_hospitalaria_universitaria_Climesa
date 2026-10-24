import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard } from '../auth';
import { RequirePermission } from '../auth';
import { SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { InvitePatientDto,UserRolesDto,UserStateDto } from './invitation.dto';
import { InvitationsService } from './invitations.service';
@ApiTags('users') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard,PermissionGuard) @Controller('usuarios')
export class UsersController {
  constructor(private readonly invitations:InvitationsService) {}
  @Get() @RequirePermission('usuarios.ver') @ApiOperation({summary:'Cuentas, roles, estado y vínculo con personal'})
  list(){return this.invitations.list();}
  @Post('invitaciones') @RequirePermission('usuarios.invitar') @ApiOperation({summary:'Invitar paciente o personal con roles autorizados por el administrador'})
  invite(@Req() r:ActorRequest,@Body() d:InvitePatientDto,@Headers('idempotency-key') k?:string){return this.invitations.invitePatient(d,r.actor,k);}
  @Patch(':id/roles') @RequirePermission('usuarios.asignar_roles') @ApiOperation({summary:'Cambiar roles; prohíbe autoasignación y protege el último administrador'})
  roles(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:UserRolesDto,@Headers('idempotency-key') k?:string){return this.invitations.changeRoles(r.actor,id,d,k);}
  @Patch(':id/estado') @RequirePermission('usuarios.desactivar') @ApiOperation({summary:'Desactivar o reactivar; no desactiva al último administrador'})
  state(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:UserStateDto,@Headers('idempotency-key') k?:string){return this.invitations.changeState(r.actor,id,d,k);}
}
