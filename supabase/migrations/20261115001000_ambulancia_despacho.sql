-- Spec 109 (T03, T04, T09). Despacho atómico de la única ambulancia y servicio hasta finalizar (RN-28 a RN-34, DAT-08).
--
-- Comprobación previa en producción (debe devolver 0 filas en cada consulta antes de aplicar):
--   select count(*) from ambulancia.unidad having count(*) > 1;
--   select u.id from ambulancia.unidad u where u.estado = 'en_servicio'
--     and not exists (select 1 from ambulancia.servicio s where s.unidad_id = u.id and s.finalizado_en is null);
--   select s.id from ambulancia.servicio s join ambulancia.unidad u on u.id = s.unidad_id
--     where s.finalizado_en is null and u.estado <> 'en_servicio';
--   select id from ambulancia.servicio where estado_final in ('cancelado','sin_traslado','rechaza_traslado') and coalesce(trim(motivo_final),'') = '';
--
-- Garantías en la base:
--   1. Una sola fila en `ambulancia.unidad` (índice único sobre una constante).
--   2. Un solo servicio activo por unidad: ya lo garantiza `servicio_activo_unico` (20261017000900).
--      La API además bloquea la fila de la unidad (FOR UPDATE) y solo despacha si está Disponible (RN-29).
--      No se agrega un disparador al insertar servicio porque `supabase/pruebas/01_invariantes.sql` (caso 12) y
--      `02_concurrencia.sh` insertan servicios directo sobre la unidad sembrada en mantenimiento.
--   3. La unidad no cambia de En Servicio mientras tenga un servicio activo, ni pasa a En Servicio sin uno.
--   4. Terminar sin traslado, cancelado o con rechazo exige motivo.
--   5. No se registran hitos en un servicio finalizado; el hito `finalizado` cierra el servicio.

do $$
begin
  if (select count(*) from ambulancia.unidad) > 1 then
    raise exception 'Hay más de una unidad de ambulancia; la regla RN-28 exige una sola. Deja una fila antes de aplicar esta migración.';
  end if;
  if exists (select 1 from ambulancia.unidad u where u.estado = 'en_servicio'
             and not exists (select 1 from ambulancia.servicio s where s.unidad_id = u.id and s.finalizado_en is null))
     or exists (select 1 from ambulancia.servicio s join ambulancia.unidad u on u.id = s.unidad_id
             where s.finalizado_en is null and u.estado <> 'en_servicio') then
    raise exception 'El estado de la unidad no coincide con sus servicios activos; corrígelo antes de aplicar esta migración.';
  end if;
  if exists (select 1 from ambulancia.servicio where estado_final in ('cancelado','sin_traslado','rechaza_traslado') and coalesce(trim(motivo_final),'') = '') then
    raise exception 'Hay servicios finalizados sin traslado o cancelados sin motivo; complétalos antes de aplicar esta migración.';
  end if;
end $$;

-- 1. Unidad única (RN-28, DAT-08).
create unique index if not exists unidad_unica on ambulancia.unidad ((true));

-- Versiones para concurrencia optimista y quién registró la solicitud telefónica.
alter table ambulancia.solicitud add column if not exists version int not null default 1;
alter table ambulancia.solicitud add column if not exists registrada_por uuid;
alter table ambulancia.servicio add column if not exists version int not null default 1;
create index if not exists solicitud_por_confirmar on ambulancia.solicitud (creada_en) where estado = 'por_confirmar';
create index if not exists servicio_despachado on ambulancia.servicio (despachado_en desc);

-- 4. Motivo obligatorio al terminar sin traslado (RN-32).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'servicio_motivo_final') then
    alter table ambulancia.servicio add constraint servicio_motivo_final
      check (estado_final is null or estado_final = 'completado' or coalesce(trim(motivo_final), '') <> '');
  end if;
end $$;

-- 3. En Servicio si y solo si hay servicio activo.
create or replace function ambulancia.validar_estado_unidad() returns trigger language plpgsql set search_path = '' as $$
declare
  activo boolean;
begin
  if new.estado is distinct from old.estado then
    activo := exists (select 1 from ambulancia.servicio where unidad_id = new.id and finalizado_en is null);
    if new.estado = 'en_servicio' and not activo then
      raise exception 'unidad_sin_servicio_activo' using errcode = 'P0001';
    elsif new.estado <> 'en_servicio' and activo then
      raise exception 'unidad_con_servicio_activo' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists unidad_estado on ambulancia.unidad;
create trigger unidad_estado before update of estado on ambulancia.unidad
  for each row execute function ambulancia.validar_estado_unidad();

-- 5. Hitos en orden (RN-32) y nunca después de finalizar.
create or replace function ambulancia.validar_hito() returns trigger language plpgsql set search_path = '' as $$
declare
  orden constant text[] := array['salida', 'en_escena', 'trasladando', 'en_hospital', 'finalizado'];
  previo text;
begin
  if exists (select 1 from ambulancia.servicio where id = new.servicio_id and finalizado_en is not null) then
    raise exception 'servicio_finalizado' using errcode = 'P0001';
  end if;
  if new.tipo <> 'salida' and new.tipo <> 'finalizado' then
    previo := orden[array_position(orden, new.tipo) - 1];
    if not exists (select 1 from ambulancia.hito where servicio_id = new.servicio_id and tipo = previo) then
      raise exception 'hito_fuera_de_orden' using errcode = 'P0001';
    end if;
  elsif new.tipo = 'finalizado' and not exists (select 1 from ambulancia.hito where servicio_id = new.servicio_id and tipo = 'salida') then
    raise exception 'hito_fuera_de_orden' using errcode = 'P0001';
  end if;
  return new;
end $$;

grant select, insert, update on ambulancia.unidad, ambulancia.solicitud, ambulancia.servicio, ambulancia.reporte_prehospital to sghu_api;

-- Reversión (manual, en este orden):
--   drop trigger if exists unidad_estado on ambulancia.unidad; drop function if exists ambulancia.validar_estado_unidad();
--   alter table ambulancia.servicio drop constraint if exists servicio_motivo_final;
--   drop index if exists ambulancia.servicio_despachado; drop index if exists ambulancia.solicitud_por_confirmar;
--   alter table ambulancia.servicio drop column if exists version;
--   alter table ambulancia.solicitud drop column if exists registrada_por; alter table ambulancia.solicitud drop column if exists version;
--   drop index if exists ambulancia.unidad_unica;
--   (validar_hito: volver a crear la versión de 20261017000900_ambulancia.sql, sin la comprobación de servicio finalizado.)
