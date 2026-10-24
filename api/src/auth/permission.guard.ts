import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSION } from './permission.decorator';
import { ActorRequest, hasPermission } from '../platform/actor';
import { CommandService } from '../platform/command.service';
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly commands: CommandService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const code = this.reflector.getAllAndOverride<string>(REQUIRED_PERMISSION, [context.getHandler(), context.getClass()]);
    if (!code) return true;
    const req = context.switchToHttp().getRequest<ActorRequest>();
    req.permission = code;
    if (req.actor && hasPermission(req.actor, code)) return true;
    if (req.actor) { await this.commands.denied(req.actor, code, req.method, req.url); req.denialAudited = true; }
    throw new ForbiddenException('Tu cuenta no tiene permiso para esta operación.');
  }
}
