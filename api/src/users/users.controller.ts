import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionGuard } from '../auth';
import { RequirePermission } from '../auth';
import { SupabaseAuthGuard } from '../auth';
import { ActorRequest } from '../platform/actor';
import { InvitationCancelDto,InvitePatientDto,UserRolesDto,UserStateDto } from './invitation.dto';
import { InvitationsService } from './invitations.service';
import { InvitationResponse, UserAccountResponse, UserStateResponse } from './users.responses';
import { IdVersionResponse } from '../platform/responses';
@ApiTags('users') @ApiBearerAuth() @UseGuards(SupabaseAuthGuard,PermissionGuard) @Controller('usuarios')
export class UsersController {
  constructor(private readonly invitations:InvitationsService) {}
  @Get() @RequirePermission('usuarios.ver') @ApiOperation({summary:'Cuentas, roles, estado, invitación y acciones permitidas a quien consulta'}) @ApiOkResponse({ type: [UserAccountResponse] })
  list(@Req() r:ActorRequest){return this.invitations.list(r.actor);}
  @Post('invitaciones') @RequirePermission('usuarios.invitar') @ApiOperation({summary:'Invitar personal con roles autorizados por el administrador (el paciente se registra en la app)'}) @ApiCreatedResponse({ type: InvitationResponse })
  invite(@Req() r:ActorRequest,@Body() d:InvitePatientDto,@Headers('idempotency-key') k?:string){return this.invitations.invitePatient(d,r.actor,k);}
  @Post(':id/invitacion/reenvio') @RequirePermission('usuarios.invitar') @ApiOperation({summary:'Reenviar una invitación pendiente'}) @ApiCreatedResponse({ type: IdVersionResponse })
  resend(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Headers('idempotency-key') k?:string){return this.invitations.resend(r.actor,id,k);}
  @Post(':id/invitacion/cancelacion') @RequirePermission('usuarios.invitar') @ApiOperation({summary:'Cancelar una invitación pendiente; desactiva la cuenta invitada'}) @ApiCreatedResponse({ type: IdVersionResponse })
  cancel(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:InvitationCancelDto,@Headers('idempotency-key') k?:string){return this.invitations.cancel(r.actor,id,d,k);}
  @Patch(':id/roles') @RequirePermission('usuarios.asignar_roles') @ApiOperation({summary:'Cambiar roles; prohíbe autoasignación y protege el último administrador'}) @ApiOkResponse({ type: IdVersionResponse })
  roles(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:UserRolesDto,@Headers('idempotency-key') k?:string){return this.invitations.changeRoles(r.actor,id,d,k);}
  @Patch(':id/estado') @RequirePermission('usuarios.desactivar') @ApiOperation({summary:'Desactivar o reactivar; no desactiva al último administrador'}) @ApiOkResponse({ type: UserStateResponse })
  state(@Req() r:ActorRequest,@Param('id',ParseUUIDPipe) id:string,@Body() d:UserStateDto,@Headers('idempotency-key') k?:string){return this.invitations.changeState(r.actor,id,d,k);}
}
