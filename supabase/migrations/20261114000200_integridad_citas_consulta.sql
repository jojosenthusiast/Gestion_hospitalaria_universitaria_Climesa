-- Auditoría 2026-11-13, DAT-03 y DAT-04 (RN-20, RN-23, constitución §3.2 y §4.2).
--
-- DAT-03: la base excluía el traslape de citas por médico, pero no por paciente; la API lo revisaba con un
-- SELECT sin candado. Ahora la exclusión vive en la base, igual que la del médico.
-- Antes de aplicar, comprueba que no haya traslapes vigentes (debe devolver cero filas):
--   select a.id, b.id from atencion.cita a join atencion.cita b on a.paciente_id = b.paciente_id and a.id < b.id
--    and a.horario && b.horario where a.estado in ('solicitada','confirmada') and b.estado in ('solicitada','confirmada');
--
-- DAT-04: lo firmado se podía alterar. Se amplía `proteger_firmada`, las tablas hijas exigen consulta abierta
-- (`exigir_consulta_abierta`) y `sghu_api` deja de poder borrar diagnósticos y renglones de receta.

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cita_paciente_sin_traslape' and conrelid = 'atencion.cita'::regclass) then
    alter table atencion.cita add constraint cita_paciente_sin_traslape
      exclude using gist (paciente_id with =, horario with &&) where (estado in ('solicitada', 'confirmada'));
  end if;
end $$;

-- RN-23: una consulta firmada no cambia de contenido, paciente, médico, origen ni instantes; solo puede
-- pasar a 'ingresada_por_error' (D-003) y subir de versión.
create or replace function atencion.proteger_firmada() returns trigger language plpgsql set search_path = '' as $$
begin
  if old.estado = 'firmada' and (new.motivo is distinct from old.motivo or new.examen_fisico is distinct from old.examen_fisico
      or new.plan is distinct from old.plan or new.estado = 'abierta'
      or new.paciente_id is distinct from old.paciente_id or new.medico_id is distinct from old.medico_id
      or new.consultorio_id is distinct from old.consultorio_id or new.ticket_id is distinct from old.ticket_id
      or new.cita_id is distinct from old.cita_id or new.iniciada_en is distinct from old.iniciada_en
      or new.firmada_en is distinct from old.firmada_en) then
    raise exception 'consulta_firmada' using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Las tablas hijas solo cambian mientras su consulta está abierta. Los signos de una admisión (sin
-- consulta) no se ven afectados.
create or replace function atencion.exigir_consulta_abierta() returns trigger language plpgsql set search_path = '' as $$
declare
  v_consulta uuid;
  v_estado text;
begin
  if tg_table_name = 'receta_item' then
    select r.consulta_id into v_consulta from atencion.receta r where r.id = coalesce(new.receta_id, old.receta_id);
  elsif tg_op = 'DELETE' then
    v_consulta := old.consulta_id;
  else
    v_consulta := new.consulta_id;
  end if;
  if v_consulta is null then
    return coalesce(new, old);
  end if;
  select k.estado into v_estado from atencion.consulta k where k.id = v_consulta for share;
  if v_estado is distinct from 'abierta' then
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
