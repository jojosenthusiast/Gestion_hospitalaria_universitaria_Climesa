import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor } from '../platform/actor';
import { channelsFor } from '../platform/channels';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { Clock } from '../platform/clock';
import { VersionConflictException } from '../platform/problem';
import { ArticleDto, MovementDto } from './inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}
  async existences(actor: Actor) {
    return this.db.transaction(async c => {
      const rows = (await c.query(`SELECT v.*,l.id AS "lotId",l.numero AS "lotNumber",l.vence AS "expiresAt",e.bodega_id AS "warehouseId",b.codigo AS "warehouseCode",e.cantidad AS quantity
        FROM inventario.v_existencias v JOIN inventario.lote l ON l.articulo_id=v.articulo_id LEFT JOIN inventario.existencia e ON e.lote_id=l.id LEFT JOIN infra.espacio b ON b.id=e.bodega_id ORDER BY v.nombre,l.vence NULLS LAST,l.numero`)).rows;
      for (const row of rows) await this.commands.audit(c, actor, { action: 'inventario.leer', entity: 'existencia', entityId: row.articulo_id, permission: 'inventario.ver' });
      return rows;
    });
  }
  async movements(actor: Actor) {
    return this.db.query(`SELECT m.id,m.tipo AS type,m.lote_id AS "lotId",m.bodega_origen_id AS "originWarehouseId",m.bodega_destino_id AS "destinationWarehouseId",m.cantidad AS quantity,m.motivo AS reason,m.paciente_id AS "patientId",m.autor_id AS "authorId",m.registrado_en AS "registeredAt",a.codigo AS "articleCode",a.nombre AS "articleName",l.numero AS "lotNumber" FROM inventario.movimiento m JOIN inventario.lote l ON l.id=m.lote_id JOIN inventario.articulo a ON a.id=l.articulo_id ORDER BY m.registrado_en DESC LIMIT 500`);
  }
  async saveArticle(actor: Actor, id: string | null, dto: ArticleDto, key?: string) {
    return this.commands.run(actor, `inventario.configurar:${id ?? 'nuevo'}`, key, dto, async c => {
      if (id) {
        const old = (await c.query('SELECT version FROM inventario.articulo WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!old) throw new NotFoundException('No se encontró el artículo.');
        if (dto.version !== old.version) throw new VersionConflictException(old.version, 'El artículo cambió; vuelve a cargarlo.');
        if (!dto.reason?.trim()) throw new BadRequestException('Indica el motivo del cambio.');
        const row = (await c.query(`UPDATE inventario.articulo SET codigo=$2,nombre=$3,tipo=$4,unidad=$5,minimo=$6,activo=$7,version=version+1 WHERE id=$1 RETURNING id,codigo AS code,nombre,tipo,unidad,minimo,activo,version`, [id,dto.code.trim().toUpperCase(),dto.name.trim(),dto.type,dto.unit.trim(),dto.minimum,dto.active ?? true])).rows[0];
        await this.commands.audit(c, actor, { action: 'inventario.articulo_editar', entity: 'articulo', entityId: id, permission: 'inventario.configurar', reason: dto.reason });
        return row;
      }
      const row = (await c.query(`INSERT INTO inventario.articulo(codigo,nombre,tipo,unidad,minimo) VALUES($1,$2,$3,$4,$5) RETURNING id,codigo AS code,nombre,tipo,unidad,minimo,activo,version`, [dto.code.trim().toUpperCase(),dto.name.trim(),dto.type,dto.unit.trim(),dto.minimum])).rows[0];
      await this.commands.audit(c, actor, { action: 'inventario.articulo_crear', entity: 'articulo', entityId: row.id, permission: 'inventario.configurar' });
      return row;
    });
  }
  async move(actor: Actor, dto: MovementDto, key?: string) {
    return this.commands.run(actor, `inventario.mover:${dto.lotId}`, key, dto, async c => {
      const lot = (await c.query(`SELECT l.id,l.articulo_id AS "articleId",l.vence,a.tipo FROM inventario.lote l JOIN inventario.articulo a ON a.id=l.articulo_id WHERE l.id=$1 AND a.activo FOR UPDATE`, [dto.lotId])).rows[0] as any;
      if (!lot) throw new NotFoundException('No se encontró el lote activo.');
      if (lot.vence && new Date(lot.vence).getTime() < this.clock.now().getTime() && ['salida','consumo','traslado'].includes(dto.type)) throw new ConflictException('No se puede usar un lote vencido.');
      if (dto.type === 'entrada' && !dto.destinationWarehouseId) throw new BadRequestException('La entrada necesita bodega destino.');
      if (['salida','consumo'].includes(dto.type) && !dto.originWarehouseId) throw new BadRequestException('La salida necesita bodega origen.');
      if (dto.type === 'traslado' && (!dto.originWarehouseId || !dto.destinationWarehouseId || dto.originWarehouseId === dto.destinationWarehouseId)) throw new BadRequestException('El traslado necesita bodegas origen y destino distintas.');
      if (dto.type === 'ajuste' && !dto.originWarehouseId) throw new BadRequestException('El ajuste necesita una bodega.');
      const source = dto.originWarehouseId ? await this.lockStock(c, dto.lotId, dto.originWarehouseId) : null;
      if (source && ['salida','consumo','traslado'].includes(dto.type) && Number(source.cantidad) < dto.quantity) throw new ConflictException('La existencia no puede quedar negativa.');
      if (source && ['salida','consumo','traslado'].includes(dto.type)) await c.query('UPDATE inventario.existencia SET cantidad=cantidad-$3 WHERE lote_id=$1 AND bodega_id=$2', [dto.lotId,dto.originWarehouseId,dto.quantity]);
      if (dto.type === 'entrada' || dto.type === 'traslado' || dto.type === 'ajuste') {
        const target = dto.destinationWarehouseId ?? dto.originWarehouseId!;
        const delta = dto.type === 'ajuste' ? dto.quantity : dto.quantity;
        await c.query(`INSERT INTO inventario.existencia(lote_id,bodega_id,cantidad) VALUES($1,$2,$3) ON CONFLICT(lote_id,bodega_id) DO UPDATE SET cantidad=inventario.existencia.cantidad+$3`, [dto.lotId,target,delta]);
      }
      const row = (await c.query(`INSERT INTO inventario.movimiento(tipo,lote_id,bodega_origen_id,bodega_destino_id,cantidad,motivo,paciente_id,autor_id,clave_idempotencia) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,tipo AS type,cantidad AS quantity,registrado_en AS "registeredAt"`, [dto.type,dto.lotId,dto.originWarehouseId ?? null,dto.destinationWarehouseId ?? null,dto.quantity,dto.reason.trim(),dto.patientId ?? null,actor.id,key ?? null])).rows[0];
      await this.commands.audit(c, actor, { action: `inventario.${dto.type}`, entity: 'movimiento', entityId: row.id, patientId: dto.patientId, permission: 'inventario.mover', reason: dto.reason, detail: { lotId: dto.lotId, quantity: dto.quantity } });
      await this.commands.event(c, 'inventario.actualizado', 'articulo', lot.articleId, 1, await channelsFor(c, ['inventario.ver']));
      return row;
    });
  }
  private async lockStock(c: PoolClient, lotId: string, warehouseId: string) {
    const row = (await c.query('SELECT cantidad FROM inventario.existencia WHERE lote_id=$1 AND bodega_id=$2 FOR UPDATE', [lotId,warehouseId])).rows[0];
    if (!row) throw new ConflictException('No existe inventario para ese lote en la bodega indicada.');
    return row;
  }
}
