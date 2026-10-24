-- Spec 111. Artículos, lotes, existencias sin negativos, movimientos trazables (D-057, RN-36, RN-37).

create schema inventario;
grant usage on schema inventario to sghu_api;

create table inventario.articulo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  tipo text not null check (tipo in ('insumo', 'reactivo', 'equipo_menor')),
  unidad text not null,
  minimo numeric not null default 0 check (minimo >= 0),
  activo boolean not null default true,
  version int not null default 1
);

create table inventario.lote (
  id uuid primary key default gen_random_uuid(),
  articulo_id uuid not null references inventario.articulo(id),
  numero text not null,
  vence date,
  unique (articulo_id, numero)
);

create table inventario.existencia (
  lote_id uuid not null references inventario.lote(id),
  bodega_id uuid not null,                              -- infra.espacio tipo bodega
  cantidad numeric not null default 0 check (cantidad >= 0),   -- RN-36
  primary key (lote_id, bodega_id)
);

create table inventario.movimiento (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('entrada', 'salida', 'ajuste', 'traslado', 'consumo')),
  lote_id uuid not null references inventario.lote(id),
  bodega_origen_id uuid,
  bodega_destino_id uuid,
  cantidad numeric not null check (cantidad > 0),
  motivo text not null,
  paciente_id uuid,
  autor_id uuid not null,
  registrado_en timestamptz not null default now(),
  clave_idempotencia text unique,
  check (tipo not in ('salida', 'consumo') or bodega_origen_id is not null),
  check (tipo <> 'entrada' or bodega_destino_id is not null),
  check (tipo <> 'traslado' or (bodega_origen_id is not null and bodega_destino_id is not null and bodega_origen_id <> bodega_destino_id))
);

grant select, insert, update on inventario.articulo, inventario.lote, inventario.existencia to sghu_api;
grant select, insert on inventario.movimiento to sghu_api;

-- Existencias por artículo y alerta de mínimo (RN-37).
create view inventario.v_existencias as
  select a.id as articulo_id, a.codigo, a.nombre, a.tipo, a.unidad, a.minimo,
         coalesce(sum(e.cantidad) filter (where l.vence is null or l.vence >= current_date), 0) as disponible,
         coalesce(sum(e.cantidad) filter (where l.vence < current_date), 0) as vencido,
         coalesce(sum(e.cantidad) filter (where l.vence is null or l.vence >= current_date), 0) < a.minimo as bajo_minimo
  from inventario.articulo a
  left join inventario.lote l on l.articulo_id = a.id
  left join inventario.existencia e on e.lote_id = l.id
  where a.activo
  group by a.id;
grant select on inventario.v_existencias to sghu_api;
