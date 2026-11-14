-- Ronda 2, inventario: merma como tipo de movimiento, lotes con baja lógica y versión, y baja de artículos sin historial.
-- Las reglas de integridad del movimiento se reescriben con nombre para poder mantenerlas en próximas migraciones.

do $$
declare
  c record;
begin
  for c in select conname from pg_constraint where conrelid = 'inventario.movimiento'::regclass and contype = 'c' loop
    execute format('alter table inventario.movimiento drop constraint %I', c.conname);
  end loop;
end $$;

alter table inventario.movimiento
  add constraint movimiento_tipo_valido check (tipo in ('entrada', 'salida', 'ajuste', 'traslado', 'consumo', 'merma')),
  add constraint movimiento_cantidad_positiva check (cantidad > 0),
  add constraint movimiento_origen_requerido check (tipo not in ('salida', 'consumo', 'merma') or bodega_origen_id is not null),
  add constraint movimiento_destino_requerido check (tipo <> 'entrada' or bodega_destino_id is not null),
  add constraint movimiento_traslado_bodegas check (tipo <> 'traslado' or (bodega_origen_id is not null and bodega_destino_id is not null and bodega_origen_id <> bodega_destino_id));

alter table inventario.lote
  add column activo boolean not null default true,
  add column version int not null default 1;

-- Un artículo sin lotes ni movimientos puede eliminarse (se creó por error); con historial solo se desactiva.
grant delete on inventario.articulo to sghu_api;

-- Los lotes dados de baja no cuentan en la existencia ni en la alerta de mínimo (RN-37).
create or replace view inventario.v_existencias as
  select a.id as articulo_id, a.codigo, a.nombre, a.tipo, a.unidad, a.minimo,
         coalesce(sum(e.cantidad) filter (where l.vence is null or l.vence >= current_date), 0) as disponible,
         coalesce(sum(e.cantidad) filter (where l.vence < current_date), 0) as vencido,
         coalesce(sum(e.cantidad) filter (where l.vence is null or l.vence >= current_date), 0) < a.minimo as bajo_minimo
  from inventario.articulo a
  left join inventario.lote l on l.articulo_id = a.id and l.activo
  left join inventario.existencia e on e.lote_id = l.id
  where a.activo
  group by a.id;
