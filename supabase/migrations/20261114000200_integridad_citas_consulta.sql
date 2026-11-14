-- Auditoría 2026-11-13, DAT-03 y DAT-04 (RN-20, RN-23, constitución §3.2 y §4.2).
--
-- DAT-03: la base excluía el traslape de citas por médico, pero no por paciente; la API lo revisaba con un
-- SELECT sin candado. Ahora la exclusión vive en la base, igual que la del médico.
-- Antes de aplicar, comprueba que no haya traslapes vigentes (debe devolver cero filas):
--   select a.id, b.id from atencion.cita a join atencion.cita b on a.paciente_id = b.paciente_id and a.id < b.id
--    and a.horario && b.horario where a.estado in ('solicitada','confirmada') and b.estado in ('solicitada','confirmada');
-- Si los hay, la migración se detiene y dice cuántos; cancela o reprograma una cita de cada par y vuelve a aplicarla.
--
-- DAT-04: lo firmado se podía alterar. Se amplía `proteger_firmada`, las tablas hijas exigen consulta abierta
-- (`exigir_consulta_abierta`) y `sghu_api` deja de poder borrar diagnósticos y renglones de receta.
--
-- La restricción y los disparadores toman candados fuertes sobre tablas con uso continuo: si no los obtiene
-- en 5 s, la migración falla en lugar de bloquear la operación del hospital; vuelve a aplicarla.
set local lock_timeout = '5s';

do $$
declare
  v_traslapes int;
begin
  if exists (select 1 from pg_constraint where conname = 'cita_paciente_sin_traslape' and conrelid = 'atencion.cita'::regclass) then
    return;
  end if;
  select count(*) into v_traslapes from atencion.cita a join atencion.cita b on a.paciente_id = b.paciente_id and a.id < b.id
    and a.horario && b.horario where a.estado in ('solicitada', 'confirmada') and b.estado in ('solicitada', 'confirmada');
  if v_traslapes > 0 then
    raise exception 'Hay % par(es) de citas solicitadas o confirmadas del mismo paciente que se traslapan; cancela o reprograma una de cada par antes de aplicar. Para listarlos: select a.id, b.id from atencion.cita a join atencion.cita b on a.paciente_id = b.paciente_id and a.id < b.id and a.horario && b.horario where a.estado in (''solicitada'',''confirmada'') and b.estado in (''solicitada'',''confirmada'');', v_traslapes;
  end if;
  alter table atencion.cita add constraint cita_paciente_sin_traslape
    exclude using gist (paciente_id with =, horario with &&) where (estado in ('solicitada', 'confirmada'));
end $$;

-- RN-23: una consulta firmada no cambia de contenido, paciente, médico, origen ni instantes; solo puede
-- pasar a 'ingresada_por_error' (D-003) y subir de versión. Una consulta 'ingresada_por_error' es terminal:
-- solo sube de versión (no vuelve a 'firmada' ni a 'abierta' ni se edita después de anularla).
create or replace function atencion.proteger_firmada() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.estado = 'firmada' and (new.estado not in ('firmada', 'ingresada_por_error')
      or new.motivo is distinct from old.motivo or new.examen_fisico is distinct from old.examen_fisico
      or new.plan is distinct from old.plan
      or new.paciente_id is distinct from old.paciente_id or new.medico_id is distinct from old.medico_id
      or new.consultorio_id is distinct from old.consultorio_id or new.ticket_id is distinct from old.ticket_id
      or new.cita_id is distinct from old.cita_id or new.iniciada_en is distinct from old.iniciada_en
      or new.firmada_en is distinct from old.firmada_en) then
    raise exception 'consulta_firmada' using errcode = 'P0001';
  end if;
  if old.estado = 'ingresada_por_error' and (to_jsonb(new) - 'version') is distinct from (to_jsonb(old) - 'version') then
    raise exception 'consulta_firmada' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Las tablas hijas solo cambian mientras su consulta está abierta. En un UPDATE se revisan la consulta de
-- antes y la de después, para que nada salga de una consulta firmada ni entre en ella. Los signos de una
-- admisión (sin consulta) no se ven afectados.
create or replace function atencion.exigir_consulta_abierta() returns trigger language plpgsql set search_path = '' as $$
declare
  v_consultas uuid[];
begin
  if tg_table_name = 'receta_item' then
    if tg_op = 'INSERT' then
      select array_agg(r.consulta_id) into v_consultas from atencion.receta r where r.id = new.receta_id;
    elsif tg_op = 'UPDATE' then
      select array_agg(r.consulta_id) into v_consultas from atencion.receta r where r.id in (new.receta_id, old.receta_id);
    else
      select array_agg(r.consulta_id) into v_consultas from atencion.receta r where r.id = old.receta_id;
    end if;
  elsif tg_op = 'INSERT' then
    v_consultas := array[new.consulta_id];
  elsif tg_op = 'UPDATE' then
    v_consultas := array[new.consulta_id, old.consulta_id];
  else
    v_consultas := array[old.consulta_id];
  end if;
  perform 1 from atencion.consulta k where k.id = any(v_consultas) order by k.id for share;
  if exists (select 1 from atencion.consulta k where k.id = any(v_consultas) and k.estado <> 'abierta') then
    raise exception 'consulta_firmada' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists diagnostico_consulta_abierta on atencion.diagnostico;
create trigger diagnostico_consulta_abierta before insert or update or delete on atencion.diagnostico
  for each row execute function atencion.exigir_consulta_abierta();
drop trigger if exists receta_consulta_abierta on atencion.receta;
create trigger receta_consulta_abierta before insert or update or delete on atencion.receta
  for each row execute function atencion.exigir_consulta_abierta();
drop trigger if exists receta_item_consulta_abierta on atencion.receta_item;
create trigger receta_item_consulta_abierta before insert or update or delete on atencion.receta_item
  for each row execute function atencion.exigir_consulta_abierta();
drop trigger if exists signos_consulta_abierta on atencion.signos_vitales;
create trigger signos_consulta_abierta before insert or update or delete on atencion.signos_vitales
  for each row execute function atencion.exigir_consulta_abierta();

-- Nada clínico se borra (constitución §3.2): la API nunca borra diagnósticos ni renglones de receta.
revoke delete on atencion.diagnostico, atencion.receta_item from sghu_api;

-- Reversión (manual, en este orden):
-- grant delete on atencion.diagnostico, atencion.receta_item to sghu_api;
-- drop trigger if exists signos_consulta_abierta on atencion.signos_vitales;
-- drop trigger if exists receta_item_consulta_abierta on atencion.receta_item;
-- drop trigger if exists receta_consulta_abierta on atencion.receta;
-- drop trigger if exists diagnostico_consulta_abierta on atencion.diagnostico;
-- drop function if exists atencion.exigir_consulta_abierta();
-- create or replace function atencion.proteger_firmada() returns trigger language plpgsql set search_path = '' as $$
-- begin
--   if old.estado = 'firmada' and (new.motivo is distinct from old.motivo or new.examen_fisico is distinct from old.examen_fisico
--       or new.plan is distinct from old.plan or new.estado = 'abierta') then
--     raise exception 'consulta_firmada' using errcode = 'P0001';
--   end if;
--   return new;
-- end $$;
-- alter table atencion.cita drop constraint if exists cita_paciente_sin_traslape;
