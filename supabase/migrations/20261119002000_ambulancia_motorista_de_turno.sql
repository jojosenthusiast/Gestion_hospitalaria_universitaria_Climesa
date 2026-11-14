-- RN-30 ampliada (decisión del dueño, 2026-11-14): la ambulancia necesita paramédico Y motorista para despacharse.
--
-- La API ya comprueba que haya paramédico y motorista con turno en curso al despachar y al sacar la unidad de
-- mantenimiento (reloj sustituible, ver api/src/ambulance/ambulance.rules.ts). La base garantiza lo que no depende
-- del reloj: la unidad no pasa a En Servicio si la tripulación de su servicio activo no tiene al menos un
-- paramédico y un motorista. Se amplía el disparador `unidad_estado` de 20261115001000_ambulancia_despacho.sql.
-- No se agrega un disparador al insertar servicio, por la misma razón que en esa migración
-- (`supabase/pruebas/01_invariantes.sql` inserta servicios directo, sin tripulación ni cambio de estado).
--
-- Comprobación previa en producción (informativa; la migración no cambia filas y solo actúa en el próximo despacho):
--   select u.estado, s.id as servicio_activo,
--          exists (select 1 from ambulancia.tripulacion t where t.servicio_id = s.id and t.funcion = 'paramedico') as con_paramedico,
--          exists (select 1 from ambulancia.tripulacion t where t.servicio_id = s.id and t.funcion = 'motorista') as con_motorista
--     from ambulancia.unidad u left join ambulancia.servicio s on s.unidad_id = u.id and s.finalizado_en is null;
--   select p.tipo, count(distinct p.id) filter (where t.periodo @> now()) as ahora,
--          count(distinct p.id) filter (where t.periodo && tstzrange(now(), now() + interval '7 days')) as proximos_7_dias
--     from personal.turno t join personal.persona p on p.id = t.persona_id
--    where p.tipo in ('paramedico', 'motorista') and p.activo and t.estado in ('publicado', 'en_curso') group by p.tipo;

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
    end if;
  end if;
  return new;
end $$;

-- Reversión (manual): volver a crear `ambulancia.validar_estado_unidad` como en 20261115001000_ambulancia_despacho.sql
-- (sin la comprobación de tripulación). El disparador `unidad_estado` no cambia.
