-- Una sola consulta vigente por número de fila (RN-22, retomar consulta desde la fila).
--
-- Los clientes retoman la consulta abierta del número que el médico ya atiende (`consultaId` en la fila y en el
-- 409 `consulta_ya_iniciada`). La API ya revisa que no exista otra consulta del número antes de insertar, con el
-- número bloqueado; la base lo garantiza ahora para que retomar nunca bifurque la atención en dos consultas del
-- mismo número. Una consulta 'ingresada_por_error' (D-003) no cuenta: el número puede volver a atenderse.
--
-- Si ya existieran duplicados, la migración se detiene y dice cuántos números los tienen; resuélvelos marcando
-- como 'ingresada_por_error' la consulta que sobra (con autor y motivo) y vuelve a aplicarla.

-- El índice toma un candado fuerte sobre las consultas: si no lo obtiene en 5 s, la migración falla en lugar de
-- detener la atención; vuelve a aplicarla.
set local lock_timeout = '5s';

do $$
declare
  v_duplicados int;
begin
  select count(*) into v_duplicados from (
    select 1 from atencion.consulta
    where ticket_id is not null and estado <> 'ingresada_por_error'
    group by ticket_id having count(*) > 1) d;
  if v_duplicados > 0 then
    raise exception 'Hay % número(s) de fila con más de una consulta vigente; resuélvelos antes de aplicar.', v_duplicados;
  end if;
end $$;

create unique index if not exists consulta_ticket_unico on atencion.consulta (ticket_id)
  where ticket_id is not null and estado <> 'ingresada_por_error';

-- Reversión (manual):
-- drop index if exists atencion.consulta_ticket_unico;
