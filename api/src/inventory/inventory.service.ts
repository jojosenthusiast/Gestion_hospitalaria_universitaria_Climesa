import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor } from '../platform/actor';
import { channelsFor } from '../platform/channels';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { Clock } from '../platform/clock';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { alertExcludedContexts, crossesBelowMinimum, subtracts } from './inventory.rules';
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
    return this.db.query(`SELECT m.id,m.tipo AS type,m.lote_id AS "lotId",m.bodega_origen_id AS "originWarehouseId",m.bodega_destino_id AS "destinationWarehouseId",CASE WHEN m.tipo='ajuste' AND m.bodega_destino_id IS NULL THEN -m.cantidad ELSE m.cantidad END AS quantity,m.motivo AS reason,m.paciente_id AS "patientId",m.autor_id AS "authorId",m.registrado_en AS "registeredAt",a.codigo AS "articleCode",a.nombre AS "articleName",l.numero AS "lotNumber" FROM inventario.movimiento m JOIN inventario.lote l ON l.id=m.lote_id JOIN inventario.articulo a ON a.id=l.articulo_id ORDER BY m.registrado_en DESC LIMIT 500`);
  }
  async saveArticle(actor: Actor, id: string | null, dto: ArticleDto, key?: string) {
    return this.commands.run(actor, `inventario.configurar:${id ?? 'nuevo'}`, key, dto, async c => {
      if (id) {
        const old = (await c.query('SELECT version FROM inventario.articulo WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!old) throw new NotFoundException('No se encontró el artículo.');
        if (dto.version !== old.version) throw new VersionConflictException(old.version, 'El artículo cambió; vuelve a cargarlo.');
        if (!dto.reason?.trim()) throw new BadRequestException('Indica el motivo del cambio.');
        const previous = (await c.query('SELECT minimo FROM inventario.articulo WHERE id=$1', [id])).rows[0];
        const stock = await this.available(c, id);
        const row = (await c.query(`UPDATE inventario.articulo SET codigo=$2,nombre=$3,tipo=$4,unidad=$5,minimo=$6,activo=$7,version=version+1 WHERE id=$1 RETURNING id,codigo AS code,nombre,tipo,unidad,minimo,activo,version`, [id,dto.code.trim().toUpperCase(),dto.name.trim(),dto.type,dto.unit.trim(),dto.minimum,dto.active ?? true])).rows[0];
        await this.commands.audit(c, actor, { action: 'inventario.articulo_editar', entity: 'articulo', entityId: id, permission: 'inventario.configurar', reason: dto.reason });
        // Raising the minimum above the current stock is also "dropping below the minimum" (RN-37).
        if (stock >= Number(previous.minimo) && stock < Number(row.minimo)) await this.commands.event(c, 'inventario.bajo_minimo', 'articulo', id, row.version, await channelsFor(c, ['inventario.mover'], { excludeContexts: alertExcludedContexts(row.tipo) }));
        return row;
      }
      const row = (await c.query(`INSERT INTO inventario.articulo(codigo,nombre,tipo,unidad,minimo) VALUES($1,$2,$3,$4,$5) RETURNING id,codigo AS code,nombre,tipo,unidad,minimo,activo,version`, [dto.code.trim().toUpperCase(),dto.name.trim(),dto.type,dto.unit.trim(),dto.minimum])).rows[0];
      await this.commands.audit(c, actor, { action: 'inventario.articulo_crear', entity: 'articulo', entityId: row.id, permission: 'inventario.configurar' });
      return row;
    });
  }
  async move(actor: Actor, dto: MovementDto, key?: string) {
    return this.commands.run(actor, `inventario.mover:${dto.lotId}`, key, dto, async c => {
      const lot = (await c.query(`SELECT l.id,l.articulo_id AS "articleId",l.vence,a.tipo,a.minimo,a.version FROM inventario.lote l JOIN inventario.articulo a ON a.id=l.articulo_id WHERE l.id=$1 AND a.activo FOR UPDATE`, [dto.lotId])).rows[0] as any;
      if (!lot) throw new NotFoundException('No se encontró el lote activo.');
      if (dto.type !== 'ajuste' && dto.quantity <= 0) throw new ProblemException('validacion', 400, 'La cantidad debe ser mayor que cero.', 'quantity');
      const out = subtracts(dto.type, dto.quantity), amount = Math.abs(dto.quantity);
      if (lot.vence && new Date(lot.vence).getTime() < this.clock.now().getTime() && ['salida','consumo','traslado'].includes(dto.type)) throw new ConflictException('No se puede usar un lote vencido.');
      if (dto.type === 'entrada' && !dto.destinationWarehouseId) throw new BadRequestException('La entrada necesita bodega destino.');
      if (['salida','consumo'].includes(dto.type) && !dto.originWarehouseId) throw new BadRequestException('La salida necesita bodega origen.');
      if (dto.type === 'traslado' && (!dto.originWarehouseId || !dto.destinationWarehouseId || dto.originWarehouseId === dto.destinationWarehouseId)) throw new BadRequestException('El traslado necesita bodegas origen y destino distintas.');
      if (dto.type === 'ajuste' && !dto.originWarehouseId) throw new BadRequestException('El ajuste necesita una bodega.');
      const before = await this.available(c, lot.articleId);
      if (out) {
        await this.lockStock(c, dto.lotId, dto.originWarehouseId!);
        // RN-36 / D-063: one atomic statement; a concurrent exit that would go negative updates no row and is rejected.
        const updated = await c.query('UPDATE inventario.existencia SET cantidad=cantidad-$3 WHERE lote_id=$1 AND bodega_id=$2 AND cantidad>=$3', [dto.lotId,dto.originWarehouseId,amount]);
        if (!updated.rowCount) throw new ProblemException('existencia_insuficiente', 409, 'La existencia no puede quedar negativa.');
      }
      if (dto.type === 'entrada' || dto.type === 'traslado' || (dto.type === 'ajuste' && !out)) {
        const target = dto.type === 'ajuste' ? dto.originWarehouseId! : dto.destinationWarehouseId!;
        await c.query(`INSERT INTO inventario.existencia(lote_id,bodega_id,cantidad) VALUES($1,$2,$3) ON CONFLICT(lote_id,bodega_id) DO UPDATE SET cantidad=inventario.existencia.cantidad+$3`, [dto.lotId,target,amount]);
      }
      // A negative adjustment leaves the warehouse (origin only); a positive one enters it (destination only).
      const origin = dto.type === 'ajuste' ? (out ? dto.originWarehouseId : null) : dto.originWarehouseId ?? null;
      const destination = dto.type === 'ajuste' ? (out ? null : dto.originWarehouseId) : dto.destinationWarehouseId ?? null;
      const row = (await c.query(`INSERT INTO inventario.movimiento(tipo,lote_id,bodega_origen_id,bodega_destino_id,cantidad,motivo,paciente_id,autor_id,clave_idempotencia) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,tipo AS type,cantidad AS quantity,registrado_en AS "registeredAt"`, [dto.type,dto.lotId,origin ?? null,destination ?? null,amount,dto.reason.trim(),dto.patientId ?? null,actor.id,key ?? null])).rows[0];
      await this.commands.audit(c, actor, { action: `inventario.${dto.type}`, entity: 'movimiento', entityId: row.id, patientId: dto.patientId, permission: 'inventario.mover', reason: dto.reason, detail: { lotId: dto.lotId, quantity: dto.quantity } });
      await this.commands.event(c, 'inventario.actualizado', 'articulo', lot.articleId, lot.version, await channelsFor(c, ['inventario.ver']));
      await this.alertIfBelowMinimum(c, lot.articleId, lot.tipo, lot.version, before, await this.available(c, lot.articleId), Number(lot.minimo));
      return { ...row, quantity: out && dto.type === 'ajuste' ? -Number(row.quantity) : row.quantity };
    });
  }
  /** Available stock of an article on the business day of the clock: expired lots do not count (RN-37). */
  private async available(c: PoolClient, articleId: string) {
    const row = (await c.query('SELECT coalesce(sum(e.cantidad) FILTER (WHERE l.vence IS NULL OR l.vence >= $2::date),0) AS n FROM inventario.lote l LEFT JOIN inventario.existencia e ON e.lote_id=l.id WHERE l.articulo_id=$1', [articleId, this.clock.today()])).rows[0];
    return Number(row?.n ?? 0);
  }
  /** FR-111-06: `inventario.bajo_minimo` to Operations and, for reagents, to the laboratory; channels come from the catalog. */
  private async alertIfBelowMinimum(c: PoolClient, articleId: string, type: string, version: number, before: number, after: number, minimum: number) {
    if (!crossesBelowMinimum(before, after, minimum)) return;
    await this.commands.event(c, 'inventario.bajo_minimo', 'articulo', articleId, version, await channelsFor(c, ['inventario.mover'], { excludeContexts: alertExcludedContexts(type) }));
  }
  private async lockStock(c: PoolClient, lotId: string, warehouseId: string) {
    const row = (await c.query('SELECT cantidad FROM inventario.existencia WHERE lote_id=$1 AND bodega_id=$2 FOR UPDATE', [lotId,warehouseId])).rows[0];
    if (!row) throw new ConflictException('No existe inventario para ese lote en la bodega indicada.');
    return row;
  }
}
