-- Tiempo real entre plataformas: cambios que no emitían evento (auditoría de cobertura, docs/arquitectura/tiempo-real.md).
-- 1. Inventario: crear, editar o eliminar un artículo, y crear o editar un lote, no emitían `inventario.actualizado`;
--    los movimientos sí. Las existencias y el catálogo de otros roles (ENF, LAB, JOP) quedaban viejos hasta recargar.
-- 2. Aislamiento: al aislar o liberar una habitación, la API bloquea o libera las otras camas con
--    `infra.bloqueo_cama` (origen 'aislamiento') sin emitir `cama.estado_cambiado` por cada cama. El tablero y la
--    ocupación pública (`plataforma.derivar_eventos`) no se enteraban.
-- Se emite al outbox en la misma transacción del cambio: si se revierte, no hay evento (FR-100-08). Un evento de más
-- junto al que ya emite la API solo cuesta una lectura agrupada en el cliente; un evento de menos deja datos viejos.
-- Los canales salen del catálogo de permisos (`plataforma.canales_por_permiso`, 20261119004000), como en la API.

create function inventario.anunciar_articulo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  articulo uuid;
  version_actual int;
  -- Fuera de VALUES: `contrato-api.spec.ts` lee los tipos de evento de ahí.
  canales text[] := plataforma.canales_por_permiso(array['inventario.ver', 'inventario.mover']);
begin
  if tg_table_name = 'articulo' then
    if tg_op = 'DELETE' then
      articulo := old.id; version_actual := old.version + 1;
    else
      articulo := new.id; version_actual := new.version;
    end if;
  else
    articulo := case when tg_op = 'DELETE' then old.articulo_id else new.articulo_id end;
    select a.version into version_actual from inventario.articulo a where a.id = articulo;
  end if;
  insert into plataforma.outbox(tipo, entidad, entidad_id, version, canales)
  values ('inventario.actualizado', 'articulo', articulo::text, coalesce(version_actual, 1), canales);
  return null;
end $$;

create trigger articulo_anunciar after insert or update or delete on inventario.articulo
  for each row execute function inventario.anunciar_articulo();
create trigger lote_anunciar after insert or update on inventario.lote
  for each row execute function inventario.anunciar_articulo();

create function infra.anunciar_bloqueo_aislamiento() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  cama uuid;
  origen text;
begin
  if tg_op = 'DELETE' then
    cama := old.cama_id; origen := old.origen;
  else
    cama := new.cama_id; origen := new.origen;
  end if;
  -- Los bloqueos manuales ya los anuncia la API (`camas.bloquear`/`desbloquear`).
  if origen <> 'aislamiento' then
    return null;
  end if;
  insert into plataforma.outbox(tipo, entidad, entidad_id, version, canales)
  select 'cama.estado_cambiado', 'cama', e.id::text, e.version,
         plataforma.canales_por_permiso(array['camas.ver_tablero', 'espacios.ver'])
  from infra.espacio e where e.id = cama;
  return null;
end $$;

create trigger bloqueo_cama_anunciar_aislamiento after insert or update or delete on infra.bloqueo_cama
  for each row execute function infra.anunciar_bloqueo_aislamiento();

revoke all on function inventario.anunciar_articulo() from public;
revoke all on function infra.anunciar_bloqueo_aislamiento() from public;

-- Reversión (manual, en este orden):
-- drop trigger if exists bloqueo_cama_anunciar_aislamiento on infra.bloqueo_cama;
-- drop function if exists infra.anunciar_bloqueo_aislamiento();
-- drop trigger if exists lote_anunciar on inventario.lote;
-- drop trigger if exists articulo_anunciar on inventario.articulo;
-- drop function if exists inventario.anunciar_articulo();
