import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const REQUIRED_PERMISSION = 'sghu:required_permission';
/** Requiere un permiso; cuando se pasan varios, cualquiera de ellos autoriza la operación. */
export const RequirePermission = (...permissions: string[]) => {
  const required = permissions.length === 1 ? permissions[0] : permissions;
  return applyDecorators(SetMetadata(REQUIRED_PERMISSION, required), ApiExtension('x-permiso', permissions.join(' OR ')));
};
