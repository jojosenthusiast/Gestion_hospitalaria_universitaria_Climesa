import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger, LoggerService } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ActorRequest } from './actor';
import { CommandService } from './command.service';
import { ProblemException } from './problem';

const CODES: Record<number, string> = { 400: 'validacion', 401: 'no_autenticado', 403: 'sin_permiso', 404: 'no_encontrado', 409: 'conflicto', 429: 'limite_excedido', 503: 'no_disponible' };
const TITLES: Record<number, string> = { 400: 'Datos no válidos', 401: 'Sesión requerida', 403: 'Sin permiso', 404: 'No encontrado', 409: 'Conflicto', 429: 'Demasiadas solicitudes', 503: 'Servicio no disponible' };
const SQL_CODES: Record<string, string> = { ultimo_administrador: 'ultimo_administrador', capacidad_excedida: 'capacidad_excedida', capacidad_menor_que_camas: 'capacidad_menor_que_camas', ciclo_en_arbol: 'ciclo_en_arbol' };

/** FR-100-11: todo error sale como `application/problem+json` con `codigo` estable, mensaje en español y `requestId`; nunca trazas ni SQL. */
@Catch()
export class ApiErrorsFilter implements ExceptionFilter {
  constructor(private readonly commands?: CommandService, private readonly logger: LoggerService = new Logger('API')) {}
  async catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const sql = error as { code?: string; message?: string };
    let status = error instanceof HttpException ? error.getStatus() : 500;
    let message = 'No se pudo completar la operación.';
    let codigo: string | undefined;
    let campo: string | undefined;
    let extra: Record<string, unknown> = {};
    if (error instanceof ProblemException) {
      const body = error.getResponse() as { message: string };
      message = body.message; codigo = error.codigo; campo = error.campo; extra = error.extra;
    } else if (error instanceof HttpException) {
      const body = error.getResponse();
      const reason = typeof body === 'string' ? body : (body as { message?: string | string[] }).message;
      message = Array.isArray(reason) ? reason.join(' ') : reason ?? message;
      // class-validator prefija cada mensaje con la propiedad afectada.
      if (status === 400 && Array.isArray(reason)) campo = /^(?:property )?(?!each\b)([A-Za-z_][\w.[\]]*) /.exec(reason[0])?.[1];
    } else if (['23505','23P01','40001','40P01'].includes(sql.code ?? '')) {
      status = 409; message = sql.code === '23P01' ? 'El horario o recurso se traslapa con otro registro.' : 'Los datos cambiaron o ya existe un registro con ese identificador. Actualiza e intenta de nuevo.';
    } else if (['23514','23503','22P02'].includes(sql.code ?? '')) {
      status = 400; message = 'Revisa los datos, referencias y restricciones del registro.';
    } else if (sql.code === 'P0001') {
      status = 409; message = ({ ultimo_administrador: 'No puedes quitar ni desactivar al último administrador.', capacidad_excedida: 'La habitación ya tiene todas sus camas.', capacidad_menor_que_camas: 'La capacidad no puede quedar por debajo de las camas activas.', ciclo_en_arbol: 'Un espacio no puede ser descendiente de sí mismo.' } as Record<string,string>)[sql.message ?? ''] ?? 'La operación incumple una regla del sistema.';
      codigo = SQL_CODES[sql.message ?? ''];
    }
    codigo ??= CODES[status] ?? (status >= 500 ? 'error_interno' : 'error');
    const actorRequest=req as unknown as ActorRequest;
    if(status===403&&actorRequest.actor&&!actorRequest.denialAudited&&this.commands)await this.commands.denied(actorRequest.actor,actorRequest.permission??'contexto',req.method,req.url).catch(()=>undefined);
    // Solo estado, código y correlación: nunca el cuerpo, los encabezados ni el mensaje original (FR-100-15).
    if (status >= 500) this.logger.error({ status, code: sql.code ?? 'INTERNAL', requestId: req.id, path: req.url.split('?')[0] });
    reply.status(status).header('content-type', 'application/problem+json; charset=utf-8').send({ type: `urn:sghu:error:${codigo}`, title: TITLES[status] ?? 'Error', status, codigo, detail: message, ...(campo ? { campo } : {}), requestId: req.id, ...extra });
  }
}
