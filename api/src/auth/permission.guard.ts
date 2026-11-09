import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRED_PERMISSION } from './permission.decorator';
import { ActorRequest, hasPermission } from '../platform/actor';
import { CommandService } from '../platform/command.service';
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly commands: CommandService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string | string[]>(REQUIRED_PERMISSION, [context.getHandler(), context.getClass()]);
    if (!required) return true;
    const codes = Array.isArray(required) ? required : [required];
    const req = context.switchToHttp().getRequest<ActorRequest>();
    const granted = req.actor ? codes.find(code => hasPermission(req.actor, code)) : undefined;
    req.permission = granted ?? codes[0];
    if (granted) return true;
    if (req.actor) { await this.commands.denied(req.actor, codes[0], req.method, req.url); req.denialAudited = true; }
    throw new ForbiddenException('Tu cuenta no tiene permiso para esta operación.');
  }
}
