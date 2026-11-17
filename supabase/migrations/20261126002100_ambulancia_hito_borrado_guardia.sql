-- R7 G-4 (verificador A7): la base de datos también pone los límites de «deshacer hito», no solo la API.
--
-- `20261126002000` concedió `delete` sobre `ambulancia.hito` a `sghu_api` para que la tripulación deshaga su último hito.
-- Este disparador impide cualquier otro borrado, venga de donde venga:
--   * solo se borra el último hito del servicio: el de mayor rango en la secuencia salida, en_escena, trasladando,
--     en_hospital, finalizado (cada tipo aparece una vez por servicio y dos hitos pueden tener la misma hora). La API
--     elige el mismo (`milestoneTypes` en `ambulance.rules.ts`);
--   * solo mientras el servicio sigue abierto (`finalizado_en is null`).
-- El plazo de 15 minutos y la entrega registrada siguen en la API (`undoMilestoneError`), porque dependen del reloj de la
-- aplicación.
--
-- Efecto en datos existentes: ninguna fila cambia. Solo se crean una función y un disparador `before delete`; las filas
-- existentes no se leen ni se reescriben al aplicarla.
--
-- Comprobación previa (solo lectura, informativa): el disparador no existe todavía.
--   select tgname from pg_trigger where tgrelid = 'ambulancia.hito'::regclass and tgname = 'hito_borrado_guardia';  -- esperado: 0 filas
--
-- Reversión (manual, en este orden):
--   drop trigger if exists hito_borrado_guardia on ambulancia.hito;
--   drop function if exists ambulancia.hito_borrado_guardia();

set lock_timeout = '5s';

create or replace function ambulancia.hito_borrado_guardia() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (select 1 from ambulancia.servicio s where s.id = old.servicio_id and s.finalizado_en is not null) then
    raise exception 'hito_no_deshacible: el servicio ya terminó; sus hitos no se borran' using errcode = 'check_violation';
  end if;
  if exists (select 1 from ambulancia.hito h
             where h.servicio_id = old.servicio_id and h.id <> old.id
               and array_position(array['salida', 'en_escena', 'trasladando', 'en_hospital', 'finalizado']::text[], h.tipo)
                 > array_position(array['salida', 'en_escena', 'trasladando', 'en_hospital', 'finalizado']::text[], old.tipo)) then
    raise exception 'hito_no_deshacible: solo se deshace el último hito del servicio' using errcode = 'check_violation';
  end if;
  return old;
end $$;

drop trigger if exists hito_borrado_guardia on ambulancia.hito;
create trigger hito_borrado_guardia before delete on ambulancia.hito
  for each row execute function ambulancia.hito_borrado_guardia();
