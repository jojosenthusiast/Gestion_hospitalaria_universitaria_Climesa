import {ConflictException,Injectable} from '@nestjs/common';
import {PoolClient} from 'pg';
/** Políticas de negocio versionadas por vigencia; se consultan en la transacción del comando. */
@Injectable()
export class PolicyRegistry {
 async value<T>(client:PoolClient,key:string,at:Date):Promise<T>{
  const row=(await client.query('SELECT valor FROM plataforma.politica WHERE clave=$1 AND vigencia @> $2::timestamptz',[key,at])).rows[0];
  if(!row)throw new ConflictException(`Falta la política vigente ${key} para esa fecha.`);
  return row.valor as T;
 }
}
