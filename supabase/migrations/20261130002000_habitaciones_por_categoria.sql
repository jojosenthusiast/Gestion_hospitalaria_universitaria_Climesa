-- Parcial 3 S1 (REQ-HAB, RN-01): the hospital has 5 VIP rooms on floor 3 (1 bed each) and 6 semi-private rooms on
-- floor 2 (2 beds each, 12 beds). Until now only the seed said so; PostgreSQL now enforces it for every active room:
--   * a VIP room lives on nivel 3 with capacidad 1; a semi-private room on nivel 2 with capacidad 1 or 2 (a room can be
--     reduced while a bed is out of service, FR-104-03, never grown past 2);
--   * at most 5 active VIP rooms and 6 active semi-private rooms.
-- Rejections are P0001 with a business code the API translates (errors.filter.ts) into a Spanish message.

create function infra.validar_habitacion_categoria() returns trigger language plpgsql set search_path = '' as $$
declare
  limite int;
  activas int;
begin
  if new.tipo <> 'habitacion' or new.categoria is null or not new.activo then
    return new;
  end if;
  if (new.categoria = 'vip' and new.nivel is distinct from 3) or (new.categoria = 'semiprivada' and new.nivel is distinct from 2) then
    raise exception 'habitacion_fuera_de_planta % nivel %', new.categoria, new.nivel using errcode = 'P0001';
  end if;
  if (new.categoria = 'vip' and new.capacidad <> 1) or (new.categoria = 'semiprivada' and new.capacidad > 2) then
    raise exception 'capacidad_de_categoria % capacidad %', new.categoria, new.capacidad using errcode = 'P0001';
  end if;
  -- Only a room that newly counts (created, reactivated, or moved into the category) can pass the limit.
  if tg_op = 'UPDATE' and old.tipo = 'habitacion' and old.activo and old.categoria is not distinct from new.categoria then
    return new;
  end if;
  -- Two concurrent creations of the same category serialize here, so both cannot see 4 VIP rooms and add the 5th and 6th.
  perform pg_advisory_xact_lock(hashtext('infra.habitacion_categoria:' || new.categoria));
  limite := case new.categoria when 'vip' then 5 else 6 end;
  select count(*) into activas from infra.espacio
    where tipo = 'habitacion' and categoria = new.categoria and activo and id <> new.id;
  if activas >= limite then
    raise exception '%', case new.categoria when 'vip' then 'limite_habitaciones_vip' else 'limite_habitaciones_semiprivadas' end
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger espacio_habitacion_categoria before insert or update on infra.espacio
  for each row execute function infra.validar_habitacion_categoria();

-- The rule must already hold on the data it starts guarding; stop the migration instead of leaving rows it rejects.
do $$
declare
  fuera int;
begin
  select count(*) into fuera from infra.espacio
    where tipo = 'habitacion' and activo and (
      (categoria = 'vip' and (nivel is distinct from 3 or capacidad <> 1))
      or (categoria = 'semiprivada' and (nivel is distinct from 2 or capacidad > 2)));
  if fuera > 0 then
    raise exception 'habitacion_fuera_de_planta: % habitaciones activas no cumplen planta o capacidad de su categoría', fuera;
  end if;
  if (select count(*) from infra.espacio where tipo = 'habitacion' and activo and categoria = 'vip') > 5
     or (select count(*) from infra.espacio where tipo = 'habitacion' and activo and categoria = 'semiprivada') > 6 then
    raise exception 'limite_habitaciones: hay más habitaciones activas que las 5 VIP y 6 semiprivadas del hospital';
  end if;
end $$;
