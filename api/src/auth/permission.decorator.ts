import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const REQUIRED_PERMISSION = 'sghu:required_permission';
export const RequirePermission = (permission: string) => applyDecorators(SetMetadata(REQUIRED_PERMISSION, permission), ApiExtension('x-permiso', permission));
