-- Prueba en producción 2026-11-13 (W-07): un mismo paciente tenía dos números activos del mismo servicio
-- el mismo día. La base garantiza ahora un solo número activo (en_espera, llamado, en_atencion) por
-- paciente, servicio y fecha (constitución §4.2).
--
-- Producción ya tiene un duplicado del 2026-11-13. Los números pasados no se cambian (no se inventa su
-- desenlace): el índice cubre las fechas desde el día local en que se aplica esta migración. Si ese día
-- ya hubiera duplicados, la migración se detiene y lista cuántos hay; resuélvelos en la fila (marcar
-- "no se presentó" o completar el número que sobra) y vuelve a aplicarla.

do $$
declare
  v_desde date := (now() at time zone 'America/El_Salvador')::date;
  v_duplicados int;
begin
  if exists (select 1 from pg_indexes where schemaname = 'atencion' and indexname = 'ticket_fila_activo_unico') then
    return;
  end if;
  select count(*) into v_duplicados from (
    select 1 from atencion.ticket_fila
    where paciente_id is not null and estado in ('en_espera', 'llamado', 'en_atencion') and fecha >= v_desde
    group by paciente_id, servicio, fecha having count(*) > 1) d;
  if v_duplicados > 0 then
    raise exception 'Hay % paciente(s) con más de un número activo desde %; resuélvelos antes de aplicar.', v_duplicados, v_desde;
  end if;
  execute format(
    'create unique index ticket_fila_activo_unico on atencion.ticket_fila (paciente_id, servicio, fecha)
       where paciente_id is not null and estado in (''en_espera'', ''llamado'', ''en_atencion'') and fecha >= %L::date',
    v_desde);
end $$;

-- Reversión (manual):
-- drop index if exists atencion.ticket_fila_activo_unico;
