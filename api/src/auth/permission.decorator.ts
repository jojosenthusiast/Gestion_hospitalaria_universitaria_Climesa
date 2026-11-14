import { applyDecorators, SetMetadata } from '@nestjs/common';
import { ApiExtension } from '@nestjs/swagger';

export const REQUIRED_PERMISSION = 'sghu:required_permission';
/** Requiere un permiso; cuando se pasan varios, cualquiera de ellos autoriza la operación. */
export const RequirePermission = (...permissions: string[]) => {
  const required = permissions.length === 1 ? permissions[0] : permissions;
  return applyDecorators(SetMetadata(REQUIRED_PERMISSION, required), ApiExtension('x-permiso', permissions.join(' OR ')));
};
/**
 * The OpenAPI `x-permiso` keeps the catalog permission of the endpoints.csv row, while the guard also admits the
 * permissions named by that row's `contexto` (for example "Solicitante ve los suyos"); the service narrows what each one sees.
 */
export const RequireCatalogPermission = (catalog: string, ...contextual: string[]) =>
  applyDecorators(SetMetadata(REQUIRED_PERMISSION, [catalog, ...contextual]), ApiExtension('x-permiso', catalog));
