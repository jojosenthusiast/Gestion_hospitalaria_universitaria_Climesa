import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PoolClient } from 'pg';
import { Actor, contextsOf } from '../platform/actor';
import { channelsFor } from '../platform/channels';
import { CommandService } from '../platform/command.service';
import { DatabaseService } from '../platform/database.service';
import { Clock } from '../platform/clock';
import { ProblemException, VersionConflictException } from '../platform/problem';
import { alertExcludedContexts, blockedForExpired, canTouchArticle, crossesBelowMinimum, EXPIRING_DAYS, fefo, InventoryScope, scopeOf, stockStatus, subtracts } from './inventory.rules';
import { ArticleDto, LotDto, MovementDto } from './inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly db: DatabaseService, private readonly commands: CommandService, private readonly clock: Clock) {}
  /** What the actor may see and do, derived from the contexts of `inventario.mover` (x, reactivos, consumo). */
  private scope(actor: Actor): InventoryScope {
    return scopeOf(contextsOf(actor, 'inventario.mover'), contextsOf(actor, 'inventario.configurar').length > 0);
  }
  async existences(actor: Actor) {
    const scope = this.scope(actor);
    return this.db.transaction(async c => {
      const rows = (await c.query(`SELECT v.*,l.id AS "lotId",l.numero AS "lotNumber",l.vence AS "expiresAt",e.bodega_id AS "warehouseId",b.codigo AS "warehouseCode",e.cantidad AS quantity
        FROM inventario.v_existencias v JOIN inventario.lote l ON l.articulo_id=v.articulo_id LEFT JOIN inventario.existencia e ON e.lote_id=l.id LEFT JOIN infra.espacio b ON b.id=e.bodega_id WHERE l.activo AND ($1::text[] IS NULL OR v.tipo=ANY($1)) ORDER BY v.nombre,l.vence NULLS LAST,l.numero`, [scope.articleTypes])).rows;
      for (const row of rows) await this.commands.audit(c, actor, { action: 'inventario.leer', entity: 'existencia', entityId: row.articulo_id, permission: 'inventario.ver' });
      return rows;
    });
  }
  async movements(actor: Actor) {
    const scope = this.scope(actor);
    return this.db.query(`SELECT m.id,m.tipo AS type,m.lote_id AS "lotId",m.bodega_origen_id AS "originWarehouseId",m.bodega_destino_id AS "destinationWarehouseId",CASE WHEN m.tipo='ajuste' AND m.bodega_destino_id IS NULL THEN -m.cantidad ELSE m.cantidad END AS quantity,m.motivo AS reason,m.paciente_id AS "patientId",m.autor_id AS "authorId",m.registrado_en AS "registeredAt",a.codigo AS "articleCode",a.nombre AS "articleName",l.numero AS "lotNumber" FROM inventario.movimiento m JOIN inventario.lote l ON l.id=m.lote_id JOIN inventario.articulo a ON a.id=l.articulo_id WHERE ($1::text[] IS NULL OR a.tipo=ANY($1)) ORDER BY m.registrado_en DESC LIMIT 500`, [scope.articleTypes]);
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
    const scope = this.scope(actor);
    if (!scope.movementTypes.includes(dto.type)) throw new ForbiddenException('Tu rol no registra este tipo de movimiento.');
    return this.commands.run(actor, `inventario.mover:${dto.lotId ?? dto.articleId ?? 'nuevo'}`, key, dto, async c => {
      const lot = await this.resolveLot(c, dto);
      if (!canTouchArticle(scope, lot.tipo)) throw new ForbiddenException('Tu rol no mueve este tipo de artículo.');
      if (!lot.activo) throw new ConflictException('El lote está dado de baja.');
      if (dto.type !== 'ajuste' && dto.quantity <= 0) throw new ProblemException('validacion', 400, 'La cantidad debe ser mayor que cero.', 'quantity');
      const out = subtracts(dto.type, dto.quantity), amount = Math.abs(dto.quantity);
      if (lot.vence && lot.vence < this.clock.today() && blockedForExpired(dto.type)) throw new ConflictException('No se puede usar un lote vencido: registra una merma para darlo de baja.');
      if (dto.type === 'entrada' && !dto.destinationWarehouseId) throw new BadRequestException('La entrada necesita bodega destino.');
      if (['salida','consumo','merma'].includes(dto.type) && !dto.originWarehouseId) throw new BadRequestException('Esta salida necesita bodega origen.');
      if (dto.type === 'traslado' && (!dto.originWarehouseId || !dto.destinationWarehouseId || dto.originWarehouseId === dto.destinationWarehouseId)) throw new BadRequestException('El traslado necesita bodegas origen y destino distintas.');
      if (dto.type === 'ajuste' && !dto.originWarehouseId) throw new BadRequestException('El ajuste necesita una bodega.');
      if (dto.type !== 'consumo' && dto.patientId) throw new BadRequestException('Solo el consumo se liga a un paciente.');
      for (const id of [dto.originWarehouseId, dto.destinationWarehouseId].filter(Boolean) as string[]) {
        if (!(await c.query("SELECT 1 FROM infra.espacio WHERE id=$1 AND tipo='bodega' AND activo", [id])).rowCount) throw new BadRequestException('La bodega indicada no existe o está inactiva.');
      }
      const before = await this.available(c, lot.articleId);
      if (out) {
        await this.lockStock(c, lot.id, dto.originWarehouseId!);
        // RN-36 / D-063: one atomic statement; a concurrent exit that would go negative updates no row and is rejected.
        const updated = await c.query('UPDATE inventario.existencia SET cantidad=cantidad-$3 WHERE lote_id=$1 AND bodega_id=$2 AND cantidad>=$3', [lot.id,dto.originWarehouseId,amount]);
        if (!updated.rowCount) throw new ProblemException('existencia_insuficiente', 409, 'La existencia no puede quedar negativa.');
      }
      if (dto.type === 'entrada' || dto.type === 'traslado' || (dto.type === 'ajuste' && !out)) {
        const target = dto.type === 'ajuste' ? dto.originWarehouseId! : dto.destinationWarehouseId!;
        await c.query(`INSERT INTO inventario.existencia(lote_id,bodega_id,cantidad) VALUES($1,$2,$3) ON CONFLICT(lote_id,bodega_id) DO UPDATE SET cantidad=inventario.existencia.cantidad+$3`, [lot.id,target,amount]);
      }
      // A negative adjustment leaves the warehouse (origin only); a positive one enters it (destination only).
      const origin = dto.type === 'ajuste' ? (out ? dto.originWarehouseId : null) : dto.originWarehouseId ?? null;
      const destination = dto.type === 'ajuste' ? (out ? null : dto.originWarehouseId) : dto.destinationWarehouseId ?? null;
      const row = (await c.query(`INSERT INTO inventario.movimiento(tipo,lote_id,bodega_origen_id,bodega_destino_id,cantidad,motivo,paciente_id,autor_id,clave_idempotencia) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,tipo AS type,cantidad AS quantity,registrado_en AS "registeredAt"`, [dto.type,lot.id,origin ?? null,destination ?? null,amount,dto.reason.trim(),dto.patientId ?? null,actor.id,key ?? null])).rows[0];
      await this.commands.audit(c, actor, { action: `inventario.${dto.type}`, entity: 'movimiento', entityId: row.id, patientId: dto.patientId, permission: 'inventario.mover', reason: dto.reason, detail: { lotId: lot.id, quantity: dto.quantity } });
      await this.commands.event(c, 'inventario.actualizado', 'articulo', lot.articleId, lot.version, await channelsFor(c, ['inventario.ver']));
      await this.alertIfBelowMinimum(c, lot.articleId, lot.tipo, lot.version, before, await this.available(c, lot.articleId), Number(lot.minimo));
      return { ...row, quantity: out && dto.type === 'ajuste' ? -Number(row.quantity) : row.quantity };
    });
  }
  /** Lot of the movement: an existing one, or (entrada only) the lot named in the entry, created when it is new. */
  private async resolveLot(c: PoolClient, dto: MovementDto) {
    const columns = `l.id,l.articulo_id AS "articleId",to_char(l.vence,'YYYY-MM-DD') AS vence,l.activo,a.tipo,a.minimo,a.version`;
    if (dto.lotId) {
      const lot = (await c.query(`SELECT ${columns} FROM inventario.lote l JOIN inventario.articulo a ON a.id=l.articulo_id WHERE l.id=$1 AND a.activo FOR UPDATE OF l`, [dto.lotId])).rows[0];
      if (!lot) throw new NotFoundException('No se encontró el lote activo.');
      return lot;
    }
    if (dto.type !== 'entrada' || !dto.articleId || !dto.lotNumber?.trim()) throw new BadRequestException('Indica el lote del movimiento.');
    const article = (await c.query('SELECT id FROM inventario.articulo WHERE id=$1 AND activo FOR UPDATE', [dto.articleId])).rows[0];
    if (!article) throw new NotFoundException('No se encontró el artículo activo.');
    const number = dto.lotNumber.trim().toUpperCase();
    const existing = (await c.query(`SELECT ${columns} FROM inventario.lote l JOIN inventario.articulo a ON a.id=l.articulo_id WHERE l.articulo_id=$1 AND l.numero=$2 FOR UPDATE OF l`, [dto.articleId, number])).rows[0];
    if (existing) {
      if (dto.expiresAt && dto.expiresAt !== existing.vence) throw new ConflictException('Ese lote ya existe con otro vencimiento: usa el lote existente o un número nuevo.');
      return existing;
    }
    const created = (await c.query('INSERT INTO inventario.lote(articulo_id,numero,vence) VALUES($1,$2,$3) RETURNING id', [dto.articleId, number, dto.expiresAt ?? null])).rows[0];
    return (await c.query(`SELECT ${columns} FROM inventario.lote l JOIN inventario.articulo a ON a.id=l.articulo_id WHERE l.id=$1`, [created.id])).rows[0];
  }
  private summarySql = `SELECT a.id,a.codigo AS code,a.nombre AS name,a.tipo AS type,a.unidad AS unit,a.minimo::float8 AS minimum,a.activo AS active,a.version,
      coalesce(sum(e.cantidad) FILTER (WHERE l.activo AND (l.vence IS NULL OR l.vence>=$1::date)),0)::float8 AS available,
      coalesce(sum(e.cantidad) FILTER (WHERE l.activo AND l.vence<$1::date),0)::float8 AS expired,
      coalesce(sum(e.cantidad) FILTER (WHERE l.activo AND l.vence>=$1::date AND l.vence<=$1::date+$2::int),0)::float8 AS "expiringSoon",
      to_char(min(l.vence) FILTER (WHERE l.activo AND e.cantidad>0 AND l.vence>=$1::date),'YYYY-MM-DD') AS "nextExpiry",
      count(DISTINCT l.id) FILTER (WHERE l.activo)::int AS lots
    FROM inventario.articulo a LEFT JOIN inventario.lote l ON l.articulo_id=a.id LEFT JOIN inventario.existencia e ON e.lote_id=l.id`;
  private withStatus<T extends { active: boolean; available: number; minimum: number; expiringSoon: number }>(row: T) { return { ...row, status: stockStatus(row) }; }
  /** Master list of the articles the actor can see, with stock summary and status. */
  async articles(actor: Actor) {
    const scope = this.scope(actor);
    const rows = (await this.db.query(`${this.summarySql} WHERE ($3::text[] IS NULL OR a.tipo=ANY($3)) GROUP BY a.id ORDER BY a.nombre`, [this.clock.today(), EXPIRING_DAYS, scope.articleTypes])) as any[];
    return rows.map(r => this.withStatus(r));
  }
  /** Detail: lots with expiry, stock per warehouse and movement history of one article. */
  async article(actor: Actor, id: string) {
    const scope = this.scope(actor);
    return this.db.transaction(async c => {
      const base = (await c.query(`${this.summarySql} WHERE a.id=$3 AND ($4::text[] IS NULL OR a.tipo=ANY($4)) GROUP BY a.id`, [this.clock.today(), EXPIRING_DAYS, id, scope.articleTypes])).rows[0];
      if (!base) throw new NotFoundException('No se encontró el artículo.');
      const lotRows = (await c.query(`SELECT l.id,l.numero AS number,to_char(l.vence,'YYYY-MM-DD') AS "expiresAt",l.activo AS active,l.version,
          (l.vence IS NOT NULL AND l.vence<$2::date) AS expired,b.id AS "warehouseId",b.codigo AS "warehouseCode",b.nombre AS "warehouseName",e.cantidad::float8 AS quantity
        FROM inventario.lote l LEFT JOIN inventario.existencia e ON e.lote_id=l.id AND e.cantidad>0 LEFT JOIN infra.espacio b ON b.id=e.bodega_id WHERE l.articulo_id=$1 ORDER BY l.vence NULLS LAST,l.numero,b.codigo`, [id, this.clock.today()])).rows as any[];
      const lots = new Map<string, any>(), warehouses = new Map<string, any>();
      for (const r of lotRows) {
        const lot = lots.get(r.id) ?? { id: r.id, number: r.number, expiresAt: r.expiresAt, active: r.active, version: r.version, expired: r.expired, total: 0, warehouses: [] };
        lots.set(r.id, lot);
        if (r.warehouseId) {
          lot.total += r.quantity; lot.warehouses.push({ warehouseId: r.warehouseId, warehouseCode: r.warehouseCode, warehouseName: r.warehouseName, quantity: r.quantity });
          if (r.active) { const w = warehouses.get(r.warehouseId) ?? { warehouseId: r.warehouseId, warehouseCode: r.warehouseCode, warehouseName: r.warehouseName, quantity: 0 }; w.quantity += r.quantity; warehouses.set(r.warehouseId, w); }
        }
      }
      const movements = (await c.query(`SELECT m.id,m.tipo AS type,l.numero AS "lotNumber",CASE WHEN m.tipo='ajuste' AND m.bodega_destino_id IS NULL THEN -m.cantidad ELSE m.cantidad END::float8 AS quantity,m.motivo AS reason,
          o.codigo AS "originWarehouseCode",d.codigo AS "destinationWarehouseCode",coalesce(nullif(u.nombre_mostrar,''),'Sistema') AS "authorName",m.registrado_en AS "registeredAt"
        FROM inventario.movimiento m JOIN inventario.lote l ON l.id=m.lote_id LEFT JOIN infra.espacio o ON o.id=m.bodega_origen_id LEFT JOIN infra.espacio d ON d.id=m.bodega_destino_id LEFT JOIN acceso.usuario u ON u.id=m.autor_id
        WHERE l.articulo_id=$1 ORDER BY m.registrado_en DESC LIMIT 200`, [id])).rows;
      await this.commands.audit(c, actor, { action: 'inventario.leer', entity: 'articulo', entityId: id, permission: 'inventario.ver' });
      return { ...this.withStatus(base), lotList: [...lots.values()], warehouses: [...warehouses.values()], movements, allowedMovements: scope.movementTypes.filter(t => t !== 'salida') };
    });
  }
  /** Warehouses the actor can move stock in: all of them for Operations, and only those holding or able to hold the actor's article types otherwise. */
  async warehouses(actor: Actor) {
    const scope = this.scope(actor);
    return this.db.query(`SELECT b.id,b.codigo AS code,b.nombre AS name FROM infra.espacio b WHERE b.tipo='bodega' AND b.activo
      AND ($1::text[] IS NULL OR EXISTS (SELECT 1 FROM inventario.existencia e JOIN inventario.lote l ON l.id=e.lote_id JOIN inventario.articulo a ON a.id=l.articulo_id WHERE e.bodega_id=b.id AND a.tipo=ANY($1))) ORDER BY b.nombre`, [scope.articleTypes]);
  }
  /** Lots of one article for the movement form: with the quantity in the chosen warehouse, FEFO first, expired ones flagged. */
  async availableLots(actor: Actor, articleId: string, warehouseId?: string, includeExpired = false) {
    const scope = this.scope(actor);
    const rows = (await this.db.query(`SELECT l.id,l.numero AS number,to_char(l.vence,'YYYY-MM-DD') AS "expiresAt",(l.vence IS NOT NULL AND l.vence<$3::date) AS expired,
        coalesce(sum(e.cantidad) FILTER (WHERE $2::uuid IS NULL OR e.bodega_id=$2),0)::float8 AS quantity
      FROM inventario.lote l JOIN inventario.articulo a ON a.id=l.articulo_id LEFT JOIN inventario.existencia e ON e.lote_id=l.id
      WHERE l.articulo_id=$1 AND l.activo AND a.activo AND ($4::text[] IS NULL OR a.tipo=ANY($4)) GROUP BY l.id ORDER BY l.vence NULLS LAST,l.numero`, [articleId, warehouseId ?? null, this.clock.today(), scope.articleTypes])) as any[];
    const usable = rows.filter(r => r.quantity > 0 && (includeExpired || !r.expired));
    const first = fefo(usable.filter(r => !r.expired))[0]?.id;
    return fefo(usable).map(r => ({ ...r, fefo: r.id === first }));
  }
  async createLot(actor: Actor, articleId: string, dto: LotDto, key?: string) {
    return this.commands.run(actor, `inventario.configurar:lote:${articleId}`, key, dto, async c => {
      const article = (await c.query('SELECT id FROM inventario.articulo WHERE id=$1 AND activo FOR UPDATE', [articleId])).rows[0];
      if (!article) throw new NotFoundException('No se encontró el artículo activo.');
      const number = dto.number.trim().toUpperCase();
      if ((await c.query('SELECT 1 FROM inventario.lote WHERE articulo_id=$1 AND numero=$2', [articleId, number])).rowCount) throw new ConflictException('Ese número de lote ya existe para el artículo.');
      const row = (await c.query(`INSERT INTO inventario.lote(articulo_id,numero,vence) VALUES($1,$2,$3) RETURNING id,numero AS number,to_char(vence,'YYYY-MM-DD') AS "expiresAt",activo AS active,version`, [articleId, number, dto.expiresAt ?? null])).rows[0];
      await this.commands.audit(c, actor, { action: 'inventario.lote_crear', entity: 'lote', entityId: row.id, permission: 'inventario.configurar' });
      return row;
    });
  }
  async saveLot(actor: Actor, id: string, dto: LotDto, key?: string) {
    return this.commands.run(actor, `inventario.configurar:lote:${id}`, key, dto, async c => {
      const old = (await c.query('SELECT version,articulo_id AS "articleId" FROM inventario.lote WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!old) throw new NotFoundException('No se encontró el lote.');
      if (dto.version !== old.version) throw new VersionConflictException(old.version, 'El lote cambió; vuelve a cargarlo.');
      if (!dto.reason?.trim()) throw new BadRequestException('Indica el motivo del cambio.');
      const number = dto.number.trim().toUpperCase();
      if ((await c.query('SELECT 1 FROM inventario.lote WHERE articulo_id=$1 AND numero=$2 AND id<>$3', [old.articleId, number, id])).rowCount) throw new ConflictException('Ese número de lote ya existe para el artículo.');
      const active = dto.active ?? true;
      if (!active) {
        const stock = Number((await c.query('SELECT coalesce(sum(cantidad),0) AS n FROM inventario.existencia WHERE lote_id=$1', [id])).rows[0].n);
        if (stock > 0) throw new ConflictException('El lote aún tiene existencia: da de baja las unidades con una merma antes de desactivarlo.');
      }
      const row = (await c.query(`UPDATE inventario.lote SET numero=$2,vence=$3,activo=$4,version=version+1 WHERE id=$1 RETURNING id,numero AS number,to_char(vence,'YYYY-MM-DD') AS "expiresAt",activo AS active,version`, [id, number, dto.expiresAt ?? null, active])).rows[0];
      await this.commands.audit(c, actor, { action: 'inventario.lote_editar', entity: 'lote', entityId: id, permission: 'inventario.configurar', reason: dto.reason });
      return row;
    });
  }
  /** Only an article created by mistake (no lots, no movements) can be deleted; with history it is deactivated. */
  async deleteArticle(actor: Actor, id: string, key?: string) {
    return this.commands.run(actor, `inventario.configurar:eliminar:${id}`, key, { id }, async c => {
      const row = (await c.query('SELECT id FROM inventario.articulo WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!row) throw new NotFoundException('No se encontró el artículo.');
      if ((await c.query('SELECT 1 FROM inventario.lote WHERE articulo_id=$1', [id])).rowCount) throw new ConflictException('El artículo tiene lotes o historial: desactívalo en lugar de eliminarlo.');
      await c.query('DELETE FROM inventario.articulo WHERE id=$1', [id]);
      await this.commands.audit(c, actor, { action: 'inventario.articulo_eliminar', entity: 'articulo', entityId: id, permission: 'inventario.configurar' });
      return { id, deleted: true };
    });
  }
  /** Available stock of an article on the business day of the clock: expired lots do not count (RN-37). */
  private async available(c: PoolClient, articleId: string) {
    const row = (await c.query('SELECT coalesce(sum(e.cantidad) FILTER (WHERE l.activo AND (l.vence IS NULL OR l.vence >= $2::date)),0) AS n FROM inventario.lote l LEFT JOIN inventario.existencia e ON e.lote_id=l.id WHERE l.articulo_id=$1', [articleId, this.clock.today()])).rows[0];
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
