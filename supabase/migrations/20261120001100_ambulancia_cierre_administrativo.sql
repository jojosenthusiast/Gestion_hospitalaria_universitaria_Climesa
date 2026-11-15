-- Fase 0 (auditoría final, BL-05): la única unidad (RN-28) no puede quedar bloqueada en "En servicio".
-- 1. Cierre administrativo: Jefatura cierra un servicio activo con motivo (`estado_final = 'cancelado'`) cuando la
--    tripulación no puede hacerlo. `cerrado_por` distingue ese cierre del que registra la tripulación con su hito.
-- 2. La unidad solo pasa a En Servicio si la tripulación del servicio tiene al menos un paramédico con cuenta activa:
--    sin cuenta nadie puede registrar los hitos ni finalizar. Se mantiene la regla del motorista de
--    20261119002000_ambulancia_motorista_de_turno.sql (RN-30).
--
-- Comprobación previa en producción (solo lectura; la migración no cambia filas):
--   select s.id, exists (select 1 from ambulancia.tripulacion t join acceso.usuario u on u.persona_personal_id = t.persona_id
--     and u.estado = 'activo' where t.servicio_id = s.id and t.funcion = 'paramedico') as paramedico_con_cuenta
--     from ambulancia.servicio s where s.finalizado_en is null;
--
-- Reversión (manual): volver a crear `ambulancia.validar_estado_unidad` como en 20261119002000_ambulancia_motorista_de_turno.sql
-- y `alter table ambulancia.servicio drop column if exists cerrado_por;`.

alter table ambulancia.servicio add column if not exists cerrado_por uuid;

create or replace function ambulancia.validar_estado_unidad() returns trigger language plpgsql set search_path = '' as $$
declare
  activo uuid;
begin
  if new.estado is distinct from old.estado then
    select id into activo from ambulancia.servicio where unidad_id = new.id and finalizado_en is null limit 1;
    if new.estado = 'en_servicio' and activo is null then
      raise exception 'unidad_sin_servicio_activo' using errcode = 'P0001';
    elsif new.estado <> 'en_servicio' and activo is not null then
      raise exception 'unidad_con_servicio_activo' using errcode = 'P0001';
    elsif new.estado = 'en_servicio' and not (
          exists (select 1 from ambulancia.tripulacion where servicio_id = activo and funcion = 'paramedico')
      and exists (select 1 from ambulancia.tripulacion where servicio_id = activo and funcion = 'motorista')) then
      raise exception 'tripulacion_incompleta' using errcode = 'P0001',
        detail = 'RN-30: el servicio necesita un paramédico y un motorista en la tripulación antes de que la unidad pase a En Servicio.';
    elsif new.estado = 'en_servicio' and not exists (
          select 1 from ambulancia.tripulacion t join acceso.usuario u on u.persona_personal_id = t.persona_id and u.estado = 'activo'
           where t.servicio_id = activo and t.funcion = 'paramedico') then
      raise exception 'tripulacion_incompleta' using errcode = 'P0001',
        detail = 'BL-05: la tripulación necesita al menos un paramédico con cuenta activa para registrar los hitos del servicio.';
    end if;
  end if;
  return new;
end $$;
