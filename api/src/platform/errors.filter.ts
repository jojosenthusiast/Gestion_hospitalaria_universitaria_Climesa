import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ActorRequest } from './actor';
import { CommandService } from './command.service';

@Catch()
export class ApiErrorsFilter implements ExceptionFilter {
  private readonly logger = new Logger('API');
  constructor(private readonly commands?: CommandService) {}
  async catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const sql = error as { code?: string; message?: string };
    let status = error instanceof HttpException ? error.getStatus() : 500;
    let message = 'No se pudo completar la operación.';
    if (error instanceof HttpException) {
      const body = error.getResponse();
      const reason = typeof body === 'string' ? body : (body as { message?: string | string[] }).message;
      message = Array.isArray(reason) ? reason.join(' ') : reason ?? message;
    } else if (['23505','23P01','40001','40P01'].includes(sql.code ?? '')) {
      status = 409; message = sql.code === '23P01' ? 'El horario o recurso se traslapa con otro registro.' : 'Los datos cambiaron o ya existe un registro con ese identificador. Actualiza e intenta de nuevo.';
    } else if (['23514','23503','22P02'].includes(sql.code ?? '')) {
      status = 400; message = 'Revisa los datos, referencias y restricciones del registro.';
    } else if (sql.code === 'P0001') {
      status = 409; message = ({ ultimo_administrador: 'No puedes quitar ni desactivar al último administrador.', capacidad_excedida: 'La habitación ya tiene todas sus camas.', capacidad_menor_que_camas: 'La capacidad no puede quedar por debajo de las camas activas.', ciclo_en_arbol: 'Un espacio no puede ser descendiente de sí mismo.' } as Record<string,string>)[sql.message ?? ''] ?? 'La operación incumple una regla del sistema.';
    }
    const actorRequest=req as unknown as ActorRequest;
    if(status===403&&actorRequest.actor&&!actorRequest.denialAudited&&this.commands)await this.commands.denied(actorRequest.actor,actorRequest.permission??'contexto',req.method,req.url).catch(()=>undefined);
    if (status >= 500) this.logger.error({ status, code: sql.code ?? 'INTERNAL', requestId: req.id });
    reply.status(status).send({ error: { code: status === 409 ? 'CONFLICT' : status === 403 ? 'FORBIDDEN' : status === 401 ? 'UNAUTHORIZED' : status === 400 ? 'VALIDATION' : 'UNAVAILABLE', message, requestId: req.id } });
  }
}
