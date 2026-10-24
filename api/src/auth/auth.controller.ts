import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from './supabase-auth.guard';
import { ActorRequest } from '../platform/actor';
import { AccessService } from './access.service';
import { RequirePermission } from './permission.decorator';
import { PermissionGuard } from './permission.guard';
@ApiTags('auth')
@ApiBearerAuth()
@UseGuards(SupabaseAuthGuard, PermissionGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly access: AccessService) {}
  @Get('me')
  @RequirePermission('sesion.perfil')
  @ApiOperation({ summary: 'Cuenta activa, roles, plataformas y permisos vigentes en la base' })
  async me(@Req() req: ActorRequest) { return { user: req.user, ...req.actor, canInviteAdmin: await this.access.canInviteAdmin(req.actor) }; }
}
