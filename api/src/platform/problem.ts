import { HttpException } from '@nestjs/common';

/** Error de negocio con `codigo` estable (snake_case), campo afectado opcional y miembros extra del problem+json. */
export class ProblemException extends HttpException {
  constructor(readonly codigo: string, status: number, message: string, readonly campo?: string, readonly extra: Record<string, unknown> = {}) {
    super({ message, codigo, campo }, status);
  }
}
/** FR-100-12: la edición llegó con una versión distinta; el cliente recibe la vigente en `versionActual`. */
export class VersionConflictException extends ProblemException {
  constructor(readonly currentVersion: number, message = 'El registro cambió; vuelve a abrirlo antes de guardar.') {
    super('version_conflicto', 409, message, undefined, { versionActual: currentVersion });
  }
}
